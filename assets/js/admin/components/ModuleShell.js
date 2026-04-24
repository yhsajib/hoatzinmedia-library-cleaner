import {
	Card,
	CardHeader,
	CardBody,
	CardFooter,
	Flex,
	FlexItem,
	ToggleControl,
	Button,
	Text,
} from '@wordpress/components'

export default function ModuleShell({
	title,
	subtitle,
	isPro,
	moduleId,
	moduleState,
	onToggle,
	children,
}) {
	const enabled = moduleState && moduleState.enabled !== false

	return (
		<Card className="hm-module-card">
			<CardHeader>
				<Flex justify="space-between" align="center" wrap>
					<FlexItem>
						<div className="hm-module-title-row">
							<span className="hm-module-title">
								{title}
							</span>
							{isPro && (
								<span className="hm-badge-pro">PRO</span>
							)}
						</div>
						{subtitle && (
							<div className="hm-module-subtitle">
								{subtitle}
							</div>
						)}
					</FlexItem>
					<FlexItem>
						<div className="hm-module-toggle-wrap">
							<ToggleControl
								label={enabled ? 'Enabled' : 'Disabled'}
								checked={enabled}
								onChange={() => onToggle(moduleId)}
							/>
						</div>
					</FlexItem>
				</Flex>
			</CardHeader>
			<CardBody>
				{!enabled && (
					<div className="hm-module-disabled">
						<Text className="hm-module-disabled-title">
							Module disabled
						</Text>
						<Text className="hm-module-disabled-text">
							This module is currently disabled. Enable it to access its tools and settings.
						</Text>
						<Button
							variant="primary"
							onClick={() => onToggle(moduleId, true)}
						>
							Enable module
						</Button>
					</div>
				)}
				{enabled && <div className="hm-module-content">{children}</div>}
			</CardBody>
			<CardFooter>
				<Text className="hm-module-footer">
					{enabled ? 'Module is active' : 'Module is disabled'}
				</Text>
			</CardFooter>
		</Card>
	)
}

