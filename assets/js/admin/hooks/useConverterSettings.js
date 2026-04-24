import { useState, useEffect, useCallback } from '@wordpress/element'

const DEFAULT_SETTINGS = {
	scope: 'uploads',
	imageTypes: 'both',
	destinationFolder: 'separate',
	fileExtension: 'replace-webp',
	destinationStructure: 'mirror-structure',
	cacheControl: 'do-not-set',
	preventLargerWebp: true,
}

const CACHE_KEY = 'hoatzin_converter_settings_cache'

export function useConverterSettings() {
	const [settings, setSettings] = useState(DEFAULT_SETTINGS)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(null)
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

	// Load settings from API on mount
	useEffect(() => {
		loadSettings()
	}, [])

	const loadSettings = useCallback(async () => {
		setIsLoading(true)
		setError(null)

		try {
			// Try to get cached settings first
			const cachedSettings = localStorage.getItem(CACHE_KEY)
			if (cachedSettings) {
				setSettings(JSON.parse(cachedSettings))
			}

			// Fetch from API
			const response = await fetch(
				`${window.HoatzinMediaSettings?.restUrl || '/wp-json/'}hoatzinmedia/v1/converter-settings`,
				{
					headers: {
						'X-WP-Nonce':
							window.HoatzinMediaSettings?.nonce || '',
					},
				}
			)

			if (response.ok) {
				const data = await response.json()
				setSettings(data)
				setHasUnsavedChanges(false)
				// Update cache
				localStorage.setItem(CACHE_KEY, JSON.stringify(data))
			} else {
				throw new Error('Failed to load settings')
			}
		} catch (err) {
			console.error('Error loading converter settings:', err)
			setError(err.message)
		} finally {
			setIsLoading(false)
		}
	}, [])

	const updateSettings = useCallback((newSettings) => {
		setSettings(newSettings)
		setHasUnsavedChanges(true)
	}, [])

	const saveSettings = useCallback(async (settingsToSave) => {
		try {
			const response = await fetch(
				`${window.HoatzinMediaSettings?.restUrl || '/wp-json/'}hoatzinmedia/v1/converter-settings`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce':
							window.HoatzinMediaSettings?.nonce || '',
					},
					body: JSON.stringify(settingsToSave),
				}
			)

			if (!response.ok) {
				throw new Error('Failed to save settings')
			}

			const savedSettings = await response.json()
			setSettings(savedSettings)
			setHasUnsavedChanges(false)
			// Update cache
			localStorage.setItem(CACHE_KEY, JSON.stringify(savedSettings))

			return true
		} catch (err) {
			console.error('Error saving converter settings:', err)
			setError(err.message)
			return false
		}
	}, [])

	const resetSettings = useCallback(() => {
		setSettings(DEFAULT_SETTINGS)
		setHasUnsavedChanges(false)
	}, [])

	return {
		settings,
		isLoading,
		error,
		hasUnsavedChanges,
		updateSettings,
		saveSettings,
		resetSettings,
		loadSettings,
	}
}
