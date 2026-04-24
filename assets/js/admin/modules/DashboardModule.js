import { Flex, FlexItem, Heading, Text } from '@wordpress/components'

export default function DashboardModule() {
	return (
		<Flex className="hm-dashboard-metrics" wrap>
			<FlexItem>
				<div className="hm-metric-card">
					<Heading level={4}>Health score</Heading>
					<Text className="hm-metric-value">82</Text>
					<Text className="hm-metric-caption">
						Based on unused ratio and file sizes
					</Text>
				</div>
			</FlexItem>
			<FlexItem>
				<div className="hm-metric-card">
					<Heading level={4}>Total files</Heading>
					<Text className="hm-metric-value">4328</Text>
					<Text className="hm-metric-caption">
						Attachments in the media library
					</Text>
				</div>
			</FlexItem>
			<FlexItem>
				<div className="hm-metric-card">
					<Heading level={4}>Estimated reclaimable</Heading>
					<Text className="hm-metric-value">3.2 GB</Text>
					<Text className="hm-metric-caption">
						Unused and duplicate files
					</Text>
				</div>
			</FlexItem>
		</Flex>
	)
}

