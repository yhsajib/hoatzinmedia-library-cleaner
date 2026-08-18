import { useState, useEffect, useCallback, useRef } from '@wordpress/element'
import { Button, Text, Notice, Spinner } from '@wordpress/components'
import apiFetch from '@wordpress/api-fetch'

export default function SmartScanModule() {
	const [scanState, setScanState] = useState(null)
	const [isScanning, setIsScanning] = useState(false)
	const [scanError, setScanError] = useState(null)
	const [results, setResults] = useState([])
	const [resultsPage, setResultsPage] = useState(1)
	const [resultsTotalPages, setResultsTotalPages] = useState(0)
	const [resultsTotal, setResultsTotal] = useState(0)
	const [isLoadingResults, setIsLoadingResults] = useState(false)
	const [resultsError, setResultsError] = useState(null)
	const [selected, setSelected] = useState({})
	const [deleteError, setDeleteError] = useState(null)
	const [isDeleting, setIsDeleting] = useState(false)

	const [isScanned, setIsScanned] = useState(false)
	const [lastScannedTime, setLastScannedTime] = useState('')
	const [logs, setLogs] = useState([])
	const [showConsole, setShowConsole] = useState(true)

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

	const loadResults = useCallback(
		(page = 1) => {
			setIsLoadingResults(true)
			setResultsError(null)
			setDeleteError(null)

			apiFetch({
				path: `/hoatzinmedia/v1/unused-results?page=${page}&limit=20`,
				method: 'GET',
			})
				.then((response) => {
					if (!response) {
						return
					}

					const items = Array.isArray(response.results) ? response.results : []
					setResults(items)
					setResultsPage(response.page || page)
					setResultsTotalPages(response.total_pages || 0)
					setResultsTotal(response.total || items.length)
					setIsScanned(!!response.scanned)

					if (response.scan_meta && response.scan_meta.finished_at) {
						try {
							const date = new Date(response.scan_meta.finished_at)
							setLastScannedTime(date.toLocaleString())
						} catch (_e) {
							setLastScannedTime(response.scan_meta.finished_at)
						}
					}
					if (response.scan_meta && Array.isArray(response.scan_meta.logs) && response.scan_meta.logs.length > 0) {
						setLogs(response.scan_meta.logs)
					}

					setSelected({})
				})
				.catch((error) => {
					setResultsError(error)
				})
				.finally(() => {
					setIsLoadingResults(false)
				})
		},
		[]
	)

	const runScanStep = useCallback(
		(scanId = '') => {
			setScanError(null)

			return apiFetch({
				path: '/hoatzinmedia/v1/scan',
				method: 'POST',
				data: {
					scan_id: scanId,
				},
			})
				.then((response) => {
					if (!response) {
						return null
					}

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
				.catch((error) => {
					setScanError(error)
					return null
				})
		},
		[]
	)

	const checkActiveScan = useCallback(() => {
		apiFetch({
			path: '/hoatzinmedia/v1/scan',
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
								loadResults(1)
							}
						})
						.finally(() => {
							setIsScanning(false)
						})
				}
			})
			.catch(() => {})
	}, [runScanStep, loadResults])

	useEffect(() => {
		loadResults(1)
		checkActiveScan()
	}, [loadResults, checkActiveScan])

	const toggleSelect = useCallback((id) => {
		setSelected((prev) => {
			const next = { ...prev }
			if (next[id]) {
				delete next[id]
			} else {
				next[id] = true
			}
			return next
		})
	}, [])

	const handleDeleteIds = useCallback(
		(ids) => {
			if (!Array.isArray(ids) || ids.length === 0) {
				return Promise.resolve()
			}
			setIsDeleting(true)
			setDeleteError(null)
			return apiFetch({
				path: '/hoatzinmedia/v1/delete-unused',
				method: 'POST',
				data: { attachment_ids: ids },
			})
				.then(() => {
					loadResults(resultsPage)
				})
				.catch((error) => {
					setDeleteError(error)
				})
				.finally(() => {
					setIsDeleting(false)
				})
		},
		[loadResults, resultsPage]
	)

	const handleDeleteSelected = useCallback(() => {
		const ids = Object.keys(selected)
			.map((k) => parseInt(k, 10))
			.filter((n) => Number.isFinite(n) && n > 0)
		return handleDeleteIds(ids)
	}, [selected, handleDeleteIds])

	const handleDeleteRow = useCallback(
		(id) => {
			return handleDeleteIds([id])
		},
		[handleDeleteIds]
	)

	const handleRunScan = useCallback(() => {
		if (isScanning) {
			return
		}

		setIsScanning(true)
		setIsScanned(true)

		runScanStep()
			.then((response) => {
				if (response && response.finished) {
					loadResults(1)
				}
			})
			.finally(() => {
				setIsScanning(false)
			})
	}, [isScanning, runScanStep, loadResults])

	const canRunScan = !isScanning

	return (
		<div className="hm-scanner-layout">
			{!isScanned && !isScanning && (
				<div className="hm-scan-prompt-card">
					<div className="hm-scan-prompt-icon">🔍</div>
					<div className="hm-scan-prompt-title">Scan Media Library for Unused Files</div>
					<div className="hm-scan-prompt-desc">
						Analyze your WordPress database to safely detect unattached and orphaned media files taking up precious disk space.
					</div>
					<div className="hm-scan-prompt-features">
						<span className="hm-scan-prompt-feature">✓ Deep Database Verification</span>
						<span className="hm-scan-prompt-feature">✓ Real-time Progress Tracking</span>
						<span className="hm-scan-prompt-feature">✓ Instant Transient Caching</span>
					</div>
					<Button
						variant="primary"
						className="hm-button hm-button-primary"
						onClick={handleRunScan}
						disabled={!canRunScan}
						style={{ padding: '10px 24px', fontSize: 14 }}
					>
						Start Unused Media Scan
					</Button>
				</div>
			)}

			{(isScanning || isScanned) && (
				<div className="hm-scan-progress-box">
					<div className="hm-panel-header">
						<div>
							<div className="hm-panel-title">
								Smart Scan & Unused Media Scanner
							</div>
							<div className="hm-panel-subtitle">
								Live scanning with percentage tracking, activity logging, and fast transient caching.
							</div>
						</div>
						<div className="hm-panel-actions">
							<Button
								variant="primary"
								className="hm-button hm-button-primary"
								onClick={handleRunScan}
								disabled={!canRunScan}
							>
								{isScanning ? 'Scanning…' : 'Run Smart Scan'}
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
							<Text>
								Failed to run scan. Please try again in a moment.
							</Text>
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
										{processed.toLocaleString()} of {total.toLocaleString()} files scanned
									</span>
								</div>
								<div className="hm-progress-count-text">
									{scanState && scanState.found ? `${scanState.found} unused found` : ''}
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
										Live Scan Console Output
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
												Ready to scan. Click "Run Smart Scan" to start logging activity.
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
			)}

			<div>
				<div className="hm-panel-header">
					<div>
						<div className="hm-panel-title">
							Unused Media Files
						</div>
						<div className="hm-panel-subtitle">
							These files are not referenced in your content and can likely be safely removed.
						</div>
					</div>
					<div className="hm-panel-actions">
						<Text>
							{resultsTotal} file
							{resultsTotal === 1 ? '' : 's'} found
						</Text>
						<Button
							variant="secondary"
							className="hm-button hm-button-outline"
							onClick={handleDeleteSelected}
							disabled={
								isDeleting ||
								Object.keys(selected).length === 0 ||
								isLoadingResults
							}
							style={{ marginLeft: 8 }}
						>
							{isDeleting ? 'Deleting…' : 'Delete Selected'}
						</Button>
					</div>
				</div>

				{resultsError && (
					<Notice status="error" isDismissible={false}>
						<Text>
							Failed to load unused media. Run a scan or try again.
						</Text>
					</Notice>
				)}
				{deleteError && (
					<Notice status="error" isDismissible={false}>
						<Text>Failed to delete selected files.</Text>
					</Notice>
				)}

				{isLoadingResults && (
					<div className="hm-module-loading">
						<Spinner />
						<Text>Loading unused media…</Text>
					</div>
				)}

				{!isLoadingResults && results.length === 0 && !resultsError && (
					<Text style={{ marginTop: 12, color: '#64748b' }}>
						No unused media found yet. Run a smart scan to populate results.
					</Text>
				)}

				{!isLoadingResults && results.length > 0 && (
					<div className="hm-panel">
						<table className="hm-latest-table">
							<thead>
								<tr>
									<th>Select</th>
									<th>Preview</th>
									<th>Name</th>
									<th>Size</th>
									<th>Uploaded</th>
									<th>Link</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{results.map((item) => (
									<tr key={item.attachment_id}>
										<td>
											<input
												type="checkbox"
												checked={!!selected[item.attachment_id]}
												onChange={() =>
													toggleSelect(item.attachment_id)
												}
											/>
										</td>
										<td>
											{item.thumbnail_url || item.file_url ? (
												<img
													src={item.thumbnail_url || item.file_url}
													alt={item.file_name || ''}
													onError={(e) => {
														if (
															item.file_url &&
															e.target.src !== item.file_url
														) {
															e.target.src = item.file_url
														}
													}}
													style={{
														width: 40,
														height: 40,
														objectFit: 'cover',
														borderRadius: 8,
													}}
												/>
											) : (
												<span className="hm-tag">
													No preview
												</span>
											)}
										</td>
										<td>{item.file_name}</td>
										<td>{item.file_size}</td>
										<td>{item.date_uploaded}</td>
										<td>
											{(item.edit_url || item.file_url) && (
												<a
													href={item.edit_url || item.file_url}
													rel="noreferrer"
												>
													View
												</a>
											)}
										</td>
										<td>
											<Button
												variant="secondary"
												className="hm-button hm-button-outline"
												onClick={() =>
													handleDeleteRow(item.attachment_id)
												}
												disabled={isDeleting}
											>
												Delete
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{resultsTotalPages > 1 && (
							<div className="hm-footer-row" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
								<div>
									Page {resultsPage} of {resultsTotalPages}
								</div>
								<div>
									<Button
										variant="secondary"
										className="hm-button hm-button-outline"
										onClick={() =>
											loadResults(
												Math.max(1, resultsPage - 1)
											)
										}
										disabled={resultsPage <= 1}
									>
										Previous
									</Button>
									<Button
										variant="secondary"
										className="hm-button hm-button-outline"
										onClick={() =>
											loadResults(
												Math.min(
													resultsTotalPages,
													resultsPage + 1
												)
											)
										}
										disabled={
											resultsPage >= resultsTotalPages
										}
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
		</div>
	)
}
