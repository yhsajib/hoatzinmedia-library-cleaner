import { Button, Text } from '@wordpress/components'

export default function UnusedMediaModule() {
	return (
		<div className="hm-module-actions">
			<Button variant="secondary">
				View unused files
			</Button>
			<Text className="hm-module-hint">
				Use the trash manager to restore or permanently delete files.
			</Text>
		</div>
	)
}

