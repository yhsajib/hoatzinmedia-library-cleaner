import { Button, Badge } from '@wordpress/components'
import {
	Icon,
	dashboard,
	search,
	image,
	plugins,
	settings,
	lock,
} from '@wordpress/icons'

const TAB_ICONS = {
	dashboard,
	search,
	image,
	plugins,
	settings,
}

export default function Tabs({ items, activeId, onChange }) {
	return (
		<div className="hm-tabs-bar">
			{items.map((item) => {
				const isActive = item.id === activeId
				const enabled = item.enabled !== false
				const iconComponent = TAB_ICONS[item.icon] || null

				return (
					<Button
						key={item.id}
						variant={isActive ? 'primary' : 'tertiary'}
						onClick={() => onChange(item.id)}
						className={
							'hm-tab-button' +
							(isActive ? ' hm-tab-button-active' : '')
						}
					>
						<div className="hm-tab-inner">
							<div className="hm-tab-label-row">
								{iconComponent && (
									<Icon
										icon={iconComponent}
										className="hm-tab-icon"
									/>
								)}
								<span className="hm-tab-title">
									{item.title}
								</span>
								{item.isPro && (
									<Badge className="hm-tab-badge-pro">
										PRO
									</Badge>
								)}
								{!enabled && (
									<span className="hm-tab-dot-disabled" />
								)}
							</div>
							{!enabled && (
								<span className="hm-tab-lock-wrap">
									<Icon
										icon={lock}
										className="hm-tab-lock"
									/>
								</span>
							)}
						</div>
					</Button>
				)
			})}
		</div>
	)
}

