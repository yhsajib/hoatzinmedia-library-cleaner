import { Button, Text } from '@wordpress/components'

export default function StorageOptimizerModule() {
	return (
		<div className="hm-module-actions">
			<Button variant="primary">
				Open optimizer
			</Button>
			<Text className="hm-module-hint">
				Pro-only automation and scheduling for storage optimization.
			</Text>
		</div>
	)
}

