;(function () {
	var element = wp.element
	var i18n = wp.i18n
	var apiFetch =
		typeof wp !== 'undefined' && wp.apiFetch
			? (typeof wp.apiFetch === 'function' ? wp.apiFetch : (wp.apiFetch.default || null))
			: null

	var HM_TEXT_DOMAIN = 'hoatzinmedia-library-cleaner'
	;(function () {
		var originalTranslate = i18n.__
		i18n.__ = function (text, domain) {
			if (!domain || domain === 'hoatzinmedia' || domain === HM_TEXT_DOMAIN) {
				return originalTranslate(text, HM_TEXT_DOMAIN)
			}
			return originalTranslate(text, domain)
		}
	})()

	var useState = element.useState
	var useEffect = element.useEffect
	var useRef = element.useRef

	var MODULE_TABS = [
		{
			id: 'dashboard',
			label: i18n.__('Dashboard', HM_TEXT_DOMAIN),
		},
		{
			id: 'smart_scan',
			label: i18n.__('Smart Scan & Unused Media', HM_TEXT_DOMAIN),
		},
		{
			id: 'duplicates',
			label: i18n.__('Duplicate Checker', HM_TEXT_DOMAIN),
		},
		{
			id: 'image_formats',
			label: i18n.__('Convert (WebP / AVIF)', HM_TEXT_DOMAIN),
		},
		{
			id: 'large_files',
			label: i18n.__('Large Files', HM_TEXT_DOMAIN),
		},
		{
			id: 'regenerate',
			label: i18n.__('Regenerate Thumbnails', HM_TEXT_DOMAIN),
		},
		{
			id: 'svg_support',
			label: i18n.__('SVG Support', HM_TEXT_DOMAIN),
		},
		{
			id: 'settings',
			label: i18n.__('Modules', HM_TEXT_DOMAIN),
		},
		{
			id: 'general_settings',
			label: i18n.__('Settings', HM_TEXT_DOMAIN),
		},
		
	]

	function hmNormalizeApiError(err) {
		if (!err) {
			return { message: i18n.__('Unknown error', HM_TEXT_DOMAIN) }
		}
		if (typeof err === 'string') {
			return { message: err }
		}
		var message = ''
		if (err.data && typeof err.data === 'object' && err.data.message) {
			message = String(err.data.message)
		} else if (err.message) {
			message = String(err.message)
		} else if (err.code) {
			message = String(err.code)
		} else {
			try {
				message = JSON.stringify(err)
			} catch (_e) {
				message = i18n.__('Unknown error', HM_TEXT_DOMAIN)
			}
		}
		var status = ''
		if (err.data && typeof err.data === 'object' && err.data.status) {
			status = String(err.data.status)
		} else if (err.statusCode) {
			status = String(err.statusCode)
		} else if (err.status) {
			status = String(err.status)
		}
		if (status && message.indexOf('(') === -1) {
			message = message + ' (' + status + ')'
		}
		return { message: message, raw: err }
	}

	function hmEmitGlobalError(err) {
		var normalized = hmNormalizeApiError(err)
		var message = normalized && normalized.message ? normalized.message : i18n.__('Unknown error', HM_TEXT_DOMAIN)
		try {
			if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
				var event = null
				try {
					event = new CustomEvent('hoatzinmedia_global_error', { detail: { message: message, raw: err } })
				} catch (_e1) {
					event = null
				}
				if (event) {
					window.dispatchEvent(event)
				}
			}
		} catch (_e2) {}
		return message
	}

	function hmApiFetchWithTimeout(options, timeoutMs) {
		if (!apiFetch) {
			return Promise.reject({
				message: i18n.__('wp.apiFetch is not available on this page.', HM_TEXT_DOMAIN),
			})
		}
		var ms = parseInt(timeoutMs, 10)
		if (!ms || ms < 1000) {
			ms = 20000
		}
		var controller = null
		var signal = null
		try {
			if (typeof AbortController !== 'undefined') {
				controller = new AbortController()
				signal = controller.signal
			}
		} catch (_e) {
			controller = null
			signal = null
		}
		var requestOptions = options || {}
		var silent = false
		try {
			if (requestOptions && typeof requestOptions.hmSilent !== 'undefined') {
				silent = !!requestOptions.hmSilent
				requestOptions = Object.assign({}, requestOptions)
				delete requestOptions.hmSilent
			}
		} catch (_e3) {}
		if (signal) {
			requestOptions = Object.assign({}, requestOptions, { signal: signal })
		}
		var timer = null
		var timeoutPromise = new Promise(function (_resolve, reject) {
			timer = window.setTimeout(function () {
				if (controller) {
					try {
						controller.abort()
					} catch (_e2) {}
				}
				reject({
					message: i18n.__('Request timed out. The server may be slow or blocked.', HM_TEXT_DOMAIN),
				})
			}, ms)
		})
		return Promise.race([apiFetch(requestOptions), timeoutPromise])
			.catch(function (err) {
				if (!silent) {
					hmEmitGlobalError(err)
				}
				return Promise.reject(err)
			})
			.finally(function () {
				if (timer) {
					window.clearTimeout(timer)
				}
			})
	}

	function useDashboardData() {
		var _useStateData = useState(null)
		var data = _useStateData[0]
		var setData = _useStateData[1]

		var _useStateLoading = useState(true)
		var loading = _useStateLoading[0]
		var setLoading = _useStateLoading[1]

		var _useStateError = useState(null)
		var error = _useStateError[0]
		var setError = _useStateError[1]

		function fetchDashboard(options) {
			var force = options && options.force
			var path = 'hoatzinmedia/v1/dashboard'
			if (force) {
				path = path + '?force=1&_ts=' + Date.now()
			}

			setLoading(true)
			setError(null)

			return apiFetch({
				path: path,
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function (response) {
					setData(response)
				})
				.catch(function (err) {
					setError(true)
					throw err
				})
				.finally(function () {
					setLoading(false)
				})
		}

		useEffect(function () {
			fetchDashboard().catch(function () {})
		}, [])

		return {
			data: data,
			loading: loading,
			error: error,
			reload: fetchDashboard,
		}
	}

	function useModulesState() {
		var defaultState = {
			dashboard: { enabled: true },
			smart_scan: { enabled: true },
			duplicates: { enabled: true },
			image_formats: { enabled: true },
			trash: { enabled: true },
			large_files: { enabled: true },
			regenerate: { enabled: true },
			svg_support: { enabled: true },
			settings: { enabled: true },
		}

		var storageKey = 'hoatzinmedia_modules_state'
		function safeParseJSON(value) {
			if (!value || typeof value !== 'string') {
				return null
			}
			try {
				return JSON.parse(value)
			} catch (e) {
				return null
			}
		}

		function buildInitialState(incoming) {
			var merged = {}
			Object.keys(defaultState).forEach(function (id) {
				var base = defaultState[id]
				var incomingModule = incoming && typeof incoming === 'object' ? incoming[id] : null
				if (incomingModule && typeof incomingModule === 'object') {
					merged[id] = {
						enabled:
							typeof incomingModule.enabled === 'boolean'
								? incomingModule.enabled
								: base.enabled,
					}
				} else {
					merged[id] = base
				}
			})
			return merged
		}

		var incomingInitial = null
		if (
			typeof HoatzinMediaSettings !== 'undefined' &&
			HoatzinMediaSettings &&
			HoatzinMediaSettings.modules &&
			typeof HoatzinMediaSettings.modules === 'object'
		) {
			incomingInitial = HoatzinMediaSettings.modules
		} else if (typeof window !== 'undefined' && window.localStorage) {
			var stored = safeParseJSON(window.localStorage.getItem(storageKey))
			if (stored && typeof stored === 'object') {
				incomingInitial = stored
			}
		}

		var initialState = buildInitialState(incomingInitial)

		var _useStateModules = useState(initialState)
		var modules = _useStateModules[0]
		var setModules = _useStateModules[1]

		var _useStateLoading = useState(false)
		var loading = _useStateLoading[0]
		var setLoading = _useStateLoading[1]

		var _useStateSaving = useState(false)
		var saving = _useStateSaving[0]
		var setSaving = _useStateSaving[1]

		var _useStateError = useState(null)
		var error = _useStateError[0]
		var setError = _useStateError[1]

		useEffect(
			function () {
				if (typeof window === 'undefined' || !window.localStorage) {
					return
				}
				window.localStorage.setItem(storageKey, JSON.stringify(modules))
			},
			[modules]
		)

		useEffect(function () {
			setLoading(true)
			setError(null)

			apiFetch({
				path: 'hoatzinmedia/v1/modules',
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function (response) {
					if (response && response.modules && typeof response.modules === 'object') {
						var incoming = response.modules
						var merged = {}

						Object.keys(defaultState).forEach(function (id) {
							var base = defaultState[id]
							var incomingModule = incoming[id]

							if (incomingModule && typeof incomingModule === 'object') {
								var enabled =
									typeof incomingModule.enabled === 'boolean'
										? incomingModule.enabled
										: base.enabled
								merged[id] = {
									enabled: enabled,
								}
							} else {
								merged[id] = base
							}
						})

						setModules(merged)
					} else {
						setModules(defaultState)
					}
				})
				.catch(function () {
					setError(true)
					setModules(defaultState)
				})
				.finally(function () {
					setLoading(false)
				})
		}, [])

		function persist(nextModules) {
			setSaving(true)
			setError(null)

			apiFetch({
				path: 'hoatzinmedia/v1/modules',
				method: 'POST',
				data: {
					modules: nextModules,
				},
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function () {})
				.catch(function () {
					setError(true)
				})
				.finally(function () {
					setSaving(false)
				})
		}

		function toggleModule(id, enabledOverride) {
			setModules(function (current) {
				var currentModule = current[id] || defaultState[id] || { enabled: true }
				var nextEnabled =
					typeof enabledOverride === 'boolean'
						? enabledOverride
						: !currentModule.enabled

				var nextModules = {}

				Object.keys(defaultState).forEach(function (key) {
					var existing = current[key] || defaultState[key] || { enabled: true }

					if (key === id) {
						nextModules[key] = {
							enabled: nextEnabled,
						}
					} else {
						nextModules[key] = {
							enabled: existing.enabled !== false,
						}
					}
				})

				persist(nextModules)

				return nextModules
			})
		}

		return {
			modules: modules,
			loading: loading,
			saving: saving,
			error: error,
			toggleModule: toggleModule,
		}
	}

	function useAnimatedNumber(value, duration) {
		if (!duration) {
			duration = 500
		}

		var _useStateNumber = useState(typeof value === 'number' ? value : 0)
		var animated = _useStateNumber[0]
		var setAnimated = _useStateNumber[1]

		var valueRef = useRef(animated)

		useEffect(
			function () {
				var target = typeof value === 'number' ? value : 0
				var start = valueRef.current

				if (start === target) {
					return
				}

				var startTime = null
				var frameId = null

				function step(timestamp) {
					if (startTime === null) {
						startTime = timestamp
					}

					var progress = (timestamp - startTime) / duration

					if (progress > 1) {
						progress = 1
					}

					var current = Math.round(start + (target - start) * progress)

					valueRef.current = current
					setAnimated(current)

					if (progress < 1) {
						frameId = window.requestAnimationFrame(step)
					}
				}

				frameId = window.requestAnimationFrame(step)

				return function () {
					if (frameId) {
						window.cancelAnimationFrame(frameId)
					}
				}
			},
			[value, duration]
		)

		return animated
	}

	function ToastNotifications(props) {
		if (!props.toasts.length) {
			return null
		}

		return element.createElement(
			'div',
			{ className: 'hm-toast-container' },
			props.toasts.map(function (toast) {
				var classes = ['hm-toast']

				if (toast.type === 'success') {
					classes.push('hm-toast-success')
				} else if (toast.type === 'error') {
					classes.push('hm-toast-error')
				} else {
					classes.push('hm-toast-info')
				}

				return element.createElement(
					'div',
					{
						key: toast.id,
						className: classes.join(' '),
					},
					element.createElement(
						'div',
						null,
						toast.message
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-toast-close',
							onClick: function () {
								props.onDismiss(toast.id)
							},
						},
						'×'
					)
				)
			})
		)
	}

	function LoadingSkeleton(props) {
		if (!props.show) {
			return null
		}

		return element.createElement(
			'div',
			{ className: 'hm-grid-stats' },
			[0, 1, 2, 3].map(function (index) {
				return element.createElement(
					'div',
					{
						key: index,
						className: 'hm-card hm-skeleton-block hm-skeleton',
						style: { height: '70px' },
					}
				)
			})
		)
	}

	function ConfirmModal(props) {
		if (!props.open) {
			return null
		}
		var modalRef = useRef(null)
		var _useStatePos = useState(null)
		var anchorPos = _useStatePos[0]
		var setAnchorPos = _useStatePos[1]
		useEffect(
			function () {
				if (props.open && props.anchor && typeof window !== 'undefined') {
					try {
						var rect = props.anchor && props.anchor.rect ? props.anchor.rect : props.anchor
						var container = props.anchor && props.anchor.container ? props.anchor.container : null
						var containerWidth = props.anchor && props.anchor.containerWidth ? props.anchor.containerWidth : (typeof window !== 'undefined' ? window.innerWidth : 1024)
						var mh = modalRef.current ? modalRef.current.offsetHeight : 0
						var mw = modalRef.current ? modalRef.current.offsetWidth : 0
						var topBase = rect.top - (container ? container.top : 0)
						var leftBase = rect.left - (container ? container.left : 0)
						var top = topBase - (mh > 0 ? mh + 12 : 12)
						if (top < 12) {
							top = topBase + rect.height + 12
						}
						var left = leftBase
						var maxLeft = containerWidth - mw - 12
						if (left > maxLeft) {
							left = Math.max(12, maxLeft)
						}
						setAnchorPos({ top: top, left: left })
					} catch (_e) {}
				}
				function onKeyDown(e) {
					if (!props.open) {
						return
					}
					if (e.key === 'Escape') {
						if (props.onCancel) {
							props.onCancel()
						}
					} else if (e.key === 'Enter') {
						if (props.onConfirm && !props.busy) {
							props.onConfirm()
						}
					}
				}
				if (typeof window !== 'undefined') {
					window.addEventListener('keydown', onKeyDown)
				}
				return function () {
					if (typeof window !== 'undefined') {
						window.removeEventListener('keydown', onKeyDown)
					}
				}
			},
			[props.open, props.busy, props.onCancel, props.onConfirm]
		)
		return element.createElement(
			'div',
			{
				className: 'hm-modal-backdrop',
				style: anchorPos ? { position: 'absolute', inset: 0 } : undefined,
				onClick: function () {
					if (props.onCancel) {
						props.onCancel()
					}
				},
			},
			element.createElement(
				'div',
				{
					className: 'hm-modal',
					ref: modalRef,
					role: 'dialog',
					'aria-modal': 'true',
					onClick: function (e) {
						e.stopPropagation()
					},
					style: anchorPos
						? {
								position: 'absolute',
								top: anchorPos.top + 'px',
								left: anchorPos.left + 'px',
								transform: 'none',
						  }
						: undefined,
				},
				element.createElement('div', { className: 'hm-modal-header' }, props.title || ''),
				element.createElement('div', { className: 'hm-modal-body' }, props.message || '', props.children),
				element.createElement(
					'div',
					{ className: 'hm-modal-footer' },
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: props.onCancel,
							disabled: props.busy,
						},
						i18n.__('Cancel', HM_TEXT_DOMAIN)
					),
					props.secondaryLabel &&
						element.createElement(
							'button',
							{
								type: 'button',
								className: 'hm-button hm-button-outline',
								onClick: props.onSecondary,
								disabled: props.busy || props.secondaryDisabled,
								style: { marginLeft: '8px' },
							},
							props.secondaryLabel
						),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-primary',
							onClick: props.onConfirm,
							disabled: props.busy || props.confirmDisabled,
							style: { marginLeft: '8px' },
						},
						props.busy
							? (props.confirmBusyLabel || i18n.__('Working…', HM_TEXT_DOMAIN))
							: (props.confirmLabel || i18n.__('Confirm', HM_TEXT_DOMAIN))
					)
				)
			)
		)
	}

	function UploadsBreakdownModal(props) {
		useEffect(
			function () {
				try {
					if (typeof document !== 'undefined' && document.body && document.body.classList) {
						if (props.open) {
							document.body.classList.add('hm-modal-open')
						} else {
							document.body.classList.remove('hm-modal-open')
						}
					}
				} catch (_e0) {}
				function onKeyDown(e) {
					if (!props.open) {
						return
					}
					if (e.key === 'Escape') {
						if (props.onClose) {
							props.onClose()
						}
					}
				}
				if (typeof window !== 'undefined') {
					window.addEventListener('keydown', onKeyDown)
				}
				return function () {
					try {
						if (typeof document !== 'undefined' && document.body && document.body.classList) {
							document.body.classList.remove('hm-modal-open')
						}
					} catch (_e1) {}
					if (typeof window !== 'undefined') {
						window.removeEventListener('keydown', onKeyDown)
					}
				}
			},
			[props.open, props.onClose]
		)

		if (!props.open) {
			return null
		}

		var entries = Array.isArray(props.entries) ? props.entries : []
		var totals = props.totals && typeof props.totals === 'object' ? props.totals : {}
		var uploadsTotal = totals.uploads || 0
		var hmImagesTotal = totals['hoatzinmedia-images'] || 0
		var overallTotal = totals.overall || (uploadsTotal + hmImagesTotal)

		function labelForBase(base) {
			if (base === 'hoatzinmedia-images') {
				return 'wp-content/hoatzinmedia-images'
			}
			return 'uploads'
		}

		var modalTree = element.createElement(
			'div',
			{
				className: 'hm-modal-backdrop',
				onClick: function () {
					if (props.onClose) {
						props.onClose()
					}
				},
			},
			element.createElement(
				'div',
				{
					className: 'hm-modal hm-modal-wide',
					role: 'dialog',
					'aria-modal': 'true',
					onClick: function (e) {
						e.stopPropagation()
					},
				},
				element.createElement(
					'div',
					{ className: 'hm-modal-header hm-modal-header-row' },
					element.createElement(
						'span',
						null,
						i18n.__('Uploads folder breakdown', HM_TEXT_DOMAIN)
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-modal-close',
							onClick: function () {
								if (props.onClose) {
									props.onClose()
								}
							},
						},
						'×'
					)
				),
				element.createElement(
					'div',
					{ className: 'hm-modal-body' },
					!props.loading &&
						!props.error &&
						element.createElement(
							'div',
							{ className: 'hm-breakdown-totals' },
							i18n.__('Total:', HM_TEXT_DOMAIN),
							' ',
							String(overallTotal),
							' · ',
							labelForBase('uploads'),
							': ',
							String(uploadsTotal),
							' · ',
							labelForBase('hoatzinmedia-images'),
							': ',
							String(hmImagesTotal)
						),
					props.loading &&
						element.createElement(
							'div',
							{ className: 'hm-modal-loading' },
							i18n.__('Loading…', HM_TEXT_DOMAIN)
						),
					!props.loading &&
						props.error &&
						element.createElement(
							'div',
							{ className: 'hm-modal-error' },
							props.error
						),
					!props.loading &&
						!props.error &&
						(entries.length === 0
							? element.createElement(
									'div',
									{ className: 'hm-empty-state' },
									i18n.__('No folders found.', HM_TEXT_DOMAIN)
							  )
							: element.createElement(
									'table',
									{ className: 'hm-latest-table hm-breakdown-table' },
									element.createElement(
										'thead',
										null,
										element.createElement(
											'tr',
											null,
											element.createElement(
												'th',
												null,
												i18n.__('Folder', HM_TEXT_DOMAIN)
											),
											element.createElement(
												'th',
												{ style: { width: '140px', textAlign: 'right' } },
												i18n.__('Files', HM_TEXT_DOMAIN)
											)
										)
									),
									element.createElement(
										'tbody',
										null,
										entries.map(function (row) {
											var base = row && row.base ? String(row.base) : 'uploads'
											var folder = row && row.folder ? String(row.folder) : ''
											var count = row && typeof row.file_count !== 'undefined' ? row.file_count : 0
											var truncated = row && row.truncated ? true : false
											var countLabel = truncated ? String(count) + '+' : String(count)
											return element.createElement(
												'tr',
												{ key: base + ':' + folder },
												element.createElement(
													'td',
													null,
													labelForBase(base) + '/' + folder
												),
												element.createElement(
													'td',
													{ style: { textAlign: 'right' } },
													countLabel
												)
											)
										})
									)
							  ))
				),
				element.createElement(
					'div',
					{ className: 'hm-modal-footer' },
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: props.onClose,
						},
						i18n.__('Close', HM_TEXT_DOMAIN)
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-primary',
							onClick: function () {
								if (props.onRefresh) {
									props.onRefresh()
								}
							},
							disabled: !!props.loading,
							style: { marginLeft: '8px' },
						},
						props.loading
							? i18n.__('Refreshing…', HM_TEXT_DOMAIN)
							: i18n.__('Refresh', HM_TEXT_DOMAIN)
					)
				)
			)
		)

		if (element.createPortal && typeof document !== 'undefined' && document.body) {
			return element.createPortal(modalTree, document.body)
		}

		return modalTree
	}

	function Header(props) {
		return element.createElement(
			'div',
			{ className: 'hm-header' },
			element.createElement(
				'div',
				{ className: 'hm-header-main' },
				element.createElement(
					'div',
					{ className: 'hm-logo' },
					(function () {
						var url = (typeof window !== 'undefined' && window.HoatzinMediaSettings && window.HoatzinMediaSettings.logoUrl) ? window.HoatzinMediaSettings.logoUrl : ''
						if (url) {
							return element.createElement('img', { src: url, alt: 'HoatzinMedia', className: 'hm-logo-img' })
						}
						return 'HM'
					})()
				),
				element.createElement(
					'div',
					null,
					element.createElement(
						'div',
						{ className: 'hm-title' },
						i18n.__('HoatzinMedia Dashboard', HM_TEXT_DOMAIN)
					),
					element.createElement(
						'div',
						{ className: 'hm-subtitle' },
						i18n.__(
							'Smart media cleaner and storage optimizer overview',
							'hoatzinmedia'
						)
					)
				)
			),
			element.createElement(
				'div',
				{ className: 'hm-header-meta' },
				element.createElement(
					'div',
					{ className: 'hm-pill' },
					element.createElement(
						'span',
						null,
						i18n.__('Media Health', HM_TEXT_DOMAIN)
					),
					element.createElement(
						'strong',
						null,
						props.healthScore,
						'/100'
					)
				),
				element.createElement(
					'div',
					{ className: 'hm-subtitle' },
					i18n.__('Live metrics, scans and large file insights', HM_TEXT_DOMAIN)
				)
			)
		)
	}

	function StatsCards(props) {
		if (!props.data) {
			return element.createElement(LoadingSkeleton, { show: true })
		}

		var totalFiles = props.data.total_files || 0
		var unusedCount = props.data.unused_count || 0
		var totalSizeReadable = props.data.total_size_readable || ''
		var healthScore = props.data.health_score || 0

		var _useStateBreakdownOpen = useState(false)
		var breakdownOpen = _useStateBreakdownOpen[0]
		var setBreakdownOpen = _useStateBreakdownOpen[1]

		var _useStateBreakdownLoading = useState(false)
		var breakdownLoading = _useStateBreakdownLoading[0]
		var setBreakdownLoading = _useStateBreakdownLoading[1]

		var _useStateBreakdownError = useState(null)
		var breakdownError = _useStateBreakdownError[0]
		var setBreakdownError = _useStateBreakdownError[1]

		var _useStateBreakdownData = useState(null)
		var breakdownData = _useStateBreakdownData[0]
		var setBreakdownData = _useStateBreakdownData[1]

		function loadBreakdown(force) {
			var path = 'hoatzinmedia/v1/dashboard/uploads-breakdown?depth=2'
			if (force) {
				path = path + '&force=1&_ts=' + Date.now()
			}

			setBreakdownLoading(true)
			setBreakdownError(null)

			return hmApiFetchWithTimeout(
				{
					path: path,
					method: 'GET',
					headers: {
						'X-WP-Nonce': HoatzinMediaSettings.nonce,
					},
				},
				60000
			)
				.then(function (response) {
					setBreakdownData(response || null)
				})
				.catch(function (err) {
					try {
						window.__hoatzinmediaLastError = err
					} catch (_e) {}
					var normalized = hmNormalizeApiError(err)
					setBreakdownError(normalized.message)
				})
				.finally(function () {
					setBreakdownLoading(false)
				})
		}

		useEffect(
			function () {
				if (breakdownOpen && !breakdownData && !breakdownLoading && !breakdownError) {
					loadBreakdown(false)
				}
			},
			[breakdownOpen]
		)

		var unusedPercent = 0
		if (totalFiles > 0) {
			unusedPercent = Math.round((unusedCount / totalFiles) * 100)
		}

		var animatedTotalFiles = useAnimatedNumber(totalFiles, 600)
		var animatedUnusedCount = useAnimatedNumber(unusedCount, 600)
		var animatedUnusedPercent = useAnimatedNumber(unusedPercent, 600)
		var animatedHealthScore = useAnimatedNumber(healthScore, 600)

		return element.createElement(
			'div',
			{ className: 'hm-grid-stats' },
			element.createElement(
				'div',
				{ className: 'hm-card' },
				element.createElement(
					'div',
					{ className: 'hm-card-label' },
					i18n.__('Total files', HM_TEXT_DOMAIN)
				),
				element.createElement(
					'div',
					{ className: 'hm-card-value' },
					animatedTotalFiles.toLocaleString()
				),
				element.createElement(
					'div',
					{ className: 'hm-card-subvalue' },
					i18n.__('Indexed media items', HM_TEXT_DOMAIN)
				),
				element.createElement(
					'div',
					{ className: 'hm-card-actions' },
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline hm-button-xs',
							onClick: function () {
								setBreakdownOpen(true)
							},
						},
						i18n.__('Folder breakdown', HM_TEXT_DOMAIN)
					)
				),
				element.createElement(UploadsBreakdownModal, {
					open: breakdownOpen,
					onClose: function () {
						setBreakdownOpen(false)
					},
					onRefresh: function () {
						loadBreakdown(true)
					},
					loading: breakdownLoading,
					error: breakdownError,
					entries:
						breakdownData && Array.isArray(breakdownData.entries)
							? breakdownData.entries
							: [],
					totals:
						breakdownData && breakdownData.totals && typeof breakdownData.totals === 'object'
							? breakdownData.totals
							: null,
				})
			),
			element.createElement(
				'div',
				{ className: 'hm-card' },
				element.createElement(
					'div',
					{ className: 'hm-card-label' },
					i18n.__('Unused media', HM_TEXT_DOMAIN)
				),
				element.createElement(
					'div',
					{ className: 'hm-card-value' },
					animatedUnusedCount.toLocaleString()
				),
				element.createElement(
					'div',
					{ className: 'hm-card-subvalue' },
					animatedUnusedPercent,
					'% ',
					i18n.__('estimated unused', HM_TEXT_DOMAIN)
				)
			),
			element.createElement(
				'div',
				{ className: 'hm-card' },
				element.createElement(
					'div',
					{ className: 'hm-card-label' },
					i18n.__('Library size', HM_TEXT_DOMAIN)
				),
				element.createElement(
					'div',
					{ className: 'hm-card-value' },
					totalSizeReadable
				),
				element.createElement(
					'div',
					{ className: 'hm-card-subvalue' },
					i18n.__('Total storage consumed', HM_TEXT_DOMAIN)
				)
			),
			element.createElement(
				'div',
				{ className: 'hm-card' },
				element.createElement(
					'div',
					{ className: 'hm-card-label' },
					i18n.__('Health score', HM_TEXT_DOMAIN)
				),
				element.createElement(
					'div',
					{ className: 'hm-card-value' },
					animatedHealthScore,
					'/100'
				),
				element.createElement(
					'div',
					{ className: 'hm-card-subvalue' },
					i18n.__('Higher is better', HM_TEXT_DOMAIN)
				)
			)
		)
	}

	function StorageMeter(props) {
		var unusedCount = props.unusedCount || 0
		var totalFiles = props.totalFiles || 0
		var ratio = 0
		if (totalFiles > 0) {
			ratio = unusedCount / totalFiles
		}
		if (ratio > 1) {
			ratio = 1
		}

		return element.createElement(
			'div',
			{ className: 'hm-storage-meter' },
			element.createElement(
				'div',
				{ className: 'hm-storage-bar' },
				element.createElement('div', {
					className: 'hm-storage-bar-fill',
					style: { transform: 'scaleX(' + ratio.toFixed(2) + ')' },
				})
			),
			element.createElement(
				'div',
				{ className: 'hm-storage-bar-label' },
				i18n.__('Estimated unused portion of library', 'hoatzinmedia'),
				' ',
				Math.round(ratio * 100),
				'%'
			)
		)
	}

	function HealthScore(props) {
		var healthScore = props.healthScore || 0
		if (healthScore < 0) {
			healthScore = 0
		}
		if (healthScore > 100) {
			healthScore = 100
		}

		var _useStateDisplayed = useState(0)
		var displayed = _useStateDisplayed[0]
		var setDisplayed = _useStateDisplayed[1]

		useEffect(
			function () {
				var current = displayed
				if (current === healthScore) {
					return
				}
				var step = healthScore > current ? 1 : -1
				var id = window.setInterval(function () {
					current += step
					setDisplayed(current)
					if (current === healthScore) {
						window.clearInterval(id)
					}
				}, 12)
				return function () {
					window.clearInterval(id)
				}
			},
			[healthScore]
		)

		var radius = 52
		var circumference = 2 * Math.PI * radius
		var progressOffset = circumference - (displayed / 100) * circumference

		var statusLabel
		if (healthScore >= 90) {
			statusLabel = i18n.__('Excellent', 'hoatzinmedia')
		} else if (healthScore >= 75) {
			statusLabel = i18n.__('Good', 'hoatzinmedia')
		} else if (healthScore >= 50) {
			statusLabel = i18n.__('Needs optimization', 'hoatzinmedia')
		} else {
			statusLabel = i18n.__('Critical', 'hoatzinmedia')
		}

		return element.createElement(
			'div',
			{ className: 'hm-health-layout' },
			element.createElement(
				'div',
				{ className: 'hm-health-circle' },
				element.createElement(
					'svg',
					{ width: 130, height: 130 },
					element.createElement('circle', {
						className: 'hm-health-circle-bg',
						cx: 65,
						cy: 65,
						r: radius,
					}),
					element.createElement('circle', {
						className: 'hm-health-circle-fg',
						cx: 65,
						cy: 65,
						r: radius,
						style: {
							strokeDasharray: circumference + ' ' + circumference,
							strokeDashoffset: progressOffset,
						},
					})
				),
				element.createElement(
					'div',
					{ className: 'hm-health-circle-center' },
					element.createElement(
						'div',
						{ className: 'hm-health-score' },
						displayed
					),
					element.createElement(
						'div',
						{ className: 'hm-health-label' },
						statusLabel
					)
				)
			),
			element.createElement(
				'div',
				null,
				element.createElement(
					'div',
					{ className: 'hm-card-label' },
					i18n.__('Media health overview', 'hoatzinmedia')
				),
				element.createElement(
					'div',
					{ className: 'hm-card-subvalue' },
					i18n.__(
						'Lower unused ratio and smaller library footprint increase your score.',
						'hoatzinmedia'
					)
				),
				element.createElement(
					'div',
					{ className: 'hm-health-badges' },
					element.createElement(
						'div',
						{ className: 'hm-health-badge' },
						i18n.__('Unused media impact', 'hoatzinmedia')
					),
					element.createElement(
						'div',
						{ className: 'hm-health-badge' },
						i18n.__('Storage pressure', 'hoatzinmedia')
					),
					element.createElement(
						'div',
						{ className: 'hm-health-badge' },
						i18n.__('Large files density', 'hoatzinmedia')
					)
				)
			)
		)
	}

	function getReadableFileType(mimeType) {
		var map = {
			'image/jpeg': 'JPEG',
			'image/png': 'PNG',
			'image/gif': 'GIF',
			'image/webp': 'WebP',
			'image/svg+xml': 'SVG',
			'image/bmp': 'BMP',
			'image/tiff': 'TIFF',
			'image/x-icon': 'ICO',
			'application/pdf': 'PDF',
			'application/zip': 'ZIP',
			'application/x-gzip': 'GZIP',
			'text/plain': 'TXT',
			'text/csv': 'CSV',
			'text/html': 'HTML',
			'audio/mpeg': 'MP3',
			'audio/wav': 'WAV',
			'video/mp4': 'MP4',
			'video/quicktime': 'MOV',
			'video/webm': 'WebM',
		}
		if (map[mimeType]) {
			return map[mimeType]
		}
		var parts = mimeType.split('/')
		if (parts.length === 2) {
			return parts[1].toUpperCase()
		}
		return mimeType
	}

	function bytesToReadable(bytes) {
		var b = parseInt(bytes || 0, 10)
		if (isNaN(b) || b <= 0) {
			return '0 MB'
		}
		var mb = b / (1024 * 1024)
		if (mb < 1024) {
			return mb.toFixed(1) + ' MB'
		}
		var gb = mb / 1024
		return gb.toFixed(2) + ' GB'
	}

	function formatLocalDateTime(value) {
		if (!value || typeof value !== 'string') {
			return ''
		}
		var d = new Date(value)
		if (!d || isNaN(d.getTime())) {
			return ''
		}
		var yyyy = String(d.getFullYear())
		var mm = String(d.getMonth() + 1).padStart(2, '0')
		var dd = String(d.getDate()).padStart(2, '0')
		var hh = String(d.getHours()).padStart(2, '0')
		var mi = String(d.getMinutes()).padStart(2, '0')
		var ss = String(d.getSeconds()).padStart(2, '0')
		return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi + ':' + ss
	}

	function PieChart(props) {
		var canvasRef = useRef(null)
		var chartRef = useRef(null)
		var _useStateTip = useState(null)
		var tip = _useStateTip[0]
		var setTip = _useStateTip[1]
		var segmentsRef = useRef(null)
		var palette = ['#2563eb', '#22c55e', '#f97316', '#ec4899', '#0ea5e9', '#a855f7']
		var entries = Object.keys(props.data || {}).map(function (key, idx) {
			var val = (props.data && props.data[key]) || 0
			return {
				key: key,
				label: getReadableFileType(key),
				value: parseFloat(val) || 0,
				color: palette[idx % palette.length],
			}
		}).filter(function (e) {
			return e.value > 0
		})
		var totalLegend = entries.reduce(function (a, e) {
			return (parseFloat(a) || 0) + (parseFloat(e.value) || 0)
		}, 0)
		entries.sort(function (a, b) {
			return b.value - a.value
		})

		useEffect(
			function () {
				var data = props.data
				if (!data) {
					return
				}

				var labels = Object.keys(data).map(function (label) {
					return getReadableFileType(label)
				})
				var values = Object.values(data)

				if (!labels.length) {
					return
				}

				var canvasEl = canvasRef.current
				if (!canvasEl) {
					return
				}

				if (typeof Chart === 'undefined') {
					var container = canvasEl.parentNode
					var w = (container && container.clientWidth) ? container.clientWidth : 280
					var h = 190
					var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1
					canvasEl.width = Math.floor(w * dpr)
					canvasEl.height = Math.floor(h * dpr)
					canvasEl.style.width = w + 'px'
					canvasEl.style.height = h + 'px'
					var ctx2d = canvasEl.getContext('2d')
					if (!ctx2d) {
						return
					}
					ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
					ctx2d.clearRect(0, 0, w, h)
					var total = values.reduce(function (a, b) {
						return (parseFloat(a) || 0) + (parseFloat(b) || 0)
					}, 0)
					if (total <= 0) {
						return
					}
					var cx = Math.floor(w / 2)
					var cy = Math.floor(h / 2)
					var radius = Math.min(cx, cy) - 8
					var inner = Math.floor(radius * 0.7)
					var start = -Math.PI / 2
					var segs = []
					values.forEach(function (val, idx) {
						var v = parseFloat(val) || 0
						if (v <= 0) return
						var angle = (v / total) * Math.PI * 2
						var end = start + angle
						ctx2d.beginPath()
						ctx2d.moveTo(cx, cy)
						ctx2d.arc(cx, cy, radius, start, end)
						ctx2d.closePath()
						ctx2d.fillStyle = palette[idx % palette.length]
						ctx2d.fill()
						segs.push({ start: start, end: end, label: labels[idx], value: v, pct: Math.round((v / total) * 100) })
						start = end
					})
					ctx2d.beginPath()
					ctx2d.arc(cx, cy, inner, 0, Math.PI * 2)
					ctx2d.closePath()
					ctx2d.fillStyle = '#ffffff'
					ctx2d.fill()
					segmentsRef.current = { cx: cx, cy: cy, radius: radius, inner: inner, segs: segs }
					function onMove(e) {
						var geom = segmentsRef.current
						if (!geom) return
						var ox = e.offsetX
						var oy = e.offsetY
						var dx = ox - geom.cx
						var dy = oy - geom.cy
						var dist = Math.sqrt(dx * dx + dy * dy)
						if (dist < geom.inner || dist > geom.radius) {
							setTip(null)
							return
						}
						var ang = Math.atan2(dy, dx)
						var rel = ang - (-Math.PI / 2)
						if (rel < 0) rel += Math.PI * 2
						var hit = null
						for (var i = 0; i < geom.segs.length; i++) {
							var s = geom.segs[i]
							var sRel = s.start - (-Math.PI / 2)
							var eRel = s.end - (-Math.PI / 2)
							if (sRel < 0) { sRel += Math.PI * 2 }
							if (eRel < 0) { eRel += Math.PI * 2 }
							if (rel >= sRel && rel <= eRel) {
								hit = { i: i, s: s }
								break
							}
						}
						if (!hit) {
							setTip(null)
							return
						}
						setTip({
							x: ox + 12,
							y: oy + 12,
							label: hit.s.label,
							value: hit.s.value,
							pct: hit.s.pct,
						})
					}
					function onLeave() {
						setTip(null)
					}
					canvasEl.addEventListener('mousemove', onMove)
					canvasEl.addEventListener('mouseleave', onLeave)
					return function () {
						var ctxCleanup = canvasEl.getContext('2d')
						if (ctxCleanup) {
							ctxCleanup.clearRect(0, 0, w, h)
						}
						canvasEl.removeEventListener('mousemove', onMove)
						canvasEl.removeEventListener('mouseleave', onLeave)
					}
				}

				var ctx = canvasEl
				if (chartRef.current) {
					chartRef.current.destroy()
				}

				chartRef.current = new Chart(ctx, {
					type: 'doughnut',
					data: {
						labels: labels,
						datasets: [
							{
								data: values,
								backgroundColor: [
									'#2563eb',
									'#22c55e',
									'#f97316',
									'#ec4899',
									'#0ea5e9',
									'#a855f7',
								],
								borderWidth: 0,
								hoverOffset: 4,
							},
						],
					},
					options: {
						plugins: {
							legend: {
								display: false,
							},
							tooltip: {
								callbacks: {
									label: function (ctx) {
										var dataset = ctx.dataset || {}
										var data = dataset.data || []
										var total = data.reduce(function (a, b) {
											return (parseFloat(a) || 0) + (parseFloat(b) || 0)
										}, 0)
										var val = parseFloat(ctx.parsed) || 0
										var pct = total > 0 ? Math.round((val / total) * 100) : 0
										return (ctx.label || '') + ': ' + val + ' (' + pct + '%)'
									},
								},
							},
						},
						cutout: '70%',
						responsive: true,
						maintainAspectRatio: false,
					},
				})

				return function () {
					if (chartRef.current) {
						chartRef.current.destroy()
						chartRef.current = null
					}
				}
			},
			[props.data]
		)

		return element.createElement(
			'div',
			{ className: 'hm-chart-container' },
			element.createElement('canvas', { ref: canvasRef }),
			tip
				? element.createElement(
						'div',
						{
							style: {
								position: 'absolute',
								left: tip.x + 'px',
								top: tip.y + 'px',
								transform: 'translate(-50%, -100%)',
								background: '#111827',
								color: '#f9fafb',
								padding: '6px 8px',
								borderRadius: '6px',
								fontSize: '12px',
								boxShadow: '0 6px 16px rgba(15,23,42,.35)',
								pointerEvents: 'none',
								whiteSpace: 'nowrap',
							},
						},
						(tip.label || '') + ': ' + tip.value + ' (' + tip.pct + '%)'
				  )
				: null
		)
	}

	function LargestFilesTable(props) {
		var files = (props.data && props.data.largest_files) || []

		if (!files.length) {
			return element.createElement(
				'div',
				{ className: 'hm-card-subvalue' },
				i18n.__('No large files detected yet.', 'hoatzinmedia')
			)
		}

		return element.createElement(
			'table',
			{ className: 'hm-latest-table' },
			element.createElement(
				'thead',
				null,
				element.createElement(
					'tr',
					null,
					element.createElement(
						'th',
						null,
						i18n.__('File', 'hoatzinmedia')
					),
					element.createElement(
						'th',
						null,
						i18n.__('Size', 'hoatzinmedia')
					),
					element.createElement(
						'th',
						null,
						i18n.__('Type', 'hoatzinmedia')
					)
				)
			),
			element.createElement(
				'tbody',
				null,
				files.map(function (file) {
					return element.createElement(
						'tr',
						{ key: file.id },
						element.createElement(
							'td',
							null,
							element.createElement(
								'a',
								{
									href: file.url,
									target: '_blank',
									rel: 'noopener noreferrer',
								},
								file.filename || '#' + file.id
							)
						),
						element.createElement(
							'td',
							null,
							file.size_readable
						),
						element.createElement(
							'td',
							null,
							element.createElement(
								'span',
								{ className: 'hm-tag' },
								file.mime_type
							)
						)
					)
				})
			)
		)
	}

	function ServerRequirements(props) {
		var requirements = props.data || {}

		function parsePhpSize(value) {
			if (!value) return 0
			var number = parseInt(value, 10)
			if (isNaN(number)) return 0
			var suffix = value.toString().toUpperCase().slice(-1)
			if (suffix === 'G') return number * 1024
			if (suffix === 'M') return number
			if (suffix === 'K') return number / 1024
			return number // assume MB if no suffix or other
		}

		var list = [
			{
				label: i18n.__('PHP Version', 'hoatzinmedia'),
				value: requirements.php_version,
				isOk: parseFloat(requirements.php_version) >= 7.4,
				recommended: '7.4+',
				required: true,
			},
			{
				label: i18n.__('Memory Limit', 'hoatzinmedia'),
				value: requirements.memory_limit,
				isOk: parsePhpSize(requirements.memory_limit) >= 128,
				recommended: '128M+',
				required: true,
			},
			{
				label: i18n.__('Upload Max Size', 'hoatzinmedia'),
				value: requirements.upload_max_filesize,
				isOk: parsePhpSize(requirements.upload_max_filesize) >= 64,
				recommended: '64M+',
				required: true,
			},
			{
				label: i18n.__('Post Max Size', 'hoatzinmedia'),
				value: requirements.post_max_size,
				isOk: parsePhpSize(requirements.post_max_size) >= 64,
				recommended: '64M+',
				required: true,
			},
			{
				label: i18n.__('Max Execution', 'hoatzinmedia'),
				value: requirements.max_execution_time + 's',
				isOk: parseInt(requirements.max_execution_time) >= 30,
				recommended: '30s+',
				required: true,
			},
			{
				label: i18n.__('GD Library', 'hoatzinmedia'),
				value: requirements.gd_installed
					? i18n.__('Installed', 'hoatzinmedia')
					: i18n.__('Missing', 'hoatzinmedia'),
				isOk: requirements.gd_installed,
				recommended: i18n.__('Required', 'hoatzinmedia'),
				required: true,
			},
			{
				label: i18n.__('Imagick', 'hoatzinmedia'),
				value: requirements.imagick_installed
					? i18n.__('Installed', 'hoatzinmedia')
					: i18n.__('Missing', 'hoatzinmedia'),
				isOk: requirements.imagick_installed,
				recommended: i18n.__('Optional', 'hoatzinmedia'),
				required: false,
			},
		]

		return element.createElement(
			'div',
			{ className: 'hm-unused-table-wrapper', style: { marginTop: '0' } },
			element.createElement(
				'table',
				{ className: 'hm-latest-table' },
				element.createElement(
					'thead',
					null,
					element.createElement(
						'tr',
						null,
						element.createElement('th', null, i18n.__('Setting', 'hoatzinmedia')),
						element.createElement('th', null, i18n.__('Current', 'hoatzinmedia')),
						element.createElement('th', null, i18n.__('Status', 'hoatzinmedia')),
						element.createElement(
							'th',
							{ style: { textAlign: 'right' } },
							i18n.__('Recommended', 'hoatzinmedia')
						)
					)
				),
				element.createElement(
					'tbody',
					null,
					list.map(function (item, index) {
						return element.createElement(
							'tr',
							{ key: index },
							element.createElement(
								'td',
								{ style: { fontWeight: '500', color: '#374151' } },
								item.label,
								item.required &&
									element.createElement(
										'span',
										{
											style: {
												color: '#ef4444',
												marginLeft: '4px',
												title: i18n.__('Required', 'hoatzinmedia'),
												cursor: 'help',
											},
										},
										'*'
									)
							),
							element.createElement(
								'td',
								{ style: { fontFamily: 'monospace', color: '#4b5563' } },
								item.value
							),
							element.createElement(
								'td',
								null,
								element.createElement(
									'span',
									{
										className: 'hm-tag',
										style: {
											backgroundColor: item.isOk ? '#f0fdf4' : '#fef2f2',
											color: item.isOk ? '#166534' : '#991b1b',
										},
									},
									item.isOk
										? i18n.__('OK', 'hoatzinmedia')
										: i18n.__('Improve', 'hoatzinmedia')
								)
							),
							element.createElement(
								'td',
								{ style: { textAlign: 'right', color: '#9ca3af', fontSize: '11px' } },
								item.recommended
							)
						)
					})
				)
			)
		)
	}

	function UnusedScanner(props) {
		var _useStateScan = useState(null)
		var scanState = _useStateScan[0]
		var setScanState = _useStateScan[1]

		var _useStateScanError = useState(null)
		var scanError = _useStateScanError[0]
		var setScanError = _useStateScanError[1]

		var _useStateRunning = useState(false)
		var scanRunning = _useStateRunning[0]
		var setScanRunning = _useStateRunning[1]

		var _useStateScanId = useState(null)
		var scanId = _useStateScanId[0]
		var setScanId = _useStateScanId[1]

		function handleScanResponse(data) {
			if (!data || typeof data !== 'object' || !data.scan_id) {
				setScanRunning(false)
				setScanError(i18n.__('Invalid scan response received.', HM_TEXT_DOMAIN))
				if (props && props.onToast) {
					props.onToast(
						'error',
						i18n.__('Scan failed: invalid response from server.', HM_TEXT_DOMAIN)
					)
				}
				return
			}
			setScanState(data)
			setScanId(data.scan_id || null)

			if (data.finished) {
				setScanRunning(false)
				if (props.onFinished) {
					props.onFinished(data)
				}
				return
			}

			window.setTimeout(function () {
				runScan(data.scan_id)
			}, 350)
		}

		function runScan(currentScanId) {
			setScanRunning(true)
			setScanError(null)

			var requestData = {}

			if (currentScanId) {
				requestData.scan_id = currentScanId
			}

			hmApiFetchWithTimeout(
				{
				path: 'hoatzinmedia/v1/scan',
				method: 'POST',
				data: requestData,
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
				},
				60000
			)
				.then(function (response) {
					handleScanResponse(response)
				})
				.catch(function (err) {
					try {
						window.__hoatzinmediaLastError = err
					} catch (_e) {}
					var normalized = hmNormalizeApiError(err)
					setScanError(normalized.message)
					if (props && props.onToast) {
						props.onToast('error', normalized.message)
					}
					setScanRunning(false)
					if (props.onError) {
						props.onError()
					}
				})
		}

		function startScan() {
			if (scanRunning) {
				return
			}
			setScanState(null)
			setScanId(null)
			setScanError(null)
			runScan(null)
		}

		var progress = 0
		if (scanState) {
			var processed = scanState.processed || 0
			var total = scanState.total || 0
			if (total > 0) {
				progress = Math.round((processed / total) * 100)
			}
		}
		if (progress < 0) {
			progress = 0
		}
		if (progress > 100) {
			progress = 100
		}

		var animatedProgress = useAnimatedNumber(progress, 400)

		var lastScan = props && props.lastScan ? props.lastScan : ''

		return element.createElement(
			'div',
			{ className: 'hm-scanner-layout' },
			element.createElement(
				'div',
				null,
				element.createElement(
					'button',
					{
						type: 'button',
						className: 'hm-button hm-button-primary',
						onClick: startScan,
						disabled: scanRunning,
					},
					scanRunning
						? i18n.__('Scanning unused media…', 'hoatzinmedia')
						: i18n.__('Run unused media scan', 'hoatzinmedia')
				)
			),
			scanError &&
				element.createElement(
					'div',
					{
						style: {
							marginTop: '10px',
							padding: '10px 12px',
							border: '1px solid #fecaca',
							borderRadius: '8px',
							background: '#fef2f2',
							color: '#991b1b',
							fontSize: '13px',
						},
					},
					scanError
				),
			(scanRunning || (scanState && progress > 0 && progress < 100)) &&
				element.createElement(
					'div',
					{ className: 'hm-progress-track' },
					element.createElement('div', {
						className:
							'hm-progress-fill' +
							(scanRunning ? ' hm-progress-fill-running' : ''),
						style: { transform: 'scaleX(' + animatedProgress / 100 + ')' },
					})
				),
			(scanRunning || scanState) &&
				element.createElement(
					'div',
					{ className: 'hm-progress-labels' },
					element.createElement(
						'span',
						null,
						i18n.__('Progress', 'hoatzinmedia'),
						': ',
						progress,
						'%'
					),
					scanState &&
						element.createElement(
							'span',
							null,
							i18n.__('Unused files', 'hoatzinmedia'),
							': ',
							(scanState.found || 0).toLocaleString()
						)
				),
			scanState &&
				element.createElement(
					'div',
					{ className: 'hm-badges-row' },
					element.createElement(
						'span',
						null,
						i18n.__('Estimated space saved if removed:', 'hoatzinmedia'),
						' ',
						bytesToReadable(scanState.found_bytes || 0)
					)
				),
			element.createElement(
				'div',
				{ className: 'hm-smartscan-last-scan' },
				i18n.__('Last scan:', 'hoatzinmedia'),
				' ',
				lastScan ? lastScan : '—'
			)
		)
	}

	function LargeFileFilter(props) {
		var _useStateSize = useState(3)
		var size = _useStateSize[0]
		var setSize = _useStateSize[1]

		var _useStatePage = useState(1)
		var page = _useStatePage[0]
		var setPage = _useStatePage[1]

		var _useStateLoading = useState(false)
		var loading = _useStateLoading[0]
		var setLoading = _useStateLoading[1]

		var _useStateResults = useState([])
		var results = _useStateResults[0]
		var setResults = _useStateResults[1]

		function loadData(nextPage, nextSize) {
			setLoading(true)

			apiFetch({
				path:
					'hoatzinmedia/v1/large-files?size=' +
					nextSize +
					'&page=' +
					nextPage +
					'&per_page=20',
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function (response) {
					setResults(response.results || [])
					setLoading(false)
				})
				.catch(function () {
					setResults([])
					setLoading(false)
				})
		}

		useEffect(
			function () {
				loadData(page, size)
			},
			[page, size]
		)

		function onSizeChange(event) {
			var value = parseInt(event.target.value, 10) || 3
			setSize(value)
			setPage(1)
		}

		function nextPageHandler() {
			setPage(page + 1)
		}

		function prevPageHandler() {
			if (page <= 1) {
				return
			}
			setPage(page - 1)
		}

		return element.createElement(
			'div',
			null,
			element.createElement(
				'div',
				{ className: 'hm-large-filter-header' },
				element.createElement(
					'label',
					null,
					i18n.__('Show files larger than', 'hoatzinmedia')
				),
				element.createElement(
					'select',
					{
						className: 'hm-select',
						value: size,
						onChange: onSizeChange,
					},
					element.createElement(
						'option',
						{ value: 1 },
						i18n.__('1 MB', 'hoatzinmedia')
					),
					element.createElement(
						'option',
						{ value: 3 },
						i18n.__('3 MB', 'hoatzinmedia')
					),
					element.createElement(
						'option',
						{ value: 5 },
						i18n.__('5 MB', 'hoatzinmedia')
					)
				)
			),
			loading &&
				element.createElement(
					'div',
					{
						className:
							'hm-skeleton hm-skeleton-block',
						style: { height: '120px', marginTop: '8px' },
					}
				),
			!loading &&
				element.createElement(
					'table',
					{ className: 'hm-latest-table', style: { marginTop: '8px' } },
					element.createElement(
						'thead',
						null,
						element.createElement(
							'tr',
							null,
							element.createElement(
								'th',
								null,
								i18n.__('File', 'hoatzinmedia')
							),
							element.createElement(
								'th',
								null,
								i18n.__('Size', 'hoatzinmedia')
							)
						)
					),
					element.createElement(
						'tbody',
						null,
						results.length === 0 &&
							element.createElement(
								'tr',
								null,
								element.createElement(
									'td',
									{ colSpan: 2 },
									i18n.__(
										'No files above this threshold on this page.',
										'hoatzinmedia'
									)
								)
							),
						results.map(function (file) {
							return element.createElement(
								'tr',
								{ key: file.id },
								element.createElement(
									'td',
									null,
									element.createElement(
										'a',
										{
											href: file.url,
											target: '_blank',
											rel: 'noopener noreferrer',
										},
										file.filename || '#' + file.id
									)
								),
								element.createElement(
									'td',
									null,
									file.size_readable
								)
							)
						})
					)
				),
			element.createElement(
				'div',
				{ className: 'hm-footer-row' },
				element.createElement(
					'span',
					null,
					i18n.__('Page', 'hoatzinmedia'),
					' ',
					page
				),
				element.createElement(
					'div',
					null,
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: prevPageHandler,
							disabled: loading || page <= 1,
						},
						i18n.__('Previous', 'hoatzinmedia')
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: nextPageHandler,
							disabled: loading,
							style: { marginLeft: '6px' },
						},
						i18n.__('Next', 'hoatzinmedia')
					)
				)
			)
		)
	}

	function UnusedResultsTable(props) {
		var _useStatePage = useState(1)
		var page = _useStatePage[0]
		var setPage = _useStatePage[1]

		var _useStateBulkAction = useState('')
		var bulkAction = _useStateBulkAction[0]
		var setBulkAction = _useStateBulkAction[1]

		var initialLimit = 20
		if (typeof window !== 'undefined' && window.HoatzinMediaSettings && window.HoatzinMediaSettings.itemsPerPage) {
			initialLimit = window.HoatzinMediaSettings.itemsPerPage
		}
		var _useStateLimit = useState(initialLimit)
		var limit = _useStateLimit[0]
		var setLimit = _useStateLimit[1]

		var _useStateLoading = useState(false)
		var loading = _useStateLoading[0]
		var setLoading = _useStateLoading[1]

		var _useStateResults = useState([])
		var results = _useStateResults[0]
		var setResults = _useStateResults[1]

		var _useStateTotalPages = useState(0)
		var totalPages = _useStateTotalPages[0]
		var setTotalPages = _useStateTotalPages[1]

		var _useStateTotal = useState(0)
		var total = _useStateTotal[0]
		var setTotal = _useStateTotal[1]

		var _useStateHasScan = useState(true)
		var hasScan = _useStateHasScan[0]
		var setHasScan = _useStateHasScan[1]

		var _useStateSelected = useState([])
		var selected = _useStateSelected[0]
		var setSelected = _useStateSelected[1]

		var _useStateConfirmOpen = useState(false)
		var confirmOpen = _useStateConfirmOpen[0]
		var setConfirmOpen = _useStateConfirmOpen[1]

		var _useStateConfirmIds = useState([])
		var confirmIds = _useStateConfirmIds[0]
		var setConfirmIds = _useStateConfirmIds[1]

		var _useStateConfirmAction = useState('delete_selected')
		var confirmAction = _useStateConfirmAction[0]
		var setConfirmAction = _useStateConfirmAction[1]

		var _useStateDeleting = useState(false)
		var deleting = _useStateDeleting[0]
		var setDeleting = _useStateDeleting[1]

		function loadData(nextPage, nextLimit) {
			setLoading(true)

			var query =
				'/hoatzinmedia/v1/unused-results?limit=' +
				nextLimit +
				'&page=' +
				nextPage

			apiFetch({
				path: query,
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function (response) {
					var items = response && response.results ? response.results : []
					setResults(items)
					setTotalPages(response && response.total_pages ? response.total_pages : 0)
					setTotal(response && response.total ? response.total : 0)
					setHasScan(response && response.scanned === false ? false : true)
					if (props && props.onMeta) {
						var meta = response && response.scan_meta ? response.scan_meta : null
						if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
							props.onMeta(meta)
						} else {
							props.onMeta(null)
						}
					}
					setLoading(false)
				})
				.catch(function () {
					setResults([])
					setTotalPages(0)
					setTotal(0)
					setHasScan(true)
					if (props && props.onMeta) {
						props.onMeta(null)
					}
					setLoading(false)
				})
		}

		useEffect(
			function () {
				var refreshKey = props.refreshKey || 0
				loadData(page, limit, refreshKey)
			},
			[page, limit, props.refreshKey]
		)

		function toggleSelect(id) {
			setSelected(function (current) {
				var found = current.indexOf(id)
				if (found === -1) {
					return current.concat([id])
				}
				var copy = current.slice()
				copy.splice(found, 1)
				return copy
			})
		}

		function toggleSelectAll() {
			if (!results.length) {
				return
			}
			var allIds = results.map(function (item) {
				return item.attachment_id
			})
			var allSelected =
				selected.length === allIds.length &&
				allIds.every(function (id) {
					return selected.indexOf(id) !== -1
				})

			if (allSelected) {
				setSelected([])
			} else {
				setSelected(allIds)
			}
		}

		var _useStateDeleteAnchor = useState(null)
		var deleteAnchor = _useStateDeleteAnchor[0]
		var setDeleteAnchor = _useStateDeleteAnchor[1]
		var wrapperRefDelete = useRef(null)

		function openConfirm(ids, e, action) {
			var nextAction = action || 'delete_selected'
			setConfirmAction(nextAction)
			var normalizedIds = []
			if (Array.isArray(ids)) {
				normalizedIds = ids
			} else if (ids) {
				normalizedIds = [ids]
			}
			if (nextAction === 'delete_selected') {
				if (!normalizedIds.length) {
					return
				}
				setConfirmIds(normalizedIds)
			} else {
				setConfirmIds([])
			}
			try {
				var rect = null
				if (e && e.currentTarget && typeof e.currentTarget.getBoundingClientRect === 'function') {
					rect = e.currentTarget.getBoundingClientRect()
				}
				var containerRect = null
				var containerWidth = (typeof window !== 'undefined' ? window.innerWidth : 1024)
				if (wrapperRefDelete && wrapperRefDelete.current && typeof wrapperRefDelete.current.getBoundingClientRect === 'function') {
					containerRect = wrapperRefDelete.current.getBoundingClientRect()
					try {
						containerWidth = wrapperRefDelete.current.offsetWidth || containerWidth
					} catch (_e2) {}
				}
				if (rect) {
					setDeleteAnchor({
						rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
						container: containerRect ? { top: containerRect.top, left: containerRect.left } : null,
						containerWidth: containerWidth,
					})
				}
			} catch (_e3) {}
			setConfirmOpen(true)
			if (typeof document !== 'undefined' && document.body) {
				try {
					document.body.classList.add('hm-modal-open')
				} catch (_e) {}
			}
		}

		function closeConfirm() {
			if (deleting) {
				return
			}
			setConfirmOpen(false)
			setConfirmIds([])
			setConfirmAction('delete_selected')
			if (typeof document !== 'undefined' && document.body) {
				try {
					document.body.classList.remove('hm-modal-open')
				} catch (_e) {}
			}
		}

		function handleDeleteConfirmed() {
			if (deleting) {
				return
			}
			var idsToDelete = Array.isArray(confirmIds) ? confirmIds : confirmIds ? [confirmIds] : []
			if (confirmAction === 'delete_selected' && !idsToDelete.length) {
				return
			}

			setDeleting(true)

			var request =
				confirmAction === 'delete_all'
					? {
							path: 'hoatzinmedia/v1/delete-unused-all',
							method: 'POST',
							data: {
								verify: 'fast',
							},
					  }
					: {
							path: 'hoatzinmedia/v1/delete-unused',
							method: 'POST',
							data: {
								attachment_ids: idsToDelete,
								verify: 'fast',
							},
					  }

			var deletePromise = null
			try {
				deletePromise = hmApiFetchWithTimeout(request, 180000)
			} catch (err) {
				setDeleting(false)
				setConfirmOpen(false)
				setConfirmIds([])
				setConfirmAction('delete_selected')
				if (typeof document !== 'undefined' && document.body) {
					try {
						document.body.classList.remove('hm-modal-open')
					} catch (_e) {}
				}
				if (props.onToast) {
					var msg =
						(err && err.message) ||
						(err && err.data && err.data.message) ||
						i18n.__(
							'Failed to delete unused files. Please try again.',
							'hoatzinmedia'
						)
					props.onToast('error', msg)
				}
				return
			}

			Promise.resolve(deletePromise)
				.then(function (response) {
					setDeleting(false)
					setConfirmOpen(false)
					setConfirmIds([])
					setConfirmAction('delete_selected')
					if (typeof document !== 'undefined' && document.body) {
						try {
							document.body.classList.remove('hm-modal-open')
						} catch (_e) {}
					}
					setSelected([])
					setBulkAction('')
					if (confirmAction === 'delete_all') {
						setPage(1)
					}
					if (props.onToast) {
						var deletedCount =
							response && typeof response.deleted_count === 'number' ? response.deleted_count : null
						var countLabel =
							deletedCount !== null
								? deletedCount
								: confirmAction === 'delete_all'
									? total
									: idsToDelete.length
						if (deletedCount === 0) {
							props.onToast(
								'info',
								i18n.__(
									'No files were deleted. They may no longer be unused. Run the scan again and retry.',
									'hoatzinmedia'
								)
							)
						} else {
							props.onToast(
								'success',
								i18n.__('Deleted unused files: ', 'hoatzinmedia') + countLabel
							)
						}
					}
					if (props.onRefresh) {
						props.onRefresh()
					} else {
						loadData(page, limit)
					}
				})
				.catch(function (err) {
					setDeleting(false)
					setConfirmOpen(false)
					setConfirmIds([])
					setConfirmAction('delete_selected')
					if (typeof document !== 'undefined' && document.body) {
						try {
							document.body.classList.remove('hm-modal-open')
						} catch (_e) {}
					}
					if (props.onToast) {
						var normalized = hmNormalizeApiError(err)
						props.onToast(
							'error',
							normalized && normalized.message
								? normalized.message
								: i18n.__(
										'Failed to delete unused files. Please try again.',
										'hoatzinmedia'
								  )
						)
					}
				})
		}

		function changePage(nextPage) {
			if (nextPage === page) {
				return
			}
			if (nextPage < 1) {
				return
			}
			if (totalPages > 0 && nextPage > totalPages) {
				return
			}
			setPage(nextPage)
		}

		function onLimitChange(event) {
			var value = parseInt(event.target.value, 10) || 20
			if (value <= 0) {
				value = 20
			}
			if (value > 100) {
				value = 100
			}
			setLimit(value)
			setPage(1)
		}

		var allSelected =
			results.length > 0 &&
			results.every(function (item) {
				return selected.indexOf(item.attachment_id) !== -1
			})
		var someSelected = selected.length > 0 && !allSelected
		var hdrChkRefUnused = useRef(null)
		useEffect(function () {
			try {
				if (hdrChkRefUnused && hdrChkRefUnused.current) {
					hdrChkRefUnused.current.indeterminate = !!someSelected
				}
			} catch (_e) {}
		}, [someSelected, allSelected, selected])

		var hasNext = totalPages > 0 && page < totalPages
		var _useStateConvertSingleOpen = useState(false)
		var convertSingleOpen = _useStateConvertSingleOpen[0]
		var setConvertSingleOpen = _useStateConvertSingleOpen[1]
		var _useStateConvertTarget = useState({ id: null, format: null })
		var convertTarget = _useStateConvertTarget[0]
		var setConvertTarget = _useStateConvertTarget[1]
		var _useStateConvertAnchor = useState(null)
		var convertAnchor = _useStateConvertAnchor[0]
		var setConvertAnchor = _useStateConvertAnchor[1]
		var wrapperRef = useRef(null)

		var handleConvert = function (id, format, e) {
			setConvertTarget({ id: id, format: format })
			try {
				var rect = null
				if (e && e.currentTarget && typeof e.currentTarget.getBoundingClientRect === 'function') {
					rect = e.currentTarget.getBoundingClientRect()
				}
				var containerRect = null
				var containerWidth = (typeof window !== 'undefined' ? window.innerWidth : 1024)
				if (wrapperRef && wrapperRef.current && typeof wrapperRef.current.getBoundingClientRect === 'function') {
					containerRect = wrapperRef.current.getBoundingClientRect()
					try {
						containerWidth = wrapperRef.current.offsetWidth || containerWidth
					} catch (_e2) {}
				}
				if (rect) {
					setConvertAnchor({
						rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
						container: containerRect ? { top: containerRect.top, left: containerRect.left } : null,
						containerWidth: containerWidth,
					})
				}
			} catch (_e3) {}
			setConvertSingleOpen(true)
			if (typeof document !== 'undefined' && document.body) {
				try {
					document.body.classList.add('hm-modal-open')
				} catch (_e) {}
			}
		}

		function confirmSingleConvert() {
			if (!convertTarget.id || !convertTarget.format) {
				setConvertSingleOpen(false)
				return
			}
			setLoading(true)
			apiFetch({
				path: 'hoatzinmedia/v1/image-formats/convert',
				method: 'POST',
				data: {
					ids: [convertTarget.id],
					format: convertTarget.format,
					workflow: 'single',
					quality: bulkQuality,
				},
			})
				.then(function (response) {
					fetchItems()
					var failed = response.results.filter(function (r) {
						return r.status !== 'success'
					})
					if (failed.length > 0 && props.onToast) {
						props.onToast(
							'error',
							i18n.sprintf(
								i18n.__('Failed to convert: %s', 'hoatzinmedia'),
								failed[0].message
							)
						)
					}
				})
				.catch(function (err) {
					console.error(err)
					if (props.onToast) {
						var msg =
							(err && err.message) ||
							(err && err.data && err.data.message) ||
							i18n.__('An error occurred.', 'hoatzinmedia')
						props.onToast('error', msg)
					}
				})
				.finally(function () {
					setLoading(false)
					setConvertSingleOpen(false)
					setConvertTarget({ id: null, format: null })
				})
		}

		var hasPrev = page > 1

		var showEmpty = !loading && results.length === 0

		var confirmCount =
			confirmAction === 'delete_all'
				? total
				: Array.isArray(confirmIds)
					? confirmIds.length
					: confirmIds
						? 1
						: 0
		var confirmTitle =
			confirmAction === 'delete_all'
				? i18n.__('Delete all unused files', 'hoatzinmedia')
				: i18n.__('Delete unused files', 'hoatzinmedia')
		var confirmMessage =
			confirmAction === 'delete_all'
				? i18n.__('Are you sure you want to delete all unused files from the latest scan?', 'hoatzinmedia') +
				  ' ' +
				  i18n.__('These files will be permanently deleted and cannot be restored.', 'hoatzinmedia')
				: i18n.__('Are you sure you want to delete the selected unused files?', 'hoatzinmedia') +
				  ' ' +
				  i18n.__('These files will be permanently deleted and cannot be restored.', 'hoatzinmedia')

		return element.createElement(
			'div',
			{
				className: 'hm-unused-table-wrapper',
				ref: function (node) {
					if (wrapperRef) {
						wrapperRef.current = node
					}
					if (wrapperRefDelete) {
						wrapperRefDelete.current = node
					}
				},
			},
			element.createElement(
				'div',
				{ className: 'hm-unused-header-row' },
				element.createElement(
					'div',
					{ className: 'hm-card-title' },
					i18n.__('Latest Unused Scan Results', 'hoatzinmedia')
				),
				element.createElement(
					'div',
					{ className: 'hm-unused-header-actions' },
					element.createElement(
						'select',
						{
							className: 'hm-smartscan-select hm-smartscan-limit-select',
							value: limit,
							onChange: onLimitChange,
						},
						element.createElement(
							'option',
							{ value: 10 },
							i18n.__('10 items per page', 'hoatzinmedia')
						),
						element.createElement(
							'option',
							{ value: 20 },
							i18n.__('20 items per page', 'hoatzinmedia')
						),
						element.createElement(
							'option',
							{ value: 50 },
							i18n.__('50 items per page', 'hoatzinmedia')
						),
						element.createElement(
							'option',
							{ value: 100 },
							i18n.__('100 items per page', 'hoatzinmedia')
						)
					),
					element.createElement(
						'select',
						{
							className: 'hm-smartscan-select hm-smartscan-bulk-select',
							value: bulkAction,
							onChange: function (event) {
								setBulkAction(event.target.value || '')
							},
							style: { marginLeft: '8px' },
						},
						element.createElement(
							'option',
							{ value: '' },
							i18n.__('Bulk actions', 'hoatzinmedia')
						),
						element.createElement(
							'option',
							{ value: 'delete' },
							i18n.__('Delete', 'hoatzinmedia')
						),
						element.createElement(
							'option',
							{ value: 'delete_all' },
							i18n.__('Delete all', 'hoatzinmedia')
						)
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-primary hm-smartscan-apply-button',
							onClick: function (e) {
								if (bulkAction === 'delete') {
									openConfirm(selected, e, 'delete_selected')
									return
								}
								if (bulkAction === 'delete_all') {
									openConfirm([], e, 'delete_all')
									return
								}
							},
							disabled:
								loading ||
								deleting ||
								!bulkAction ||
								(bulkAction === 'delete' && !selected.length) ||
								(bulkAction === 'delete_all' && !total),
							style: { marginLeft: '8px' },
						},
						i18n.__('Apply', 'hoatzinmedia')
					),
				)
			),
			element.createElement(ConfirmModal, {
				open: convertSingleOpen,
				title: i18n.__('Convert image', 'hoatzinmedia'),
				message: i18n.__(
					'Convert this image now? The original file will be updated.',
					'hoatzinmedia'
				),
				anchor: convertAnchor,
				busy: loading,
				confirmLabel: i18n.__('Convert', 'hoatzinmedia'),
				confirmBusyLabel: i18n.__('Converting…', 'hoatzinmedia'),
				onCancel: function () {
					if (!loading) {
						setConvertSingleOpen(false)
						if (typeof document !== 'undefined' && document.body) {
							try {
								document.body.classList.remove('hm-modal-open')
							} catch (_e) {}
						}
					}
				},
				onConfirm: confirmSingleConvert,
			}),
			loading &&
				element.createElement(
					'div',
					{
						className: 'hm-skeleton hm-skeleton-block',
						style: { height: '160px', marginTop: '8px' },
					}
				),
			!loading &&
				element.createElement(
					'div',
					{ className: 'hm-smartscan-table-card' },
					element.createElement(
						'table',
						{ className: 'hm-latest-table hm-unused-table', style: { marginTop: '0' } },
						element.createElement(
							'thead',
							null,
							element.createElement(
								'tr',
								null,
								element.createElement(
									'th',
									{ style: { width: '32px' } },
									element.createElement('input', {
										type: 'checkbox',
										checked: allSelected,
										ref: hdrChkRefUnused,
										onChange: toggleSelectAll,
									})
								),
								element.createElement(
									'th',
									{ style: { width: '54px' } },
									i18n.__('Thumbnail', 'hoatzinmedia')
								),
								element.createElement(
									'th',
									null,
									i18n.__('File name', 'hoatzinmedia')
								),
								element.createElement(
									'th',
									{ style: { width: '120px' } },
									i18n.__('Size', 'hoatzinmedia')
								),
								element.createElement(
									'th',
									{ style: { width: '140px' } },
									i18n.__('Uploaded', 'hoatzinmedia')
								),
								element.createElement(
									'th',
									{ style: { width: '150px' } },
									i18n.__('Actions', 'hoatzinmedia')
								)
							)
						),
						element.createElement(
							'tbody',
							null,
							showEmpty &&
								element.createElement(
									'tr',
									null,
									element.createElement(
										'td',
										{ colSpan: 6 },
										element.createElement(
											'div',
											{ className: 'hm-empty-state' },
											hasScan
												? i18n.__(
														'No unused files found in the latest scan.',
														'hoatzinmedia'
												  )
												: i18n.__(
														'Run the unused media scan to see results here.',
														'hoatzinmedia'
												  )
										)
									)
								),
							!showEmpty &&
								results.map(function (item) {
									var id = item.attachment_id
									var checked = selected.indexOf(id) !== -1
									var date =
										item.date_uploaded ||
										''
									return element.createElement(
										'tr',
										{ key: id, className: 'hm-row-hover' },
										element.createElement(
											'td',
											null,
											element.createElement('input', {
												type: 'checkbox',
												checked: checked,
												onChange: function () {
													toggleSelect(id)
												},
											})
										),
										element.createElement(
											'td',
											null,
											(item.thumbnail_url || item.file_url)
												? element.createElement(
														'div',
														{ className: 'hm-thumbnail-popover' },
														element.createElement('img', {
															src: item.thumbnail_url || item.file_url,
															alt: item.file_name || '',
															className: 'hm-thumbnail',
															onError: function (e) {
																if (item.file_url && e.target.src !== item.file_url) {
																	e.target.src = item.file_url
																}
															},
														}),
														(item.file_url || item.thumbnail_url) &&
															element.createElement(
																'div',
																{
																	className:
																		'hm-thumbnail-popover-preview',
																},
																element.createElement('img', {
																	src: item.file_url || item.thumbnail_url,
																	alt: item.file_name || '',
																})
															)
												  )
												: element.createElement(
														'div',
														{ className: 'hm-thumbnail hm-thumbnail-placeholder' },
														item.file_name
															? item.file_name.charAt(0).toUpperCase()
															: '?'
												  )
										),
										element.createElement(
											'td',
											{ className: 'hm-file-name-cell' },
											element.createElement(
												'div',
												{ className: 'hm-file-name-primary' },
												item.file_name || i18n.__('Untitled file', 'hoatzinmedia')
											),
											element.createElement(
												'div',
												{ className: 'hm-file-name-secondary' },
												item.file_url || ''
											)
										),
										element.createElement(
											'td',
											null,
											item.file_size || ''
										),
										element.createElement(
											'td',
											null,
											date
										),
										element.createElement(
											'td',
											null,
											element.createElement(
												'div',
												{ className: 'hm-row-actions' },
												element.createElement(
													'a',
													{
														href: item.edit_url || item.file_url || '#',
														rel: 'noopener noreferrer',
														className: 'hm-link-muted',
													},
													i18n.__('View', 'hoatzinmedia')
												),
												element.createElement(
													'button',
													{
														type: 'button',
														className: 'hm-button hm-button-ghost',
														onClick: function (e) {
															openConfirm([id], e)
														},
														disabled: loading || deleting,
														style: { marginLeft: '6px' },
													},
													i18n.__('Delete', 'hoatzinmedia')
												)
											)
										)
									)
								})
						)
					)
				),
			element.createElement(
				'div',
				{ className: 'hm-footer-row' },
				element.createElement(
					'span',
					null,
					i18n.__('Page', 'hoatzinmedia'),
					' ',
					page,
					totalPages > 0 ? ' / ' + totalPages : '',
					total > 0 ? ' · ' + total + ' ' + i18n.__('items', 'hoatzinmedia') : ''
				),
				element.createElement(
					'div',
					null,
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: function () {
								changePage(page - 1)
							},
							disabled: loading || !hasPrev,
						},
						i18n.__('Previous', 'hoatzinmedia')
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: function () {
								changePage(page + 1)
							},
							disabled: loading || !hasNext,
							style: { marginLeft: '6px' },
						},
						i18n.__('Next', 'hoatzinmedia')
					)
				)
			),
			element.createElement(ConfirmModal, {
				open: confirmOpen,
				title: confirmTitle,
				message:
					confirmMessage +
					(confirmCount ? ' ' + i18n.__('Count: ', 'hoatzinmedia') + confirmCount : ''),
				anchor: deleteAnchor,
				busy: deleting,
				confirmLabel: i18n.__('Delete', 'hoatzinmedia'),
				confirmBusyLabel: i18n.__('Deleting…', 'hoatzinmedia'),
				onCancel: closeConfirm,
				onConfirm: handleDeleteConfirmed,
			})
		)
	}

	function DuplicateResultsTable(props) {
		var _useStatePage = useState(1)
		var page = _useStatePage[0]
		var setPage = _useStatePage[1]

		var initialLimit = 10
		if (typeof window !== 'undefined' && window.HoatzinMediaSettings && window.HoatzinMediaSettings.itemsPerPage) {
			initialLimit = window.HoatzinMediaSettings.itemsPerPage
		}
		var _useStatePerPage = useState(initialLimit)
		var perPage = _useStatePerPage[0]
		var setPerPage = _useStatePerPage[1]

		var _useStateLoading = useState(false)
		var loading = _useStateLoading[0]
		var setLoading = _useStateLoading[1]

		var _useStateGroups = useState([])
		var groups = _useStateGroups[0]
		var setGroups = _useStateGroups[1]
		var _useStateStrategy = useState('hash')
		var strategy = _useStateStrategy[0]
		var setStrategy = _useStateStrategy[1]

		var _useStateTotals = useState({ total: 0, totalPages: 0 })
		var totals = _useStateTotals[0]
		var setTotals = _useStateTotals[1]
		var _useStateSelected = useState([])
		var selected = _useStateSelected[0]
		var setSelected = _useStateSelected[1]
		var _useStateOpenGroupKey = useState(null)
		var openGroupKey = _useStateOpenGroupKey[0]
		var setOpenGroupKey = _useStateOpenGroupKey[1]
		var _useStateFormat = useState('webp')
		var bulkFormat = _useStateFormat[0]
		var setBulkFormat = _useStateFormat[1]
		var _useStateQuality = useState(80)
		var bulkQuality = _useStateQuality[0]
		var setBulkQuality = _useStateQuality[1]
		var _useStateMessage = useState('')
		var message = _useStateMessage[0]
		var setMessage = _useStateMessage[1]
		var _useStateCompare = useState({ open: false, left: '', right: '' })
		var compare = _useStateCompare[0]
		var setCompare = _useStateCompare[1]
		var _useStateUsageById = useState({})
		var usageById = _useStateUsageById[0]
		var setUsageById = _useStateUsageById[1]
		var usageTimersRef = useRef({})
		var _useStateConvertConfirmOpen = useState(false)
		var convertConfirmOpen = _useStateConvertConfirmOpen[0]
		var setConvertConfirmOpen = _useStateConvertConfirmOpen[1]
		var _useStateCleanConfirmOpen = useState(false)
		var cleanConfirmOpen = _useStateCleanConfirmOpen[0]
		var setCleanConfirmOpen = _useStateCleanConfirmOpen[1]
		var cleanBtnRef = useRef(null)
		var _useStateCleanAnchor = useState(null)
		var cleanAnchor = _useStateCleanAnchor[0]
		var setCleanAnchor = _useStateCleanAnchor[1]
		var wrapperRef = useRef(null)
		var _useStateDeleteConfirm = useState(false)
		var deleteConfirmOpen = _useStateDeleteConfirm[0]
		var setDeleteConfirmOpen = _useStateDeleteConfirm[1]
		var _useStateDeleteTarget = useState(0)
		var deleteTargetId = _useStateDeleteTarget[0]
		var setDeleteTargetId = _useStateDeleteTarget[1]
		var _useStateDeleteBusy = useState(false)
		var deleteBusy = _useStateDeleteBusy[0]
		var setDeleteBusy = _useStateDeleteBusy[1]
		var _useStateGroupDeleteOpen = useState(false)
		var groupDeleteOpen = _useStateGroupDeleteOpen[0]
		var setGroupDeleteOpen = _useStateGroupDeleteOpen[1]
		var _useStateGroupDeleteBusy = useState(false)
		var groupDeleteBusy = _useStateGroupDeleteBusy[0]
		var setGroupDeleteBusy = _useStateGroupDeleteBusy[1]
		var _useStateGroupTargets = useState([])
		var groupDeleteTargets = _useStateGroupTargets[0]
		var setGroupDeleteTargets = _useStateGroupTargets[1]
		var _useStateBulkPageOpen = useState(false)
		var bulkPageOpen = _useStateBulkPageOpen[0]
		var setBulkPageOpen = _useStateBulkPageOpen[1]
		var _useStateBulkPageBusy = useState(false)
		var bulkPageBusy = _useStateBulkPageBusy[0]
		var setBulkPageBusy = _useStateBulkPageBusy[1]
		var _useStateBulkAllOpen = useState(false)
		var bulkAllOpen = _useStateBulkAllOpen[0]
		var setBulkAllOpen = _useStateBulkAllOpen[1]
		var _useStateBulkAllBusy = useState(false)
		var bulkAllBusy = _useStateBulkAllBusy[0]
		var setBulkAllBusy = _useStateBulkAllBusy[1]
		var _useStateMessage = useState('')
		var message = _useStateMessage[0]
		var setMessage = _useStateMessage[1]
		var _useStateConvertConfirmOpen = useState(false)
		var convertConfirmOpen = _useStateConvertConfirmOpen[0]
		var setConvertConfirmOpen = _useStateConvertConfirmOpen[1]
		var _useStateMessage = useState('')
		var message = _useStateMessage[0]
		var setMessage = _useStateMessage[1]
		var _useStateConvertConfirmOpen = useState(false)
		var convertConfirmOpen = _useStateConvertConfirmOpen[0]
		var setConvertConfirmOpen = _useStateConvertConfirmOpen[1]
		var _useStateMessage = useState('')
		var message = _useStateMessage[0]
		var setMessage = _useStateMessage[1]
		var _useStateConvertConfirmOpen = useState(false)
		var convertConfirmOpen = _useStateConvertConfirmOpen[0]
		var setConvertConfirmOpen = _useStateConvertConfirmOpen[1]

		function reloadGroups() {
			setLoading(true)
			setUsageById({})
			var query =
				'hoatzinmedia/v1/duplicates?page=' +
				page +
				'&per_page=' +
				perPage +
				'&strategy=' +
				encodeURIComponent(strategy)
			apiFetch({
				path: query,
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function (response) {
					var nextGroups = response && response.groups ? response.groups : []
					setGroups(nextGroups)
					setTotals({
						total: response && response.total ? response.total : 0,
						totalPages:
							response && response.total_pages ? response.total_pages : 0,
					})
					setSelected([])
					setOpenGroupKey(null)
					setLoading(false)
				})
				.catch(function () {
					setGroups([])
					setTotals({ total: 0, totalPages: 0 })
					setSelected([])
					setOpenGroupKey(null)
					setLoading(false)
				})
		}

		function toggleUsage(attachmentId) {
			var id = parseInt(attachmentId, 10) || 0
			if (!id) {
				return
			}
			var current = usageById && usageById[id] ? usageById[id] : null
			var willOpen = !(current && current.open)
			try {
				if (usageTimersRef && usageTimersRef.current && usageTimersRef.current[id]) {
					window.clearTimeout(usageTimersRef.current[id])
					delete usageTimersRef.current[id]
				}
			} catch (_e0) {}
			setUsageById(function (prev) {
				var next = Object.assign({}, prev || {})
				var existing = next[id] || { open: false, loading: false, usages: null, error: false }
				next[id] = Object.assign({}, existing, { open: willOpen, error: false })
				return next
			})
			if (!willOpen) {
				return
			}
			var shouldFetch = !current || (!current.loading && current.usages == null)
			if (shouldFetch) {
				setUsageById(function (prev) {
					var next = Object.assign({}, prev || {})
					var existing = next[id] || { open: true, loading: false, usages: null, error: false }
					next[id] = Object.assign({}, existing, { loading: true, error: false })
					return next
				})
				try {
					if (usageTimersRef && usageTimersRef.current) {
						usageTimersRef.current[id] = window.setTimeout(function () {
							setUsageById(function (prev) {
								var next = Object.assign({}, prev || {})
								var existing = next[id] || { open: true, loading: false, usages: null, error: false }
								if (!existing.open || !existing.loading) {
									return next
								}
								next[id] = Object.assign({}, existing, { loading: false, usages: [], error: true })
								return next
							})
							hmEmitGlobalError({
								message: i18n.__('Usage lookup is taking too long. Please try again.', 'hoatzinmedia'),
							})
						}, 35000)
					}
				} catch (_e1) {}
				hmApiFetchWithTimeout(
					{
						path: 'hoatzinmedia/v1/attachment-usage?attachment_id=' + id + '&limit=20&deep=0',
						method: 'GET',
						headers: {
							'X-WP-Nonce': HoatzinMediaSettings.nonce,
						},
					},
					30000
				)
					.then(function (response) {
						try {
							if (usageTimersRef && usageTimersRef.current && usageTimersRef.current[id]) {
								window.clearTimeout(usageTimersRef.current[id])
								delete usageTimersRef.current[id]
							}
						} catch (_e2) {}
						var list = response && response.usages ? response.usages : []
						setUsageById(function (prev) {
							var next = Object.assign({}, prev || {})
							var existing = next[id] || { open: true, loading: false, usages: null, error: false }
							next[id] = Object.assign({}, existing, { loading: false, usages: list, error: false })
							return next
						})
					})
					.catch(function (err) {
						try {
							if (usageTimersRef && usageTimersRef.current && usageTimersRef.current[id]) {
								window.clearTimeout(usageTimersRef.current[id])
								delete usageTimersRef.current[id]
							}
						} catch (_e3) {}
						setUsageById(function (prev) {
							var next = Object.assign({}, prev || {})
							var existing = next[id] || { open: true, loading: false, usages: null, error: false }
							var normalized = hmNormalizeApiError(err || { message: i18n.__('Failed to load usage.', 'hoatzinmedia') })
							next[id] = Object.assign({}, existing, {
								loading: false,
								usages: [],
								error: true,
								errorMessage: normalized && normalized.message ? normalized.message : i18n.__('Failed to load usage.', 'hoatzinmedia'),
							})
							return next
						})
						try {
							window.__hoatzinmediaLastError = err
						} catch (_e4) {}
						try {
							err = err || { message: i18n.__('Failed to load usage.', 'hoatzinmedia') }
							hmEmitGlobalError(err)
						} catch (_e4) {}
					})
			}
		}

		function cleanDuplicates() {
			if (loading) {
				return
			}
			setCleanConfirmOpen(false)
			if (typeof document !== 'undefined' && document.body) {
				try {
					document.body.classList.remove('hm-modal-open')
				} catch (_e) {}
			}
			var ids = (selected || []).slice()
			if (!ids.length) {
				if (props.onToast) {
					props.onToast('info', i18n.__('No duplicates selected to delete.', 'hoatzinmedia'))
				}
				return
			}
			setLoading(true)
			apiFetch({
				path: 'hoatzinmedia/v1/image-formats/delete',
				method: 'POST',
				body: JSON.stringify({ ids: ids }),
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
					'Content-Type': 'application/json',
				},
			})
				.then(function (response) {
					if (props.onToast) {
						var deleted = (response && response.deleted_count) || 0
						props.onToast(
							'success',
							(deleted || ids.length) + ' ' + i18n.__('attachments deleted', 'hoatzinmedia')
						)
					}
					reloadGroups()
				})
				.catch(function () {
					if (props.onToast) {
						props.onToast('error', i18n.__('Failed to delete duplicates', 'hoatzinmedia'))
					}
					setLoading(false)
				})
		}

		function onClickClean() {
			if (loading || showEmpty) {
				return
			}
			setCleanConfirmOpen(true)
			try {
				if (cleanBtnRef && cleanBtnRef.current && typeof cleanBtnRef.current.getBoundingClientRect === 'function') {
					var rect = cleanBtnRef.current.getBoundingClientRect()
					var containerRect = null
					var containerWidth = (typeof window !== 'undefined' ? window.innerWidth : 1024)
					if (wrapperRef && wrapperRef.current && typeof wrapperRef.current.getBoundingClientRect === 'function') {
						containerRect = wrapperRef.current.getBoundingClientRect()
						try {
							containerWidth = wrapperRef.current.offsetWidth || containerWidth
						} catch (_e2) {}
					}
					setCleanAnchor({
						rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
						container: containerRect ? { top: containerRect.top, left: containerRect.left } : null,
						containerWidth: containerWidth,
					})
				}
			} catch (_e) {}
			if (typeof document !== 'undefined' && document.body) {
				try {
					document.body.classList.add('hm-modal-open')
				} catch (_e) {}
			}
		}

		useEffect(
			function () {
				reloadGroups()
			},
			[page, perPage]
		)

		function toggleSelect(id) {
			var next = selected.slice()
			var idx = next.indexOf(id)
			if (idx === -1) {
				next.push(id)
			} else {
				next.splice(idx, 1)
			}
			setSelected(next)
		}

		function toggleSelectAll() {
			var allSelectedNow =
				items.length > 0 &&
				items.every(function (it) {
					return selected.indexOf(it.id) !== -1
				})
			if (allSelectedNow) {
				setSelected([])
			} else {
				setSelected(
					items.map(function (it) {
						return it.id
					})
				)
			}
		}

		function handleBulkConvert() {
			if (!selected.length) {
				setMessage(i18n.__('Select at least one image to convert.', 'hoatzinmedia'))
				return
			}
			if (bulkFormat !== 'webp' && bulkFormat !== 'avif') {
				setMessage(i18n.__('Choose a target format.', 'hoatzinmedia'))
				return
			}
			setConvertConfirmOpen(true)
			if (typeof document !== 'undefined' && document.body) {
				try {
					document.body.classList.add('hm-modal-open')
				} catch (_e) {}
			}
		}

		function onPerPageChange(event) {
			var value = parseInt(event.target.value, 10) || 10
			if (value <= 0) {
				value = 10
			}
			if (value > 50) {
				value = 50
			}
			setPerPage(value)
			setPage(1)
		}

		var hasPrev = page > 1
		var hasNext = totals.totalPages > 0 && page < totals.totalPages
		var showEmpty = !loading && (!groups || !groups.length)
		var idsToCleanCount = (selected || []).length
		function formatBytes(bytes) {
			var value = parseInt(bytes, 10) || 0
			if (value <= 0) {
				return '0 B'
			}
			var units = ['B', 'KB', 'MB', 'GB', 'TB']
			var idx = 0
			var n = value
			while (n >= 1024 && idx < units.length - 1) {
				n = n / 1024
				idx++
			}
			var decimals = 0
			if (idx === 1 && n < 10) {
				decimals = 1
			} else if (idx === 0) {
				decimals = 0
			} else if (n < 10) {
				decimals = 1
			}
			var out = n.toFixed(decimals)
			return out + ' ' + units[idx]
		}
		function isLikelyImageUrl(url) {
			if (!url || typeof url !== 'string') {
				return false
			}
			return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i.test(url)
		}
		var estimatedBytes = (groups || []).reduce(function (acc, group) {
			var items = (group && group.items) || []
			for (var i = 1; i < items.length; i++) {
				var b = items[i] && items[i].file_size_bytes ? parseInt(items[i].file_size_bytes, 10) : 0
				if (b > 0) {
					acc += b
				}
			}
			return acc
		}, 0)

		return element.createElement(
			'div',
			{ className: 'hm-duplicates', ref: wrapperRef },
			element.createElement(
				'div',
				{ className: 'hm-dup-toolbar' },
				element.createElement(
					'div',
					{ className: 'hm-dup-savings' },
					element.createElement('span', {
						className: 'dashicons dashicons-database',
						'aria-hidden': 'true',
					}),
					element.createElement(
						'div',
						{ className: 'hm-dup-savings-text' },
						i18n.__('Estimated Space Savings:', 'hoatzinmedia') +
							' ' +
							formatBytes(estimatedBytes) +
							' ' +
							i18n.__('(approx.)', 'hoatzinmedia')
					)
				),
				element.createElement(
					'div',
					{ className: 'hm-dup-controls' },
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-primary hm-dup-scan-btn',
							onClick: reloadGroups,
							disabled: loading,
						},
						element.createElement('span', {
							className: 'dashicons dashicons-search',
							'aria-hidden': 'true',
						}),
						i18n.__('Scan', 'hoatzinmedia')
					),
					element.createElement(
						'div',
						{ className: 'hm-dup-control' },
						element.createElement('label', null, i18n.__('Groups per page', 'hoatzinmedia')),
						element.createElement(
							'select',
							{
								className: 'hm-select',
								value: perPage,
								onChange: onPerPageChange,
							},
							element.createElement('option', { value: 10 }, '10'),
							element.createElement('option', { value: 20 }, '20'),
							element.createElement('option', { value: 50 }, '50')
						)
					),
					element.createElement(
						'div',
						{ className: 'hm-dup-control' },
						element.createElement('label', null, i18n.__('Matching', 'hoatzinmedia')),
						element.createElement(
							'select',
							{
								className: 'hm-select',
								value: strategy,
								onChange: function (e) {
									setStrategy(e.target.value || 'hash')
									setPage(1)
								},
							},
							element.createElement('option', { value: 'hash' }, i18n.__('Content hash (advanced)', 'hoatzinmedia')),
							element.createElement('option', { value: 'path' }, i18n.__('File path (basic)', 'hoatzinmedia'))
						)
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-danger hm-dup-clean-btn',
							onClick: onClickClean,
							ref: cleanBtnRef,
							disabled: loading || showEmpty || idsToCleanCount === 0,
						},
						element.createElement('span', {
							className: 'dashicons dashicons-trash',
							'aria-hidden': 'true',
						}),
						i18n.__('Delete', 'hoatzinmedia')
					)
				)
			),
			element.createElement(ConfirmModal, {
				open: cleanConfirmOpen,
				title: i18n.__('Delete duplicates', 'hoatzinmedia'),
				message:
					i18n.__('Delete selected duplicates?', 'hoatzinmedia') +
					' ' +
					idsToCleanCount +
					' ' +
					i18n.__('files will be permanently deleted. This action cannot be undone.', 'hoatzinmedia'),
				anchor: cleanAnchor,
				busy: loading,
				confirmLabel: i18n.__('Delete', 'hoatzinmedia'),
				confirmBusyLabel: i18n.__('Deleting…', 'hoatzinmedia'),
				onCancel: function () {
					if (!loading) {
						setCleanConfirmOpen(false)
						if (typeof document !== 'undefined' && document.body) {
							try {
								document.body.classList.remove('hm-modal-open')
							} catch (_e) {}
						}
					}
				},
				onConfirm: cleanDuplicates,
			}),
			loading &&
				element.createElement(
					'div',
					{
						className: 'hm-skeleton hm-skeleton-block',
						style: { height: '160px', marginTop: '8px' },
					}
				),
			!loading &&
				(showEmpty
					? element.createElement(
							'div',
							{ className: 'hm-empty-state' },
							i18n.__('No duplicate files were detected.', 'hoatzinmedia')
					  )
					: element.createElement(
							'div',
							{ className: 'hm-dup-groups' },
							groups.map(function (group) {
								var items = group.items || []
								var first = items[0] || {}
								var name =
									group.file_name ||
									first.file_name ||
									i18n.__('Unnamed file', 'hoatzinmedia')
								var count = items.length || group.duplicates || 0
								var groupIds = []
								var groupPotentialBytes = 0
								for (var i = 0; i < items.length; i++) {
									var gid = items[i] && items[i].attachment_id
									if (gid) {
										groupIds.push(gid)
									}
									if (i > 0) {
										var gb = items[i] && items[i].file_size_bytes ? parseInt(items[i].file_size_bytes, 10) : 0
										if (gb > 0) {
											groupPotentialBytes += gb
										}
									}
								}
								var selectedInGroup = groupIds.filter(function (id) {
									return selected.indexOf(id) !== -1
								})
								var groupAllSelected = groupIds.length > 0 && selectedInGroup.length === groupIds.length
								var groupSomeSelected = selectedInGroup.length > 0 && !groupAllSelected
								var groupKey = group.group_key
								var isOpen = openGroupKey === groupKey
								return element.createElement(
									'div',
									{ key: group.group_key, className: 'hm-dup-group' },
									element.createElement(
										'div',
										{ className: 'hm-dup-group-header' },
										element.createElement('input', {
											type: 'checkbox',
											className: 'hm-dup-checkbox',
											checked: groupAllSelected,
											ref: function (el) {
												if (el) {
													el.indeterminate = groupSomeSelected
												}
											},
											onClick: function (e) {
												if (e && typeof e.stopPropagation === 'function') {
													e.stopPropagation()
												}
											},
											onChange: function () {
												if (!groupIds.length) {
													return
												}
												setSelected(function (prev) {
													var next = Array.isArray(prev) ? prev.slice() : []
													if (groupAllSelected) {
														groupIds.forEach(function (id) {
															var idx = next.indexOf(id)
															if (idx !== -1) {
																next.splice(idx, 1)
															}
														})
													} else {
														groupIds.forEach(function (id) {
															if (next.indexOf(id) === -1) {
																next.push(id)
															}
														})
													}
													return next
												})
											},
											disabled: loading || !groupIds.length,
										}),
										element.createElement(
											'button',
											{
												type: 'button',
												className: 'hm-dup-accordion-btn' + (isOpen ? ' is-open' : ''),
												'aria-expanded': isOpen,
												onClick: function () {
													setOpenGroupKey(function (prev) {
														return prev === groupKey ? null : groupKey
													})
												},
											},
											element.createElement('span', {
												className: 'dashicons dashicons-arrow-right-alt2 hm-dup-caret',
												'aria-hidden': 'true',
											}),
											element.createElement(
												'span',
												{ className: 'hm-dup-group-title' },
												name +
													' (' +
													count +
													' ' +
													i18n.__('files', 'hoatzinmedia') +
													') - ' +
													i18n.__('Potential saving:', 'hoatzinmedia') +
													' ' +
													formatBytes(groupPotentialBytes)
											)
										)
									),
									isOpen
										? element.createElement(
												'div',
												{ className: 'hm-dup-items' },
												items.map(function (item) {
													var usageState =
														usageById && usageById[item.attachment_id]
															? usageById[item.attachment_id]
															: { open: false, loading: false, usages: null, error: false }
													var usageOpen = !!usageState.open
													var usageLoading = !!usageState.loading
													var usageList = usageState.usages
													var usageError = !!usageState.error
													var attachmentId = item.attachment_id
													var checked = selected.indexOf(attachmentId) !== -1
													var sizeText =
														(item && item.file_size) ||
														(item && item.file_size_bytes ? formatBytes(item.file_size_bytes) : '')
													var url = item && item.file_url ? item.file_url : ''
													return element.createElement(
														'div',
														{
															key: attachmentId,
															className: 'hm-dup-item',
														},
														element.createElement('input', {
															type: 'checkbox',
															className: 'hm-dup-checkbox',
															checked: checked,
															disabled: loading,
															onChange: function () {
																setSelected(function (prev) {
																	var next = Array.isArray(prev) ? prev.slice() : []
																	var at = parseInt(attachmentId, 10) || 0
																	if (!at) {
																		return next
																	}
																	var pos = next.indexOf(at)
																	if (pos === -1) {
																		next.push(at)
																	} else {
																		next.splice(pos, 1)
																	}
																	return next
																})
															},
														}),
														isLikelyImageUrl(url)
															? element.createElement('img', {
																	className: 'hm-dup-thumb',
																	src: url,
																	alt: name,
															  })
															: element.createElement('span', {
																	className: 'dashicons dashicons-format-image hm-dup-thumb-icon',
																	'aria-hidden': 'true',
															  }),
														element.createElement(
															'a',
															{
																href: url || '#',
																target: '_blank',
																rel: 'noopener noreferrer',
																className: 'hm-dup-url',
															},
															url
														),
														element.createElement('div', { className: 'hm-dup-size' }, sizeText),
														element.createElement(
															'button',
															{
																type: 'button',
																className: 'hm-dup-usagebtn',
																onClick: function () {
																	toggleUsage(attachmentId)
																},
															},
															usageOpen ? i18n.__('Hide usage', 'hoatzinmedia') : i18n.__('Show usage', 'hoatzinmedia')
														),
														usageOpen
															? element.createElement(
																	'div',
																	{ className: 'hm-dup-usagepanel' },
																	usageLoading
																		? element.createElement('div', { className: 'hm-usage-muted' }, i18n.__('Loading…', 'hoatzinmedia'))
																		: usageError
																			? element.createElement(
																					'div',
																					{ className: 'hm-usage-muted' },
																					usageState && usageState.errorMessage
																						? String(usageState.errorMessage)
																						: i18n.__('Failed to load usage.', 'hoatzinmedia')
																			  )
																			: !usageList || !usageList.length
																				? element.createElement('div', { className: 'hm-usage-muted' }, i18n.__('No usage detected.', 'hoatzinmedia'))
																				: element.createElement(
																						'div',
																						{ className: 'hm-usage-list' },
																						usageList.map(function (u, uidx) {
																							var post = u && u.post ? u.post : null
																							var contexts = u && u.contexts ? u.contexts : []
																							var ctxText = contexts && contexts.length ? contexts.join(', ') : ''
																							if (post && post.id) {
																								return element.createElement(
																									'div',
																									{ key: post.id + '-' + uidx, className: 'hm-usage-item' },
																									element.createElement(
																										'a',
																										{
																											href: post.edit_link || post.view_link || '#',
																											target: '_blank',
																											rel: 'noopener noreferrer',
																											className: 'hm-usage-link',
																										},
																										(post.title || '') +
																											(post.post_type ? ' (' + post.post_type + ')' : '')
																									),
																									ctxText
																										? element.createElement('span', { className: 'hm-usage-muted' }, ' · ' + ctxText)
																										: null
																								)
																							}
																							var label = u && u.label ? u.label : ''
																							return element.createElement(
																								'div',
																								{ key: 'site-' + uidx, className: 'hm-usage-item' },
																								element.createElement('span', { className: 'hm-usage-muted' }, label || '')
																							)
																						})
																					)
																)
															: null
													)
												})
										  )
										: null
								)
							})
					  )),
			showEmpty
				? null
				: element.createElement(
						'div',
						{ className: 'hm-footer-row' },
						element.createElement(
							'span',
							null,
							i18n.__('Page', 'hoatzinmedia'),
							' ',
							page,
							totals.totalPages > 0 ? ' / ' + totals.totalPages : '',
							totals.total > 0
								? ' · ' + totals.total + ' ' + i18n.__('groups', 'hoatzinmedia')
								: ''
						),
						element.createElement(
							'div',
							null,
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-outline',
									onClick: function () {
										if (hasPrev) {
											setPage(page - 1)
										}
									},
									disabled: loading || !hasPrev,
								},
								i18n.__('Previous', 'hoatzinmedia')
							),
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-outline',
									onClick: function () {
										if (hasNext) {
											setPage(page + 1)
										}
									},
									disabled: loading || !hasNext,
									style: { marginLeft: '6px' },
								},
								i18n.__('Next', 'hoatzinmedia')
							)
						)
				  )
		)
	}

	function RegenerateModule(props) {
		var _useStatePage = useState(1)
		var page = _useStatePage[0]
		var setPage = _useStatePage[1]

		var initialLimit = 20
		if (typeof window !== 'undefined' && window.HoatzinMediaSettings && window.HoatzinMediaSettings.itemsPerPage) {
			initialLimit = window.HoatzinMediaSettings.itemsPerPage
		}
		var _useStatePerPage = useState(initialLimit)
		var perPage = _useStatePerPage[0]
		var setPerPage = _useStatePerPage[1]

		var _useStateLoading = useState(false)
		var loading = _useStateLoading[0]
		var setLoading = _useStateLoading[1]

		var _useStateItems = useState([])
		var items = _useStateItems[0]
		var setItems = _useStateItems[1]

		var _useStateTotalPages = useState(0)
		var totalPages = _useStateTotalPages[0]
		var setTotalPages = _useStateTotalPages[1]

		var _useStateTotal = useState(0)
		var total = _useStateTotal[0]
		var setTotal = _useStateTotal[1]

		var _useStateSelected = useState([])
		var selected = _useStateSelected[0]
		var setSelected = _useStateSelected[1]

		var _useStateWorking = useState(false)
		var working = _useStateWorking[0]
		var setWorking = _useStateWorking[1]

		var _useStateMessage = useState('')
		var message = _useStateMessage[0]
		var setMessage = _useStateMessage[1]
		var _useStateSizes = useState([])
		var sizes = _useStateSizes[0]
		var setSizes = _useStateSizes[1]
		var _useStateProgress = useState({ total: 0, processed: 0 })
		var progress = _useStateProgress[0]
		var setProgress = _useStateProgress[1]
		var _useStateLogs = useState([])
		var logs = _useStateLogs[0]
		var setLogs = _useStateLogs[1]
		var _useStateCounts = useState({ success: 0, error: 0, skipped: 0 })
		var counts = _useStateCounts[0]
		var setCounts = _useStateCounts[1]
		var _useStateRegenStatus = useState(null)
		var regenStatus = _useStateRegenStatus[0]
		var setRegenStatus = _useStateRegenStatus[1]
		var _useStateModalMessage = useState('')
		var modalMessage = _useStateModalMessage[0]
		var setModalMessage = _useStateModalMessage[1]
		var _useStateBgJobId = useState(null)
		var bgJobId = _useStateBgJobId[0]
		var setBgJobId = _useStateBgJobId[1]
		var _useStateBgStatus = useState(null)
		var bgStatus = _useStateBgStatus[0]
		var setBgStatus = _useStateBgStatus[1]
		var bgIntervalRef = useRef(null)
		var _useStateStopRequested = useState(false)
		var stopRequested = _useStateStopRequested[0]
		var setStopRequested = _useStateStopRequested[1]
		var _useStateSkipExisting = useState(function () {
			try {
				var v = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('hmSkipExisting') : null
				return v === null ? true : v === '1'
			} catch (_e) {
				return true
			}
		}())
		var skipExisting = _useStateSkipExisting[0]
		var setSkipExisting = _useStateSkipExisting[1]
		useEffect(function () {
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					window.localStorage.setItem('hmSkipExisting', skipExisting ? '1' : '0')
				}
			} catch (_e) {}
		}, [skipExisting])
		var _useStateHideBackupNotice = useState(function () {
			try {
				var until = parseInt(
					typeof window !== 'undefined' && window.localStorage
						? window.localStorage.getItem('hm_regenerate_backup_notice_hide_until') || '0'
						: '0',
					10
				)
				return until && !isNaN(until) ? Date.now() < until : false
			} catch (_e) {
				return false
			}
		}())
		var hideBackupNotice = _useStateHideBackupNotice[0]
		var setHideBackupNotice = _useStateHideBackupNotice[1]
		function dismissBackupNotice() {
			setHideBackupNotice(true)
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					window.localStorage.setItem(
						'hm_regenerate_backup_notice_hide_until',
						String(Date.now() + 86400000)
					)
				}
			} catch (_e) {}
		}

		function loadLibrary(nextPage, nextPerPage) {
			setLoading(true)
			var query =
				'hoatzinmedia/v1/regenerate/library?page=' +
				nextPage +
				'&per_page=' +
				nextPerPage
			apiFetch({
				path: query,
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function (response) {
					var list = (response && response.items) || []
					setItems(list)
					setPage(response && response.page ? response.page : nextPage)
					setPerPage(
						response && response.per_page ? response.per_page : nextPerPage
					)
					setTotalPages(
						response && response.total_pages ? response.total_pages : 0
					)
					setTotal(response && response.total ? response.total : list.length)
					setLoading(false)
				})
				.catch(function () {
					setItems([])
					setTotalPages(0)
					setTotal(0)
					setLoading(false)
				})
		}

		useEffect(
			function () {
				loadLibrary(page, perPage)
			},
			[page, perPage]
		)

		useEffect(function () {
			apiFetch({
				path: 'hoatzinmedia/v1/regenerate/sizes',
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function (response) {
					var list = (response && response.sizes) || []
					setSizes(list)
				})
				.catch(function () {
					setSizes([])
				})
		}, [])

		function toggleSelect(id) {
			var next = selected.slice()
			var idx = next.indexOf(id)
			if (idx === -1) {
				next.push(id)
			} else {
				next.splice(idx, 1)
			}
			setSelected(next)
		}

		function toggleSelectAll() {
			if (!items.length) {
				return
			}
			var allSelectedNow = items.every(function (it) {
				return selected.indexOf(it.id) !== -1
			})
			if (allSelectedNow) {
				setSelected([])
			} else {
				var apiFetchFn =
					typeof apiFetch === 'function'
						? apiFetch
						: (typeof wp !== 'undefined' && wp.apiFetch && typeof wp.apiFetch === 'function' ? wp.apiFetch : null)
				if (!apiFetchFn) {
					return
				}
				apiFetchFn({
					path: 'hoatzinmedia/v1/regenerate/library/ids',
					method: 'GET',
					headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
				})
					.then(function (resp) {
						var allIds = (resp && resp.ids) || []
						setSelected(allIds)
					})
					.catch(function () {})
			}
		}

		var _useStateConfirmOpen = useState(false)
		var confirmOpen = _useStateConfirmOpen[0]
		var setConfirmOpen = _useStateConfirmOpen[1]
		var regenBtnRef = useRef(null)
		var wrapperRef = useRef(null)
		var _useStateRegenAnchor = useState(null)
		var regenAnchor = _useStateRegenAnchor[0]
		var setRegenAnchor = _useStateRegenAnchor[1]

		function handleRegenerate() {
			if (working) {
				return
			}
			if (!selected.length) {
				setMessage(i18n.__('Select at least one image.', 'hoatzinmedia'))
				return
			}
			try {
				if (regenBtnRef && regenBtnRef.current && typeof regenBtnRef.current.getBoundingClientRect === 'function') {
					var rect = regenBtnRef.current.getBoundingClientRect()
					var containerRect = null
					var containerWidth = (typeof window !== 'undefined' ? window.innerWidth : 1024)
					if (wrapperRef && wrapperRef.current && typeof wrapperRef.current.getBoundingClientRect === 'function') {
						containerRect = wrapperRef.current.getBoundingClientRect()
						try {
							containerWidth = wrapperRef.current.offsetWidth || containerWidth
						} catch (_e2) {}
					}
					setRegenAnchor({
						rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
						container: containerRect ? { top: containerRect.top, left: containerRect.left } : null,
						containerWidth: containerWidth,
					})
				}
			} catch (_e) {}
			setConfirmOpen(true)
		}

		function confirmRegenerate() {
			if (!selected.length) {
				return
			}
			setWorking(true)
			setMessage('')
			setModalMessage('')
			setRegenStatus('running')
			setLogs([])
			setCounts({ success: 0, error: 0, skipped: 0 })
			setProgress({ total: selected.length, processed: 0 })
			var ids = selected.slice()
			var nameById = {}
			var itemsList = Array.isArray(items) ? items : []
			itemsList.forEach(function (it) {
				nameById[it.id] = it.file_name || ('#' + it.id)
			})
			var batchSize = 5
			var index = 0
			var hadErrors = false
			var apiFetchFn =
				typeof apiFetch === 'function'
					? apiFetch
					: (typeof wp !== 'undefined' && wp.apiFetch && typeof wp.apiFetch === 'function' ? wp.apiFetch : null)
			if (!apiFetchFn) {
				setWorking(false)
				setConfirmOpen(false)
				setMessage(i18n.__('Network client unavailable.', 'hoatzinmedia'))
				return
			}
			function runNext() {
				if (stopRequested) {
					setWorking(false)
					setConfirmOpen(false)
					setMessage(i18n.__('Regeneration stopped.', 'hoatzinmedia'))
					return
				}
				if (index >= ids.length) {
					setWorking(false)
					setSelected([])
					loadLibrary(page, perPage)
					if (hadErrors) {
						setRegenStatus('errors')
					} else {
						setModalMessage(i18n.__('Thumbnails regenerated successfully.', 'hoatzinmedia'))
						setRegenStatus('done')
					}
					return
				}
				var batch = ids.slice(index, index + batchSize)
				index += batch.length
				apiFetchFn({
					path: 'hoatzinmedia/v1/regenerate',
					method: 'POST',
					headers: {
						'X-WP-Nonce': HoatzinMediaSettings.nonce,
					},
					data: { ids: batch, skip_existing: skipExisting },
				})
					.then(function (response) {
						var results = (response && response.results) || []
						var succ = 0
						var errc = 0
						var skipc = 0
						var lines = results.map(function (r) {
							var t = new Date()
							var hh = String(t.getHours()).padStart(2, '0')
							var mm = String(t.getMinutes()).padStart(2, '0')
							var ss = String(t.getSeconds()).padStart(2, '0')
							var label = nameById[r.id] || ('#' + r.id)
							if (r.status === 'success') { succ++ } else if (r.status === 'error') { errc++ } else if (r.status === 'skipped') { skipc++ }
							return '[' + hh + ':' + mm + ':' + ss + '] ' + label + ' ' + (r.status || '')
						})
						if (results.some(function (r) { return r.status !== 'success' })) {
							hadErrors = true
						}
						setCounts(function (prev) {
							return { success: prev.success + succ, error: prev.error + errc, skipped: prev.skipped + skipc }
						})
						setLogs(function (prev) {
							return prev.concat(lines)
						})
						setProgress(function (prev) {
							var nextProcessed = prev.processed + batch.length
							return { total: prev.total, processed: nextProcessed }
						})
					})
					.catch(function (err) {
						hadErrors = true
						var t = new Date()
						var hh = String(t.getHours()).padStart(2, '0')
						var mm = String(t.getMinutes()).padStart(2, '0')
						var ss = String(t.getSeconds()).padStart(2, '0')
						setLogs(function (prev) {
							return prev.concat([
								'[' + hh + ':' + mm + ':' + ss + '] ' + (err && err.message ? err.message : i18n.__('Batch failed', 'hoatzinmedia')),
							])
						})
						setProgress(function (prev) {
							var nextProcessed = prev.processed + batch.length
							return { total: prev.total, processed: nextProcessed }
						})
					})
					.finally(function () {
						runNext()
					})
			}
			runNext()
		}

		function startBackgroundRegenerate() {
			if (working) {
				return
			}
			if (!selected.length) {
				setMessage(i18n.__('Select at least one image.', 'hoatzinmedia'))
				return
			}
			setMessage('')
			setLogs([])
			setCounts({ success: 0, error: 0, skipped: 0 })
			setProgress({ total: selected.length, processed: 0 })
			var apiFetchFn =
				typeof apiFetch === 'function'
					? apiFetch
					: (typeof wp !== 'undefined' && wp.apiFetch && typeof wp.apiFetch === 'function' ? wp.apiFetch : null)
			if (!apiFetchFn) {
				setMessage(i18n.__('Network client unavailable.', 'hoatzinmedia'))
				return
			}
			apiFetchFn({
				path: 'hoatzinmedia/v1/regenerate/background',
				method: 'POST',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
				data: { ids: selected, skip_existing: skipExisting },
			})
				.then(function (response) {
					var jobId = response && response.job_id
					if (!jobId) {
						setMessage(i18n.__('Failed to start background job.', 'hoatzinmedia'))
						return
					}
					setBgJobId(jobId)
					setBgStatus({ status: 'queued' })
					if (bgIntervalRef.current) {
						try { clearInterval(bgIntervalRef.current) } catch (_e) {}
						bgIntervalRef.current = null
					}
					bgIntervalRef.current = setInterval(function () {
						apiFetch({
							path: 'hoatzinmedia/v1/regenerate/background/status?job_id=' + jobId,
							method: 'GET',
							headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
						})
							.then(function (resp) {
								setBgStatus(resp)
								setProgress({ total: resp.total || selected.length, processed: resp.processed || 0 })
								setCounts({
									success: resp && typeof resp.success === 'number' ? resp.success : 0,
									error: resp && typeof resp.error === 'number' ? resp.error : 0,
									skipped: resp && typeof resp.skipped === 'number' ? resp.skipped : 0,
								})
								if (resp.cancel_requested) {
									setMessage(i18n.__('Background job cancelling…', 'hoatzinmedia'))
								}
								var lines = (resp.logs || []).map(function (l) {
									var t = l.time ? new Date(l.time * 1000) : new Date()
									var hh = String(t.getHours()).padStart(2, '0')
									var mm = String(t.getMinutes()).padStart(2, '0')
									var ss = String(t.getSeconds()).padStart(2, '0')
									return '[' + hh + ':' + mm + ':' + ss + '] ' + (l.message || '')
								})
								setLogs(lines)
								if (resp.status === 'done' || resp.status === 'cancelled') {
									if (bgIntervalRef.current) {
										try { clearInterval(bgIntervalRef.current) } catch (_e2) {}
										bgIntervalRef.current = null
									}
									setMessage(resp.status === 'done' ? i18n.__('Background job completed.', 'hoatzinmedia') : i18n.__('Background job cancelled.', 'hoatzinmedia'))
									setSelected([])
									loadLibrary(page, perPage)
								}
							})
							.catch(function () {})
					}, 2000)
				})
				.catch(function () {
					setMessage(i18n.__('Failed to start background job.', 'hoatzinmedia'))
				})
		}

		function stopRegenerate() {
			if (working) {
				setStopRequested(true)
			}
			if (bgJobId) {
				var apiFetchFn =
					typeof apiFetch === 'function'
						? apiFetch
						: (typeof wp !== 'undefined' && wp.apiFetch && typeof wp.apiFetch === 'function' ? wp.apiFetch : null)
				if (apiFetchFn) {
					apiFetchFn({
						path: 'hoatzinmedia/v1/regenerate/background/cancel',
						method: 'POST',
						headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
						data: { job_id: bgJobId },
					}).catch(function () {})
				}
			}
		}

		var showEmpty = !loading && (!items || !items.length)
		var hasPrev = page > 1
		var hasNext = totalPages > 0 && page < totalPages
		var allSelectedNow =
			items.length > 0 &&
			items.every(function (it) {
				return selected.indexOf(it.id) !== -1
			})
		var someSelectedNow = selected.length > 0 && !allSelectedNow
		var hdrChkRef = useRef(null)
		useEffect(function () {
			try {
				if (hdrChkRef && hdrChkRef.current) {
					hdrChkRef.current.indeterminate = !!someSelectedNow
				}
			} catch (_e) {}
		}, [someSelectedNow, allSelectedNow, selected])

		return element.createElement(
			'div',
			{ className: 'hm-unused-table-wrapper', ref: wrapperRef },
			element.createElement(
				'div',
				{ className: 'hm-unused-header-row' },
				element.createElement(
					'div',
					{ className: 'hm-card-title' },
					i18n.__('Library', 'hoatzinmedia')
				),
				element.createElement(
					'div',
					{ className: 'hm-unused-header-actions' },
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: toggleSelectAll,
						},
						allSelectedNow
							? i18n.__('Unselect all', 'hoatzinmedia')
							: i18n.__('Select all', 'hoatzinmedia')
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-primary',
							onClick: handleRegenerate,
							ref: regenBtnRef,
							disabled: working || !selected.length,
							style: { marginLeft: '8px' },
						},
						working
							? i18n.__('Regenerating…', 'hoatzinmedia')
							: i18n.__('Regenerate thumbnails', 'hoatzinmedia')
					)
				)
			),
			!hideBackupNotice &&
				element.createElement(
					'div',
					{ className: 'hm-converter-backup-warning' },
					element.createElement(
						'div',
						{ className: 'hm-converter-backup-warning-text' },
						element.createElement(
							'strong',
							null,
							i18n.__('Important:', 'hoatzinmedia')
						),
						' ',
						i18n.__(
							'Take a full backup before running this process. Regenerating thumbnails can overwrite derived image sizes and may take time on large libraries.',
							'hoatzinmedia'
						)
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-converter-backup-warning-close',
							onClick: dismissBackupNotice,
							title: i18n.__('Hide for 1 day', 'hoatzinmedia'),
						},
						element.createElement(
							'svg',
							{ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
							element.createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
							element.createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
						)
					)
				),
			message &&
				element.createElement(
					'div',
					{ className: 'hm-card-subvalue', style: { marginTop: '6px' }, hidden: !!confirmOpen },
					message
				),
			(working || bgJobId) &&
				element.createElement(
					'div',
					{ style: { marginTop: '8px' } },
					element.createElement(
						'div',
						{
							style: {
								height: '8px',
								background: '#eaedf3',
								borderRadius: '999px',
								overflow: 'hidden',
							},
						},
						element.createElement('div', {
							style: {
								height: '8px',
								width:
									progress && progress.total > 0
										? Math.round((progress.processed / progress.total) * 100) + '%'
										: '0%',
								background: '#3c78f0',
							},
						})
					),
					element.createElement(
						'div',
						{
							style: {
								marginTop: '8px',
								background: '#f8f9fb',
								borderRadius: '8px',
								padding: '8px',
								maxHeight: '180px',
								overflow: 'auto',
								fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
								fontSize: '12px',
							},
						},
						(logs || []).map(function (line, idx) {
							return element.createElement('div', { key: 'log-' + idx }, line)
						})
					)
				),
			element.createElement(ConfirmModal, {
				open: confirmOpen,
				title: i18n.__('Regenerate thumbnails', 'hoatzinmedia'),
				message: i18n.__(
					'Regenerate thumbnails for selected images now? They will be recreated for all registered sizes.',
					'hoatzinmedia'
				),
				anchor: regenAnchor,
				busy: working,
				secondaryLabel: i18n.__('Background regenerate', 'hoatzinmedia'),
				onSecondary: startBackgroundRegenerate,
				secondaryDisabled: !!bgJobId || !selected.length,
				confirmLabel: i18n.__('Regenerate', 'hoatzinmedia'),
				confirmBusyLabel: i18n.__('Regenerating…', 'hoatzinmedia'),
				confirmDisabled: !!bgJobId || !selected.length,
				onCancel: function () {
					if (!working) {
						setConfirmOpen(false)
					}
				},
				onConfirm: confirmRegenerate,
			},
				element.createElement(
					'label',
					{ style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' } },
					element.createElement('input', {
						type: 'checkbox',
						checked: !!skipExisting,
						onChange: function () { setSkipExisting(!skipExisting) },
						disabled: working || !!bgJobId,
					}),
					element.createElement('span', null, i18n.__('Skip images already regenerated', 'hoatzinmedia'))
				),
				confirmOpen
					? element.createElement(
							'div',
							{ style: { marginTop: '8px' } },
							element.createElement(
								'div',
								{
									style: {
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'space-between',
										marginBottom: '8px',
									},
								},
								element.createElement(
									'span',
									null,
									i18n.__('Status:', 'hoatzinmedia'),
									' ',
									working ? i18n.__('Regenerating…', 'hoatzinmedia') :
									(regenStatus ? i18n.__('Completed', 'hoatzinmedia') :
									  (bgStatus && bgStatus.status) || i18n.__('Running…', 'hoatzinmedia'))
								),
								modalMessage &&
									element.createElement(
										'span',
										{ style: { marginLeft: '8px' } },
										modalMessage
									),
								element.createElement(
									'span',
									{ style: { marginLeft: '8px', flex: '1', textAlign: 'center' } },
									i18n.__('Success', 'hoatzinmedia'),
									': ',
									String(counts.success || 0),
									' · ',
									i18n.__('Error', 'hoatzinmedia'),
									': ',
									String(counts.error || 0),
									' · ',
									i18n.__('Skipped', 'hoatzinmedia'),
									': ',
									String(counts.skipped || 0)
								),
								element.createElement(
									'button',
									{
										type: 'button',
										className: 'hm-button hm-button-danger',
										onClick: stopRegenerate,
										disabled: !working && !bgJobId,
									},
									i18n.__('Stop', 'hoatzinmedia')
								)
							),
							element.createElement(
								'div',
								{
									style: {
										height: '6px',
										background: '#eaedf3',
										borderRadius: '999px',
										overflow: 'hidden',
									},
								},
								element.createElement('div', {
									style: {
										height: '6px',
										width:
											progress && progress.total > 0
												? Math.round((progress.processed / progress.total) * 100) + '%'
												: '0%',
										background: '#3c78f0',
									},
								})
							),
							element.createElement(
								'div',
								{
									style: {
										marginTop: '8px',
										background: '#f8f9fb',
										borderRadius: '8px',
										padding: '8px',
										maxHeight: '120px',
										overflow: 'auto',
										fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
										fontSize: '12px',
									},
								},
								(logs || []).map(function (line, idx) {
									return element.createElement('div', { key: 'modal-log-' + idx }, line)
								})
							)
					  )
					: null
			),
			element.createElement(
				'div',
				{
					className: 'hm-layout',
					style: {
						marginTop: '12px',
						display: 'grid',
						gridTemplateColumns: '1fr 360px',
						gap: '12px',
						alignItems: 'start',
					},
				},
				// Left column: library table and pagination
				element.createElement(
					'div',
					{ className: 'hm-panel' },
					loading &&
						element.createElement('div', {
							className: 'hm-skeleton hm-skeleton-block',
							style: { height: '160px', marginTop: '8px' },
						}),
					!loading &&
						element.createElement(
							'table',
							{
								className: 'hm-latest-table',
								style: { marginTop: '8px' },
							},
							element.createElement(
								'thead',
								null,
								element.createElement(
									'tr',
									null,
									element.createElement(
										'th',
										null,
									element.createElement('input', {
											type: 'checkbox',
											ref: hdrChkRef,
											checked: !!allSelectedNow,
											onChange: function (e) {
												var apiFetchFn =
													typeof apiFetch === 'function'
														? apiFetch
														: (typeof wp !== 'undefined' && wp.apiFetch && typeof wp.apiFetch === 'function' ? wp.apiFetch : null)
												if (!apiFetchFn) {
													return
												}
												if (e && e.target && e.target.checked) {
													apiFetchFn({
														path: 'hoatzinmedia/v1/regenerate/library/ids',
														method: 'GET',
														headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
													})
														.then(function (resp) {
															var allIds = (resp && resp.ids) || []
															setSelected(allIds)
														})
														.catch(function () {})
												} else {
													setSelected([])
												}
											},
										})
									),
									element.createElement(
										'th',
										null,
										i18n.__('Preview', 'hoatzinmedia')
									),
									element.createElement(
										'th',
										null,
										i18n.__('Name', 'hoatzinmedia')
									),
									element.createElement(
										'th',
										null,
										i18n.__('Size', 'hoatzinmedia')
									),
									element.createElement(
										'th',
										null,
										i18n.__('Uploaded', 'hoatzinmedia')
									)
								)
							),
							element.createElement(
								'tbody',
								null,
								showEmpty &&
									element.createElement(
										'tr',
										null,
										element.createElement(
											'td',
											{ colSpan: 5 },
											element.createElement(
												'div',
												{ className: 'hm-empty-state' },
												i18n.__('No images found.', 'hoatzinmedia')
											)
										)
									),
								!showEmpty &&
									items.map(function (item) {
										return element.createElement(
											'tr',
											{ key: item.id, className: 'hm-row-hover' },
											element.createElement(
												'td',
												null,
												element.createElement('input', {
													type: 'checkbox',
													checked: selected.indexOf(item.id) !== -1,
													onChange: function () {
														toggleSelect(item.id)
													},
												})
											),
											element.createElement(
												'td',
												null,
												item.thumbnail_url || item.file_url
													? element.createElement('img', {
															src: item.thumbnail_url || item.file_url,
															alt: item.file_name || '',
															onError: function (e) {
																if (
																	item.file_url &&
																	e.target.src !== item.file_url
																) {
																	e.target.src = item.file_url
																}
															},
															style: {
																width: '40px',
																height: '40px',
																objectFit: 'cover',
																borderRadius: '8px',
															},
													  })
													: element.createElement(
															'span',
															{ className: 'hm-tag' },
															i18n.__('No preview', 'hoatzinmedia')
													  )
											),
											element.createElement(
												'td',
												{ className: 'hm-file-name-cell' },
												element.createElement(
													'div',
													{ className: 'hm-file-name-primary' },
													item.file_name || '#' + item.id
												)
											),
											element.createElement(
												'td',
												null,
												item.size_readable || ''
											),
											element.createElement('td', null, item.date || '')
										)
									})
							)
						),
					element.createElement(
						'div',
						{ className: 'hm-footer-row' },
						element.createElement(
							'span',
							null,
							i18n.__('Page', 'hoatzinmedia'),
							' ',
							page,
							totalPages > 0 ? ' / ' + totalPages : '',
							total > 0
								? ' · ' + total + ' ' + i18n.__('items', 'hoatzinmedia')
								: ''
						),
						element.createElement(
							'div',
							null,
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-outline',
									onClick: function () {
										if (hasPrev) {
											setPage(page - 1)
										}
									},
									disabled: loading || !hasPrev,
								},
								i18n.__('Previous', 'hoatzinmedia')
							),
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-outline',
									onClick: function () {
										if (hasNext) {
											setPage(page + 1)
										}
									},
									disabled: loading || !hasNext,
									style: { marginLeft: '6px' },
								},
								i18n.__('Next', 'hoatzinmedia')
							)
						)
					)
				),
				// Right column: sizes panel
				element.createElement(
					'div',
					{ className: 'hm-panel' },
					element.createElement(
						'div',
						{ className: 'hm-panel-header' },
						element.createElement(
							'div',
							null,
							element.createElement(
								'div',
								{ className: 'hm-panel-title' },
								i18n.__('Registered image sizes', 'hoatzinmedia')
							),
							element.createElement(
								'div',
								{ className: 'hm-panel-subtitle' },
								i18n.__('These sizes are regenerated per image.', 'hoatzinmedia')
							)
						)
					),
					element.createElement(
						'table',
						{ className: 'hm-latest-table', style: { marginTop: '8px' } },
						element.createElement(
							'thead',
							null,
							element.createElement(
								'tr',
								null,
								element.createElement('th', null, i18n.__('Size', 'hoatzinmedia')),
								element.createElement(
									'th',
									null,
									i18n.__('Dimensions', 'hoatzinmedia')
								),
								element.createElement('th', null, i18n.__('Crop', 'hoatzinmedia'))
							)
						),
						element.createElement(
							'tbody',
							null,
							(!sizes || !sizes.length) &&
								element.createElement(
									'tr',
									null,
									element.createElement(
										'td',
										{ colSpan: 3 },
										element.createElement(
											'div',
											{ className: 'hm-empty-state' },
											i18n.__('No sizes found.', 'hoatzinmedia')
										)
									)
								),
							sizes &&
								sizes.map(function (s) {
									return element.createElement(
										'tr',
										{ key: s.name },
										element.createElement('td', null, s.name),
										element.createElement(
											'td',
											null,
											(s.width || 0) + '×' + (s.height || 0)
										),
										element.createElement('td', null, s.crop ? 'Yes' : 'No')
									)
								})
						)
					)
				)
			)
		)
	}

	function TrashManager(props) {
		var _useStatePage = useState(1)
		var page = _useStatePage[0]
		var setPage = _useStatePage[1]

		var initialLimit = 20
		if (typeof window !== 'undefined' && window.HoatzinMediaSettings && window.HoatzinMediaSettings.itemsPerPage) {
			initialLimit = window.HoatzinMediaSettings.itemsPerPage
		}
		var _useStateLimit = useState(initialLimit)
		var limit = _useStateLimit[0]
		var setLimit = _useStateLimit[1]

		var _useStateLoading = useState(false)
		var loading = _useStateLoading[0]
		var setLoading = _useStateLoading[1]

		var _useStateRows = useState([])
		var rows = _useStateRows[0]
		var setRows = _useStateRows[1]

		var _useStateTotalPages = useState(0)
		var totalPages = _useStateTotalPages[0]
		var setTotalPages = _useStateTotalPages[1]

		var _useStateTotal = useState(0)
		var total = _useStateTotal[0]
		var setTotal = _useStateTotal[1]

		var _useStateRestoreOpen = useState(false)
		var restoreOpen = _useStateRestoreOpen[0]
		var setRestoreOpen = _useStateRestoreOpen[1]

		var _useStateRestoreId = useState(null)
		var restoreId = _useStateRestoreId[0]
		var setRestoreId = _useStateRestoreId[1]

		var _useStateDeleteOpen = useState(false)
		var deleteOpen = _useStateDeleteOpen[0]
		var setDeleteOpen = _useStateDeleteOpen[1]

		var _useStateDeleteId = useState(null)
		var deleteId = _useStateDeleteId[0]
		var setDeleteId = _useStateDeleteId[1]

		var _useStateWorking = useState(false)
		var working = _useStateWorking[0]
		var setWorking = _useStateWorking[1]

		function loadTrash(nextPage, nextLimit) {
			setLoading(true)

			var query =
				'hoatzinmedia/v1/trash?page=' +
				nextPage +
				'&per_page=' +
				nextLimit

			apiFetch({
				path: query,
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function (response) {
					var items = response && response.results ? response.results : []
					setRows(items)
					setTotalPages(response && response.total_pages ? response.total_pages : 0)
					setTotal(response && response.total ? response.total : 0)
					setLoading(false)
				})
				.catch(function () {
					setRows([])
					setTotalPages(0)
					setTotal(0)
					setLoading(false)
				})
		}

		useEffect(
			function () {
				loadTrash(page, limit)
			},
			[page, limit]
		)

		function onLimitChange(event) {
			var value = parseInt(event.target.value, 10) || 20
			if (value <= 0) {
				value = 20
			}
			if (value > 100) {
				value = 100
			}
			setLimit(value)
			setPage(1)
		}

		function changePage(nextPage) {
			if (nextPage === page) {
				return
			}
			if (nextPage < 1) {
				return
			}
			if (totalPages > 0 && nextPage > totalPages) {
				return
			}
			setPage(nextPage)
		}

		function openRestore(id) {
			if (!id || working) {
				return
			}
			setRestoreId(id)
			setRestoreOpen(true)
		}

		function closeRestore() {
			if (working) {
				return
			}
			setRestoreOpen(false)
			setRestoreId(null)
		}

		function openDelete(id) {
			if (!id || working) {
				return
			}
			setDeleteId(id)
			setDeleteOpen(true)
		}

		function closeDelete() {
			if (working) {
				return
			}
			setDeleteOpen(false)
			setDeleteId(null)
		}

		function handleRestore() {
			if (!restoreId || working) {
				return
			}

			setWorking(true)

			apiFetch({
				path: 'hoatzinmedia/v1/restore',
				method: 'POST',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
				data: {
					attachment_ids: [restoreId],
				},
			})
				.then(function (response) {
					setWorking(false)
					setRestoreOpen(false)
					setRestoreId(null)
					if (props.onToast) {
						var count =
							response && typeof response.restored_count === 'number'
								? response.restored_count
								: 1
						props.onToast(
							'success',
							i18n.__('Restored from trash: ', 'hoatzinmedia') + count
						)
					}
					loadTrash(page, limit)
				})
				.catch(function () {
					setWorking(false)
					setRestoreOpen(false)
					setRestoreId(null)
					if (props.onToast) {
						props.onToast(
							'error',
							i18n.__(
								'Failed to restore file from trash. Please try again.',
								'hoatzinmedia'
							)
						)
					}
				})
		}

		function handlePermanentDelete() {
			if (!deleteId || working) {
				return
			}

			setWorking(true)

			apiFetch({
				path: 'hoatzinmedia/v1/trash-permanent',
				method: 'POST',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
				data: {
					attachment_ids: [deleteId],
				},
			})
				.then(function (response) {
					setWorking(false)
					setDeleteOpen(false)
					setDeleteId(null)
					if (props.onToast) {
						var count =
							response && typeof response.deleted_count === 'number'
								? response.deleted_count
								: 1
						props.onToast(
							'success',
							i18n.__('Permanently deleted from trash: ', 'hoatzinmedia') +
								count
						)
					}
					loadTrash(page, limit)
				})
				.catch(function () {
					setWorking(false)
					setDeleteOpen(false)
					setDeleteId(null)
					if (props.onToast) {
						props.onToast(
							'error',
							i18n.__(
								'Failed to permanently delete file. Please try again.',
								'hoatzinmedia'
							)
						)
					}
				})
		}

		var hasNext = totalPages > 0 && page < totalPages
		var hasPrev = page > 1

		var showEmpty = !loading && rows.length === 0

		return element.createElement(
			'div',
			{ className: 'hm-unused-table-wrapper' },
			element.createElement(
				'div',
				{ className: 'hm-unused-header-row' },
				element.createElement(
					'div',
					{ className: 'hm-card-title' },
					i18n.__('Trash manager', 'hoatzinmedia')
				),
				element.createElement(
					'div',
					{ className: 'hm-unused-header-actions' },
					element.createElement(
						'select',
						{
							className: 'hm-select',
							value: limit,
							onChange: onLimitChange,
						},
						element.createElement(
							'option',
							{ value: 10 },
							'10'
						),
						element.createElement(
							'option',
							{ value: 20 },
							'20'
						),
						element.createElement(
							'option',
							{ value: 50 },
							'50'
						),
						element.createElement(
							'option',
							{ value: 100 },
							'100'
						)
					)
				)
			),
			loading &&
				element.createElement(
					'div',
					{
						className: 'hm-skeleton hm-skeleton-block',
						style: { height: '160px', marginTop: '8px' },
					}
				),
			!loading &&
				element.createElement(
					'table',
					{ className: 'hm-latest-table hm-unused-table', style: { marginTop: '8px' } },
					element.createElement(
						'thead',
						null,
						element.createElement(
							'tr',
							null,
							element.createElement(
								'th',
								null,
								i18n.__('File name', 'hoatzinmedia')
							),
							element.createElement(
								'th',
								{ style: { width: '140px' } },
								i18n.__('Deleted at', 'hoatzinmedia')
							),
							element.createElement(
								'th',
								{ style: { width: '120px' } },
								i18n.__('Size', 'hoatzinmedia')
							),
							element.createElement(
								'th',
								{ style: { width: '180px' } },
								i18n.__('Actions', 'hoatzinmedia')
							)
						)
					),
					element.createElement(
						'tbody',
						null,
						showEmpty &&
							element.createElement(
								'tr',
								null,
								element.createElement(
									'td',
									{ colSpan: 4 },
									element.createElement(
										'div',
										{ className: 'hm-empty-state' },
										i18n.__(
											'Trash is empty. Recently deleted files will appear here.',
											'hoatzinmedia'
										)
									)
								)
							),
						!showEmpty &&
							rows.map(function (item, index) {
								var id = item.attachment_id
								var name =
									item.file_name ||
									i18n.__('Untitled file', 'hoatzinmedia')
								var deletedAt = item.deleted_at || ''
								var size = item.file_size || ''
								return element.createElement(
									'tr',
									{ key: id || index, className: 'hm-row-hover' },
									element.createElement(
										'td',
										{ className: 'hm-file-name-cell' },
										element.createElement(
											'div',
											{ className: 'hm-file-name-primary' },
											name
										)
									),
									element.createElement('td', null, deletedAt),
									element.createElement('td', null, size),
									element.createElement(
										'td',
										null,
										element.createElement(
											'div',
											{ className: 'hm-row-actions' },
											element.createElement(
												'button',
												{
													type: 'button',
													className: 'hm-button hm-button-ghost',
													onClick: function () {
														openRestore(id)
													},
													disabled: working,
												},
												i18n.__('Restore', 'hoatzinmedia')
											),
											element.createElement(
												'button',
												{
													type: 'button',
													className: 'hm-button hm-button-danger',
													onClick: function () {
														openDelete(id)
													},
													disabled: working,
													style: { marginLeft: '6px' },
												},
												i18n.__('Delete permanently', 'hoatzinmedia')
											)
										)
									)
								)
							})
					)
				),
			element.createElement(
				'div',
				{ className: 'hm-footer-row' },
				element.createElement(
					'span',
					null,
					i18n.__('Page', 'hoatzinmedia'),
					' ',
					page,
					totalPages > 0 ? ' / ' + totalPages : '',
					total > 0 ? ' · ' + total + ' ' + i18n.__('items', 'hoatzinmedia') : ''
				),
				element.createElement(
					'div',
					null,
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: function () {
								changePage(page - 1)
							},
							disabled: loading || !hasPrev,
						},
						i18n.__('Previous', 'hoatzinmedia')
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: function () {
								changePage(page + 1)
							},
							disabled: loading || !hasNext,
							style: { marginLeft: '6px' },
						},
						i18n.__('Next', 'hoatzinmedia')
					)
				)
			),
			restoreOpen &&
				element.createElement(
					'div',
					{ className: 'hm-modal-backdrop' },
					element.createElement(
						'div',
						{ className: 'hm-modal' },
						element.createElement(
							'div',
							{ className: 'hm-modal-header' },
							i18n.__('Restore file', 'hoatzinmedia')
						),
						element.createElement(
							'div',
							{ className: 'hm-modal-body' },
							i18n.__(
								'Restore this file from the HoatzinMedia trash?',
								'hoatzinmedia'
							)
						),
						element.createElement(
							'div',
							{ className: 'hm-modal-footer' },
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-outline',
									onClick: closeRestore,
									disabled: working,
								},
								i18n.__('Cancel', 'hoatzinmedia')
							),
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-primary',
									onClick: handleRestore,
									disabled: working,
									style: { marginLeft: '8px' },
								},
								working
									? i18n.__('Restoring…', 'hoatzinmedia')
									: i18n.__('Restore', 'hoatzinmedia')
							)
						)
					)
				),
			deleteOpen &&
				element.createElement(
					'div',
					{ className: 'hm-modal-backdrop' },
					element.createElement(
						'div',
						{ className: 'hm-modal' },
						element.createElement(
							'div',
							{ className: 'hm-modal-header' },
							i18n.__('Delete file permanently', 'hoatzinmedia')
						),
						element.createElement(
							'div',
							{ className: 'hm-modal-body' },
							i18n.__(
								'Are you sure? This will permanently delete the file and cannot be undone.',
								'hoatzinmedia'
							)
						),
						element.createElement(
							'div',
							{ className: 'hm-modal-footer' },
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-outline',
									onClick: closeDelete,
									disabled: working,
								},
								i18n.__('Cancel', 'hoatzinmedia')
							),
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-danger',
									onClick: handlePermanentDelete,
									disabled: working,
									style: { marginLeft: '8px' },
								},
								working
									? i18n.__('Deleting…', 'hoatzinmedia')
									: i18n.__('Delete permanently', 'hoatzinmedia')
							)
						)
					)
				)
		)
	}

	function ImageFormatsLibraryTable(props) {
		var _useStatePage = useState(1)
		var page = _useStatePage[0]
		var setPage = _useStatePage[1]

		var initialLimit = 20
		if (typeof window !== 'undefined' && window.HoatzinMediaSettings && window.HoatzinMediaSettings.itemsPerPage) {
			initialLimit = window.HoatzinMediaSettings.itemsPerPage
		}
		var _useStatePerPage = useState(initialLimit)
		var perPage = _useStatePerPage[0]
		var setPerPage = _useStatePerPage[1]

		var _useStateLoading = useState(false)
		var loading = _useStateLoading[0]
		var setLoading = _useStateLoading[1]

		var _useStateItems = useState([])
		var items = _useStateItems[0]
		var setItems = _useStateItems[1]

		var _useStateTotals = useState({ total: 0, totalPages: 0 })
		var totals = _useStateTotals[0]
		var setTotals = _useStateTotals[1]

		var _useStateSelected = useState([])
		var selected = _useStateSelected[0]
		var setSelected = _useStateSelected[1]

		var _useStateFormat = useState('webp')
		var bulkFormat = _useStateFormat[0]
		var setBulkFormat = _useStateFormat[1]

		var _useStateQuality = useState(80)
		var bulkQuality = _useStateQuality[0]
		var setBulkQuality = _useStateQuality[1]
		var _useStateBulkAction = useState('convert_selected')
		var bulkAction = _useStateBulkAction[0]
		var setBulkAction = _useStateBulkAction[1]
		var _useStateMessage = useState('')
		var message = _useStateMessage[0]
		var setMessage = _useStateMessage[1]
		var _useStateConvertConfirmOpen = useState(false)
		var convertConfirmOpen = _useStateConvertConfirmOpen[0]
		var setConvertConfirmOpen = _useStateConvertConfirmOpen[1]

		var _useStateBgJobId = useState('')
		var bgJobId = _useStateBgJobId[0]
		var setBgJobId = _useStateBgJobId[1]
		var _useStateBgJob = useState(null)
		var bgJob = _useStateBgJob[0]
		var setBgJob = _useStateBgJob[1]
		var _useStateQueueHidden = useState(false)
		var queueHidden = _useStateQueueHidden[0]
		var setQueueHidden = _useStateQueueHidden[1]

		var _useStateShowSettings = useState(false)
		var showSettings = _useStateShowSettings[0]
		var setShowSettings = _useStateShowSettings[1]

		var BACKUP_NOTICE_STORAGE_KEY = 'hm_converter_backup_notice_hide_until'
		var ONE_DAY_MS = 86400000
		var _useStateHideBackupNotice = useState(function () {
			try {
				if (typeof window === 'undefined' || !window.localStorage) {
					return false
				}
				var until = parseInt(window.localStorage.getItem(BACKUP_NOTICE_STORAGE_KEY) || '0', 10)
				if (!until || isNaN(until)) {
					return false
				}
				return Date.now() < until
			} catch (_e) {
				return false
			}
		})
		var hideBackupNotice = _useStateHideBackupNotice[0]
		var setHideBackupNotice = _useStateHideBackupNotice[1]

		function dismissBackupNotice() {
			setHideBackupNotice(true)
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					window.localStorage.setItem(
						BACKUP_NOTICE_STORAGE_KEY,
						String(Date.now() + ONE_DAY_MS)
					)
				}
			} catch (_e) {}
		}

		var _useStateConverterScope = useState('all')
		var converterScope = _useStateConverterScope[0]
		var setConverterScope = _useStateConverterScope[1]

		var _useStateImageTypes = useState('both')
		var imageTypes = _useStateImageTypes[0]
		var setImageTypes = _useStateImageTypes[1]

		var _useStateDestinationFolder = useState('separate')
		var destinationFolder = _useStateDestinationFolder[0]
		var setDestinationFolder = _useStateDestinationFolder[1]

		var _useStateFileExtension = useState('append')
		var fileExtension = _useStateFileExtension[0]
		var setFileExtension = _useStateFileExtension[1]

		var _useStateDestinationStructure = useState('roots')
		var destinationStructure = _useStateDestinationStructure[0]
		var setDestinationStructure = _useStateDestinationStructure[1]

		var _useStateCacheControl = useState('do_not_set')
		var cacheControl = _useStateCacheControl[0]
		var setCacheControl = _useStateCacheControl[1]

		var _useStatePreventLarger = useState(true)
		var preventLarger = _useStatePreventLarger[0]
		var setPreventLarger = _useStatePreventLarger[1]

		var _useStateJpegEncoding = useState('auto')
		var jpegEncoding = _useStateJpegEncoding[0]
		var setJpegEncoding = _useStateJpegEncoding[1]

		var _useStateJpegLossyQualityMode = useState('same_as_jpeg')
		var jpegLossyQualityMode = _useStateJpegLossyQualityMode[0]
		var setJpegLossyQualityMode = _useStateJpegLossyQualityMode[1]

		var _useStateJpegLossyLimit = useState(80)
		var jpegLossyLimit = _useStateJpegLossyLimit[0]
		var setJpegLossyLimit = _useStateJpegLossyLimit[1]

		var _useStateJpegFallback = useState(70)
		var jpegFallback = _useStateJpegFallback[0]
		var setJpegFallback = _useStateJpegFallback[1]

		var _useStateJpegLosslessQualityMode = useState('apply_preprocessing')
		var jpegLosslessQualityMode = _useStateJpegLosslessQualityMode[0]
		var setJpegLosslessQualityMode = _useStateJpegLosslessQualityMode[1]

		var _useStateJpegNearLossless = useState(60)
		var jpegNearLossless = _useStateJpegNearLossless[0]
		var setJpegNearLossless = _useStateJpegNearLossless[1]

		var _useStatePngEncoding = useState('auto')
		var pngEncoding = _useStatePngEncoding[0]
		var setPngEncoding = _useStatePngEncoding[1]

		var _useStatePngLossyQuality = useState(85)
		var pngLossyQuality = _useStatePngLossyQuality[0]
		var setPngLossyQuality = _useStatePngLossyQuality[1]

		var _useStatePngAlphaQuality = useState(80)
		var pngAlphaQuality = _useStatePngAlphaQuality[0]
		var setPngAlphaQuality = _useStatePngAlphaQuality[1]

		var _useStatePngLosslessQualityMode = useState('apply_preprocessing')
		var pngLosslessQualityMode = _useStatePngLosslessQualityMode[0]
		var setPngLosslessQualityMode = _useStatePngLosslessQualityMode[1]

		var _useStatePngNearLossless = useState(60)
		var pngNearLossless = _useStatePngNearLossless[0]
		var setPngNearLossless = _useStatePngNearLossless[1]

		var _useStateMetadataOption = useState('no_metadata_in_webp')
		var metadataOption = _useStateMetadataOption[0]
		var setMetadataOption = _useStateMetadataOption[1]

		var _useStateSavingSettings = useState(false)
		var savingSettings = _useStateSavingSettings[0]
		var setSavingSettings = _useStateSavingSettings[1]

		useEffect(function () {
			if (typeof window === 'undefined' || !window.localStorage) {
				return
			}
			try {
				var storedJobId = window.localStorage.getItem('hmBgJobId')
				if (storedJobId && !bgJobId) {
					setBgJobId(storedJobId)
				}
				var storedSettings = window.localStorage.getItem('hoatzinMediaConverterSettings')
				if (storedSettings) {
					var settings = JSON.parse(storedSettings)
					if (settings.converterScope) setConverterScope(settings.converterScope)
					if (settings.imageTypes) setImageTypes(settings.imageTypes)
					if (settings.destinationFolder) setDestinationFolder(settings.destinationFolder)
					if (settings.fileExtension) setFileExtension(settings.fileExtension)
					if (settings.destinationStructure) setDestinationStructure(settings.destinationStructure)
					if (settings.cacheControl) setCacheControl(settings.cacheControl)
					if (typeof settings.preventLarger === 'boolean') setPreventLarger(settings.preventLarger)
					if (settings.jpegEncoding) setJpegEncoding(settings.jpegEncoding)
					if (settings.jpegLossyQualityMode) setJpegLossyQualityMode(settings.jpegLossyQualityMode)
					if (typeof settings.jpegLossyLimit === 'number') setJpegLossyLimit(settings.jpegLossyLimit)
					if (typeof settings.jpegFallback === 'number') setJpegFallback(settings.jpegFallback)
					if (settings.jpegLosslessQualityMode) setJpegLosslessQualityMode(settings.jpegLosslessQualityMode)
					if (typeof settings.jpegNearLossless === 'number') setJpegNearLossless(settings.jpegNearLossless)
					if (settings.pngEncoding) setPngEncoding(settings.pngEncoding)
					if (typeof settings.pngLossyQuality === 'number') setPngLossyQuality(settings.pngLossyQuality)
					if (typeof settings.pngAlphaQuality === 'number') setPngAlphaQuality(settings.pngAlphaQuality)
					if (settings.pngLosslessQualityMode) setPngLosslessQualityMode(settings.pngLosslessQualityMode)
					if (typeof settings.pngNearLossless === 'number') setPngNearLossless(settings.pngNearLossless)
					if (settings.metadataOption) setMetadataOption(settings.metadataOption)
				}
			} catch (_e) {}
		}, [])

		useEffect(function () {
			if (typeof window === 'undefined' || !window.localStorage) {
				return
			}
			try {
				if (bgJobId) {
					window.localStorage.setItem('hmBgJobId', String(bgJobId))
				} else {
					window.localStorage.removeItem('hmBgJobId')
				}
			} catch (_e) {}
		}, [bgJobId])

		useEffect(function () {
			if (!bgJob || !bgJob.status) {
				return
			}
			var status = String(bgJob.status)
			if (status !== 'queued' && status !== 'running' && status !== 'paused') {
				try {
					if (typeof window !== 'undefined' && window.localStorage) {
						window.localStorage.removeItem('hmBgJobId')
					}
				} catch (_e) {}
			}
		}, [bgJob])

		var _useStateDeleteConfirmOpen = useState(false)
		var deleteConfirmOpen = _useStateDeleteConfirmOpen[0]
		var setDeleteConfirmOpen = _useStateDeleteConfirmOpen[1]
		var _useStateDeleteId = useState(0)
		var deleteId = _useStateDeleteId[0]
		var setDeleteId = _useStateDeleteId[1]

		function fetchBackgroundStatus(jobId) {
			if (!jobId) {
				return Promise.resolve(null)
			}
			return apiFetch({
				path:
					'hoatzinmedia/v1/image-formats/background/status?job_id=' +
					encodeURIComponent(String(jobId)),
				method: 'GET',
				headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
			})
		}

		useEffect(
			function () {
				if (!bgJobId) {
					return
				}
				var disposed = false
				var timer = null

				function tick() {
					fetchBackgroundStatus(bgJobId)
						.then(function (data) {
							if (disposed) {
								return
							}
							setBgJob(data || null)
							var status = data && data.status ? String(data.status) : ''
							var shouldPoll =
								status === 'queued' || status === 'running' || status === 'paused'
							if (shouldPoll) {
								timer = setTimeout(tick, 2000)
							}
						})
						.catch(function () {
							if (!disposed) {
								setBgJob(null)
							}
						})
				}

				tick()

				return function () {
					disposed = true
					if (timer) {
						clearTimeout(timer)
					}
				}
			},
			[bgJobId]
		)

		useEffect(
			function () {
				if (bgJobId) {
					setQueueHidden(false)
				}
			},
			[bgJobId]
		)

		function fetchItems() {
			setLoading(true)

			var query =
				'hoatzinmedia/v1/image-formats/library?page=' +
				page +
				'&per_page=' +
				perPage

			apiFetch({
				path: query,
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			})
				.then(function (response) {
					setItems(response && response.items ? response.items : [])
					setTotals({
						total: response && response.total ? response.total : 0,
						totalPages:
							response && response.total_pages ? response.total_pages : 0,
					})
					setLoading(false)
				})
				.catch(function () {
					setItems([])
					setTotals({ total: 0, totalPages: 0 })
					setLoading(false)
				})
		}

		useEffect(
			function () {
				fetchItems()
			},
			[page, perPage]
		)

		function toggleSelect(id) {
			var next = selected.slice()
			var idx = next.indexOf(id)
			if (idx === -1) {
				next.push(id)
			} else {
				next.splice(idx, 1)
			}
			setSelected(next)
		}

		function toggleSelectAll() {
			var allSelectedNow =
				items.length > 0 &&
				items.every(function (it) {
					return selected.indexOf(it.id) !== -1
				})
			if (allSelectedNow) {
				setSelected([])
			} else {
				setSelected(
					items.map(function (it) {
						return it.id
					})
				)
			}
		}

		var wrapperRef = useRef(null)
		var bulkApplyBtnRef = useRef(null)
		var _useStateBulkAnchor = useState(null)
		var bulkAnchor = _useStateBulkAnchor[0]
		var setBulkAnchor = _useStateBulkAnchor[1]

		function handleBulkConvert() {
			if (bgActive) {
				setMessage(i18n.__('A conversion queue is already running.', 'hoatzinmedia'))
				return
			}
			if (bulkAction === 'convert_selected' && !selected.length) {
				setMessage(i18n.__('Select at least one image to convert.', 'hoatzinmedia'))
				return
			}
			if (bulkFormat !== 'webp' && bulkFormat !== 'avif') {
				setMessage(i18n.__('Choose a target format.', 'hoatzinmedia'))
				return
			}
			try {
				if (bulkApplyBtnRef && bulkApplyBtnRef.current && typeof bulkApplyBtnRef.current.getBoundingClientRect === 'function') {
					var rect = bulkApplyBtnRef.current.getBoundingClientRect()
					var containerRect = null
					var containerWidth = (typeof window !== 'undefined' ? window.innerWidth : 1024)
					if (wrapperRef && wrapperRef.current && typeof wrapperRef.current.getBoundingClientRect === 'function') {
						containerRect = wrapperRef.current.getBoundingClientRect()
						try {
							containerWidth = wrapperRef.current.offsetWidth || containerWidth
						} catch (_e2) {}
					}
					setBulkAnchor({
						rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
						container: containerRect ? { top: containerRect.top, left: containerRect.left } : null,
						containerWidth: containerWidth,
					})
				}
			} catch (_e) {}
			setConvertConfirmOpen(true)
			if (typeof document !== 'undefined' && document.body) {
				try {
					document.body.classList.add('hm-modal-open')
				} catch (_e) {}
			}
		}

		function confirmBulkConvert() {
			setLoading(true)
			var promise = null
			if (bulkAction === 'convert_all') {
				promise = apiFetch({
					path: 'hoatzinmedia/v1/image-formats/library/ids',
					method: 'GET',
					headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
				})
					.then(function (resp) {
						var ids = resp && resp.ids ? resp.ids : []
						if (!ids || !ids.length) {
							throw new Error('no_ids')
						}
						var conversionData = { 
							ids: ids, 
							format: bulkFormat, 
							quality: bulkQuality,
							scope: converterScope,
							imageTypes: imageTypes,
							destinationFolder: destinationFolder,
							fileExtension: fileExtension,
							destinationStructure: destinationStructure,
							cacheControl: cacheControl,
							preventLarger: preventLarger,
							jpegEncoding: jpegEncoding,
							jpegLossyQualityMode: jpegLossyQualityMode,
							jpegLossyLimit: jpegLossyLimit,
							jpegFallback: jpegFallback,
							jpegLosslessQualityMode: jpegLosslessQualityMode,
							jpegNearLossless: jpegNearLossless,
							pngEncoding: pngEncoding,
							pngLossyQuality: pngLossyQuality,
							pngAlphaQuality: pngAlphaQuality,
							pngLosslessQualityMode: pngLosslessQualityMode,
							pngNearLossless: pngNearLossless,
							metadataOption: metadataOption
						};
						console.log('Converting all images with settings:', conversionData);
						return apiFetch({
							path: 'hoatzinmedia/v1/image-formats/background',
							method: 'POST',
							headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
							data: conversionData,
						})
					})
					.then(function (bgResp) {
						var jid = bgResp && bgResp.job_id
						if (jid) {
							setBgJobId(String(jid))
							setQueueHidden(false)
							return fetchBackgroundStatus(String(jid)).then(function (data) {
								setBgJob(data || null)
								return { started: true }
							})
						}
						return { started: true }
					})
					.then(function (result) {
						if (!result || !result.started) {
							return
						}
						setSelected([])
						fetchItems()
						setMessage(i18n.__('Bulk conversion queued.', 'hoatzinmedia'))
					})
			} else {
				promise = apiFetch({
					path: 'hoatzinmedia/v1/image-formats/convert',
					method: 'POST',
					headers: {
						'X-WP-Nonce': HoatzinMediaSettings.nonce,
					},
					data: {
						ids: selected,
						format: bulkFormat,
						workflow: 'bulk',
						quality: bulkQuality,
						scope: converterScope,
						imageTypes: imageTypes,
						destinationFolder: destinationFolder,
						fileExtension: fileExtension,
						destinationStructure: destinationStructure,
						cacheControl: cacheControl,
						preventLarger: preventLarger,
						jpegEncoding: jpegEncoding,
						jpegLossyQualityMode: jpegLossyQualityMode,
						jpegLossyLimit: jpegLossyLimit,
						jpegFallback: jpegFallback,
						jpegLosslessQualityMode: jpegLosslessQualityMode,
						jpegNearLossless: jpegNearLossless,
						pngEncoding: pngEncoding,
						pngLossyQuality: pngLossyQuality,
						pngAlphaQuality: pngAlphaQuality,
						pngLosslessQualityMode: pngLosslessQualityMode,
						pngNearLossless: pngNearLossless,
						metadataOption: metadataOption
					},
				}).then(function (response) {
					fetchItems()
					var failed = response.results.filter(function (r) {
						return r.status !== 'success'
					})
					if (failed.length > 0) {
						setMessage(
							i18n.sprintf(
								i18n.__('Some conversions failed: %s', 'hoatzinmedia'),
								failed[0].message
							)
						)
					}
					setSelected([])
				})
			}

			Promise.resolve(promise)
				.catch(function (err) {
					if (err && err.message === 'no_ids') {
						setMessage(i18n.__('No images found to convert.', 'hoatzinmedia'))
						return
					}
					console.error(err)
					setMessage(i18n.__('An error occurred.', 'hoatzinmedia'))
				})
				.finally(function () {
					setLoading(false)
					setConvertConfirmOpen(false)
					if (typeof document !== 'undefined' && document.body) {
						try {
							document.body.classList.remove('hm-modal-open')
						} catch (_e) {}
					}
				})
		}
		function handleConvert(id, format) {
			setLoading(true)
			var conversionData = {
				ids: [id],
				format: format,
				workflow: 'single',
				scope: converterScope,
				imageTypes: imageTypes,
				destinationFolder: destinationFolder,
				fileExtension: fileExtension,
				destinationStructure: destinationStructure,
				cacheControl: cacheControl,
				preventLarger: preventLarger,
				jpegEncoding: jpegEncoding,
				jpegLossyQualityMode: jpegLossyQualityMode,
				jpegLossyLimit: jpegLossyLimit,
				jpegFallback: jpegFallback,
				jpegLosslessQualityMode: jpegLosslessQualityMode,
				jpegNearLossless: jpegNearLossless,
				pngEncoding: pngEncoding,
				pngLossyQuality: pngLossyQuality,
				pngAlphaQuality: pngAlphaQuality,
				pngLosslessQualityMode: pngLosslessQualityMode,
				pngNearLossless: pngNearLossless,
				metadataOption: metadataOption,
				quality: bulkQuality
			};
			console.log('Converting image (ID: ' + id + ', Format: ' + format + ') with settings:', conversionData);
			apiFetch({
				path: 'hoatzinmedia/v1/image-formats/convert',
				method: 'POST',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
				data: conversionData,
			})
				.then(function (response) {
					fetchItems()
					var failed = response.results.filter(function (r) {
						return r.status !== 'success'
					})
					if (failed.length > 0) {
						setMessage(
							i18n.sprintf(
								i18n.__('Failed to convert: %s', 'hoatzinmedia'),
								failed[0].message
							)
						)
					}
				})
				.catch(function (err) {
					console.error(err)
					setMessage(i18n.__('An error occurred.', 'hoatzinmedia'))
				})
				.finally(function () {
					setLoading(false)
				})
		}

		function onPerPageChange(event) {
			var value = parseInt(event.target.value, 10) || 10
			if (value <= 0) {
				value = 10
			}
			if (value > 50) {
				value = 50
			}
			setPerPage(value)
			setPage(1)
		}

		var hasPrev = page > 1
		var hasNext = totals.totalPages > 0 && page < totals.totalPages
		var showEmpty = !loading && (!items || !items.length)
		var allSelected =
			items.length > 0 &&
			items.every(function (it) {
				return selected.indexOf(it.id) !== -1
			})

		function getMimeTagClass(mime) {
			var m = String(mime || '').toLowerCase()
			if (m.indexOf('jpeg') !== -1 || m.indexOf('jpg') !== -1) {
				return 'hm-tag hm-tag-jpeg'
			}
			if (m.indexOf('png') !== -1) {
				return 'hm-tag hm-tag-png'
			}
			if (m.indexOf('webp') !== -1) {
				return 'hm-tag hm-tag-webp'
			}
			if (m.indexOf('avif') !== -1) {
				return 'hm-tag hm-tag-avif'
			}
			return 'hm-tag'
		}

		function formatDuration(seconds) {
			var s = parseInt(seconds, 10)
			if (!s || s <= 0) {
				return '-'
			}
			var hrs = Math.floor(s / 3600)
			var mins = Math.floor((s % 3600) / 60)
			var secs = s % 60
			if (hrs > 0) {
				return String(hrs) + 'h ' + String(mins) + 'm'
			}
			if (mins > 0) {
				return String(mins) + 'm ' + String(secs) + 's'
			}
			return String(secs) + 's'
		}

		var bgStatus = bgJob && bgJob.status ? String(bgJob.status) : ''
		var bgTotal = bgJob && typeof bgJob.total === 'number' ? bgJob.total : 0
		var bgProcessed = bgJob && typeof bgJob.processed === 'number' ? bgJob.processed : 0
		var bgPercent = bgTotal > 0 ? Math.min(100, Math.round((bgProcessed / bgTotal) * 100)) : 0
		var bgPreview = bgJob && bgJob.preview ? bgJob.preview : []
		var bgPaused = bgStatus === 'paused'
		var bgBusy = bgStatus === 'queued' || bgStatus === 'running'
		var bgActive = bgStatus === 'queued' || bgStatus === 'running' || bgStatus === 'paused'
		var bgEta = '-'
		try {
			if (bgJob && bgJob.started_at && bgBusy && bgProcessed > 0 && bgTotal > bgProcessed) {
				var elapsed = Math.max(1, Math.floor(Date.now() / 1000) - parseInt(bgJob.started_at, 10))
				var rate = bgProcessed / elapsed
				if (rate > 0) {
					bgEta = formatDuration((bgTotal - bgProcessed) / rate)
				}
			}
		} catch (_e) {}

		function pauseOrResumeQueue() {
			if (!bgJobId || loading) {
				return
			}
			setLoading(true)
			apiFetch({
				path: bgPaused
					? 'hoatzinmedia/v1/image-formats/background/resume'
					: 'hoatzinmedia/v1/image-formats/background/pause',
				method: 'POST',
				headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
				data: { job_id: bgJobId },
			})
				.then(function () {
					return fetchBackgroundStatus(bgJobId)
				})
				.then(function (data) {
					setBgJob(data || null)
				})
				.catch(function () {
					setMessage(i18n.__('Failed to update queue state.', 'hoatzinmedia'))
				})
				.finally(function () {
					setLoading(false)
				})
		}

		function runQueueInBackground() {
			if (!bgJobId || loading || !bgActive) {
				return
			}

			if (!bgPaused) {
				setQueueHidden(true)
				return
			}

			setLoading(true)
			apiFetch({
				path: 'hoatzinmedia/v1/image-formats/background/resume',
				method: 'POST',
				headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
				data: { job_id: bgJobId },
			})
				.then(function () {
					setQueueHidden(true)
				})
				.catch(function () {
					setMessage(i18n.__('Failed to run queue in background.', 'hoatzinmedia'))
				})
				.finally(function () {
					setLoading(false)
				})
		}

		function cancelQueue() {
			if (!bgJobId || loading) {
				return
			}
			setLoading(true)
			apiFetch({
				path: 'hoatzinmedia/v1/image-formats/background/cancel',
				method: 'POST',
				headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
				data: { job_id: bgJobId },
			})
				.then(function () {
					return fetchBackgroundStatus(bgJobId)
				})
				.then(function (data) {
					setBgJob(data || null)
				})
				.catch(function () {
					setMessage(i18n.__('Failed to cancel queue.', 'hoatzinmedia'))
				})
				.finally(function () {
					setLoading(false)
				})
		}

		function openDeleteConfirm(id) {
			setDeleteId(parseInt(id, 10) || 0)
			setDeleteConfirmOpen(true)
			if (typeof document !== 'undefined' && document.body) {
				try {
					document.body.classList.add('hm-modal-open')
				} catch (_e) {}
			}
		}

		function confirmDelete() {
			if (!deleteId) {
				setDeleteConfirmOpen(false)
				return
			}
			setLoading(true)
			apiFetch({
				path: 'hoatzinmedia/v1/image-formats/delete',
				method: 'POST',
				headers: { 'X-WP-Nonce': HoatzinMediaSettings.nonce },
				data: { ids: [deleteId] },
			})
				.then(function () {
					setMessage(i18n.__('Deleted.', 'hoatzinmedia'))
					setSelected(function (cur) {
						return cur.filter(function (x) {
							return x !== deleteId
						})
					})
					fetchItems()
				})
				.catch(function () {
					setMessage(i18n.__('Failed to delete item.', 'hoatzinmedia'))
				})
				.finally(function () {
					setLoading(false)
					setDeleteConfirmOpen(false)
					setDeleteId(0)
					if (typeof document !== 'undefined' && document.body) {
						try {
							document.body.classList.remove('hm-modal-open')
						} catch (_e) {}
					}
				})
		}

		return element.createElement(
			'div',
			{ className: 'hm-unused-table-wrapper', ref: wrapperRef },
			bgJobId &&
				bgJob &&
				bgActive &&
				!queueHidden &&
				element.createElement(
					'div',
					{ className: 'hm-convert-queue' },
					element.createElement(
						'div',
						{ className: 'hm-convert-queue-header' },
						element.createElement(
							'div',
							null,
							element.createElement(
								'div',
								{ className: 'hm-convert-queue-title' },
								i18n.__('Bulk Conversion Queue', 'hoatzinmedia')
							),
							element.createElement(
								'div',
								{ className: 'hm-convert-queue-subtitle' },
								bgStatus === 'done'
									? i18n.__('Queue finished.', 'hoatzinmedia')
									: bgStatus === 'cancelled'
									? i18n.__('Queue cancelled.', 'hoatzinmedia')
									: i18n.sprintf(
											i18n.__('Converting %d of %d images…', 'hoatzinmedia'),
											bgProcessed,
											bgTotal
									  )
							)
						),
					),
					element.createElement(
						'div',
						{ className: 'hm-convert-queue-bar' },
						element.createElement(
							'div',
							{ className: 'hm-convert-queue-track' },
							element.createElement('div', {
								className: 'hm-convert-queue-fill',
								style: { width: String(bgPercent) + '%' },
							})
						),
						element.createElement(
							'div',
							{ className: 'hm-convert-queue-thumbs' },
							(bgPreview || []).slice(0, 6).map(function (p, idx) {
								var thumbWidth = Math.min(100, Math.max(14, bgPercent + idx * 8 - 12))
								return element.createElement(
									'div',
									{ className: 'hm-convert-queue-thumb-card', key: String(p && p.id ? p.id : 'thumb-' + idx) },
										element.createElement('img', {
											src: (p && (p.thumbnail_url || p.file_url)) || '',
											className: 'hm-convert-queue-thumb',
											alt: '',
										}),
										element.createElement(
											'div',
											{ className: 'hm-convert-thumb-progress' },
												element.createElement('div', {
												className: 'hm-convert-thumb-fill',
												style: { width: String(thumbWidth) + '%' },
											})
											)
									)
							})
						)
					),
					element.createElement(
						'div',
						{ className: 'hm-convert-queue-bottom' },
						element.createElement(
							'div',
							{ className: 'hm-convert-queue-actions' },
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-outline hm-button-mini',
									onClick: pauseOrResumeQueue,
									disabled: loading || !bgActive,
								},
								bgPaused
									? i18n.__('Resume Queue', 'hoatzinmedia')
									: i18n.__('Pause Queue', 'hoatzinmedia')
							),
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-outline hm-button-mini',
									onClick: runQueueInBackground,
									disabled: loading || !bgActive,
								},
								i18n.__('Background Run', 'hoatzinmedia')
							),
							element.createElement(
								'button',
								{
									type: 'button',
									className: 'hm-button hm-button-danger hm-button-mini',
									onClick: cancelQueue,
									disabled: loading || !bgActive,
								},
								i18n.__('Cancel All', 'hoatzinmedia')
							)
						),
						element.createElement(
							'div',
							{ className: 'hm-inline-label' },
							i18n.__('Estimated time remaining:', 'hoatzinmedia'),
							' ',
							element.createElement('strong', null, bgEta)
						)
					)
				),
			element.createElement(
				'div',
				{ className: 'hm-unused-header-row', style: { alignItems: 'flex-start', flexDirection: 'column', gap: '16px', width: '100%' } },
            bgActive &&
                queueHidden &&
                element.createElement(
                    'div',
                    { className: 'hm-background-indicator' },
                    element.createElement(
                        'div',
                        { className: 'hm-background-indicator-badge' },
                        bgPaused
                            ? i18n.__('Paused', 'hoatzinmedia')
                            : i18n.__('Running', 'hoatzinmedia')
                    ),
                    element.createElement(
                        'div',
                        null,
                        bgPaused
                            ? i18n.__('Bulk conversion is paused in background.', 'hoatzinmedia')
                            : i18n.__('Bulk conversion is running in the background.', 'hoatzinmedia'),
                        ' ',
                        element.createElement(
                            'strong',
                            null,
                            i18n.sprintf(
                                i18n.__('%d / %d images processed', 'hoatzinmedia'),
                                bgProcessed,
                                bgTotal
                            )
                        )
                    )
                ),
				!hideBackupNotice &&
					element.createElement(
						'div',
						{ className: 'hm-converter-backup-warning' },
						element.createElement(
							'div',
							{ className: 'hm-converter-backup-warning-text' },
							element.createElement(
								'strong',
								null,
								i18n.__('Important:', 'hoatzinmedia')
							),
							' ',
							i18n.__(
								'Take a full backup before running the conversion process. This can overwrite original image files.',
								'hoatzinmedia'
							)
						),
						element.createElement(
							'button',
							{
								type: 'button',
								className: 'hm-converter-backup-warning-close',
								onClick: dismissBackupNotice,
								title: i18n.__('Hide for 1 day', 'hoatzinmedia'),
							},
							element.createElement(
								'svg',
								{ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
								element.createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
								element.createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
							)
						)
					),
				element.createElement(
					'div',
					{ style: { display: 'flex', width: '100%', maxWidth: '100%', boxSizing: 'border-box', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' } },
					element.createElement(
						'div',
						{ className: 'hm-card-title' },
						i18n.__('Recent library images', 'hoatzinmedia')
					),
					element.createElement(
						'div',
						{ style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
						element.createElement(
							'label',
							null,
							i18n.__('Items per page', 'hoatzinmedia')
						),
						element.createElement(
							'select',
							{
								className: 'hm-select',
								value: perPage,
								onChange: onPerPageChange,
							},
							element.createElement('option', { value: 10 }, '10'),
							element.createElement('option', { value: 20 }, '20'),
							element.createElement('option', { value: 50 }, '50')
						)
					)
				),
				element.createElement(
					'div',
					{ style: { display: 'flex', width: '100%', maxWidth: '100%', boxSizing: 'border-box', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' } },
					element.createElement(
						'div',
						{ style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
						element.createElement(
							'label',
							null,
							i18n.__('Format', 'hoatzinmedia')
						),
						element.createElement(
							'select',
							{
								className: 'hm-select',
								value: bulkFormat,
								onChange: function (e) {
									setBulkFormat(e.target.value)
								},
							},
							element.createElement('option', { value: 'webp' }, 'WebP'),
							element.createElement('option', { value: 'avif' }, 'AVIF')
						),
						element.createElement(
							'input',
							{
								type: 'range',
								min: 1,
								max: 100,
								value: bulkQuality,
								onChange: function (e) {
									setBulkQuality(parseInt(e.target.value, 10) || 80)
								},
								className: 'hm-input',
								style: { width: '120px' },
							}
						),
						element.createElement(
							'span',
							{ style: { fontSize: '12px', color: '#6b7280' } },
							i18n.__('Quality', 'hoatzinmedia'),
							' ',
							String(bulkQuality)
						)
					),
					element.createElement(
						'div',
						{ style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
						element.createElement(
							'label',
							null,
							i18n.__('Bulk Action', 'hoatzinmedia')
						),
						element.createElement(
							'select',
							{
								className: 'hm-select',
								value: bulkAction,
								onChange: function (e) {
									setBulkAction(e.target.value)
								},
							},
							element.createElement(
								'option',
								{ value: 'convert_selected' },
								i18n.__('Convert Selected', 'hoatzinmedia')
							),
							element.createElement(
								'option',
								{ value: 'convert_all' },
								i18n.__('Convert All', 'hoatzinmedia')
							)
						),
						element.createElement(
							'button',
							{
								type: 'button',
								className: 'hm-converter-settings-icon-btn-custom',
								onClick: function () {
									setShowSettings(true)
									if (typeof document !== 'undefined' && document.body) {
										try {
											document.body.classList.add('hm-modal-open')
										} catch (_e) {}
									}
								},
								title: 'Configure conversion settings',
								style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', padding: '0', borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid rgba(148, 163, 184, 0.4)', color: '#2563eb', cursor: 'pointer', marginLeft: '4px' },
							},
							element.createElement(
								'svg',
								{ width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
								element.createElement('circle', { cx: '12', cy: '12', r: '3.5' }),
								element.createElement('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15.4a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.23.52.23 1.11 0 1.63a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' })
							)
						),
						element.createElement(
							'button',
							{
								type: 'button',
								className: 'hm-button hm-button-primary',
								onClick: handleBulkConvert,
								ref: bulkApplyBtnRef,
								disabled:
									loading || bgActive || (bulkAction === 'convert_selected' && !selected.length),
							},
							i18n.__('Apply', 'hoatzinmedia')
						)
					)
				)
			),
			message &&
				element.createElement(
					'div',
					{ className: 'hm-inline-note' },
					message
				),
			element.createElement(ConfirmModal, {
				open: convertConfirmOpen,
				title: i18n.__('Convert images', 'hoatzinmedia'),
				message:
					bulkAction === 'convert_all'
						? i18n.__(
								'Convert all library images now? Original files will be updated.',
								'hoatzinmedia'
						  )
						: i18n.__(
								'Convert selected images now? Original files will be updated.',
								'hoatzinmedia'
						  ),
				anchor: bulkAnchor,
				busy: loading,
				confirmLabel:
					bulkAction === 'convert_all'
						? i18n.__('Convert All', 'hoatzinmedia')
						: i18n.__('Convert', 'hoatzinmedia'),
				confirmBusyLabel: i18n.__('Converting…', 'hoatzinmedia'),
				onCancel: function () {
					if (!loading) {
						setConvertConfirmOpen(false)
						if (typeof document !== 'undefined' && document.body) {
							try {
								document.body.classList.remove('hm-modal-open')
							} catch (_e) {}
						}
					}
				},
				onConfirm: confirmBulkConvert,
			}),
			element.createElement(ConfirmModal, {
				open: deleteConfirmOpen,
				title: i18n.__('Delete file permanently', 'hoatzinmedia'),
				message: i18n.__(
					'Are you sure? This will permanently delete the file and cannot be undone.',
					'hoatzinmedia'
				),
				anchor: null,
				busy: loading,
				confirmLabel: i18n.__('Delete', 'hoatzinmedia'),
				confirmBusyLabel: i18n.__('Deleting…', 'hoatzinmedia'),
				onCancel: function () {
					if (!loading) {
						setDeleteConfirmOpen(false)
						setDeleteId(0)
						if (typeof document !== 'undefined' && document.body) {
							try {
								document.body.classList.remove('hm-modal-open')
							} catch (_e) {}
						}
					}
				},
				onConfirm: confirmDelete,
			}),
			loading &&
				element.createElement(
					'div',
					{
						className: 'hm-skeleton hm-skeleton-block',
						style: { height: '160px', marginTop: '8px' },
					}
				),
			!loading &&
				element.createElement(
					'table',
					{
						className: 'hm-latest-table hm-unused-table',
						style: { marginTop: '8px' },
					},
					element.createElement(
						'thead',
						null,
						element.createElement(
							'tr',
							null,
							element.createElement(
								'th',
								{ style: { width: '32px' } },
								element.createElement('input', {
									type: 'checkbox',
									checked: allSelected,
									onChange: toggleSelectAll,
								})
							),
							element.createElement('th', null, i18n.__('File', 'hoatzinmedia')),
							element.createElement(
								'th',
								{ style: { width: '100px' } },
								i18n.__('Size', 'hoatzinmedia')
							),
							element.createElement(
								'th',
								{ style: { width: '100px' } },
								i18n.__('Type', 'hoatzinmedia')
							),
							element.createElement(
								'th',
								{ style: { textAlign: 'right', width: '360px' } },
								i18n.__('Actions', 'hoatzinmedia')
							)
						)
					),
					element.createElement(
						'tbody',
						null,
						showEmpty &&
							element.createElement(
								'tr',
								null,
								element.createElement(
									'td',
									{ colSpan: 5 },
									element.createElement(
										'div',
										{ className: 'hm-empty-state' },
										i18n.__(
											'No JPEG or PNG images found in the current selection.',
											'hoatzinmedia'
										)
									)
								)
							),
						!showEmpty &&
							items.map(function (item) {
								return element.createElement(
									'tr',
									{ key: item.id, className: 'hm-row-hover' },
									element.createElement(
										'td',
										null,
										element.createElement('input', {
											type: 'checkbox',
											checked: selected.indexOf(item.id) !== -1,
											onChange: function () {
												toggleSelect(item.id)
											},
										})
									),
									element.createElement(
										'td',
										{ className: 'hm-file-name-cell' },
										element.createElement(
											'div',
											{ style: { display: 'flex', alignItems: 'center', gap: '12px' } },
											(item.thumbnail_url || item.file_url)
												? element.createElement(
														'div',
														{ className: 'hm-thumbnail-popover' },
														element.createElement('img', {
															src: item.thumbnail_url || item.file_url,
															className: 'hm-thumbnail',
															alt: '',
															onError: function (e) {
																if (item.file_url && e.target.src !== item.file_url) {
																	e.target.src = item.file_url
																}
															},
														}),
														item.file_url &&
															element.createElement(
																'div',
																{ className: 'hm-thumbnail-popover-preview' },
																element.createElement('img', {
																	src: item.file_url,
																	alt: item.file_name || '',
																})
															)
												  )
												: element.createElement(
														'div',
														{ className: 'hm-thumbnail hm-thumbnail-placeholder' },
														(item.mime_type || 'IMG').split('/')[1].toUpperCase().slice(0, 3)
												  ),
											element.createElement(
												'div',
												null,
												element.createElement(
													'div',
													{ className: 'hm-file-name-primary' },
													item.file_name || ''
												),
												element.createElement(
													'div',
													{ className: 'hm-file-name-secondary' },
													item.date || ''
												)
											)
										)
									),
									element.createElement(
										'td',
										null,
										element.createElement(
											'span',
											{ style: { fontFamily: 'monospace', fontSize: '11px', color: '#4b5563' } },
											item.size_readable
										)
									),
									element.createElement(
										'td',
										null,
										element.createElement(
											'span',
											{ className: getMimeTagClass(item.mime_type) },
											(item.mime_type || '').replace('image/', '').toUpperCase()
										)
									),
									element.createElement(
										'td',
										{ style: { textAlign: 'right' } },
										element.createElement(
											'div',
											{ className: 'hm-row-actions', style: { justifyContent: 'flex-end' } },
											element.createElement(
												'button',
												{
													type: 'button',
													className: 'hm-button hm-button-primary hm-button-mini',
													onClick: function () {
														handleConvert(item.id, 'webp')
													},
													disabled: loading,
												},
												i18n.__('Convert to WebP', 'hoatzinmedia')
											),
											element.createElement(
												'button',
												{
													type: 'button',
													className: 'hm-button hm-button-avif hm-button-mini',
													onClick: function () {
														handleConvert(item.id, 'avif')
													},
													disabled: loading,
												},
												i18n.__('Convert to AVIF', 'hoatzinmedia')
											),
											element.createElement(
												'button',
												{
													type: 'button',
													className: 'hm-button hm-button-danger hm-button-mini',
													onClick: function () {
														openDeleteConfirm(item.id)
													},
													disabled: loading,
												},
												i18n.__('Delete', 'hoatzinmedia')
											)
										)
									)
								)
							})
					)
				),
			element.createElement(
				'div',
				{ className: 'hm-footer-row' },
				element.createElement(
					'span',
					null,
					i18n.__('Page', 'hoatzinmedia'),
					' ',
					page,
					totals.totalPages > 0 ? ' / ' + totals.totalPages : '',
					totals.total > 0
						? ' · ' + totals.total + ' ' + i18n.__('items', 'hoatzinmedia')
						: ''
				),
				element.createElement(
					'div',
					null,
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: function () {
								if (hasPrev) {
									setPage(page - 1)
								}
							},
							disabled: loading || !hasPrev,
						},
						i18n.__('Previous', 'hoatzinmedia')
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-button hm-button-outline',
							onClick: function () {
								if (hasNext) {
									setPage(page + 1)
								}
							},
							disabled: loading || !hasNext,
							style: { marginLeft: '6px' },
						},
						i18n.__('Next', 'hoatzinmedia')
					)
				)
			),
			showSettings &&
				element.createElement(
					'div',
					{
						className: 'hm-settings-panel-overlay',
						onClick: function () {
							setShowSettings(false)
							if (typeof document !== 'undefined' && document.body) {
								try {
									document.body.classList.remove('hm-modal-open')
								} catch (_e) {}
							}
						},
					},
					element.createElement(
						'div',
						{ className: 'hm-settings-side-panel', onClick: function (e) { e.stopPropagation() } },
						element.createElement(
							'div',
							{ className: 'hm-settings-panel-header' },
							element.createElement(
								'div',
								{ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
								element.createElement(
									'h2',
									{ className: 'hm-settings-panel-title' },
									'Conversion Settings'
								),
								element.createElement(
									'button',
									{
										type: 'button',
										onClick: function () {
											setShowSettings(false)
											if (typeof document !== 'undefined' && document.body) {
												try {
													document.body.classList.remove('hm-modal-open')
												} catch (_e) {}
											}
										},
										style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid rgba(148, 163, 184, 0.3)', color: '#6b7280', cursor: 'pointer', padding: '0' },
									},
									element.createElement(
										'svg',
										{ width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
										element.createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
										element.createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
									)
								)
							)
						),
						element.createElement(
							'div',
							{ className: 'hm-settings-panel-body' },
							element.createElement(
								'div',
								{ style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
								element.createElement(
									'div',
									{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
									element.createElement(
										'label',
										{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
										'Scope'
									),
									element.createElement(
										'select',
										{ 
											value: converterScope, 
											onChange: function(e) { setConverterScope(e.target.value) },
											style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
										},
										element.createElement('option', { value: 'uploads' }, 'Uploads only'),
										element.createElement('option', { value: 'uploads_themes' }, 'Uploads and themes'),
										element.createElement('option', { value: 'all' }, 'All')
									)
								),
								element.createElement(
									'div',
									{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
									element.createElement(
										'label',
										{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
										'Image types to work on'
									),
									element.createElement(
										'select',
										{ 
											value: imageTypes, 
											onChange: function(e) { setImageTypes(e.target.value) },
											style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
										},
										element.createElement('option', { value: 'both' }, 'Both jpegs and pngs'),
										element.createElement('option', { value: 'jpg' }, 'Only jpegs'),
										element.createElement('option', { value: 'png' }, 'Only pngs')
									)
								),
								element.createElement(
									'div',
									{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
									element.createElement(
										'label',
										{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
										'Destination folder'
									),
									element.createElement(
										'select',
										{ 
											value: destinationFolder, 
											onChange: function(e) { setDestinationFolder(e.target.value) },
											style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
										},
										element.createElement('option', { value: 'same' }, 'Same folder'),
										element.createElement('option', { value: 'separate' }, 'In separate folder')
									)
								),
								element.createElement(
									'div',
									{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
									element.createElement(
										'label',
										{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
										'File extension'
									),
									element.createElement(
										'select',
										{ 
											value: fileExtension, 
											onChange: function(e) { setFileExtension(e.target.value) },
											style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
										},
										element.createElement('option', { value: 'append' }, "Append '.webp'"),
										element.createElement('option', { value: 'replace' }, "Replace '.jpg' with '.webp'")
									)
								),
								element.createElement(
									'div',
									{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
									element.createElement(
										'label',
										{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
										'Destination structure'
									),
									element.createElement(
										'select',
										{ 
											value: destinationStructure, 
											onChange: function(e) { setDestinationStructure(e.target.value) },
											style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
										},
										element.createElement('option', { value: 'roots' }, 'Image roots'),
										element.createElement('option', { value: 'date' }, 'By date')
									)
								),
								element.createElement(
									'div',
									{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
									element.createElement(
										'label',
										{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
										'Cache-Control header'
									),
									element.createElement(
										'select',
										{ 
											value: cacheControl, 
											onChange: function(e) { setCacheControl(e.target.value) },
											style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
										},
										element.createElement('option', { value: 'do_not_set' }, 'Do not set'),
										element.createElement('option', { value: 'year' }, '1 year'),
										element.createElement('option', { value: 'month' }, '1 month')
									)
								),
								element.createElement(
									'div',
									{ style: { display: 'flex', alignItems: 'center', gap: '10px' } },
									element.createElement(
										'input',
										{
											type: 'checkbox',
											checked: preventLarger,
											onChange: function(e) { setPreventLarger(e.target.checked) },
											style: { width: '16px', height: '16px', cursor: 'pointer' }
										}
									),
									element.createElement(
										'label',
										{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a', cursor: 'pointer', margin: '0' } },
										'Prevent using webps larger than original'
									)
								),
								element.createElement(
									'div',
									{ style: { borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '8px' } },
									element.createElement(
										'h3',
										{ style: { fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: '0 0 12px 0' } },
										'JPEG Settings'
									),
									element.createElement(
										'div',
										{ style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
										element.createElement(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
											element.createElement(
												'label',
												{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
												'Encoding'
											),
											element.createElement(
												'select',
												{ 
													value: jpegEncoding, 
													onChange: function(e) { setJpegEncoding(e.target.value) },
													style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
												},
												element.createElement('option', { value: 'auto' }, 'Auto'),
												element.createElement('option', { value: 'lossy' }, 'Lossy'),
												element.createElement('option', { value: 'lossless' }, 'Lossless')
											)
										),
										element.createElement(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
											element.createElement(
												'label',
												{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
												'Quality mode'
											),
											element.createElement(
												'select',
												{ 
													value: jpegLossyQualityMode, 
													onChange: function(e) { setJpegLossyQualityMode(e.target.value) },
													style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
												},
												element.createElement('option', { value: 'same_as_jpeg' }, 'Same as JPEG'),
												element.createElement('option', { value: 'fixed' }, 'Fixed')
											)
										),
										element.createElement(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
											element.createElement(
												'label',
												{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
												'Quality limit: ' + String(jpegLossyLimit)
											),
											element.createElement(
												'input',
												{
													type: 'range',
													min: 1,
													max: 100,
													value: jpegLossyLimit,
													onChange: function(e) { setJpegLossyLimit(parseInt(e.target.value, 10) || 80) },
													style: { width: '100%', height: '6px', borderRadius: '3px', background: '#e2e8f0', outline: 'none', cursor: 'pointer' }
												}
											)
										),
										element.createElement(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
											element.createElement(
												'label',
												{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
												'Fallback quality: ' + String(jpegFallback)
											),
											element.createElement(
												'input',
												{
													type: 'range',
													min: 1,
													max: 100,
													value: jpegFallback,
													onChange: function(e) { setJpegFallback(parseInt(e.target.value, 10) || 70) },
													style: { width: '100%', height: '6px', borderRadius: '3px', background: '#e2e8f0', outline: 'none', cursor: 'pointer' }
												}
											)
										),
										element.createElement(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
											element.createElement(
												'label',
												{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
												'Near-lossless: ' + String(jpegNearLossless)
											),
											element.createElement(
												'input',
												{
													type: 'range',
													min: 0,
													max: 100,
													value: jpegNearLossless,
													onChange: function(e) { setJpegNearLossless(parseInt(e.target.value, 10) || 60) },
													style: { width: '100%', height: '6px', borderRadius: '3px', background: '#e2e8f0', outline: 'none', cursor: 'pointer' }
												}
											)
										)
									)
								),
								element.createElement(
									'div',
									{ style: { borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '8px' } },
									element.createElement(
										'h3',
										{ style: { fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: '0 0 12px 0' } },
										'PNG Settings'
									),
									element.createElement(
										'div',
										{ style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
										element.createElement(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
											element.createElement(
												'label',
												{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
												'Encoding'
											),
											element.createElement(
												'select',
												{ 
													value: pngEncoding, 
													onChange: function(e) { setPngEncoding(e.target.value) },
													style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
												},
												element.createElement('option', { value: 'auto' }, 'Auto'),
												element.createElement('option', { value: 'lossy' }, 'Lossy'),
												element.createElement('option', { value: 'lossless' }, 'Lossless')
											)
										),
										element.createElement(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
											element.createElement(
												'label',
												{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
												'Lossy quality: ' + String(pngLossyQuality)
											),
											element.createElement(
												'input',
												{
													type: 'range',
													min: 1,
													max: 100,
													value: pngLossyQuality,
													onChange: function(e) { setPngLossyQuality(parseInt(e.target.value, 10) || 85) },
													style: { width: '100%', height: '6px', borderRadius: '3px', background: '#e2e8f0', outline: 'none', cursor: 'pointer' }
												}
											)
										),
										element.createElement(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
											element.createElement(
												'label',
												{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
												'Alpha quality: ' + String(pngAlphaQuality)
											),
											element.createElement(
												'input',
												{
													type: 'range',
													min: 1,
													max: 100,
													value: pngAlphaQuality,
													onChange: function(e) { setPngAlphaQuality(parseInt(e.target.value, 10) || 80) },
													style: { width: '100%', height: '6px', borderRadius: '3px', background: '#e2e8f0', outline: 'none', cursor: 'pointer' }
												}
											)
										),
										element.createElement(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
											element.createElement(
												'label',
												{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
												'Near-lossless: ' + String(pngNearLossless)
											),
											element.createElement(
												'input',
												{
													type: 'range',
													min: 0,
													max: 100,
													value: pngNearLossless,
													onChange: function(e) { setPngNearLossless(parseInt(e.target.value, 10) || 60) },
													style: { width: '100%', height: '6px', borderRadius: '3px', background: '#e2e8f0', outline: 'none', cursor: 'pointer' }
												}
											)
										)
									)
								),
								element.createElement(
									'div',
									{ style: { borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '8px' } },
									element.createElement(
										'h3',
										{ style: { fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: '0 0 12px 0' } },
										'Metadata'
									),
									element.createElement(
										'div',
										{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
										element.createElement(
											'label',
											{ style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } },
											'Metadata option'
										),
										element.createElement(
											'select',
											{ 
												value: metadataOption, 
												onChange: function(e) { setMetadataOption(e.target.value) },
												style: { borderRadius: '6px', height: '38px', padding: '0 10px', fontFamily: 'inherit', fontSize: '13px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }
											},
											element.createElement('option', { value: 'no_metadata_in_webp' }, 'No metadata in WebP'),
											element.createElement('option', { value: 'keep_all_metadata' }, 'Keep all metadata'),
											element.createElement('option', { value: 'keep_exif' }, 'Keep EXIF only')
										)
									)
								)
							)
						),
						element.createElement(
							'div',
							{ style: { backgroundColor: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginTop: '16px' } },
							element.createElement(
								'h4',
								{ style: { fontSize: '12px', fontWeight: '700', color: '#0c4a6e', margin: '0 0 12px 0', textTransform: 'uppercase' } },
								'Current Settings'
							),
							element.createElement(
								'div',
								{ style: { fontSize: '12px', color: '#0f172a', lineHeight: '1.6', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
								element.createElement('div', null, element.createElement('strong', null, 'Scope: '), converterScope === 'uploads' ? 'Uploads only' : converterScope === 'uploads_themes' ? 'Uploads & Themes' : 'All'),
								element.createElement('div', null, element.createElement('strong', null, 'Image Types: '), imageTypes === 'jpg' ? 'JPEGs only' : imageTypes === 'png' ? 'PNGs only' : 'Both'),
								element.createElement('div', null, element.createElement('strong', null, 'Destination: '), destinationFolder === 'same' ? 'Same folder' : 'Separate folder'),
								element.createElement('div', null, element.createElement('strong', null, 'Extension: '), fileExtension === 'append' ? "Append '.webp'" : "Replace with '.webp'"),
								element.createElement('div', null, element.createElement('strong', null, 'Structure: '), destinationStructure === 'roots' ? 'Image Roots' : 'By Date'),
								element.createElement('div', null, element.createElement('strong', null, 'Cache Control: '), cacheControl === 'do_not_set' ? 'Not Set' : cacheControl === 'year' ? '1 Year' : '1 Month'),
								element.createElement('div', null, element.createElement('strong', null, 'JPEG: '), jpegEncoding),
								element.createElement('div', null, element.createElement('strong', null, 'PNG: '), pngEncoding),
								element.createElement('div', null, element.createElement('strong', null, 'Metadata: '), metadataOption),
								element.createElement('div', null, element.createElement('strong', null, 'Prevent Larger: '), preventLarger ? 'Yes' : 'No')
							)
						),
						element.createElement(
							'div',
							{ className: 'hm-settings-panel-footer' },
							element.createElement(
								'div',
								{ style: { display: 'flex', justifyContent: 'flex-end', gap: '10px' } },
								element.createElement(
									'button',
									{
										type: 'button',
										onClick: function () { setShowSettings(false) },
										style: { borderRadius: '8px', height: '40px', padding: '0 16px', fontWeight: '600', backgroundColor: '#e5e7eb', color: '#0f172a', border: 'none', cursor: 'pointer' }
									},
									'Close'
								),
								element.createElement(
									'button',
									{
										type: 'button',
										disabled: savingSettings,
										onClick: function () { 
											setSavingSettings(true);
											try {
												console.log('Converter Settings being saved:', {
													converterScope: converterScope,
													imageTypes: imageTypes,
													destinationFolder: destinationFolder,
													fileExtension: fileExtension,
													destinationStructure: destinationStructure,
													cacheControl: cacheControl,
													preventLarger: preventLarger,
													jpegEncoding: jpegEncoding,
													pngEncoding: pngEncoding,
													metadataOption: metadataOption
												});
											} catch(e) {}
											setTimeout(function() {
												try {
													var settings = {
														converterScope: converterScope,
														imageTypes: imageTypes,
														destinationFolder: destinationFolder,
														fileExtension: fileExtension,
														destinationStructure: destinationStructure,
														cacheControl: cacheControl,
														preventLarger: preventLarger,
														jpegEncoding: jpegEncoding,
														jpegLossyQualityMode: jpegLossyQualityMode,
														jpegLossyLimit: jpegLossyLimit,
														jpegFallback: jpegFallback,
														jpegLosslessQualityMode: jpegLosslessQualityMode,
														jpegNearLossless: jpegNearLossless,
														pngEncoding: pngEncoding,
														pngLossyQuality: pngLossyQuality,
														pngAlphaQuality: pngAlphaQuality,
														pngLosslessQualityMode: pngLosslessQualityMode,
														pngNearLossless: pngNearLossless,
														metadataOption: metadataOption
													};
													if (typeof window !== 'undefined' && window.localStorage) {
														window.localStorage.setItem('hoatzinMediaConverterSettings', JSON.stringify(settings));
													}
													setMessage(i18n.__('Settings saved successfully.', 'hoatzinmedia'));
													setSavingSettings(false);
													setShowSettings(false);
												} catch (e) {
													setMessage(i18n.__('Failed to save settings.', 'hoatzinmedia'));
													setSavingSettings(false);
												}
											}, 800);
										},
										style: { 
											borderRadius: '8px', 
											height: '40px', 
											padding: '0 16px', 
											fontWeight: '600', 
											background: savingSettings ? '#9ca3af' : 'linear-gradient(135deg, #2563eb, #1d4ed8)', 
											color: '#ffffff', 
											border: 'none', 
											cursor: savingSettings ? 'not-allowed' : 'pointer',
											display: 'flex',
											alignItems: 'center',
											gap: '8px'
										}
									},
									savingSettings ? element.createElement(
										'svg',
										{ 
											width: '16', 
											height: '16', 
											viewBox: '0 0 24 24', 
											fill: 'none', 
											stroke: 'currentColor', 
											strokeWidth: '2',
											style: { animation: 'spin 1s linear infinite' }
										},
										element.createElement('circle', { cx: '12', cy: '12', r: '10', stroke: 'currentColor', strokeOpacity: '0.25' }),
										element.createElement('path', { fill: 'currentColor', d: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z' })
									) : null,
									savingSettings ? 'Saving...' : 'Save Settings'
								)
							)
						)
					)
				)
		)
	}

	function RecentUnoptimizedMedia(props) {
		var items = props.items || []

		if (items.length === 0) {
			return element.createElement(
				'div',
				{ style: { padding: '32px', textAlign: 'center', color: '#6b7280' } },
				element.createElement(
					'div',
					{ style: { marginBottom: '8px', fontSize: '14px', fontWeight: '500' } },
					i18n.__('All caught up!', 'hoatzinmedia')
				),
				i18n.__('No unoptimized recent media found.', 'hoatzinmedia')
			)
		}

		return element.createElement(
			'div',
			{ className: 'hm-unused-table-wrapper' },
			element.createElement(
				'table',
				{ className: 'hm-latest-table' },
				element.createElement(
					'thead',
					null,
					element.createElement(
						'tr',
						null,
						element.createElement('th', null, i18n.__('File', 'hoatzinmedia')),
						element.createElement('th', null, i18n.__('Size', 'hoatzinmedia')),
						element.createElement('th', null, i18n.__('Type', 'hoatzinmedia')),
						element.createElement(
							'th',
							{ style: { textAlign: 'right' } },
							i18n.__('Actions', 'hoatzinmedia')
						)
					)
				),
				element.createElement(
					'tbody',
					null,
					items.map(function (item) {
						return element.createElement(
							'tr',
							{ key: item.id },
							element.createElement(
								'td',
								{ className: 'hm-file-name-cell' },
								element.createElement(
									'div',
									{ style: { display: 'flex', alignItems: 'center', gap: '12px' } },
									(item.thumbnail_url || item.url)
										? element.createElement('img', {
												src: item.thumbnail_url || item.url,
												className: 'hm-thumbnail',
												alt: '',
												onError: function (e) {
													if (item.url && e.target.src !== item.url) {
														e.target.src = item.url
													}
												},
										  })
										: element.createElement(
												'div',
												{ className: 'hm-thumbnail-placeholder' },
												item.mime_type.split('/')[1].toUpperCase().slice(0, 3)
										  ),
									element.createElement(
										'div',
										null,
										element.createElement(
											'div',
											{ className: 'hm-file-name-primary' },
											item.filename
										),
										element.createElement(
											'div',
											{ className: 'hm-file-name-secondary' },
											item.date
										)
									)
								)
							),
							element.createElement(
								'td',
								null,
								element.createElement(
									'span',
									{ style: { fontFamily: 'monospace', fontSize: '11px', color: '#4b5563' } },
									item.size_readable
								)
							),
							element.createElement(
								'td',
								null,
								element.createElement(
									'span',
									{ className: 'hm-tag' },
									item.mime_type.replace('image/', '').toUpperCase()
								)
							),
							element.createElement(
								'td',
								{ style: { textAlign: 'right' } },
								element.createElement(
									'a',
									{
										href: 'post.php?post=' + item.id + '&action=edit',
										className: 'hm-button hm-button-outline',
										style: { padding: '4px 10px', fontSize: '11px', minHeight: '24px' },
										target: '_blank',
										rel: 'noopener noreferrer',
									},
									i18n.__('Edit', 'hoatzinmedia')
								)
							)
						)
					})
				)
			)
		)
	}

	function App() {
		var dashboard = useDashboardData()
		var modulesState = useModulesState()
		var modules = modulesState.modules || {}
		var toggleModule = modulesState.toggleModule

		var DEFAULT_GENERAL_SETTINGS = {
			maxFileSize: '2',
			scanSchedule: 'daily',
			itemsPerPage: 10,
			unusedMediaAgeDays: 7,
			autoConvertUploads: 'webp',
			enableWebpServing: true,
			webpQuality: 80,
			enableImageExtLabel: true,
			enableMediaUsageButton: true,
			enableSvgUploads: false,
		}

		var _useStateGeneralSettings = useState(DEFAULT_GENERAL_SETTINGS)
		var generalSettings = _useStateGeneralSettings[0]
		var setGeneralSettings = _useStateGeneralSettings[1]

		var _useStateGeneralSettingsDraft = useState(DEFAULT_GENERAL_SETTINGS)
		var generalSettingsDraft = _useStateGeneralSettingsDraft[0]
		var setGeneralSettingsDraft = _useStateGeneralSettingsDraft[1]

		var _useStateGeneralSettingsSaving = useState(false)
		var generalSettingsSaving = _useStateGeneralSettingsSaving[0]
		var setGeneralSettingsSaving = _useStateGeneralSettingsSaving[1]

		useEffect(function () {
			apiFetch({
				path: 'hoatzinmedia/v1/settings',
				method: 'GET',
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			}).then(function (response) {
				if (response && response.settings) {
					var raw = response.settings || {}
					var nextDraft = Object.assign({}, DEFAULT_GENERAL_SETTINGS, raw)

					var allowedSchedules = ['every3hours', 'daily', 'weekly']
					if (allowedSchedules.indexOf(String(nextDraft.scanSchedule || '')) === -1) {
						nextDraft.scanSchedule = DEFAULT_GENERAL_SETTINGS.scanSchedule
					}

					var allowedItems = [10, 25, 50, 100]
					var nextItems = parseInt(nextDraft.itemsPerPage, 10)
					if (!nextItems || allowedItems.indexOf(nextItems) === -1) {
						nextItems = DEFAULT_GENERAL_SETTINGS.itemsPerPage
					}
					nextDraft.itemsPerPage = nextItems

					var nextMax = parseInt(nextDraft.maxFileSize, 10)
					if (!nextMax || nextMax < 1) {
						nextMax = parseInt(DEFAULT_GENERAL_SETTINGS.maxFileSize, 10) || 20
					}
					if (nextMax > 200) {
						nextMax = 200
					}
					nextDraft.maxFileSize = String(nextMax)

					var nextAge = parseInt(nextDraft.unusedMediaAgeDays, 10)
					if (nextAge < 0 || !isFinite(nextAge)) {
						nextAge = DEFAULT_GENERAL_SETTINGS.unusedMediaAgeDays
					}
					if (nextAge > 365) {
						nextAge = 365
					}
					nextDraft.unusedMediaAgeDays = nextAge

					var allowedConvert = ['disabled', 'webp', 'avif']
					if (allowedConvert.indexOf(String(nextDraft.autoConvertUploads || '')) === -1) {
						nextDraft.autoConvertUploads = DEFAULT_GENERAL_SETTINGS.autoConvertUploads
					}

					if (typeof raw.enableWebpServing !== 'undefined') {
						nextDraft.enableWebpServing =
							raw.enableWebpServing === true ||
							raw.enableWebpServing === 'true' ||
							raw.enableWebpServing === '1'
					}

					var nextQuality = parseInt(raw.webpQuality, 10)
					if (!nextQuality || nextQuality < 1) {
						nextQuality = DEFAULT_GENERAL_SETTINGS.webpQuality
					}
					if (nextQuality > 100) {
						nextQuality = 100
					}
					nextDraft.webpQuality = nextQuality

					if (typeof raw.enableImageExtLabel !== 'undefined') {
						nextDraft.enableImageExtLabel =
							raw.enableImageExtLabel === true ||
							raw.enableImageExtLabel === 'true' ||
							raw.enableImageExtLabel === '1'
					}
					if (typeof raw.enableMediaUsageButton !== 'undefined') {
						nextDraft.enableMediaUsageButton =
							raw.enableMediaUsageButton === true ||
							raw.enableMediaUsageButton === 'true' ||
							raw.enableMediaUsageButton === '1'
					}
					if (typeof raw.enableSvgUploads !== 'undefined') {
						nextDraft.enableSvgUploads =
							raw.enableSvgUploads === true ||
							raw.enableSvgUploads === 'true' ||
							raw.enableSvgUploads === '1'
					}

					setGeneralSettings(raw)
					setGeneralSettingsDraft(nextDraft)
				}
			})
		}, [])

		function saveGeneralSettings(newSettings) {
			setGeneralSettingsSaving(true)
			try {
				if (
					typeof window !== 'undefined' &&
					window.HoatzinMediaSettings &&
					newSettings &&
					typeof newSettings.itemsPerPage !== 'undefined'
				) {
					window.HoatzinMediaSettings.itemsPerPage = parseInt(newSettings.itemsPerPage, 10) || 10
				}
			} catch (_e) {}
			apiFetch({
				path: 'hoatzinmedia/v1/settings',
				method: 'POST',
				data: {
					settings: newSettings,
				},
				headers: {
					'X-WP-Nonce': HoatzinMediaSettings.nonce,
				},
			}).then(function (response) {
				setGeneralSettingsSaving(false)
				if (response && response.success) {
					if (response.settings) {
						setGeneralSettings(response.settings)
						setGeneralSettingsDraft(response.settings)
					} else {
						setGeneralSettings(newSettings)
						setGeneralSettingsDraft(newSettings)
					}
					addToast('success', i18n.__('Settings saved', 'hoatzinmedia'))
				} else {
					addToast('error', i18n.__('Error saving settings', 'hoatzinmedia'))
				}
			}).catch(function () {
				setGeneralSettingsSaving(false)
				addToast('error', i18n.__('Error saving settings', 'hoatzinmedia'))
			})
		}

		var _useStateToasts = useState([])
		var toasts = _useStateToasts[0]
		var setToasts = _useStateToasts[1]

		function addToast(type, message) {
			var id = Date.now().toString() + Math.random().toString(16).slice(2)
			var toast = { id: id, type: type, message: message }
			setToasts(function (current) {
				return current.concat([toast])
			})
			window.setTimeout(function () {
				dismissToast(id)
			}, 5000)
		}

		useEffect(function () {
			function onGlobalError(e) {
				try {
					var msg = e && e.detail && e.detail.message ? String(e.detail.message) : ''
					if (msg) {
						addToast('error', msg)
					}
				} catch (_e0) {}
			}
			function onUnhandledRejection(e) {
				try {
					var reason = e && e.reason ? e.reason : null
					var normalized = hmNormalizeApiError(reason)
					if (normalized && normalized.message) {
						addToast('error', normalized.message)
					}
				} catch (_e1) {}
			}
			function onWindowError(e) {
				try {
					var err = e && e.error ? e.error : null
					var normalized = hmNormalizeApiError(err || { message: e && e.message ? e.message : '' })
					if (normalized && normalized.message) {
						addToast('error', normalized.message)
					}
				} catch (_e2) {}
			}
			try {
				if (typeof window !== 'undefined' && window.addEventListener) {
					window.addEventListener('hoatzinmedia_global_error', onGlobalError)
					window.addEventListener('unhandledrejection', onUnhandledRejection)
					window.addEventListener('error', onWindowError)
				}
			} catch (_e3) {}
			return function () {
				try {
					if (typeof window !== 'undefined' && window.removeEventListener) {
						window.removeEventListener('hoatzinmedia_global_error', onGlobalError)
						window.removeEventListener('unhandledrejection', onUnhandledRejection)
						window.removeEventListener('error', onWindowError)
					}
				} catch (_e4) {}
			}
		}, [])

		function dismissToast(id) {
			setToasts(function (current) {
				return current.filter(function (item) {
					return item.id !== id
				})
			})
		}

		var _useStateUnusedKey = useState(0)
		var unusedResultsKey = _useStateUnusedKey[0]
		var setUnusedResultsKey = _useStateUnusedKey[1]

		var _useStateUnusedMeta = useState(null)
		var unusedScanMeta = _useStateUnusedMeta[0]
		var setUnusedScanMeta = _useStateUnusedMeta[1]

		function refreshUnusedResults() {
			setUnusedResultsKey(function (current) {
				return current + 1
			})
		}

		var tabStorageKey = 'hoatzinmedia_active_tab'
		var tabQueryParam = 'hm_tab'

		function getInitialTabId() {
			var ids = MODULE_TABS.map(function (t) {
				return t.id
			})

			var initialModuleNameRaw =
				typeof HoatzinMediaSettings !== 'undefined' &&
				HoatzinMediaSettings &&
				HoatzinMediaSettings.module
					? HoatzinMediaSettings.module
					: 'dashboard'

			if (initialModuleNameRaw === 'unused_media') {
				initialModuleNameRaw = 'smart_scan'
			}

			if (typeof window !== 'undefined') {
				var url = new URL(window.location.href)
				var fromQuery = url.searchParams.get(tabQueryParam)
				if (fromQuery && ids.indexOf(fromQuery) !== -1) {
					return fromQuery
				}
			}

			if (initialModuleNameRaw && ids.indexOf(initialModuleNameRaw) !== -1) {
				return initialModuleNameRaw
			}

			if (typeof window !== 'undefined' && window.localStorage) {
				var fromStorage = window.localStorage.getItem(tabStorageKey)
				if (fromStorage && ids.indexOf(fromStorage) !== -1) {
					return fromStorage
				}
			}

			return 'dashboard'
		}

		var initialModuleName = getInitialTabId()

		var _useStateModule = useState(initialModuleName)
		var moduleName = _useStateModule[0]
		var setModuleName = _useStateModule[1]

		useEffect(
			function () {
				if (typeof window === 'undefined') {
					return
				}
				if (window.localStorage) {
					window.localStorage.setItem(tabStorageKey, moduleName)
				}
				var url = new URL(window.location.href)
				url.searchParams.set(tabQueryParam, moduleName)
				window.history.replaceState({}, '', url.toString())
			},
			[moduleName]
		)

		function isModuleEnabled(id) {
			if (id === 'dashboard' || id === 'settings' || id === 'general_settings') {
				return true
			}

			var state = modules[id]

			if (!state) {
				return true
			}

			return state.enabled !== false
		}

		useEffect(
			function () {
				var availableIds = MODULE_TABS.filter(function (tab) {
					return isModuleEnabled(tab.id)
				}).map(function (tab) {
					return tab.id
				})
				if (availableIds.indexOf(moduleName) === -1) {
					setModuleName('dashboard')
				}
			},
			[moduleName, modules]
		)

		var healthScore = dashboard.data ? dashboard.data.health_score || 0 : 0
		var totalFiles = dashboard.data ? dashboard.data.total_files || 0 : 0
		var unusedCount = dashboard.data ? dashboard.data.unused_count || 0 : 0
		var totalSizeReadable = dashboard.data
			? dashboard.data.total_size_readable || ''
			: ''
		var fileTypes = dashboard.data ? dashboard.data.file_types_distribution || {} : {}

		var children = []

		children.push(
			element.createElement(Header, {
				key: 'header',
				healthScore: healthScore,
			})
		)

		var tabs = MODULE_TABS.filter(function (tab) {
			return isModuleEnabled(tab.id)
		}).map(function (tab) {
			var isActive = moduleName === tab.id

			return element.createElement(
				'button',
				{
					key: tab.id,
					type: 'button',
					className: 'hm-tab-button' + (isActive ? ' hm-tab-button-active' : ''),
					onClick: function () {
						setModuleName(tab.id)
					},
				},
				tab.label
			)
		})

		children.push(
			element.createElement(
				'div',
				{ key: 'module-tabs', className: 'hm-tabs-row' },
				tabs
			)
		)

		if (moduleName === 'dashboard') {
			children.push(
				element.createElement(StatsCards, {
					key: 'stats',
					data: dashboard.data,
				})
			)

			children.push(
				element.createElement(
					'div',
					{ key: 'layout', className: 'hm-layout' },
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header' },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('Media health and storage', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'Score, unused ratio and storage pressure',
										'hoatzinmedia'
									)
								)
							)
						),
						element.createElement(HealthScore, {
							healthScore: healthScore,
						}),
						element.createElement(StorageMeter, {
							totalFiles: totalFiles,
							unusedCount: unusedCount,
						})
					),
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header' },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('File type distribution', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'Understand how your storage is allocated',
										'hoatzinmedia'
									)
								)
							),
							element.createElement(
								'div',
								{ className: 'hm-panel-actions' },
								element.createElement(
									'button',
									{
										type: 'button',
										className: 'hm-converter-settings-icon-btn-custom',
										onClick: function () {
											if (dashboard && dashboard.reload) {
												dashboard.reload({ force: true }).catch(function () {})
											}
										},
										disabled: !!dashboard.loading,
										title: i18n.__('Reload', 'hoatzinmedia'),
										'aria-label': i18n.__('Reload', 'hoatzinmedia'),
									},
									element.createElement(
										'svg',
										{
											viewBox: '0 0 24 24',
											fill: 'none',
											stroke: 'currentColor',
											strokeWidth: '2',
											style: dashboard.loading ? { animation: 'spin 1s linear infinite' } : undefined,
										},
										element.createElement('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
										element.createElement('polyline', { points: '21 3 21 9 15 9' })
									)
								)
							)
						),
						element.createElement(PieChart, {
							data: fileTypes,
						}),
						element.createElement(
							'div',
							{ className: 'hm-chart-legend' },
							Object.keys(fileTypes || {}).map(function (key, idx) {
								var val = (fileTypes && fileTypes[key]) || 0
								var label = getReadableFileType(key)
								var all = Object.values(fileTypes || {}).reduce(function (a, b) {
									return (parseFloat(a) || 0) + (parseFloat(b) || 0)
								}, 0)
								var pct = all > 0 ? Math.round(((parseFloat(val) || 0) / all) * 100) : 0
								var color = ['#2563eb', '#22c55e', '#f97316', '#ec4899', '#0ea5e9', '#a855f7'][idx % 6]
								if (!val) return null
								if (String(key) === 'unknown' && pct === 0) return null
								return element.createElement(
									'span',
									{ key: key, className: 'hm-chart-legend-item' },
									element.createElement('span', { className: 'hm-chart-legend-dot', style: { backgroundColor: color } }),
									label + ': ' + pct + '%'
								)
							})
						),
						element.createElement(
							'div',
							{ className: 'hm-badges-row' },
							element.createElement(
								'span',
								null,
								i18n.__('Total size:', 'hoatzinmedia'),
								' ',
								totalSizeReadable
							)
						)
					)
				)
			)

			children.push(
				element.createElement(
					'div',
					{ key: 'layout-2', className: 'hm-layout', style: { marginTop: '18px' } },
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header' },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('Largest files in library', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'Top 10 largest attachments by size',
										'hoatzinmedia'
									)
								)
							)
						),
						element.createElement(LargestFilesTable, {
							data: dashboard.data,
						})
					),
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('Required Server Settings', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'System configuration for optimal performance',
										'hoatzinmedia'
									)
								)
							),
							element.createElement(
								'div',
								{ style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' } },
								element.createElement(
									'button',
									{
										type: 'button',
										className: 'hm-button hm-button-outline',
										style: { height: '30px', lineHeight: '28px', padding: '0 8px', display: 'flex', alignItems: 'center' },
										disabled: dashboard.loading,
										onClick: function () {
											return dashboard
												.reload({ force: true })
												.then(function () {
													addToast('success', i18n.__('Server configuration rechecked', 'hoatzinmedia'))
												})
												.catch(function () {
													addToast('error', i18n.__('Failed to recheck server configuration', 'hoatzinmedia'))
												})
										},
										'aria-label': i18n.__('Recheck server configuration', 'hoatzinmedia'),
										title: i18n.__('Recheck server configuration', 'hoatzinmedia'),
									},
									element.createElement('span', {
										className: 'dashicons dashicons-update',
										style: { fontSize: '16px', lineHeight: '20px' },
									})
								),
								element.createElement(
									'a',
									{
										href: 'https://wordpress.org/documentation/article/requirements/',
										target: '_blank',
										rel: 'noopener noreferrer',
										className: 'hm-button hm-button-outline',
										style: { textDecoration: 'none', height: '30px', lineHeight: '28px', padding: '0 12px', whiteSpace: 'nowrap' }
									},
									i18n.__('How to configure', 'hoatzinmedia')
								)
							)
						),
						element.createElement(ServerRequirements, {
							data: dashboard.data ? dashboard.data.server_requirements : {},
						})
					)
				)
			)

		} else if (moduleName === 'smart_scan') {
			children.push(
				element.createElement(
					'div',
					{ key: 'smart-scan-layout', className: 'hm-layout hm-layout-full', style: { marginTop: '18px' } },
					element.createElement(
						'div',
						{ className: 'hm-panel hm-smartscan-panel' },
						element.createElement(
							'div',
							{ className: 'hm-smartscan-content' },
							element.createElement(
								'div',
								{ className: 'hm-smartscan-toprow' },
								element.createElement(
									'div',
									{ className: 'hm-smartscan-card' },
									element.createElement(
										'div',
										{ className: 'hm-smartscan-card-title' },
										i18n.__('Unused Media Scanner', 'hoatzinmedia')
									),
									element.createElement(
										'div',
										{ className: 'hm-smartscan-card-subtitle' },
										i18n.__(
											'Scan for orphaned files and estimate space savings',
											'hoatzinmedia'
										)
									),
									element.createElement(UnusedScanner, {
										lastScan: unusedScanMeta && unusedScanMeta.finished_at
											? formatLocalDateTime(unusedScanMeta.finished_at)
											: '',
										onFinished: function (data) {
											addToast(
												'success',
												i18n.__(
													'Scan completed. Unused files found: ',
													'hoatzinmedia'
												) + (data && typeof data.found === 'number' ? data.found : 0)
											)
											refreshUnusedResults()
										},
										onError: function () {
											addToast(
												'error',
												i18n.__(
													'Scan failed. Please check your connection or try again.',
													'hoatzinmedia'
												)
											)
										},
									})
								)
							),
							element.createElement(UnusedResultsTable, {
								refreshKey: unusedResultsKey,
								onRefresh: refreshUnusedResults,
								onToast: addToast,
								onMeta: setUnusedScanMeta,
							})
						)
					)
				)
			)
		} else if (moduleName === 'duplicates') {
			children.push(
				element.createElement(
					'div',
					{
						key: 'duplicates-layout',
						className: 'hm-layout hm-layout-full',
						style: { marginTop: '18px' },
					},
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header' },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('Duplicate Checker', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'List attachment files that share the same stored path value.',
										'hoatzinmedia'
									)
								)
							)
						),
						element.createElement(DuplicateResultsTable, { onToast: addToast })
					)
				)
			)
		} else if (moduleName === 'image_formats') {
			children.push(
				element.createElement(
					'div',
					{
						key: 'image-formats-layout',
						className: 'hm-layout hm-layout-full',
						style: { marginTop: '18px' },
					},
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header' },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('Convert (WebP / AVIF)', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'Convert images to WebP or AVIF in bulk or individually.',
										'hoatzinmedia'
									)
								)
							)
						),
						element.createElement(ImageFormatsLibraryTable, null)
					)
				)
			)
		} else if (moduleName === 'regenerate') {
			children.push(
				element.createElement(
					'div',
					{
						key: 'regenerate-layout',
						className: 'hm-layout hm-layout-full',
						style: { marginTop: '18px' },
					},
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header' },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('Regenerate thumbnails', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'Recreate image sizes for selected attachments.',
										'hoatzinmedia'
									)
								)
							)
						),
						element.createElement(RegenerateModule, null)
					)
				)
			)
		} else if (moduleName === 'large_files') {
			children.push(
				element.createElement(
					'div',
					{ key: 'large-files-layout', className: 'hm-layout', style: { marginTop: '18px' } },
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header' },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('Large file explorer', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'Identify heavy files by threshold and page through results',
										'hoatzinmedia'
									)
								)
							)
						),
						element.createElement(LargeFileFilter, null)
					)
				)
			)
		} else if (moduleName === 'svg_support') {
			var isTrueSvg = function (val) {
				return val === true || val === 'true' || val === '1'
			}
			var svgEnabled = isTrueSvg(
				generalSettingsDraft && typeof generalSettingsDraft.enableSvgUploads !== 'undefined'
					? generalSettingsDraft.enableSvgUploads
					: generalSettings && generalSettings.enableSvgUploads
			)

			function toggleSvgUploads() {
				var next = !svgEnabled
				var nextSettings = Object.assign({}, generalSettingsDraft || {}, {
					enableSvgUploads: next,
				})
				setGeneralSettingsDraft(nextSettings)
				saveGeneralSettings(nextSettings)
			}

			children.push(
				element.createElement(
					'div',
					{
						key: 'svg-support-layout',
						className: 'hm-layout hm-layout-full',
						style: { marginTop: '18px' },
					},
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header' },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('SVG Support', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'Allow administrators to upload sanitized SVG files safely.',
										'hoatzinmedia'
									)
								)
							)
						),
						element.createElement(
							'div',
							{ className: 'hm-settings-layout' },
							element.createElement(
								'div',
								{ className: 'hm-card-subvalue' },
								i18n.__(
									'When enabled, SVG uploads are restricted to administrators and sanitized on upload. Complex SVG features may be removed for safety.',
									'hoatzinmedia'
								)
							),
							element.createElement(
								'div',
								{ className: 'hm-settings-row' },
								element.createElement(
									'div',
									null,
									element.createElement(
										'div',
										{ className: 'hm-settings-label' },
										i18n.__('Enable SVG uploads', 'hoatzinmedia')
									),
									element.createElement(
										'div',
										{ className: 'hm-settings-description' },
										svgEnabled
											? i18n.__('Enabled (admins only)', 'hoatzinmedia')
											: i18n.__('Disabled', 'hoatzinmedia')
									)
								),
								element.createElement(
									'button',
									{
										type: 'button',
										className: 'hm-toggle' + (svgEnabled ? ' hm-toggle-on' : ''),
										'aria-pressed': svgEnabled,
										'aria-label':
											(svgEnabled ? i18n.__('Disable', 'hoatzinmedia') : i18n.__('Enable', 'hoatzinmedia')) +
											' ' +
											i18n.__('SVG uploads', 'hoatzinmedia'),
										onClick: toggleSvgUploads,
										disabled: !!generalSettingsSaving,
									},
									element.createElement(
										'span',
										{ className: 'hm-toggle-track' },
										element.createElement('span', { className: 'hm-toggle-thumb' })
									)
								)
							),
							element.createElement(
								'div',
								{ className: 'hm-settings-info' },
								element.createElement(
									'p',
									{ className: 'hm-settings-info-text' },
									i18n.__(
										'Security notes: doctype/entities are blocked; scripts, event handlers, and style attributes are removed; only a safe subset of SVG elements and attributes is allowed.',
										'hoatzinmedia'
									)
								)
							)
						)
					)
				)
			)
		} else if (moduleName === 'general_settings') {
			var isTrue = function (val) {
				return val === true || val === 'true' || val === '1'
			}

			var scanScheduleValue =
				generalSettingsDraft && generalSettingsDraft.scanSchedule
					? generalSettingsDraft.scanSchedule
					: 'daily'
			if (
				scanScheduleValue !== 'every3hours' &&
				scanScheduleValue !== 'daily' &&
				scanScheduleValue !== 'weekly'
			) {
				scanScheduleValue = 'daily'
			}

			var itemsPerPageValueRaw =
				generalSettingsDraft && typeof generalSettingsDraft.itemsPerPage !== 'undefined'
					? generalSettingsDraft.itemsPerPage
					: 10
			var itemsPerPageValue = parseInt(itemsPerPageValueRaw, 10) || 10
			if ([10, 25, 50, 100].indexOf(itemsPerPageValue) === -1) {
				itemsPerPageValue = 10
			}

			var maxFileSizeValueRaw =
				generalSettingsDraft && typeof generalSettingsDraft.maxFileSize !== 'undefined'
					? generalSettingsDraft.maxFileSize
					: '20'
			var maxFileSizeValue = parseInt(maxFileSizeValueRaw, 10)
			if (!maxFileSizeValue || maxFileSizeValue < 1) {
				maxFileSizeValue = 20
			}
			if (maxFileSizeValue > 200) {
				maxFileSizeValue = 200
			}

			var unusedAgeValueRaw =
				generalSettingsDraft && typeof generalSettingsDraft.unusedMediaAgeDays !== 'undefined'
					? generalSettingsDraft.unusedMediaAgeDays
					: 30
			var unusedAgeValue = parseInt(unusedAgeValueRaw, 10)
			if (unusedAgeValue < 0 || !isFinite(unusedAgeValue)) {
				unusedAgeValue = 30
			}
			if (unusedAgeValue > 365) {
				unusedAgeValue = 365
			}

			var convertValue =
				generalSettingsDraft && generalSettingsDraft.autoConvertUploads
					? generalSettingsDraft.autoConvertUploads
					: 'webp'
			var convertMode =
				convertValue === 'disabled'
					? 'disabled'
					: convertValue === 'avif'
					? 'custom'
					: 'enabled'

			var dirty =
				JSON.stringify(generalSettingsDraft || {}) !== JSON.stringify(generalSettings || {})

			var enableWebpServingValue = isTrue(
				generalSettingsDraft && generalSettingsDraft.enableWebpServing
			)

			var webpQualityValueRaw =
				generalSettingsDraft && typeof generalSettingsDraft.webpQuality !== 'undefined'
					? generalSettingsDraft.webpQuality
					: 80
			var webpQualityValue = parseInt(webpQualityValueRaw, 10)
			if (!webpQualityValue || webpQualityValue < 1) {
				webpQualityValue = 80
			}
			if (webpQualityValue > 100) {
				webpQualityValue = 100
			}

			function updateDraft(patch) {
				setGeneralSettingsDraft(Object.assign({}, generalSettingsDraft || {}, patch))
			}

			function resetToDefaults() {
				setGeneralSettingsDraft(DEFAULT_GENERAL_SETTINGS)
			}

			function saveDraft() {
				saveGeneralSettings(Object.assign({}, generalSettingsDraft || {}))
			}

			function SegmentedControl(props) {
				var value = props.value
				var options = props.options || []
				var ariaLabel = props.ariaLabel || ''
				return element.createElement(
					'div',
					{ className: 'hm-gs-seg', role: 'group', 'aria-label': ariaLabel },
					options.map(function (opt) {
						var isActive = value === opt.value
						return element.createElement(
							'button',
							{
								key: opt.value,
								type: 'button',
								className: 'hm-gs-seg-btn' + (isActive ? ' is-active' : ''),
								onClick: function () {
									return opt.onSelect(opt.value)
								},
							},
							opt.label
						)
					})
				)
			}

			function Switch(props) {
				var on = !!props.on
				return element.createElement(
					'button',
					{
						type: 'button',
						className: 'hm-gs-switch' + (on ? ' is-on' : ''),
						'aria-pressed': on,
						'aria-label': props.ariaLabel || '',
						onClick: props.onToggle,
					},
					element.createElement(
						'span',
						{ className: 'hm-gs-switch-track' },
						element.createElement('span', { className: 'hm-gs-switch-thumb' })
					)
				)
			}

			children.push(
				element.createElement(
					'div',
					{
						key: 'general-settings-layout',
						className: 'hm-layout hm-layout-full',
						style: { marginTop: '18px' },
					},
					element.createElement(
						'div',
						{ className: 'hm-panel hm-gs-panel' },
						element.createElement(
							'div',
							{ className: 'hm-general-settings-surface' },
							element.createElement(
								'div',
								{ className: 'hm-general-settings-header' },
								element.createElement(
									'div',
									{ className: 'hm-general-settings-title-row' },
									element.createElement(
										'div',
										{ className: 'hm-gs-title-icon' },
										element.createElement('span', {
											className: 'dashicons dashicons-admin-generic',
											'aria-hidden': 'true',
										})
									),
									element.createElement(
										'div',
										null,
										element.createElement(
											'div',
											{ className: 'hm-gs-title' },
											i18n.__('HoatzinMedia Settings', 'hoatzinmedia')
										),
										element.createElement(
											'div',
											{ className: 'hm-gs-subtitle' },
											i18n.__(
												'Configure your media library optimization preferences',
												'hoatzinmedia'
											)
										)
									)
								)
							),
							element.createElement(
								'div',
								{ className: 'hm-gs-grid' },
								element.createElement(
									'div',
									{ className: 'hm-gs-card' },
									element.createElement(
										'div',
										{ className: 'hm-gs-card-header' },
										element.createElement(
											'div',
											{ className: 'hm-gs-card-headleft' },
											element.createElement(
												'div',
												{ className: 'hm-gs-card-icon' },
												element.createElement('span', {
													className: 'dashicons dashicons-admin-tools',
													'aria-hidden': 'true',
												})
											),
											element.createElement(
												'div',
												{ className: 'hm-gs-card-title' },
												i18n.__('Automation & Media library', 'hoatzinmedia')
											)
										)
									),
									element.createElement(
										'div',
										{ className: 'hm-gs-card-body' },
										element.createElement(
											'div',
											{ className: 'hm-gs-field' },
											element.createElement(
												'div',
												{ className: 'hm-gs-field-label' },
												i18n.__('Scan Schedule', 'hoatzinmedia')
											),
											element.createElement(SegmentedControl, {
												ariaLabel: i18n.__('Scan schedule', 'hoatzinmedia'),
												value: scanScheduleValue,
												options: [
													{
														value: 'every3hours',
														label: i18n.__('Every 3 Hours', 'hoatzinmedia'),
														onSelect: function (val) {
															return updateDraft({ scanSchedule: val })
														},
													},
													{
														value: 'daily',
														label: i18n.__('Daily', 'hoatzinmedia'),
														onSelect: function (val) {
															return updateDraft({ scanSchedule: val })
														},
													},
													{
														value: 'weekly',
														label: i18n.__('Weekly', 'hoatzinmedia'),
														onSelect: function (val) {
															return updateDraft({ scanSchedule: val })
														},
													},
												],
											})
										),
										element.createElement(
											'div',
											{ className: 'hm-gs-field hm-gs-field-inline' },
											element.createElement(
												'div',
												{ className: 'hm-gs-field-label' },
												i18n.__('Items per page', 'hoatzinmedia')
											),
											element.createElement(
												'div',
												{ className: 'hm-gs-select-wrap' },
												element.createElement(
													'select',
													{
														value: itemsPerPageValue,
														onChange: function (e) {
															return updateDraft({
																itemsPerPage: parseInt(e.target.value, 10) || 10,
															})
														},
														className: 'hm-gs-select',
														'aria-label': i18n.__('Items per page', 'hoatzinmedia'),
													},
													element.createElement('option', { value: 10 }, '10'),
													element.createElement('option', { value: 25 }, '25'),
													element.createElement('option', { value: 50 }, '50'),
													element.createElement('option', { value: 100 }, '100')
												),
												element.createElement('span', {
													className:
														'dashicons dashicons-arrow-down-alt2 hm-gs-select-icon',
													'aria-hidden': 'true',
												})
											)
										)
									)
								),
								element.createElement(
									'div',
									{ className: 'hm-gs-card' },
									element.createElement(
										'div',
										{ className: 'hm-gs-card-header' },
										element.createElement(
											'div',
											{ className: 'hm-gs-card-headleft' },
											element.createElement(
												'div',
												{ className: 'hm-gs-card-icon' },
												element.createElement('span', {
													className: 'dashicons dashicons-media-document',
													'aria-hidden': 'true',
												})
											),
											element.createElement(
												'div',
												{ className: 'hm-gs-card-title' },
												i18n.__('File Thresholds', 'hoatzinmedia')
											)
										)
									),
									element.createElement(
										'div',
										{ className: 'hm-gs-card-body' },
										element.createElement(
											'div',
											{ className: 'hm-gs-range-group' },
											element.createElement(
												'div',
												{ className: 'hm-gs-range-top' },
												element.createElement(
													'div',
													{ className: 'hm-gs-range-label' },
													i18n.__('Large File Threshold (MB)', 'hoatzinmedia')
												),
												element.createElement(
													'div',
													{ className: 'hm-gs-range-badge' },
													String(maxFileSizeValue)
												)
											),
											element.createElement('input', {
												type: 'range',
												min: 1,
												max: 200,
												step: 1,
												value: maxFileSizeValue,
												onChange: function (e) {
													return updateDraft({
														maxFileSize: String(parseInt(e.target.value, 10) || 20),
													})
												},
												className: 'hm-gs-range hm-gs-range-large',
												'aria-label': i18n.__('Large file threshold (MB)', 'hoatzinmedia'),
											})
										),
										element.createElement(
											'div',
											{ className: 'hm-gs-range-group' },
											element.createElement(
												'div',
												{ className: 'hm-gs-range-top hm-gs-range-top-split' },
												element.createElement(
													'div',
													{ className: 'hm-gs-range-label' },
													i18n.__('Unused Media Age Threshold', 'hoatzinmedia')
												),
												element.createElement(
													'div',
														{ className: 'hm-gs-range-right' },
														element.createElement(
															'div',
															{ className: 'hm-gs-range-badge' },
															String(unusedAgeValue)
														),
														element.createElement(
															'div',
															{ className: 'hm-gs-range-suffix' },
															i18n.__('Days', 'hoatzinmedia')
														)
												)
											),
											element.createElement('input', {
												type: 'range',
												min: 0,
												max: 365,
												step: 1,
												value: unusedAgeValue,
												onChange: function (e) {
													return updateDraft({
														unusedMediaAgeDays:
															parseInt(e.target.value, 10) || 0,
													})
												},
												className: 'hm-gs-range hm-gs-range-age',
												'aria-label': i18n.__(
													'Unused media age threshold (days)',
													'hoatzinmedia'
												),
											})
										)
									)
								),
								element.createElement(
									'div',
									{ className: 'hm-gs-card' },
									element.createElement(
										'div',
										{ className: 'hm-gs-card-header' },
										element.createElement(
											'div',
											{ className: 'hm-gs-card-headleft' },
											element.createElement(
												'div',
												{ className: 'hm-gs-card-icon' },
												element.createElement('span', {
													className: 'dashicons dashicons-admin-site-alt3',
													'aria-hidden': 'true',
												})
											),
											element.createElement(
												'div',
												{ className: 'hm-gs-card-title' },
												i18n.__('WebP Serving', 'hoatzinmedia')
											)
										)
									),
									element.createElement(
										'div',
										{ className: 'hm-gs-card-body' },
										element.createElement(
											'div',
											{ className: 'hm-gs-ui-row' },
											element.createElement(
												'div',
												{ className: 'hm-gs-ui-left' },
												element.createElement(
													'div',
													{ className: 'hm-gs-ui-ico' },
													element.createElement('span', {
														className: 'dashicons dashicons-performance',
														'aria-hidden': 'true',
													})
												),
												element.createElement(
													'div',
													{ className: 'hm-gs-ui-label' },
													i18n.__('Serve WebP/AVIF silently', 'hoatzinmedia')
												)
											),
											element.createElement(Switch, {
												on: enableWebpServingValue,
												ariaLabel: i18n.__('Toggle WebP serving', 'hoatzinmedia'),
												onToggle: function () {
													return updateDraft({
														enableWebpServing: !enableWebpServingValue,
													})
												},
											})
										),
										enableWebpServingValue
											? element.createElement(
													'div',
													{ className: 'hm-gs-range-group', style: { marginTop: '14px' } },
													element.createElement(
														'div',
														{ className: 'hm-gs-range-top' },
														element.createElement(
															'div',
															{ className: 'hm-gs-range-label' },
															i18n.__('WebP Quality', 'hoatzinmedia')
														),
														element.createElement(
															'div',
															{ className: 'hm-gs-range-badge' },
															String(webpQualityValue)
														)
													),
													element.createElement('input', {
														type: 'range',
														min: 1,
														max: 100,
														step: 1,
														value: webpQualityValue,
														onChange: function (e) {
															return updateDraft({
																webpQuality: parseInt(e.target.value, 10) || 80,
															})
														},
														className: 'hm-gs-range hm-gs-range-large',
														'aria-label': i18n.__('WebP quality', 'hoatzinmedia'),
													})
											  )
											: null
									)
								),
								element.createElement(
									'div',
									{ className: 'hm-gs-card' },
									element.createElement(
										'div',
										{ className: 'hm-gs-card-header' },
										element.createElement(
											'div',
											{ className: 'hm-gs-card-headleft' },
											element.createElement(
												'div',
												{ className: 'hm-gs-card-icon' },
												element.createElement('span', {
													className: 'dashicons dashicons-format-image',
													'aria-hidden': 'true',
												})
											),
											element.createElement(
												'div',
												{ className: 'hm-gs-card-title' },
												i18n.__('Image Formats', 'hoatzinmedia')
											)
										)
									),
									element.createElement(
										'div',
										{ className: 'hm-gs-card-body' },
										element.createElement(
											'div',
											{ className: 'hm-gs-field' },
											element.createElement(
												'div',
												{ className: 'hm-gs-field-label' },
												i18n.__('Convert compatible images', 'hoatzinmedia')
											),
											element.createElement(SegmentedControl, {
												ariaLabel: i18n.__('Convert compatible images', 'hoatzinmedia'),
												value: convertMode,
												options: [
													{
														value: 'enabled',
														label: i18n.__('Enabled (WebP/AVIF)', 'hoatzinmedia'),
														onSelect: function () {
															return updateDraft({ autoConvertUploads: 'webp' })
														},
													},
													{
														value: 'disabled',
														label: i18n.__('Disabled', 'hoatzinmedia'),
														onSelect: function () {
															return updateDraft({ autoConvertUploads: 'disabled' })
														},
													},
													{
														value: 'custom',
														label: i18n.__('Custom', 'hoatzinmedia'),
														onSelect: function () {
															return updateDraft({ autoConvertUploads: 'avif' })
														},
													},
												],
											})
										)
									)
								),
								element.createElement(
									'div',
									{ className: 'hm-gs-card' },
									element.createElement(
										'div',
										{ className: 'hm-gs-card-header' },
										element.createElement(
											'div',
											{ className: 'hm-gs-card-headleft' },
											element.createElement(
												'div',
												{ className: 'hm-gs-card-icon' },
												element.createElement('span', {
													className: 'dashicons dashicons-admin-customizer',
													'aria-hidden': 'true',
												})
											),
											element.createElement(
												'div',
												{ className: 'hm-gs-card-title' },
												i18n.__('UI Preferences', 'hoatzinmedia')
											)
										)
									),
									element.createElement(
										'div',
										{ className: 'hm-gs-card-body' },
										element.createElement(
											'div',
											{ className: 'hm-gs-ui-row' },
											element.createElement(
												'div',
												{ className: 'hm-gs-ui-left' },
												element.createElement(
													'div',
													{ className: 'hm-gs-ui-ico' },
													element.createElement('span', {
														className: 'dashicons dashicons-tag',
														'aria-hidden': 'true',
													})
												),
												element.createElement(
													'div',
													{ className: 'hm-gs-ui-label' },
													i18n.__('Image Extension Badge', 'hoatzinmedia')
												)
											),
											element.createElement(Switch, {
												on: isTrue(
													generalSettingsDraft && generalSettingsDraft.enableImageExtLabel
												),
												ariaLabel: i18n.__('Toggle image extension badge', 'hoatzinmedia'),
												onToggle: function () {
													var next = !isTrue(
														generalSettingsDraft && generalSettingsDraft.enableImageExtLabel
													)
													return updateDraft({ enableImageExtLabel: next })
												},
											})
										),
										element.createElement(
											'div',
											{ className: 'hm-gs-ui-row' },
											element.createElement(
												'div',
												{ className: 'hm-gs-ui-left' },
												element.createElement(
													'div',
													{ className: 'hm-gs-ui-ico' },
													element.createElement('span', {
														className: 'dashicons dashicons-chart-area',
														'aria-hidden': 'true',
													})
												),
												element.createElement(
													'div',
													{ className: 'hm-gs-ui-label' },
													i18n.__('Show Media Usage Button', 'hoatzinmedia')
												)
											),
											element.createElement(Switch, {
												on: isTrue(
													generalSettingsDraft &&
														generalSettingsDraft.enableMediaUsageButton
												),
												ariaLabel: i18n.__('Toggle media usage button', 'hoatzinmedia'),
												onToggle: function () {
													var next = !isTrue(
														generalSettingsDraft &&
															generalSettingsDraft.enableMediaUsageButton
													)
													return updateDraft({ enableMediaUsageButton: next })
												},
											})
										)
									)
								)
							),
							element.createElement(
								'div',
								{ className: 'hm-gs-footer' },
								element.createElement(
									'button',
									{
										type: 'button',
										className: 'hm-gs-btn hm-gs-btn-primary',
										onClick: saveDraft,
										disabled: generalSettingsSaving || !dirty,
									},
									generalSettingsSaving
										? i18n.__('Saving…', 'hoatzinmedia')
										: i18n.__('Save Changes', 'hoatzinmedia')
								),
								element.createElement(
									'button',
									{
										type: 'button',
										className: 'hm-gs-btn hm-gs-btn-secondary',
										onClick: resetToDefaults,
										disabled: generalSettingsSaving,
									},
									i18n.__('Reset to Defaults', 'hoatzinmedia')
								)
							)
						)
					)
				)
			)
		} else if (moduleName === 'settings') {
			var settingsIntro = element.createElement(
				'div',
				{ key: 'intro', className: 'hm-card-subvalue' },
				i18n.__(
					'Enable or disable individual HoatzinMedia modules. Core dashboard is always available.',
					'hoatzinmedia'
				)
			)

			var settingsModules = [
				{
					id: 'smart_scan',
					label: i18n.__('Smart Scan & Unused Media', 'hoatzinmedia'),
					description: i18n.__(
						'Run scans and review unused media in one combined view.',
						'hoatzinmedia'
					),
					icon: 'dashicons-search',
				},
				{
					id: 'duplicates',
					label: i18n.__('Duplicate Checker', 'hoatzinmedia'),
					description: i18n.__(
						'Find attachment files that share the same stored path.',
						'hoatzinmedia'
					),
					icon: 'dashicons-admin-page',
				},
				{
					id: 'image_formats',
					label: i18n.__('Convert (WebP / AVIF)', 'hoatzinmedia'),
					description: i18n.__(
						'Convert images to WebP and AVIF formats with multiple workflows.',
						'hoatzinmedia'
					),
					icon: 'dashicons-images-alt2',
				},
				{
					id: 'regenerate',
					label: i18n.__('Regenerate Thumbnails', 'hoatzinmedia'),
					description: i18n.__(
						'Recreate image sizes (thumbnails) for selected attachments.',
						'hoatzinmedia'
					),
					icon: 'dashicons-image-rotate',
				},
				{
					id: 'large_files',
					label: i18n.__('Large Files', 'hoatzinmedia'),
					description: i18n.__(
						'Explorer for files above a selected size threshold.',
						'hoatzinmedia'
					),
					icon: 'dashicons-media-document',
				},
				{
					id: 'svg_support',
					label: i18n.__('SVG Support', 'hoatzinmedia'),
					description: i18n.__(
						'Enable secure SVG uploads with strict sanitization.',
						'hoatzinmedia'
					),
					icon: 'dashicons-format-image',
				},
				{
					id: 'general_settings',
					label: i18n.__('Settings', 'hoatzinmedia'),
					description: i18n.__(
						'Configure general plugin settings and behavior.',
						'hoatzinmedia'
					),
					icon: 'dashicons-admin-generic',
					locked: true,
				},
			]

			var moduleCards = settingsModules.map(function (item) {
				var state = modules[item.id] || {}
				var enabled = item.locked ? true : state.enabled !== false

				return element.createElement(
					'div',
					{ key: item.id, className: 'hm-module-card' },
					element.createElement(
						'div',
						{ className: 'hm-module-card-icon' },
						element.createElement('span', {
							className: 'dashicons ' + item.icon,
							'aria-hidden': 'true',
						})
					),
					element.createElement(
						'div',
						{ className: 'hm-module-card-body' },
						element.createElement(
							'div',
							{ className: 'hm-module-card-title' },
							item.label
						),
						element.createElement(
							'div',
							{ className: 'hm-module-card-desc' },
							item.description
						)
					),
					element.createElement(
						'button',
						{
							type: 'button',
							className: 'hm-toggle' + (enabled ? ' hm-toggle-on' : ''),
							'aria-pressed': enabled,
							'aria-label':
								(enabled ? i18n.__('Disable', 'hoatzinmedia') : i18n.__('Enable', 'hoatzinmedia')) +
								' ' +
								item.label,
							onClick: function () {
								if (item.locked) {
									return
								}
								toggleModule(item.id)
							},
							disabled: modulesState.saving || !!item.locked,
						},
						element.createElement(
							'span',
							{ className: 'hm-toggle-track' },
							element.createElement('span', { className: 'hm-toggle-thumb' })
						)
					)
				)
			})

			children.push(
				element.createElement(
					'div',
					{ key: 'settings-layout', className: 'hm-layout hm-layout-full', style: { marginTop: '18px' } },
					element.createElement(
						'div',
						{ className: 'hm-panel' },
						element.createElement(
							'div',
							{ className: 'hm-panel-header' },
							element.createElement(
								'div',
								null,
								element.createElement(
									'div',
									{ className: 'hm-panel-title' },
									i18n.__('Modules', 'hoatzinmedia')
								),
								element.createElement(
									'div',
									{ className: 'hm-panel-subtitle' },
									i18n.__(
										'Configure HoatzinMedia modules and behavior',
										'hoatzinmedia'
									)
								)
							)
						),
						element.createElement(
							'div',
							{ className: 'hm-settings-layout' },
							settingsIntro,
							element.createElement(
								'div',
								{ key: 'modules-grid', className: 'hm-modules-grid' },
								moduleCards
							)
						)
					)
				)
			)
		}

		return element.createElement(
			'div',
			{ className: 'hoatzinmedia-app-root' },
			element.createElement('div', { className: 'hm-shell' }, children),
			element.createElement(ToastNotifications, {
				toasts: toasts,
				onDismiss: dismissToast,
			})
		)
	}

	document.addEventListener('DOMContentLoaded', function () {
		var root = document.getElementById('hoatzinmedia-admin-app')

		if (!root) {
			return
		}

		element.render(element.createElement(App, null), root)
	})
})()
