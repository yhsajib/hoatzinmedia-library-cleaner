<?php
namespace HoatzinMedia\Service;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Media_Health {

	public function calculate( $total_files, $unused_count, $total_size_bytes, $large_files_over_3mb ) {
		$total_files         = max( 0, (int) $total_files );
		$unused_count        = max( 0, (int) $unused_count );
		$total_size_bytes    = max( 0, (int) $total_size_bytes );
		$large_files_over_3mb = max( 0, (int) $large_files_over_3mb );

		$score = 100;

		if ( $total_files > 0 ) {
			$unused_ratio   = $unused_count / $total_files;
			$unused_percent = $unused_ratio * 100;
			$score         -= (int) floor( $unused_percent );
		}

		if ( $total_size_bytes > 0 ) {
			$points_storage = (int) floor( $total_size_bytes / ( 500 * 1024 * 1024 ) );
			$score         -= $points_storage;
		}

		if ( $large_files_over_3mb > 0 ) {
			$points_large_files = (int) floor( $large_files_over_3mb / 10 );
			$score             -= $points_large_files;
		}

		if ( $score < 0 ) {
			$score = 0;
		} elseif ( $score > 100 ) {
			$score = 100;
		}

		$status = $this->get_status_label( $score );

		return array(
			'score'  => (int) $score,
			'status' => $status,
		);
	}

	private function get_status_label( $score ) {
		$score = (int) $score;

		if ( $score >= 90 ) {
			return esc_html__( 'Excellent', 'hoatzinmedia-library-cleaner' );
		}

		if ( $score >= 75 ) {
			return esc_html__( 'Good', 'hoatzinmedia-library-cleaner' );
		}

		if ( $score >= 50 ) {
			return esc_html__( 'Needs optimization', 'hoatzinmedia-library-cleaner' );
		}

		return esc_html__( 'Critical', 'hoatzinmedia-library-cleaner' );
	}
}