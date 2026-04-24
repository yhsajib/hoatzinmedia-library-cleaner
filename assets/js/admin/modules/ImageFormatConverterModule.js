import { useState, useEffect } from '@wordpress/element'
import {
	Flex,
	FlexItem,
	Button,
	Text,
	Spinner,
	Notice,
} from '@wordpress/components'
import { settings, close } from '@wordpress/icons'
import ConverterSettingsPanel from '../components/ConverterSettingsPanel'

export default function ImageFormatConverterModule() {
	const [showSettings, setShowSettings] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [hideBackupNotice, setHideBackupNotice] = useState(() => {
		try {
			const key = 'hm_converter_backup_notice_hide_until'
			const until = parseInt(window?.localStorage?.getItem(key) || '0', 10)
			return until && !Number.isNaN(until) ? Date.now() < until : false
		} catch {
			return false
		}
	})
	const [convertSettings, setConvertSettings] = useState({
		scope: 'uploads',
		imageTypes: 'both',
		destinationFolder: 'separate',
		fileExtension: 'replace-webp',
		destinationStructure: 'mirror-structure',
		cacheControl: 'do-not-set',
		preventLargerWebp: true,
	})

	useEffect(() => {
		loadSettings()
	}, [])

	const loadSettings = async () => {
		setIsLoading(true)
		try {
			const response = await fetch(
				`${window.HoatzinMediaSettings?.restUrl || '/wp-json/'}hoatzinmedia/v1/converter-settings`,
				{
					headers: {
						'X-WP-Nonce': window.HoatzinMediaSettings?.nonce || '',
					},
				}
			)
			if (response.ok) {
				const data = await response.json()
				setConvertSettings(data)
			}
		} catch (error) {
			console.error('Failed to load converter settings:', error)
		}
		setIsLoading(false)
	}

	const handleSettingsChange = (updatedSettings) => {
		setConvertSettings(updatedSettings)
	}

	const handleStartConversion = () => {
		console.log('Starting conversion with settings:', convertSettings)
	}

	return (
		<>
			<div className="hm-converter-module">
				{!hideBackupNotice && (
					<div className="hm-converter-backup-warning">
						<div className="hm-converter-backup-warning-text">
							<strong>Important:</strong> Take a full backup before running the
							conversion process. This can overwrite original image files.
						</div>
						<Button
							isSmall
							icon={close}
							label="Hide for 1 day"
							onClick={() => {
								setHideBackupNotice(true)
								try {
									const key = 'hm_converter_backup_notice_hide_until'
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

				{/* Format Controls */}
				<div className="hm-converter-controls">
					<div className="hm-format-selector">
						<label className="hm-control-label">Format</label>
						<select className="hm-format-dropdown">
							<option>WebP</option>
							<option>AVIF</option>
							<option>Both</option>
						</select>
					</div>
					<div className="hm-quality-slider-wrapper">
						<label className="hm-control-label">Quality 80</label>
						<input type="range" min="0" max="100" defaultValue="80" className="hm-quality-slider" />
					</div>
				</div>

				{/* Recent Library Images Header with Settings Icon */}
				<div className="hm-library-header">
					<h3 className="hm-library-title">Recent library images</h3>
					<div className="hm-library-header-right">
						<select className="hm-items-per-page-select">
							<option>20</option>
							<option>50</option>
							<option>100</option>
						</select>
					</div>
				</div>

				{/* Bulk Actions Bar */}
				<div className="hm-bulk-actions-bar">
					<div className="hm-bulk-left">
						<Button variant="secondary" isSmall>
							Bulk Action
						</Button>
					</div>
					<div className="hm-bulk-right">
						<Button variant="secondary" isSmall>
							Convert Selected
						</Button>
						<Button
							variant="secondary"
							isSmall
							icon={settings}
							label="Conversion settings"
							onClick={() => setShowSettings(true)}
							className="hm-converter-settings-icon-btn"
						/>
						<Button variant="primary" isSmall>
							Apply
						</Button>
					</div>
				</div>

				{/* Content Area */}
				{isLoading ? (
					<Flex justify="center" align="center" style={{ minHeight: '200px' }}>
						<FlexItem>
							<Spinner />
						</FlexItem>
					</Flex>
				) : (
					<div className="hm-converter-content">
						<Notice className="hm-converter-notice" isDismissible={false}>
							<Text>
								<strong>Current Configuration:</strong>
							</Text>
							<ul className="hm-converter-settings-list">
								<li>
									<strong>Scope:</strong>{' '}
									{convertSettings.scope === 'uploads'
										? 'Uploads and themes'
										: 'Uploads only'}
								</li>
								<li>
									<strong>Image Types:</strong>{' '}
									{convertSettings.imageTypes === 'both'
										? 'Both JPEGs and PNGs'
										: convertSettings.imageTypes === 'jpeg'
											? 'JPEGs only'
											: 'PNGs only'}
								</li>
								<li>
									<strong>Destination Folder:</strong>{' '}
									{convertSettings.destinationFolder === 'separate'
										? 'In separate folder'
										: 'Same folder'}
								</li>
								<li>
									<strong>File Extension:</strong>{' '}
									{convertSettings.fileExtension === 'append-webp'
										? 'Append ".webp"'
										: 'Replace with ".webp"'}
								</li>
								<li>
									<strong>Destination Structure:</strong>{' '}
									{convertSettings.destinationStructure === 'image-roots'
										? 'Image roots'
										: 'Mirror source structure'}
								</li>
							</ul>
						</Notice>
					</div>
				)}
			</div>

			{showSettings && (
				<ConverterSettingsPanel
					settings={convertSettings}
					onSettingsChange={handleSettingsChange}
					onClose={() => setShowSettings(false)}
				/>
			)}
		</>
	)
}
