import DashboardModule from './modules/DashboardModule'
import SmartScanModule from './modules/SmartScanModule'
import DuplicateFinderModule from './modules/DuplicateFinderModule'
import StorageOptimizerModule from './modules/StorageOptimizerModule'
import SettingsModule from './modules/SettingsModule'
import RegenerateThumbnailsModule from './modules/RegenerateThumbnailsModule'
import ImageFormatConverterModule from './modules/ImageFormatConverterModule'

const modulesConfig = [
	{
		id: 'dashboard',
		title: 'Dashboard',
		isPro: false,
		enabled: true,
		icon: 'dashboard',
		Component: DashboardModule,
	},
	{
		id: 'smartScan',
		title: 'Smart Scan & Unused Media',
		isPro: false,
		enabled: true,
		icon: 'search',
		Component: SmartScanModule,
	},
	{
		id: 'duplicateFinder',
		title: 'Duplicate Finder',
		isPro: true,
		enabled: false,
		icon: 'plugins',
		Component: DuplicateFinderModule,
	},
	{
		id: 'storageOptimizer',
		title: 'Storage Optimizer',
		isPro: true,
		enabled: false,
		icon: 'plugins',
		Component: StorageOptimizerModule,
	},
	{
		id: 'regenerate',
		title: 'Regenerate Thumbnails',
		isPro: false,
		enabled: true,
		icon: 'plugins',
		Component: RegenerateThumbnailsModule,
	},
	{
		id: 'imageConverter',
		title: 'Convert to WebP / AVIF',
		isPro: false,
		enabled: true,
		icon: 'format-image',
		Component: ImageFormatConverterModule,
	},
	{
		id: 'settings',
		title: 'Modules',
		isPro: false,
		enabled: true,
		icon: 'settings',
		Component: SettingsModule,
	},
]

export default modulesConfig
