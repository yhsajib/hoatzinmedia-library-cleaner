import { Button, TextControl, SelectControl, CheckboxControl, RangeControl } from '@wordpress/components'
import { useState } from '@wordpress/element'

export default function SettingsModule() {
	const [maxFileSize, setMaxFileSize] = useState('20')
	const [scanSchedule, setScanSchedule] = useState('weekly')
	const [enableWebpServing, setEnableWebpServing] = useState(false)
	const [webpQuality, setWebpQuality] = useState(80)

	return (
		<div className="hm-settings-grid">
			<TextControl
				label="Maximum recommended file size (MB)"
				type="number"
				value={maxFileSize}
				onChange={setMaxFileSize}
			/>
			<SelectControl
				label="Automatic scan schedule"
				value={scanSchedule}
				options={[
					{ label: 'Disabled', value: 'disabled' },
					{ label: 'Daily', value: 'daily' },
					{ label: 'Weekly', value: 'weekly' },
					{ label: 'Monthly', value: 'monthly' },
				]}
				onChange={setScanSchedule}
			/>
			<div className="hm-settings-section">
				<h3>WebP Serving Settings</h3>
				<CheckboxControl
					label="Enable automatic WebP serving"
					checked={enableWebpServing}
					onChange={setEnableWebpServing}
					help="Serve WebP images automatically to browsers that support them. This works like WebP Express plugin."
				/>
				{enableWebpServing && (
					<RangeControl
						label="WebP Quality"
						value={webpQuality}
						onChange={setWebpQuality}
						min={1}
						max={100}
						help="Quality for WebP conversions. Higher values mean better quality but larger files."
					/>
				)}
			</div>
			<Button variant="secondary">
				Save settings
			</Button>
		</div>
	)
}

