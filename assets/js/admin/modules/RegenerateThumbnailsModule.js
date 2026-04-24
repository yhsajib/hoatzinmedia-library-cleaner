import { useState, useEffect, useCallback } from '@wordpress/element'
import { Button, Text, Notice, Spinner, CheckboxControl, Modal } from '@wordpress/components'
import apiFetch from '@wordpress/api-fetch'
import { close } from '@wordpress/icons'

export default function RegenerateThumbnailsModule() {
	const [page, setPage] = useState(1)
	const [perPage, setPerPage] = useState(20)
	const [items, setItems] = useState([])
	const [totalPages, setTotalPages] = useState(0)
	const [total, setTotal] = useState(0)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(null)
	const [selected, setSelected] = useState([])
	const [selectAllGlobal, setSelectAllGlobal] = useState(false)
	const [excludedIds, setExcludedIds] = useState([])
	const [working, setWorking] = useState(false)
	const [workMessage, setWorkMessage] = useState('')
	const [sizes, setSizes] = useState([])
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [hideBackupNotice, setHideBackupNotice] = useState(() => {
		try {
			const key = 'hm_regenerate_backup_notice_hide_until'
			const until = parseInt(window?.localStorage?.getItem(key) || '0', 10)
			return until && !Number.isNaN(until) ? Date.now() < until : false
		} catch {
			return false
		}
	})

	const loadLibrary = useCallback(
		(nextPage = 1, nextPerPage = perPage) => {
			setLoading(true)
			setError(null)
			apiFetch({
				path: `/hoatzinmedia/v1/regenerate/library?page=${nextPage}&per_page=${nextPerPage}`,
				method: 'GET',
			})
				.then((response) => {
					const list = (response && response.items) || []
					setItems(list)
					setPage(response && response.page ? response.page : nextPage)
					setPerPage(response && response.per_page ? response.per_page : nextPerPage)
					setTotalPages(response && response.total_pages ? response.total_pages : 0)
					setTotal(response && response.total ? response.total : list.length)
				})
				.catch((err) => {
					setError(err)
				})
				.finally(() => {
					setLoading(false)
				})
		},
		[perPage]
	)

	useEffect(() => {
		loadLibrary(1, perPage)
	}, [loadLibrary, perPage])

	useEffect(() => {
		apiFetch({ path: '/hoatzinmedia/v1/regenerate/sizes', method: 'GET' })
			.then((response) => {
				setSizes((response && response.sizes) || [])
			})
			.catch(() => {
				setSizes([])
			})
	}, [])

	const toggleSelect = useCallback((id) => {
		if (selectAllGlobal) {
			setExcludedIds((prev) => {
				const next = prev.slice()
				const idx = next.indexOf(id)
				if (idx === -1) next.push(id)
				else next.splice(idx, 1)
				return next
			})
			return
		}
		setSelected((prev) => {
			const next = prev.slice()
			const idx = next.indexOf(id)
			if (idx === -1) next.push(id)
			else next.splice(idx, 1)
			return next
		})
	}, [selectAllGlobal])

	const toggleSelectAll = useCallback(() => {
		if (items.length === 0) return
		if (selectAllGlobal) {
			setSelectAllGlobal(false)
			setExcludedIds([])
			setSelected([])
			return
		}
		setSelectAllGlobal(true)
		setExcludedIds([])
		setSelected([])
	}, [items, selectAllGlobal])

	const handleRegenerate = useCallback(() => {
		if (working) return
		const selectionCount = selectAllGlobal ? Math.max(0, total - excludedIds.length) : selected.length
		if (selectionCount === 0) {
			setWorkMessage('Select at least one image')
			return
		}
		setConfirmOpen(true)
	}, [working, selected, selectAllGlobal, excludedIds, total])

	const confirmRegenerate = useCallback(() => {
		setWorking(true)
		setWorkMessage('')
		apiFetch({
			path: '/hoatzinmedia/v1/regenerate',
			method: 'POST',
			data: {
				ids: selectAllGlobal ? [] : selected,
				all: selectAllGlobal ? true : false,
				exclude_ids: selectAllGlobal ? excludedIds : [],
			},
		})
			.then((response) => {
				const results = (response && response.results) || []
				const errors = results.filter((r) => r.status !== 'success')
				if (errors.length > 0) {
					setWorkMessage(`Some items failed: ${errors[0].message || 'Unknown error'}`)
				} else {
					setWorkMessage('Thumbnails regenerated successfully.')
				}
				setSelected([])
				setSelectAllGlobal(false)
				setExcludedIds([])
				loadLibrary(page, perPage)
			})
			.catch((err) => {
				const msg =
					(err && err.message) ||
					(err && err.data && err.data.message) ||
					'Failed to regenerate thumbnails.'
				setWorkMessage(msg)
			})
			.finally(() => {
				setWorking(false)
				setConfirmOpen(false)
			})
	}, [selected, selectAllGlobal, excludedIds, page, perPage, loadLibrary])

	const canWork = !working
	const showEmpty = !loading && items.length === 0 && !error
	const allSelected =
		selectAllGlobal ||
		(items.length > 0 && items.every((it) => selected.indexOf(it.id) !== -1))
	const hasSelection = selectAllGlobal ? Math.max(0, total - excludedIds.length) > 0 : selected.length > 0

	return (
		<div className="hm-scanner-layout">
			<div className="hm-panel">
				<div className="hm-panel-header">
					<div>
						<div className="hm-panel-title">Regenerate thumbnails</div>
						<div className="hm-panel-subtitle">
							Recreate image sizes for selected attachments
						</div>
					</div>
					<div className="hm-panel-actions">
						<Button
							variant="primary"
							className="hm-button hm-button-primary"
							onClick={handleRegenerate}
							disabled={!canWork || !hasSelection}
						>
							{working ? 'Regenerating…' : 'Regenerate thumbnails'}
						</Button>
					</div>
				</div>

				{!hideBackupNotice && (
					<div className="hm-converter-backup-warning">
						<div className="hm-converter-backup-warning-text">
							<strong>Important:</strong> Take a full backup before running this
							process. Regenerating thumbnails can overwrite derived image
							sizes and may take time on large libraries.
						</div>
						<Button
							isSmall
							icon={close}
							label="Hide for 1 day"
							onClick={() => {
								setHideBackupNotice(true)
								try {
									const key = 'hm_regenerate_backup_notice_hide_until'
									window?.localStorage?.setItem(
										key,
										String(Date.now() + 86400000)
									)
								} catch {}
							}}
							className="hm-converter-backup-warning-close"
						/>
					</div>
				)}

				{workMessage && (
					<Notice status="info" isDismissible={false}>
						<Text>{workMessage}</Text>
					</Notice>
				)}

				{error && (
					<Notice status="error" isDismissible={false}>
						<Text>Failed to load library.</Text>
					</Notice>
				)}

				{loading && (
					<div className="hm-module-loading">
						<Spinner />
						<Text>Loading library…</Text>
					</div>
				)}

				{showEmpty && <Text>No images found.</Text>}

				{!loading && items.length > 0 && (
					<div
						className="hm-layout"
						style={{
							marginTop: 12,
							display: 'grid',
							gridTemplateColumns: '1fr 360px',
							gap: 12,
							alignItems: 'start',
						}}
					>
						<div className="hm-panel">
							<table className="hm-latest-table">
								<thead>
									<tr>
										<th style={{ width: 36 }}>
											<CheckboxControl
												checked={allSelected}
												onChange={toggleSelectAll}
												label=""
											/>
										</th>
										<th>Preview</th>
										<th>Name</th>
										<th>Size</th>
										<th>Uploaded</th>
									</tr>
								</thead>
								<tbody>
									{items.map((item) => (
										<tr key={item.id}>
											<td>
												<CheckboxControl
													checked={
														selectAllGlobal
															? excludedIds.indexOf(item.id) === -1
															: selected.indexOf(item.id) !== -1
													}
													onChange={() => toggleSelect(item.id)}
													label=""
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
													<span className="hm-tag">No preview</span>
												)}
											</td>
											<td>{item.file_name || `#${item.id}`}</td>
											<td>{item.size_readable || ''}</td>
											<td>{item.date || ''}</td>
										</tr>
									))}
								</tbody>
							</table>
							{totalPages > 1 && (
								<div className="hm-footer-row">
									<div>
										Page {page} of {totalPages} · {total} items
									</div>
									<div>
										<Button
											variant="secondary"
											className="hm-button hm-button-outline"
											onClick={() =>
												loadLibrary(Math.max(1, page - 1), perPage)
											}
											disabled={page <= 1}
										>
											Previous
										</Button>
										<Button
											variant="secondary"
											className="hm-button hm-button-outline"
											onClick={() =>
												loadLibrary(Math.min(totalPages, page + 1), perPage)
											}
											disabled={page >= totalPages}
											style={{ marginLeft: 8 }}
										>
											Next
										</Button>
									</div>
								</div>
							)}
						</div>
						<div className="hm-panel">
							<div className="hm-panel-header">
								<div>
									<div className="hm-panel-title">Registered image sizes</div>
									<div className="hm-panel-subtitle">
										These sizes are regenerated per image
									</div>
								</div>
							</div>
							<table className="hm-latest-table" style={{ marginTop: 8 }}>
								<thead>
									<tr>
										<th>Size</th>
										<th>Dimensions</th>
										<th>Crop</th>
									</tr>
								</thead>
								<tbody>
									{(!sizes || sizes.length === 0) && (
										<tr>
											<td colSpan={3}>
												<div className="hm-empty-state">No sizes found.</div>
											</td>
										</tr>
									)}
									{sizes &&
										sizes.map((s) => (
											<tr key={s.name}>
												<td>{s.name}</td>
												<td>{(s.width || 0) + '×' + (s.height || 0)}</td>
												<td>{s.crop ? 'Yes' : 'No'}</td>
											</tr>
										))}
								</tbody>
							</table>
						</div>
					</div>
				)}
				{confirmOpen && (
					<Modal
						title="Regenerate thumbnails"
						onRequestClose={() => {
							if (!working) setConfirmOpen(false)
						}}
					>
						<div style={{ marginBottom: 12 }}>
							<Text>
								{selectAllGlobal
									? `Regenerate thumbnails for all images${
											excludedIds.length > 0 ? ` (excluding ${excludedIds.length})` : ''
										} now? They will be recreated for all registered sizes.`
									: 'Regenerate thumbnails for selected images now? They will be recreated for all registered sizes.'}
							</Text>
						</div>
						<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
							<Button variant="tertiary" onClick={() => setConfirmOpen(false)} disabled={working}>
								Cancel
							</Button>
							<Button
								variant="primary"
								onClick={confirmRegenerate}
								disabled={working}
								style={{ marginLeft: 8 }}
							>
								{working ? 'Regenerating…' : 'Regenerate'}
							</Button>
						</div>
					</Modal>
				)}
			</div>
		</div>
	)
}
