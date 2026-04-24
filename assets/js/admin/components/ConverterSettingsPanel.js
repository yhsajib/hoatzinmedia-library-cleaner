import { useState, useEffect } from '@wordpress/element'
import {
	Card,
	CardHeader,
	CardBody,
	CardFooter,
	SelectControl,
	CheckboxControl,
	Button,
	Flex,
	FlexItem,
	Text,
	Spinner,
	Icon,
} from '@wordpress/components'
import { close, check } from '@wordpress/icons'

export default function ConverterSettingsPanel({
	settings,
	onSettingsChange,
	onClose,
}) {
	const [localSettings, setLocalSettings] = useState(settings)
	const [isSaving, setIsSaving] = useState(false)
	const [saveSuccess, setSaveSuccess] = useState(false)
	const [scanResult, setScanResult] = useState(null)
	const [isScanning, setIsScanning] = useState(false)

	useEffect(() => {
		if (typeof document !== 'undefined' && document.body) {
			try {
				document.body.classList.add('hm-modal-open')
			} catch (_e) {}
		}
		return () => {
			if (typeof document !== 'undefined' && document.body) {
				try {
					document.body.classList.remove('hm-modal-open')
				} catch (_e) {}
			}
		}
	}, [])

	const handleSettingChange = (key, value) => {
		const updated = { ...localSettings, [key]: value }
		setLocalSettings(updated)
	}

	useEffect(() => {
		const run = async () => {
			setIsScanning(true)
			try {
				const response = await fetch(
					`${window.HoatzinMediaSettings?.restUrl || '/wp-json/'}hoatzinmedia/v1/converter-settings/scan?scope=${encodeURIComponent(
						localSettings.scope
					)}&imageTypes=${encodeURIComponent(localSettings.imageTypes)}`,
					{
						headers: {
							'X-WP-Nonce': window.HoatzinMediaSettings?.nonce || '',
						},
					}
				)
				if (response.ok) {
					const data = await response.json()
					setScanResult(data)
				}
			} catch (error) {
				setScanResult(null)
			} finally {
				setIsScanning(false)
			}
		}
		run()
	}, [localSettings.scope, localSettings.imageTypes])

	const handleSaveSettings = async () => {
		setIsSaving(true)
		try {
			const response = await fetch(
				`${window.HoatzinMediaSettings?.restUrl || '/wp-json/'}hoatzinmedia/v1/converter-settings`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': window.HoatzinMediaSettings?.nonce || '',
					},
					body: JSON.stringify(localSettings),
				}
			)

			if (response.ok) {
				onSettingsChange(localSettings)
				setSaveSuccess(true)
				setTimeout(() => {
					setSaveSuccess(false)
				}, 2000)
			}
		} catch (error) {
			console.error('Failed to save converter settings:', error)
		}
		setIsSaving(false)
	}

	const handleReset = () => {
		setLocalSettings(settings)
	}

	return (
		<div className="hm-settings-panel-overlay minht-600" onClick={onClose}>
			<div
				className="hm-settings-side-panel"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="hm-settings-panel-header">
					<Flex justify="space-between" align="center">
						<FlexItem>
							<h2 className="hm-settings-panel-title">
								Conversion Settings
							</h2>
						</FlexItem>
						<FlexItem>
							<Button
								isSmall
								icon={close}
								label="Close settings"
								onClick={onClose}
								className="hm-settings-close-btn"
							/>
						</FlexItem>
					</Flex>
				</div>

				{/* Body */}
				<div className="hm-settings-panel-body">
					<div className="hm-settings-section">
						<h3 className="hm-settings-section-title">General</h3>

						<SelectControl
							label="Scope"
							value={localSettings.scope}
							options={[
								{
									label: 'Uploads and themes',
									value: 'uploads',
								},
								{
									label: 'Uploads only',
									value: 'uploads-only',
								},
							]}
							onChange={(value) =>
								handleSettingChange('scope', value)
							}
							help="Choose which folders to scan for image conversion"
						/>

						<SelectControl
							label="Image types to work on"
							value={localSettings.imageTypes}
							options={[
								{
									label: 'Both JPEGs and PNGs',
									value: 'both',
								},
								{ label: 'JPEGs only', value: 'jpeg' },
								{ label: 'PNGs only', value: 'png' },
							]}
							onChange={(value) =>
								handleSettingChange('imageTypes', value)
							}
							help="Select which image formats to convert"
						/>

						<SelectControl
							label="Destination folder"
							value={localSettings.destinationFolder}
							options={[
								{
									label: 'In separate folder',
									value: 'separate',
								},
								{
									label: 'Same folder as original',
									value: 'same',
								},
							]}
							onChange={(value) =>
								handleSettingChange('destinationFolder', value)
							}
							help="Where to save converted images"
						/>

						<SelectControl
							label="File extension"
							value={localSettings.fileExtension}
							options={[
								{
									label: 'Append ".webp"',
									value: 'append-webp',
								},
								{
									label: 'Replace with ".webp"',
									value: 'replace-webp',
								},
								{
									label: 'Append ".avif"',
									value: 'append-avif',
								},
								{
									label: 'Replace with ".avif"',
									value: 'replace-avif',
								},
							]}
							onChange={(value) =>
								handleSettingChange('fileExtension', value)
							}
							help="How to name the converted files"
						/>

						<SelectControl
							label="Destination structure"
							value={localSettings.destinationStructure}
							options={[
								{
									label: 'Image roots',
									value: 'image-roots',
								},
								{
									label: 'Mirror source structure',
									value: 'mirror-structure',
								},
								{
									label: 'Flat structure',
									value: 'flat',
								},
							]}
							onChange={(value) =>
								handleSettingChange(
									'destinationStructure',
									value
								)
							}
							help="How to organize converted files in destination folder"
						/>

						<SelectControl
							label="Cache-Control header"
							value={localSettings.cacheControl}
							options={[
								{ label: 'Do not set', value: 'do-not-set' },
								{
									label: 'public, max-age=31536000',
									value: 'public-1year',
								},
								{
									label: 'public, max-age=2592000',
									value: 'public-30days',
								},
								{
									label: 'no-cache',
									value: 'no-cache',
								},
							]}
							onChange={(value) =>
								handleSettingChange('cacheControl', value)
							}
							help="Set cache control for converted images"
						/>
					</div>

					<div className="hm-settings-section">
						<h3 className="hm-settings-section-title">Advanced</h3>

						<CheckboxControl
							label="Prevent using WebPs larger than original"
							checked={localSettings.preventLargerWebp}
							onChange={(checked) =>
								handleSettingChange('preventLargerWebp', checked)
							}
							help="Skip conversion if the result would be larger than the original"
						/>
					</div>

					<div className="hm-settings-section">
						<h3 className="hm-settings-section-title">Scope Scan</h3>
						{isScanning ? (
							<Flex align="center" gap={2}>
								<FlexItem>
									<Spinner />
								</FlexItem>
								<FlexItem>
									<Text>Scanning folders…</Text>
								</FlexItem>
							</Flex>
						) : (
							<>
								<Text>
									Uploads images found:{' '}
									{scanResult?.uploads?.count ?? 0}
									{scanResult?.uploads?.limited
										? '+'
										: ''}
								</Text>
								{localSettings.scope === 'uploads' && (
									<Text>
										Theme images found:{' '}
										{scanResult?.theme?.count ?? 0}
										{scanResult?.theme?.limited
											? '+'
											: ''}
									</Text>
								)}
							</>
						)}
					</div>

					<div className="hm-settings-info">
						<Text className="hm-settings-info-text">
							These settings apply to all future conversions. Previous conversions will not be affected.
						</Text>
					</div>
				</div>

				{/* Footer */}
				<div className="hm-settings-panel-footer">
					{saveSuccess && (
						<div className="hm-settings-save-success">
							<Icon icon={check} />
							<Text>Settings saved successfully</Text>
						</div>
					)}

					<Flex justify="flex-end" gap={2}>
						<FlexItem>
							<Button
								isSecondary
								onClick={handleReset}
								disabled={isSaving}
							>
								Reset
							</Button>
						</FlexItem>
						<FlexItem>
							<Button
								isPrimary
								onClick={handleSaveSettings}
								isBusy={isSaving}
								disabled={isSaving}
							>
								{isSaving ? (
									<>
										<Spinner />
										Saving...
									</>
								) : (
									'Save Settings'
								)}
							</Button>
						</FlexItem>
					</Flex>
				</div>
			</div>
		</div>
	)
}
