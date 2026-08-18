(function ($) {
	if (!window.wp || !wp.element || !wp.apiFetch) {
		return;
	}

	const { createElement, useState, useEffect, useCallback } = wp.element;
	const config = window.hoatzinMediaFoldersData || {};

	// Global selected upload folder ID
	window.hoatzinSelectedUploadFolderId = 0;

	// Helper for REST API requests
	const apiCall = (path, method = 'GET', data = null) => {
		const options = {
			path: 'hoatzinmedia/v1' + path,
			method: method,
		};
		if (data) {
			options.data = data;
		}
		if (config.nonce && wp.apiFetch.createNonceMiddleware) {
			wp.apiFetch.use(wp.apiFetch.createNonceMiddleware(config.nonce));
		}
		return wp.apiFetch(options);
	};

	/* ------------------------------------------------------------------
	 * 1. SIDEBAR FOR /wp-admin/upload.php
	 * ------------------------------------------------------------------ */
	function MediaFoldersSidebar() {
		const [folders, setFolders] = useState([]);
		const [totalCount, setTotalCount] = useState(0);
		const [uncategorizedCount, setUncategorizedCount] = useState(0);
		const [activeFolderId, setActiveFolderId] = useState(0); // 0 = All, -1 = Uncategorized, >0 = Folder ID
		const [loading, setLoading] = useState(true);
		const [isCreating, setIsCreating] = useState(false);
		const [newFolderName, setNewFolderName] = useState('');
		const [editingFolderId, setEditingFolderId] = useState(null);
		const [editingName, setEditingName] = useState('');

		const loadFolders = useCallback(() => {
			setLoading(true);
			apiCall('/folders')
				.then((res) => {
					setFolders(res.folders || []);
					setTotalCount(res.total_attachments || 0);
					setUncategorizedCount(res.uncategorized_count || 0);
					setLoading(false);
				})
				.catch(() => {
					setLoading(false);
				});
		}, []);

		useEffect(() => {
			loadFolders();
		}, [loadFolders]);

		// Filter WP Media Library view by folder ID
		const handleSelectFolder = (id) => {
			setActiveFolderId(id);
			const folderId = id > 0 ? id : 0;
			window.hoatzinSelectedUploadFolderId = folderId;

			// Sync active upload folder with backend user_meta
			apiCall('/folders/active-upload-folder', 'POST', { folder_id: folderId }).catch(() => {});

			// 1. Grid View (wp.media)
			if (window.wp && wp.media && wp.media.frame) {
				try {
					const library = wp.media.frame.content.get().collection;
					if (library && library.props) {
						if (id === 0) {
							library.props.unset('hoatzinmedia_folder');
						} else {
							library.props.set('hoatzinmedia_folder', id);
						}
						library.more();
					}
				} catch (e) {}
			}

			// 2. List View or URL updates
			const url = new URL(window.location.href);
			if (id === 0) {
				url.searchParams.delete('hoatzinmedia_folder');
			} else {
				url.searchParams.set('hoatzinmedia_folder', id);
			}
			window.history.pushState({}, '', url.toString());

			// If in list view table, update form & reload list query
			if ($('table.wp-list-table').length) {
				let $hidden = $('#hm-folder-filter-input');
				if (!$hidden.length) {
					$hidden = $('<input type="hidden" id="hm-folder-filter-input" name="hoatzinmedia_folder" />').appendTo('#posts-filter');
				}
				$hidden.val(id === 0 ? '' : id);
				$('#post-query-submit').click();
			}
		};

		// Create Folder
		const handleCreateFolder = (e) => {
			e.preventDefault();
			if (!newFolderName.trim()) return;

			apiCall('/folders', 'POST', { name: newFolderName.trim(), parent_id: 0 })
				.then(() => {
					setNewFolderName('');
					setIsCreating(false);
					loadFolders();
				})
				.catch((err) => {
					alert(err.message || 'Error creating folder.');
				});
		};

		// Save Rename Folder
		const handleSaveRename = (id) => {
			if (!editingName.trim()) return;
			apiCall(`/folders/${id}`, 'PUT', { name: editingName.trim() })
				.then(() => {
					setEditingFolderId(null);
					setEditingName('');
					loadFolders();
				})
				.catch((err) => alert(err.message || 'Failed to rename folder.'));
		};

		// Delete Folder
		const handleDeleteFolder = (id, name) => {
			if (!confirm(`Are you sure you want to delete folder "${name}"? Media files will NOT be deleted off disk.`)) {
				return;
			}
			apiCall(`/folders/${id}`, 'DELETE')
				.then(() => {
					if (activeFolderId === id) {
						handleSelectFolder(0);
					}
					loadFolders();
				})
				.catch((err) => alert(err.message || 'Failed to delete folder.'));
		};

		return createElement(
			'div',
			{ className: 'hm-folders-sidebar-wrap' },
			// Header
			createElement(
				'div',
				{ className: 'hm-folders-header' },
				createElement(
					'div',
					{ className: 'hm-folders-title-wrap' },
					createElement('span', { className: 'dashicons dashicons-category' }),
					createElement('h3', { className: 'hm-folders-title' }, config.i18n.folders || 'Virtual Folders')
				),
				createElement(
					'button',
					{
						type: 'button',
						className: 'hm-folders-btn-add',
						onClick: () => setIsCreating(!isCreating),
						title: config.i18n.addFolder || 'New Folder',
					},
					'+ New'
				)
			),

			// Create Folder Form
			isCreating &&
				createElement(
					'form',
					{ className: 'hm-folders-create-form', onSubmit: handleCreateFolder },
					createElement('input', {
						type: 'text',
						className: 'hm-folders-input',
						placeholder: config.i18n.folderName || 'Folder Name...',
						value: newFolderName,
						onChange: (e) => setNewFolderName(e.target.value),
						autoFocus: true,
					}),
					createElement(
						'div',
						{ className: 'hm-folders-form-actions' },
						createElement('button', { type: 'submit', className: 'button button-primary button-small' }, 'Save'),
						createElement(
							'button',
							{
								type: 'button',
								className: 'button button-secondary button-small',
								onClick: () => setIsCreating(false),
							},
							'Cancel'
						)
					)
				),

			// List Group
			createElement(
				'div',
				{ className: 'hm-folders-list' },
				// All Files item
				createElement(
					'div',
					{
						className: `hm-folder-item ${activeFolderId === 0 ? 'is-active' : ''}`,
						onClick: () => handleSelectFolder(0),
					},
					createElement('span', { className: 'dashicons dashicons-admin-media' }),
					createElement('span', { className: 'hm-folder-name' }, config.i18n.allMedia || 'All Files'),
					createElement('span', { className: 'hm-folder-count' }, totalCount)
				),

				// Uncategorized item
				createElement(
					'div',
					{
						className: `hm-folder-item ${activeFolderId === -1 ? 'is-active' : ''}`,
						onClick: () => handleSelectFolder(-1),
					},
					createElement('span', { className: 'dashicons dashicons-portfolio' }),
					createElement('span', { className: 'hm-folder-name' }, config.i18n.uncategorized || 'Uncategorized'),
					createElement('span', { className: 'hm-folder-count' }, uncategorizedCount)
				),

				createElement('div', { className: 'hm-folders-divider' }),

				// Folder Tree Items
				loading
					? createElement('div', { className: 'hm-folders-loading' }, 'Loading folders…')
					: folders.length === 0
					? createElement('div', { className: 'hm-folders-empty' }, 'No folders created yet.')
					: folders.map((folder) =>
							createElement(
								'div',
								{
									key: folder.id,
									className: `hm-folder-item ${activeFolderId === folder.id ? 'is-active' : ''}`,
									onClick: () => handleSelectFolder(folder.id),
								},
								createElement('span', { className: 'dashicons dashicons-category' }),
								editingFolderId === folder.id
									? createElement('input', {
											type: 'text',
											className: 'hm-folders-inline-edit',
											value: editingName,
											onChange: (e) => setEditingName(e.target.value),
											onBlur: () => handleSaveRename(folder.id),
											onKeyDown: (e) => {
												if (e.key === 'Enter') handleSaveRename(folder.id);
												if (e.key === 'Escape') setEditingFolderId(null);
											},
											autoFocus: true,
											onClick: (e) => e.stopPropagation(),
									  })
									: createElement('span', { className: 'hm-folder-name' }, folder.name),
								createElement('span', { className: 'hm-folder-count' }, folder.count),

								// Action buttons
								createElement(
									'div',
									{ className: 'hm-folder-actions', onClick: (e) => e.stopPropagation() },
									createElement('button', {
										type: 'button',
										className: 'hm-folder-action-btn dashicons dashicons-edit',
										title: 'Rename',
										onClick: () => {
											setEditingFolderId(folder.id);
											setEditingName(folder.name);
										},
									}),
									createElement('button', {
										type: 'button',
										className: 'hm-folder-action-btn dashicons dashicons-trash',
										title: 'Delete',
										onClick: () => handleDeleteFolder(folder.id, folder.name),
									})
								)
							)
					  )
			)
		);
	}

	/* ------------------------------------------------------------------
	 * 2. CLEAN STANDALONE FOLDER SELECTOR FOR /wp-admin/media-new.php & INLINE DROPZONE
	 * ------------------------------------------------------------------ */
	function MediaNewFolderSelector() {
		const [folders, setFolders] = useState([]);
		const [selectedFolderId, setSelectedFolderId] = useState(window.hoatzinSelectedUploadFolderId || 0);
		const [loading, setLoading] = useState(true);

		const loadFolders = useCallback(() => {
			setLoading(true);
			apiCall('/folders')
				.then((res) => {
					setFolders(res.folders || []);
					setLoading(false);
				})
				.catch(() => setLoading(false));
		}, []);

		// Bind chosen folder to WordPress Uploader (Plupload) & Sync with Backend
		const attachFolderToUploader = useCallback((folderId) => {
			window.hoatzinSelectedUploadFolderId = folderId;
			setSelectedFolderId(folderId);

			// Sync active upload folder with user meta via REST API
			apiCall('/folders/active-upload-folder', 'POST', { folder_id: folderId }).catch(() => {});

			// 1. Plupload global / instance params
			if (window.wp && wp.Uploader && wp.Uploader.defaults) {
				wp.Uploader.defaults.multipart_params = wp.Uploader.defaults.multipart_params || {};
				wp.Uploader.defaults.multipart_params.hoatzinmedia_folder = folderId;
			}

			if (window.uploader && window.uploader.uploader) {
				const up = window.uploader.uploader;
				up.settings.multipart_params = up.settings.multipart_params || {};
				up.settings.multipart_params.hoatzinmedia_folder = folderId;
				if (typeof up.setOption === 'function') {
					up.setOption('multipart_params', up.settings.multipart_params);
				}
				up.bind('BeforeUpload', function (upInstance) {
					upInstance.settings.multipart_params = upInstance.settings.multipart_params || {};
					upInstance.settings.multipart_params.hoatzinmedia_folder = window.hoatzinSelectedUploadFolderId || 0;
					if (typeof upInstance.setOption === 'function') {
						upInstance.setOption('multipart_params', upInstance.settings.multipart_params);
					}
				});
			}

			// 2. Hidden form input for standard fallback uploads
			let $hidden = $('#hm_upload_folder_input');
			if (!$hidden.length) {
				$hidden = $('<input type="hidden" id="hm_upload_folder_input" name="hoatzinmedia_folder" />').appendTo('#file-form, #async-upload-wrap, .uploader-inline, #drag-drop-area, form');
			}
			$hidden.val(folderId);
		}, []);

		useEffect(() => {
			loadFolders();
		}, [loadFolders]);

		useEffect(() => {
			attachFolderToUploader(selectedFolderId);
		}, [selectedFolderId, attachFolderToUploader]);

		const handleFolderChange = (e) => {
			const id = parseInt(e.target.value, 10) || 0;
			attachFolderToUploader(id);
		};

		return createElement(
			'div',
			{ className: 'hm-media-new-folder-single' },
			createElement(
				'select',
				{
					id: 'hm-folder-select-clean',
					className: 'hm-folder-select-clean',
					value: selectedFolderId,
					onChange: handleFolderChange,
					disabled: loading,
				},
				createElement('option', { value: 0 }, 'Select Folder... (Default Uncategorized)'),
				folders.map((f) => createElement('option', { key: f.id, value: f.id }, f.name))
			)
		);
	}

	/* ------------------------------------------------------------------
	 * 3. DOM MOUNTING & PLUPLOAD HOOKS FOR upload.php & media-new.php
	 * ------------------------------------------------------------------ */
	function mountInlineUploaderFolderBox() {
		const $inlineContent = $('.uploader-inline-content');
		if ($inlineContent.length) {
			let $box = $('#hm-inline-uploader-folder-container');
			if (!$box.length) {
				$box = $('<div id="hm-inline-uploader-folder-container"></div>');
				const $maxUpload = $inlineContent.find('.max-upload-size');
				if ($maxUpload.length) {
					$box.insertBefore($maxUpload);
				} else {
					$inlineContent.append($box);
				}
			}
			if ($box.length && wp.element.render && !$box.children().length) {
				wp.element.render(createElement(MediaNewFolderSelector), $box[0]);
			}
		}
	}

	function mountMediaNewFolderBox() {
		const $dragInside = $('.drag-drop-inside');
		if ($dragInside.length) {
			let $box = $('#hm-media-new-folder-container');
			if (!$box.length) {
				$box = $('<div id="hm-media-new-folder-container"></div>');
				const $buttons = $dragInside.find('.drag-drop-buttons, #plupload-browse-button');
				if ($buttons.length) {
					$box.insertAfter($buttons.first());
				} else {
					const $maxUpload = $dragInside.find('.max-upload-size');
					if ($maxUpload.length) {
						$box.insertBefore($maxUpload);
					} else {
						$dragInside.append($box);
					}
				}
			}
			if ($box.length && wp.element.render && !$box.children().length) {
				wp.element.render(createElement(MediaNewFolderSelector), $box[0]);
			}
		}
	}

	function initApp() {
		const page = window.location.pathname;

		// Attach AJAX Interceptor for async-upload.php
		if (!window._hmAjaxSendHooked) {
			window._hmAjaxSendHooked = true;
			$(document).ajaxSend(function (event, xhr, settings) {
				if (settings && settings.url && settings.url.includes('async-upload.php')) {
					const folderId = window.hoatzinSelectedUploadFolderId || 0;
					if (folderId > 0) {
						if (typeof settings.data === 'string' && !settings.data.includes('hoatzinmedia_folder')) {
							settings.data += '&hoatzinmedia_folder=' + folderId;
						}
					}
				}
			});
		}

		// Global Plupload Prototype Hook for all uploader instances
		if (window.wp && wp.Uploader) {
			const originalInit = wp.Uploader.prototype.init;
			wp.Uploader.prototype.init = function () {
				if (originalInit) {
					originalInit.apply(this, arguments);
				}
				if (this.uploader) {
					this.uploader.bind('BeforeUpload', function (up) {
						const folderId = window.hoatzinSelectedUploadFolderId || 0;
						up.settings.multipart_params = up.settings.multipart_params || {};
						up.settings.multipart_params.hoatzinmedia_folder = folderId;
						if (typeof up.setOption === 'function') {
							up.setOption('multipart_params', up.settings.multipart_params);
						}
					});
				}
			};
		}

		// A. On /wp-admin/upload.php
		if (page.includes('upload.php')) {
			let $wrapper = $('#hm-media-folders-wrapper');
			if (!$wrapper.length) {
				$wrapper = $('<div id="hm-media-folders-wrapper"></div>');
				const $wpFilter = $('.wp-filter');
				if ($wpFilter.length) {
					$wrapper.insertBefore($wpFilter);
				} else if ($('#wpbody-content').length) {
					$('#wpbody-content').prepend($wrapper);
				}
			}
			if ($wrapper.length && wp.element.render && !$wrapper.children().length) {
				wp.element.render(createElement(MediaFoldersSidebar), $wrapper[0]);
			}

			mountInlineUploaderFolderBox();

			if (window.wp && wp.media && wp.media.view && wp.media.view.UploaderInline) {
				const origUploaderRender = wp.media.view.UploaderInline.prototype.render;
				wp.media.view.UploaderInline.prototype.render = function () {
					const res = origUploaderRender.apply(this, arguments);
					setTimeout(mountInlineUploaderFolderBox, 50);
					return res;
				};
			}

			try {
				const observer = new MutationObserver(function () {
					mountInlineUploaderFolderBox();
				});
				observer.observe(document.body, { childList: true, subtree: true });
			} catch (e) {}
		}

		// B. On /wp-admin/media-new.php
		if (page.includes('media-new.php')) {
			mountMediaNewFolderBox();

			try {
				const observer = new MutationObserver(function () {
					mountMediaNewFolderBox();
				});
				observer.observe(document.body, { childList: true, subtree: true });
			} catch (e) {}
		}
	}

	$(document).ready(initApp);
	$(window).on('load', initApp);
	setInterval(initApp, 1000);

	/* ------------------------------------------------------------------
	 * 4. STYLES FOR BOTH MODULES & INLINE DROPZONE
	 * ------------------------------------------------------------------ */
	const styles = `
		#hm-media-folders-wrapper {
			margin: 15px 0;
			background: #ffffff;
			border: 1px solid #c3c4c7;
			border-radius: 8px;
			padding: 12px 16px;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
		}
		.hm-folders-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 10px;
		}
		.hm-folders-title-wrap {
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.hm-folders-title-wrap .dashicons {
			color: #2271b1;
		}
		.hm-folders-title {
			margin: 0;
			font-size: 14px;
			font-weight: 600;
			color: #1d2327;
		}
		.hm-folders-btn-add {
			background: #f0f6fc;
			color: #2271b1;
			border: 1px solid #2271b1;
			border-radius: 4px;
			padding: 2px 10px;
			font-size: 12px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.15s ease-in-out;
		}
		.hm-folders-btn-add:hover {
			background: #2271b1;
			color: #ffffff;
		}
		.hm-folders-create-form {
			display: flex;
			gap: 8px;
			margin-bottom: 12px;
		}
		.hm-folders-input {
			flex: 1;
			font-size: 13px;
			padding: 4px 8px;
		}
		.hm-folders-form-actions {
			display: flex;
			gap: 4px;
		}
		.hm-folders-list {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
		}
		.hm-folder-item {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 6px 12px;
			background: #f6f7f7;
			border: 1px solid #dcdcde;
			border-radius: 20px;
			font-size: 13px;
			color: #3c434a;
			cursor: pointer;
			user-select: none;
			transition: all 0.15s ease;
		}
		.hm-folder-item:hover {
			background: #f0f6fc;
			border-color: #2271b1;
			color: #2271b1;
		}
		.hm-folder-item.is-active {
			background: #2271b1;
			border-color: #2271b1;
			color: #ffffff;
		}
		.hm-folder-item.is-active .dashicons,
		.hm-folder-item.is-active .hm-folder-count {
			color: #ffffff;
		}
		.hm-folder-count {
			background: rgba(0, 0, 0, 0.08);
			padding: 1px 6px;
			border-radius: 10px;
			font-size: 11px;
			font-weight: 600;
		}
		.hm-folders-divider {
			width: 1px;
			height: 24px;
			background: #dcdcde;
			margin: 0 4px;
		}
		.hm-folder-actions {
			display: none;
			align-items: center;
			gap: 2px;
			margin-left: 4px;
		}
		.hm-folder-item:hover .hm-folder-actions {
			display: inline-flex;
		}
		.hm-folder-action-btn {
			background: transparent;
			border: none;
			font-size: 14px;
			width: 18px;
			height: 18px;
			cursor: pointer;
			color: #646970;
		}
		.hm-folder-action-btn:hover {
			color: #d63638;
		}
		.hm-folders-loading,
		.hm-folders-empty {
			font-size: 12px;
			color: #646970;
			padding: 4px 0;
		}

		/* Fix drag-drop-area height so dropdown doesn't overlap the bottom dotted border */
		#drag-drop-area {
			min-height: 280px !important;
			height: auto !important;
			padding: 25px 0 !important;
		}
		.drag-drop-inside {
			padding: 10px 0 !important;
		}
		.drag-drop-buttons {
			margin-bottom: 12px !important;
		}

		/* Clean standalone folder select box */
		#hm-media-new-folder-container,
		#hm-inline-uploader-folder-container {
			margin: 12px auto 16px auto !important;
			display: block !important;
			text-align: center !important;
			clear: both !important;
			position: relative !important;
			z-index: 10 !important;
		}
		.hm-media-new-folder-single {
			display: inline-block !important;
		}
		.hm-folder-select-clean {
			min-width: 240px !important;
			height: 36px !important;
			border: 1px solid #8c8f94 !important;
			border-radius: 6px !important;
			font-size: 13px !important;
			font-weight: 500 !important;
			padding: 0 14px !important;
			background: #ffffff !important;
			color: #1d2327 !important;
			box-shadow: 0 1px 3px rgba(0,0,0,0.08) !important;
			cursor: pointer !important;
		}
		.hm-folder-select-clean:focus {
			border-color: #2271b1 !important;
			box-shadow: 0 0 0 1px #2271b1 !important;
			outline: 2px solid transparent !important;
		}
	`;

	const styleTag = document.createElement('style');
	styleTag.textContent = styles;
	document.head.appendChild(styleTag);
})(jQuery);
