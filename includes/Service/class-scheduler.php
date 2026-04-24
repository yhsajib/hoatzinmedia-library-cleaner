<?php
namespace HoatzinMedia\Service;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Scheduler {

	/**
	 * @var Scheduler
	 */
	private static $instance;

	/**
	 * Get singleton instance.
	 *
	 * @return Scheduler
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function __construct() {
		add_filter( 'cron_schedules', array( $this, 'add_cron_intervals' ) );
		add_action( 'hoatzinmedia_scheduled_scan', array( $this, 'run_scan' ) );
	}

	public function run_scan() {
		Scanner::get_instance()->run_full_scan();
	}

	public function schedule_scan( $frequency ) {
		$hook = 'hoatzinmedia_scheduled_scan';

		// Clear existing schedule
		wp_clear_scheduled_hook( $hook );

		if ( 'manual' === $frequency || empty( $frequency ) ) {
			return;
		}

		if ( ! in_array( $frequency, array( 'every3hours', 'daily', 'weekly', 'monthly' ), true ) ) {
			return;
		}

		if ( 'every3hours' === $frequency ) {
			$time = time() + 10 * MINUTE_IN_SECONDS;
		} else {
			$time = strtotime( 'tomorrow midnight' );
		}

		wp_schedule_event( $time, $frequency, $hook );
	}

	public function ensure_schedule( $frequency ) {
		$hook = 'hoatzinmedia_scheduled_scan';

		if ( 'manual' === $frequency || empty( $frequency ) ) {
			// Ensure nothing scheduled
			wp_clear_scheduled_hook( $hook );
			return;
		}

		if ( ! in_array( $frequency, array( 'every3hours', 'daily', 'weekly', 'monthly' ), true ) ) {
			wp_clear_scheduled_hook( $hook );
			return;
		}

		$next = wp_next_scheduled( $hook );
		if ( ! $next ) {
			$this->schedule_scan( $frequency );
		}
	}

	public function add_cron_intervals( $schedules ) {
		if ( ! isset( $schedules['every3hours'] ) ) {
			$schedules['every3hours'] = array(
				'interval' => 3 * HOUR_IN_SECONDS,
				'display'  => __( 'Every 3 Hours', 'hoatzinmedia-library-cleaner' ),
			);
		}

		if ( ! isset( $schedules['weekly'] ) ) {
			$schedules['weekly'] = array(
				'interval' => WEEK_IN_SECONDS,
				'display'  => __( 'Once Weekly', 'hoatzinmedia-library-cleaner' ),
			);
		}

		if ( ! isset( $schedules['monthly'] ) ) {
			$schedules['monthly'] = array(
				'interval' => 30 * DAY_IN_SECONDS,
				'display'  => __( 'Once Monthly', 'hoatzinmedia-library-cleaner' ),
			);
		}

		return $schedules;
	}
}