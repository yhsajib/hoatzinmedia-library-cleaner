import { Button, Text } from '@wordpress/components'

export default function DuplicateFinderModule() {
	return (
		<div className="hm-module-actions">
			<Button variant="primary">
				Find duplicates
			</Button>
			<Text className="hm-module-hint">
				Upgrade to HoatzinMedia Pro to unlock advanced duplicate rules.
			</Text>
		</div>
	)
}

