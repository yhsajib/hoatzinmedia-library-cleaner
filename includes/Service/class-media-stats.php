<?php
namespace HoatzinMedia\Service;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Media_Stats {

	/**
	 * Get counts of media types.
	 *
	 * @return array
	 */
	public static function get_counts() {
		$counts = array(
			'image'    => 0,
			'video'    => 0,
			'audio'    => 0,
			'document' => 0,
			'total'    => 0,
		);

		$mime_types = array(
			'image'    => 'image',
			'video'    => 'video',
			'audio'    => 'audio',
			'document' => 'application', // loosely for docs, or use specific list
		);

		// Use wp_count_attachments() which is cached
		$stats = wp_count_attachments();
		
		// wp_count_attachments returns object with mime_types as properties
		// But it groups by specific mime type, not general type. 
		// Actually wp_count_attachments() returns mime types like 'image/jpeg' => count.
		
		// Let's use a more robust approach: WP_Query or SQL for general types if needed.
		// However, for performance, we should rely on object cache if possible.
		// wp_count_attachments() result: { "image/jpeg": 10, "application/pdf": 5 }
		
		foreach ( $stats as $mime_type => $count ) {
			$counts['total'] += $count;
			
			if ( strpos( $mime_type, 'image/' ) === 0 ) {
				$counts['image'] += $count;
			} elseif ( strpos( $mime_type, 'video/' ) === 0 ) {
				$counts['video'] += $count;
			} elseif ( strpos( $mime_type, 'audio/' ) === 0 ) {
				$counts['audio'] += $count;
			} else {
				// Fallback for documents and others
				$counts['document'] += $count;
			}
		}

		return $counts;
	}
}