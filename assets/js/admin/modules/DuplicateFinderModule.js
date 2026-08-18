import { useState, useEffect, useCallback, useRef } from '@wordpress/element'
import { Button, Text, Notice, Spinner } from '@wordpress/components'
import apiFetch from '@wordpress/api-fetch'

export default function DuplicateFinderModule() {
	const [groups, setGroups] = useState([])
	const [page, setPage] = useState(1)
	const [totalPages, setTotalPages] = useState(0)
	const [totalGroups, setTotalGroups] = useState(0)
	const [isScanned, setIsScanned] = useState(false)
	const [lastScannedTime, setLastScannedTime] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState(null)

	const [scanState, setScanState] = useState(null)
	const [isScanning, setIsScanning] = useState(false)
	const [scanError, setScanError] = useState(null)
	const [logs, setLogs] = useState([])
	const [showConsole, setShowConsole] = useState(true)

	const [selected, setSelected] = useState({})
	const [isDeleting, setIsDeleting] = useState(false)
	const [deleteError, setDeleteError] = useState(null)

	const consoleEndRef = useRef(null)

	const total = scanState && typeof scanState.total === 'number' ? scanState.total : 0
	const processed = scanState && typeof scanState.processed === 'number' ? scanState.processed : 0
	const finished = !!(scanState && scanState.finished)
	const calculatedProgress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : (finished ? 100 : 0)

	useEffect(() => {
		if (showConsole && consoleEndRef.current) {
			consoleEndRef.current.scrollIntoView({ behavior: 'smooth' })
		}
	}, [logs, showConsole])

	const loadDuplicates = useCallback((page = 1) => {
		setIsLoading(true)
		setError(null)

		apiFetch({
			path: `/hoatzinmedia/v1/duplicates?page=${page}&per_page=10`,
			method: 'GET',
		})
			.then((response) => {
				if (!response) return
				setGroups(Array.isArray(response.groups) ? response.groups : [])
				setPage(response.page || page)
				setTotalPages(response.total_pages || 0)
				setTotalGroups(response.total || 0)
				setIsScanned(!!response.scanned)

				if (response.last_scanned) {
					try {
						const date = new Date(response.last_scanned)
						setLastScannedTime(date.toLocaleString())
					} catch (_e) {
						setLastScannedTime(response.last_scanned)
					}
				}
				if (Array.isArray(response.logs) && response.logs.length > 0) {
					setLogs(response.logs)
				}
			})
			.catch((err) => {
				setError(err)
			})
			.finally(() => {
				setIsLoading(false)
			})
	}, [])

	const runScanStep = useCallback((scanId = '') => {
		setScanError(null)

		return apiFetch({
			path: '/hoatzinmedia/v1/duplicates/scan',
			method: 'POST',
			data: { scan_id: scanId },
		})
			.then((response) => {
				if (!response) return null
				setScanState(response)

				if (Array.isArray(response.logs) && response.logs.length > 0) {
					setLogs(response.logs)
				}

				if (!response.finished && response.scan_id) {
					return new Promise((resolve) => {
						setTimeout(() => {
							resolve(runScanStep(response.scan_id))
						}, 350)
					})
				}
				return response
			})
			.catch((err) => {
				setScanError(err)
				return null
			})
	}, [])

	const checkActiveScan = useCallback(() => {
		apiFetch({
			path: '/hoatzinmedia/v1/duplicates/scan',
			method: 'GET',
		})
			.then((response) => {
				if (response && response.active && response.scan_id) {
					setScanState(response)
					setIsScanning(true)
					setIsScanned(true)
					if (Array.isArray(response.logs) && response.logs.length > 0) {
						setLogs(response.logs)
					}
					runScanStep(response.scan_id)
						.then((res) => {
							if (res && res.finished) {
								loadDuplicates(1)
							}
						})
						.finally(() => {
							setIsScanning(false)
						})
				}
			})
			.catch(() => {})
	}, [runScanStep, loadDuplicates])

	useEffect(() => {
		loadDuplicates(1)
		checkActiveScan()
	}, [loadDuplicates, checkActiveScan])

	const handleRunScan = useCallback(() => {
		if (isScanning) return

		setIsScanning(true)
		setIsScanned(true)

		runScanStep()
			.then((response) => {
				if (response && response.finished) {
					loadDuplicates(1)
				}
			})
			.finally(() => {
				setIsScanning(false)
			})
	}, [isScanning, runScanStep, loadDuplicates])

	const toggleSelect = useCallback((id) => {
		setSelected((prev) => {
			const next = { ...prev }
			if (next[id]) delete next[id]
			else next[id] = true
			return next
		})
	}, [])

	const autoSelectDuplicates = useCallback(() => {
		const nextSelected = {}
		groups.forEach((group) => {
			if (Array.isArray(group.items) && group.items.length > 1) {
				for (let i = 1; i < group.items.length; i++) {
					if (group.items[i].attachment_id) {
						nextSelected[group.items[i].attachment_id] = true
					}
				}
			}
		})
		setSelected(nextSelected)
	}, [groups])

	const handleDeleteSelected = useCallback(() => {
		const ids = Object.keys(selected)
			.map((k) => parseInt(k, 10))
			.filter((n) => Number.isFinite(n) && n > 0)

		if (ids.length === 0) return

		setIsDeleting(true)
		setDeleteError(null)

		apiFetch({
			path: '/hoatzinmedia/v1/delete-unused',
			method: 'POST',
			data: { attachment_ids: ids },
		})
			.then(() => {
				setSelected({})
				loadDuplicates(page)
			})
			.catch((err) => {
				setDeleteError(err)
			})
			.finally(() => {
				setIsDeleting(false)
			})
	}, [selected, loadDuplicates, page])

	return (
		<div className="hm-scanner-layout">
			{!isScanned && !isScanning && (
				<div className="hm-scan-prompt-card">
					<div className="hm-scan-prompt-icon">📋</div>
					<div className="hm-scan-prompt-title">Scan Media Library for Duplicates</div>
					<div className="hm-scan-prompt-desc">
						Detect duplicate images and media files uploaded multiple times across your WordPress media library to reclaim disk space.
					</div>
					<div className="hm-scan-prompt-features">
						<span className="hm-scan-prompt-feature">✓ Content MD5 Hash Comparison</span>
						<span className="hm-scan-prompt-feature">✓ Real-time Progress & Logging</span>
						<span className="hm-scan-prompt-feature">✓ Fast Transient Caching</span>
					</div>
					<Button
						variant="primary"
						className="hm-button hm-button-primary"
						onClick={handleRunScan}
						disabled={isScanning}
						style={{ padding: '10px 24px', fontSize: 14 }}
					>
						Start Duplicate Scan
					</Button>
				</div>
			)}

			{(isScanning || isScanned) && (
				<div className="hm-scan-progress-box">
					<div className="hm-panel-header">
						<div>
							<div className="hm-panel-title">
								Duplicate Checker & Scanner
							</div>
							<div className="hm-panel-subtitle">
								Live duplicate scanning with real-time percentage progress, activity logging, and cached results.
							</div>
						</div>
						<div className="hm-panel-actions">
							<Button
								variant="primary"
								className="hm-button hm-button-primary"
								onClick={handleRunScan}
								disabled={isScanning}
							>
								{isScanning ? 'Scanning…' : 'Run Duplicate Scan'}
							</Button>
						</div>
					</div>

					{isScanned && !isScanning && lastScannedTime && (
						<div className="hm-cache-banner">
							<div className="hm-cache-badge">
								⚡ Loaded from transient cache (Last scanned: {lastScannedTime})
							</div>
							<Button
								variant="secondary"
								className="hm-button hm-button-outline"
								onClick={handleRunScan}
							>
								Re-Scan
							</Button>
						</div>
					)}

					{scanError && (
						<Notice status="error" isDismissible={false} style={{ marginBottom: 12 }}>
							<Text>Failed to run duplicate scan. Please try again.</Text>
						</Notice>
					)}

					{(isScanning || scanState) && (
						<div>
							<div className="hm-progress-header">
								<div className="hm-progress-title-wrap">
									<span className="hm-progress-percentage-badge">
										{calculatedProgress}%
									</span>
									<span className="hm-progress-count-text">
										{processed.toLocaleString()} of {total.toLocaleString()} attachments scanned
									</span>
								</div>
								<div className="hm-progress-count-text">
									{scanState && scanState.found_groups ? `${scanState.found_groups} duplicate groups found` : ''}
								</div>
							</div>

							<div className="hm-progress-track-enhanced">
								<div
									className="hm-progress-fill-animated"
									style={{ width: `${calculatedProgress}%` }}
								/>
							</div>

							{/* Live Console Logger */}
							<div className="hm-scan-console">
								<div className="hm-console-header">
									<div className="hm-console-title">
										{isScanning && <span className="hm-console-dot" />}
										Live Duplicate Scan Log Output
									</div>
									<div className="hm-console-controls">
										<button
											type="button"
											className="hm-console-btn"
											onClick={() => setLogs([])}
										>
											Clear
										</button>
										<button
											type="button"
											className="hm-console-btn"
											onClick={() => setShowConsole(!showConsole)}
										>
											{showConsole ? 'Hide' : 'Show'} Console
										</button>
									</div>
								</div>

								{showConsole && (
									<div className="hm-console-body">
										{logs.length === 0 ? (
											<div className="hm-console-line" style={{ color: '#64748b' }}>
												Ready to scan. Click "Run Duplicate Scan" to start logging activity.
											</div>
										) : (
											logs.map((log, idx) => {
												let lineClass = 'hm-console-line'
												if (log.includes('[FOUND]')) lineClass += ' hm-console-line-found'
												else if (log.includes('[BATCH]')) lineClass += ' hm-console-line-batch'
												else if (log.includes('[DONE]')) lineClass += ' hm-console-line-done'

												return (
													<div key={idx} className={lineClass}>
														{log}
													</div>
												)
											})
										)}
										<div ref={consoleEndRef} />
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			{(isScanning || isScanned) && (
				<div>
					<div className="hm-panel-header">
					<div>
						<div className="hm-panel-title">
							Duplicate Media Groups
						</div>
						<div className="hm-panel-subtitle">
							Files with identical content hashes identified across your library.
						</div>
					</div>
					<div className="hm-panel-actions">
						<Button
							variant="secondary"
							className="hm-button hm-button-outline"
							onClick={autoSelectDuplicates}
							disabled={groups.length === 0 || isLoading}
						>
							Auto-Select Duplicates
						</Button>
						<Button
							variant="secondary"
							className="hm-button hm-button-outline"
							onClick={handleDeleteSelected}
							disabled={isDeleting || Object.keys(selected).length === 0 || isLoading}
							style={{ marginLeft: 8 }}
						>
							{isDeleting ? 'Deleting…' : 'Delete Selected'}
						</Button>
					</div>
				</div>

				{error && (
					<Notice status="error" isDismissible={false}>
						<Text>Failed to load duplicate files. Run a scan or try again.</Text>
					</Notice>
				)}
				{deleteError && (
					<Notice status="error" isDismissible={false}>
						<Text>Failed to delete selected files.</Text>
					</Notice>
				)}

				{isLoading && (
					<div className="hm-module-loading">
						<Spinner />
						<Text>Loading duplicates…</Text>
					</div>
				)}

				{!isLoading && groups.length === 0 && !error && (
					<Text style={{ marginTop: 12, color: '#64748b' }}>
						No duplicate media groups found. Run a duplicate scan to detect duplicates.
					</Text>
				)}

				{!isLoading && groups.length > 0 && (
					<div className="hm-panel">
						{groups.map((group, idx) => (
							<div key={group.group_key || idx} style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
								<div style={{ background: '#f8fafc', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
									<div>
										<strong style={{ fontSize: 13, color: '#0f172a' }}>{group.file_name || `Group ${idx + 1}`}</strong>
										<span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>({group.duplicates || (group.items && group.items.length) || 0} copies)</span>
									</div>
									<span className="hm-tag" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
										Hash: {group.group_key ? group.group_key.substring(0, 10) + '…' : ''}
									</span>
								</div>

								<table className="hm-latest-table" style={{ margin: 0 }}>
									<thead>
										<tr>
											<th style={{ width: 40 }}>Select</th>
											<th style={{ width: 50 }}>Preview</th>
											<th>File Path / Name</th>
											<th>Size</th>
											<th>Date Uploaded</th>
											<th>Action</th>
										</tr>
									</thead>
									<tbody>
										{Array.isArray(group.items) &&
											group.items.map((item, itemIdx) => (
												<tr key={item.attachment_id || itemIdx}>
													<td>
														<input
															type="checkbox"
															checked={!!selected[item.attachment_id]}
															onChange={() => toggleSelect(item.attachment_id)}
														/>
													</td>
													<td>
														{item.file_url ? (
															<img
																src={item.file_url}
																alt={item.file_name}
																style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }}
															/>
														) : (
															<span style={{ fontSize: 11, color: '#94a3b8' }}>N/A</span>
														)}
													</td>
													<td>
														<div>
															<strong>{item.file_name}</strong> {itemIdx === 0 && <span style={{ fontSize: 10, background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: 999, marginLeft: 6 }}>Original</span>}
														</div>
														<span style={{ fontSize: 11, color: '#64748b' }}>ID: #{item.attachment_id}</span>
													</td>
													<td>{item.file_size}</td>
													<td>{item.date_uploaded}</td>
													<td>
														{item.file_url && (
															<a href={item.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
																View
															</a>
														)}
													</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
						))}

						{totalPages > 1 && (
							<div className="hm-footer-row" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
								<div>
									Page {page} of {totalPages} ({totalGroups} duplicate groups total)
								</div>
								<div>
									<Button
										variant="secondary"
										className="hm-button hm-button-outline"
										onClick={() => loadDuplicates(Math.max(1, page - 1))}
										disabled={page <= 1}
									>
										Previous
									</Button>
									<Button
										variant="secondary"
										className="hm-button hm-button-outline"
										onClick={() => loadDuplicates(Math.min(totalPages, page + 1))}
										disabled={page >= totalPages}
										style={{ marginLeft: 8 }}
									>
										Next
									</Button>
								</div>
							</div>
						)}
					</div>
				)}
			</div>
			)}
		</div>
	)
}
