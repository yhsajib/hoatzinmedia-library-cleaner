import { useState, useEffect, useCallback } from '@wordpress/element'
import apiFetch from '@wordpress/api-fetch'
import modulesConfig from '../modulesConfig'

const DEFAULT_STATE = modulesConfig.reduce((acc, mod) => {
	acc[mod.id] = {
		enabled: mod.enabled !== false,
		isPro: !!mod.isPro,
	}
	return acc
}, {})

const STORAGE_KEY = 'hoatzinmedia_modules_state'

const MODULE_KEY_MAP = {
	dashboard: 'dashboard',
	smartScan: 'smart_scan',
	duplicateFinder: 'duplicates',
	storageOptimizer: 'large_files',
	regenerate: 'regenerate',
	imageConverter: 'image_formats',
	settings: 'settings',
}

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

function toSnakeCase(value) {
	if (!value || typeof value !== 'string') {
		return ''
	}
	return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

function getInitialModulesFromWindow() {
	if (typeof window === 'undefined') {
		return null
	}
	const settings = window.HoatzinMediaSettings || {}
	if (!settings.modules || typeof settings.modules !== 'object') {
		return null
	}
	return settings.modules
}

function getInitialModulesFromStorage() {
	if (typeof window === 'undefined' || !window.localStorage) {
		return null
	}
	const raw = window.localStorage.getItem(STORAGE_KEY)
	const parsed = safeParseJSON(raw)
	if (!parsed || typeof parsed !== 'object') {
		return null
	}
	return parsed
}

function normalizeIncoming(incoming) {
	const normalized = {}
	if (!incoming || typeof incoming !== 'object') {
		return normalized
	}

	Object.keys(DEFAULT_STATE).forEach((id) => {
		const keyMap = MODULE_KEY_MAP[id]
		const candidates = [
			id,
			id.toLowerCase(),
			toSnakeCase(id),
			keyMap,
			keyMap ? keyMap.toLowerCase() : '',
		].filter(Boolean)

		let found = null
		for (let i = 0; i < candidates.length; i++) {
			const key = candidates[i]
			if (Object.prototype.hasOwnProperty.call(incoming, key)) {
				found = incoming[key]
				break
			}
		}

		if (!found || typeof found !== 'object') {
			return
		}

		normalized[id] = {
			enabled:
				typeof found.enabled === 'boolean'
					? found.enabled
					: DEFAULT_STATE[id].enabled,
			isPro:
				typeof found.isPro === 'boolean'
					? found.isPro
					: DEFAULT_STATE[id].isPro,
		}
	})

	return normalized
}

function buildServerPayload(nextModules) {
	const payload = {}
	Object.keys(DEFAULT_STATE).forEach((id) => {
		const key = MODULE_KEY_MAP[id] || toSnakeCase(id) || id
		const value = nextModules[id]
		if (!value || typeof value !== 'object') {
			return
		}
		payload[key] = value
	})
	return payload
}

export function useModules() {
	const [modules, setModules] = useState(() => {
		const fromWindow = getInitialModulesFromWindow()
		const fromStorage = getInitialModulesFromStorage()
		const initial = fromWindow || fromStorage || {}
		return {
			...DEFAULT_STATE,
			...normalizeIncoming(initial),
		}
	})
	const [isLoading, setIsLoading] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [saveSuccess, setSaveSuccess] = useState(false)
	const [error, setError] = useState(null)

	useEffect(() => {
		if (typeof window === 'undefined' || !window.localStorage) {
			return
		}
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(modules))
	}, [modules])

	useEffect(() => {
		let cancelled = false
		setIsLoading(true)
		setError(null)

		apiFetch({ path: '/hoatzinmedia/v1/modules', method: 'GET' })
			.then((response) => {
				if (cancelled) {
					return
				}
				if (response && response.modules) {
					const normalized = normalizeIncoming(response.modules)
					setModules({
						...DEFAULT_STATE,
						...normalized,
					})
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setError(err)
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false)
				}
			})

		return () => {
			cancelled = true
		}
	}, [])

	const persist = useCallback((nextModules) => {
		setIsSaving(true)
		setSaveSuccess(false)
		setError(null)

		const serverModules = buildServerPayload(nextModules)
		apiFetch({
			path: '/hoatzinmedia/v1/modules',
			method: 'POST',
			data: {
				modules: serverModules,
			},
		})
			.then(() => {
				setSaveSuccess(true)
			})
			.catch((err) => {
				setError(err)
			})
			.finally(() => {
				setIsSaving(false)
			})
	}, [])

	const toggleModule = useCallback(
		(id, enabledOverride) => {
			setModules((current) => {
				const existing = current[id] || DEFAULT_STATE[id] || {}
				const nextEnabled =
					typeof enabledOverride === 'boolean'
						? enabledOverride
						: !existing.enabled
				const nextModules = {
					...current,
					[id]: {
						...existing,
						enabled: nextEnabled,
					},
				}
				persist(nextModules)
				return nextModules
			})
		},
		[persist]
	)

	return {
		modules,
		isLoading,
		isSaving,
		saveSuccess,
		error,
		toggleModule,
	}
}

