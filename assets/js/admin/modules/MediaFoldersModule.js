import { useState, useEffect, useCallback } from '@wordpress/element'

export default function MediaFoldersModule() {
	const [folders, setFolders] = useState([])
	const [stats, setStats] = useState({ total: 0, uncategorized: 0 })
	const [loading, setLoading] = useState(true)
	const [newFolderName, setNewFolderName] = useState('')
	const [creating, setCreating] = useState(false)

	const fetchFolders = useCallback(() => {
		setLoading(true)
		if (window.wp && window.wp.apiFetch) {
			window.wp
				.apiFetch({ path: 'hoatzinmedia/v1/folders' })
				.then((res) => {
					setFolders(res.folders || [])
					setStats({
						total: res.total_attachments || 0,
						uncategorized: res.uncategorized_count || 0,
					})
					setLoading(false)
				})
				.catch(() => setLoading(false))
		}
	}, [])

	useEffect(() => {
		fetchFolders()
	}, [fetchFolders])

	const handleCreate = (e) => {
		e.preventDefault()
		if (!newFolderName.trim()) return

		setCreating(true)
		window.wp
			.apiFetch({
				path: 'hoatzinmedia/v1/folders',
				method: 'POST',
				data: { name: newFolderName.trim(), parent_id: 0 },
			})
			.then(() => {
				setNewFolderName('')
				setCreating(false)
				fetchFolders()
			})
			.catch((err) => {
				alert(err.message || 'Error creating folder')
				setCreating(false)
			})
	}

	const handleDelete = (id, name) => {
		if (!confirm(`Delete folder "${name}"? Media files will NOT be deleted.`)) return

		window.wp
			.apiFetch({
				path: `hoatzinmedia/v1/folders/${id}`,
				method: 'DELETE',
			})
			.then(() => fetchFolders())
			.catch((err) => alert(err.message || 'Failed to delete folder'))
	}

	return (
		<div className="hm-module-wrap">
			<div className="hm-module-header" style={{ marginBottom: '20px' }}>
				<h2>Virtual Media Folders Manager</h2>
				<p>Organize your media library with virtual folders without altering physical file paths on server disk.</p>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
				<div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
					<span style={{ fontSize: '12px', color: '#64748b' }}>Total Media Items</span>
					<div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a' }}>{stats.total}</div>
				</div>
				<div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
					<span style={{ fontSize: '12px', color: '#64748b' }}>Active Virtual Folders</span>
					<div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb' }}>{folders.length}</div>
				</div>
				<div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
					<span style={{ fontSize: '12px', color: '#64748b' }}>Uncategorized Media</span>
					<div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>{stats.uncategorized}</div>
				</div>
			</div>

			<div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
				<h3 style={{ marginTop: 0 }}>Create Virtual Folder</h3>
				<form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
					<input
						type="text"
						className="regular-text"
						placeholder="Folder name..."
						value={newFolderName}
						onChange={(e) => setNewFolderName(e.target.value)}
						disabled={creating}
					/>
					<button type="submit" className="button button-primary" disabled={creating}>
						{creating ? 'Creating...' : 'Add Folder'}
					</button>
				</form>

				<h3>Existing Folders</h3>
				{loading ? (
					<p>Loading virtual folders...</p>
				) : folders.length === 0 ? (
					<p style={{ color: '#64748b' }}>No virtual folders found. Create your first folder above or directly in the Media Library page!</p>
				) : (
					<table className="widefat fixed striped">
						<thead>
							<tr>
								<th>Folder Name</th>
								<th>Media Count</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{folders.map((f) => (
								<tr key={f.id}>
									<td>
										<strong>{f.name}</strong>
									</td>
									<td>{f.count} items</td>
									<td>
										<a
											href={`upload.php?hoatzinmedia_folder=${f.id}`}
											className="button button-small"
											style={{ marginRight: '8px' }}
										>
											View Files
										</a>
										<button
											type="button"
											className="button button-small button-link-delete"
											onClick={() => handleDelete(f.id, f.name)}
										>
											Delete
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	)
}
