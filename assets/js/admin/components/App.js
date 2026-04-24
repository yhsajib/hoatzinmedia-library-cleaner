import {
	useState,
	useEffect,
	Suspense,
	lazy,
} from '@wordpress/element'
import {
	Spinner,
	Flex,
	FlexItem,
	Heading,
	Text,
	Notice,
} from '@wordpress/components'
import Tabs from './Tabs'
import ModuleShell from './ModuleShell'
import modulesConfig from '../modulesConfig'
import { useModules } from '../hooks/useModules'

const LazyDuplicateFinderModule = lazy(() =>
	import('../modules/DuplicateFinderModule')
)
const LazyStorageOptimizerModule = lazy(() =>
	import('../modules/StorageOptimizerModule')
)
const LazyImageFormatConverterModule = lazy(() =>
	import('../modules/ImageFormatConverterModule')
)

function resolveComponent(config) {
	if (config.id === 'duplicateFinder') {
		return LazyDuplicateFinderModule
	}
	if (config.id === 'storageOptimizer') {
		return LazyStorageOptimizerModule
	}
	if (config.id === 'imageConverter') {
		return LazyImageFormatConverterModule
	}
	return config.Component
}

export default function App() {
	const { modules, isLoading, isSaving, saveSuccess, error, toggleModule } =
		useModules()

	const TAB_STORAGE_KEY = 'hoatzinmedia_active_tab'
	const TAB_QUERY_PARAM = 'hm_tab'

	function mapLegacyModuleSlugToTabId(moduleSlug) {
		if (!moduleSlug || typeof moduleSlug !== 'string') {
			return 'dashboard'
		}
		if (moduleSlug === 'smart_scan' || moduleSlug === 'unused_media') {
			return 'smartScan'
		}
		if (moduleSlug === 'duplicates') {
			return 'duplicateFinder'
		}
		if (moduleSlug === 'image_formats') {
			return 'imageConverter'
		}
		if (moduleSlug === 'regenerate') {
			return 'regenerate'
		}
		if (moduleSlug === 'large_files') {
			return 'storageOptimizer'
		}
		if (moduleSlug === 'settings' || moduleSlug === 'general_settings') {
			return 'settings'
		}
		return 'dashboard'
	}

	const initialModuleId = (() => {
		if (typeof window === 'undefined') {
			return 'dashboard'
		}

		const validIds = modulesConfig.map((c) => c.id)
		const url = new URL(window.location.href)
		const fromQuery = url.searchParams.get(TAB_QUERY_PARAM)
		if (fromQuery && validIds.includes(fromQuery)) {
			return fromQuery
		}

		const settings = window.HoatzinMediaSettings || {}
		const moduleSlug = settings.module || 'dashboard'

		const mapped = mapLegacyModuleSlugToTabId(moduleSlug)
		if (mapped && validIds.includes(mapped)) {
			return mapped
		}

		if (window.localStorage) {
			const fromStorage = window.localStorage.getItem(TAB_STORAGE_KEY)
			if (fromStorage && validIds.includes(fromStorage)) {
				return fromStorage
			}
		}

		return 'dashboard'
	})()

	const [activeModuleId, setActiveModuleId] = useState(initialModuleId)

	useEffect(() => {
		if (typeof window === 'undefined') {
			return
		}

		if (window.localStorage) {
			window.localStorage.setItem(TAB_STORAGE_KEY, activeModuleId)
		}

		const url = new URL(window.location.href)
		url.searchParams.set(TAB_QUERY_PARAM, activeModuleId)
		window.history.replaceState({}, '', url.toString())
	}, [activeModuleId])

	const tabs = modulesConfig.map((config) => {
		const state = modules[config.id] || {}
		const enabled =
			typeof state.enabled === 'boolean'
				? state.enabled
				: config.enabled !== false

		return {
			id: config.id,
			title: config.title,
			isPro: config.isPro,
			icon: config.icon,
			enabled,
		}
	})

	const activeConfig =
		modulesConfig.find((c) => c.id === activeModuleId) ||
		modulesConfig[0]
	const ActiveComponent = resolveComponent(activeConfig)
	const activeState = modules[activeConfig.id] || {}

	const headerStateLabel = isSaving
		? 'Saving module state…'
		: isLoading
		? 'Loading modules…'
		: 'All changes saved'

	return (
		<div className="hm-admin-shell">
			<header className="hm-admin-header">
				<Flex justify="space-between" align="center" wrap>
					<FlexItem>
						<div className="hm-logo">
							<img
								src={(window.HoatzinMediaSettings && window.HoatzinMediaSettings.logoUrl) || ''}
								alt="HoatzinMedia"
								className="hm-logo-img"
							/>
						</div>
						<Heading level={2}>
							HoatzinMedia – Smart Media Cleaner &amp; Storage Optimizer
						</Heading>
						<Text className="hm-header-subtitle">
							Modular tools for keeping your media library fast, lean, and safe.
						</Text>
					</FlexItem>
					<FlexItem>
						<div className="hm-header-status">
							<span className="hm-status-dot" />
							<span className="hm-status-label">
								{headerStateLabel}
							</span>
						</div>
					</FlexItem>
				</Flex>
			</header>

			<main className="hm-admin-main">
				<Tabs
					items={tabs}
					activeId={activeModuleId}
					onChange={setActiveModuleId}
				/>

				<div className="hm-module-layout">
					{isLoading && (
						<Notice status="info" isDismissible={false}>
							Loading module configuration from WordPress options.
						</Notice>
					)}
					{error && (
						<Notice status="error" isDismissible={false}>
							Failed to load or save modules.
						</Notice>
					)}
					{saveSuccess && !isSaving && (
						<Notice status="success" isDismissible={false}>
							Module settings updated.
						</Notice>
					)}

					<Suspense
						fallback={
							<div className="hm-module-loading">
								<Spinner />
								<Text>Loading module…</Text>
							</div>
						}
					>
						<div className="hm-module-transition">
							<div
								key={activeConfig.id}
								className="hm-module-panel"
							>
								<ModuleShell
									title={activeConfig.title}
									subtitle={
										activeConfig.id === 'dashboard'
											? 'Overview of media health and storage'
											: null
									}
									isPro={activeConfig.isPro}
									moduleId={activeConfig.id}
									moduleState={activeState}
									onToggle={toggleModule}
								>
									<ActiveComponent
										moduleId={activeConfig.id}
										moduleState={activeState}
										onToggle={toggleModule}
									/>
								</ModuleShell>
							</div>
						</div>
					</Suspense>
				</div>
			</main>
		</div>
	)
}
