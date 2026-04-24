import { useState, useEffect, useCallback } from '@wordpress/element'
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

	const progress = scanState && typeof scanState.progress === 'number' ? scanState.progress : 0
	const spaceSavedReadable =
		(scanState && scanState.estimated_space_saved_readable) ||
		(scanState && scanState.estimatedSpaceSavedReadable) ||
		''
	const total = scanState && typeof scanState.total === 'number' ? scanState.total : 0
	const processed = scanState && typeof scanState.processed === 'number' ? scanState.processed : 0
	const finished = !!(scanState && scanState.finished)

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

	useEffect(() => {
		loadResults(1)
	}, [loadResults])

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

					if (!response.finished && response.scan_id) {
						return new Promise((resolve) => {
							setTimeout(() => {
								resolve(runScanStep(response.scan_id))
							}, 500)
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

	const handleRunScan = useCallback(() => {
		if (isScanning) {
			return
		}

		setIsScanning(true)

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
			<div>
				<div className="hm-panel-header">
					<div>
						<div className="hm-panel-title">
							Smart scan and unused media results
						</div>
						<div className="hm-panel-subtitle">
							Scan your media library for unused files and review them in one place.
						</div>
					</div>
					<div className="hm-panel-actions">
						<Button
							variant="primary"
							className="hm-button hm-button-primary"
							onClick={handleRunScan}
							disabled={!canRunScan}
						>
							{isScanning ? 'Scanning…' : 'Run smart scan'}
						</Button>
					</div>
				</div>

				{scanError && (
					<Notice status="error" isDismissible={false}>
						<Text>
							Failed to run scan. Please try again in a moment.
						</Text>
					</Notice>
				)}

				<div className="hm-progress-track">
					<div
						className={
							'hm-progress-fill' +
							(isScanning ? ' hm-progress-fill-running' : '')
						}
						style={{
							transform: `scaleX(${Math.max(
								0,
								Math.min(1, progress / 100)
							)})`,
						}}
					/>
				</div>
				<div className="hm-progress-labels">
					<span>
						Progress: {progress}% ({processed} of {total} files)
					</span>
					<span>
						Estimated reclaimable space{' '}
						{spaceSavedReadable || 'Not available yet'}
					</span>
				</div>
				{finished && (
					<Text size="12">
						Scan finished. Review unused files below.
					</Text>
				)}
			</div>

			<div>
				<div className="hm-panel-header">
					<div>
						<div className="hm-panel-title">
							Unused media files
						</div>
						<div className="hm-panel-subtitle">
							These files are not referenced in your content and can likely be removed.
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
							{isDeleting ? 'Deleting…' : 'Delete selected'}
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
					<Text>
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
							<div className="hm-footer-row">
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
