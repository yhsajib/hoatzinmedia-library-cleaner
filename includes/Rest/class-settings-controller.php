<?php

namespace HoatzinMedia\Rest;

use HoatzinMedia\Service\Scheduler;
use HoatzinMedia\Service\WebP_Server;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Settings_Controller {

	/**
	 * @var Settings_Controller
	 */
	private static $instance;

	private function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Get singleton instance.
	 *
	 * @return Settings_Controller
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	public function register_routes() {
		register_rest_route(
			'hoatzinmedia/v1',
			'/settings',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'get_settings' ),
					'permission_callback' => array( $this, 'permissions_check' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'update_settings' ),
					'permission_callback' => array( $this, 'permissions_check' ),
					'args'                => array(
						'settings' => array(
							'required'          => true,
							'validate_callback' => function ( $value ) {
								return is_array( $value );
							},
						),
					),
				),
			)
		);
	}

	public function permissions_check( $request ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'hoatzinmedia_forbidden',
				esc_html__( 'You are not allowed to perform this action.', 'hoatzinmedia-library-cleaner' ),
				array(
					'status' => rest_authorization_required_code(),
				)
			);
		}

		$nonce = $request->get_header( 'X-WP-Nonce' );

		if ( ! $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new \WP_Error(
				'hoatzinmedia_invalid_nonce',
				esc_html__( 'Invalid security token.', 'hoatzinmedia-library-cleaner' ),
				array(
					'status' => rest_authorization_required_code(),
				)
			);
		}

		return true;
	}

	public function get_settings() {
		$defaults = array(
			'maxFileSize'        => '2',
			'scanSchedule'       => 'daily',
			'enableImageExtLabel' => true,
			'autoConvertUploads' => 'webp',
			'enableMediaUsageButton' => true,
			'itemsPerPage'       => 10,
			'unusedMediaAgeDays' => 7,
			'enableWebpServing'  => true,
			'webpQuality'        => 80,
			'enableSvgUploads'   => false,
		);

		$settings = get_option( 'hoatzinmedia_settings', $defaults );

		if ( ! is_array( $settings ) ) {
			$settings = $defaults;
		}

		$settings = wp_parse_args( $settings, $defaults );

		return new \WP_REST_Response(
			array(
				'settings' => $settings,
			)
		);
	}

	public function update_settings( $request ) {
		$new_settings = $request->get_param( 'settings' );
		
		$defaults = array(
			'maxFileSize'        => '2',
			'scanSchedule'       => 'daily',
			'enableImageExtLabel' => true,
			'autoConvertUploads' => 'webp',
			'enableMediaUsageButton' => true,
			'itemsPerPage'       => 10,
			'unusedMediaAgeDays' => 7,
			'enableWebpServing'  => true,
			'webpQuality'        => 80,
			'enableSvgUploads'   => false,
		);

		$current_settings = get_option( 'hoatzinmedia_settings', $defaults );
		if ( ! is_array( $current_settings ) ) {
			$current_settings = $defaults;
		}

		// Sanitize and merge
		if ( isset( $new_settings['maxFileSize'] ) ) {
			$current_settings['maxFileSize'] = sanitize_text_field( $new_settings['maxFileSize'] );
		}
		
		$schedule_changed = false;
		if ( isset( $new_settings['scanSchedule'] ) ) {
			$new_schedule = sanitize_text_field( $new_settings['scanSchedule'] );
			if ( in_array( $new_schedule, array( 'manual', 'every3hours', 'daily', 'weekly', 'monthly' ), true ) ) {
				if ( $new_schedule !== $current_settings['scanSchedule'] ) {
					$current_settings['scanSchedule'] = $new_schedule;
					$schedule_changed = true;
				}
			}
		}

		if ( isset( $new_settings['enableImageExtLabel'] ) ) {
			$current_settings['enableImageExtLabel'] = (bool) $new_settings['enableImageExtLabel'];
		}
		
		if ( isset( $new_settings['autoConvertUploads'] ) ) {
			$val = sanitize_text_field( $new_settings['autoConvertUploads'] );
			if ( in_array( $val, array( 'disabled', 'webp', 'avif' ), true ) ) {
				$current_settings['autoConvertUploads'] = $val;
			}
		}

		if ( isset( $new_settings['enableMediaUsageButton'] ) ) {
			$current_settings['enableMediaUsageButton'] = (bool) $new_settings['enableMediaUsageButton'];
		}

		if ( isset( $new_settings['itemsPerPage'] ) ) {
			$val = (int) $new_settings['itemsPerPage'];
			if ( $val > 0 && $val <= 200 ) {
				$current_settings['itemsPerPage'] = $val;
			}
		}

		if ( isset( $new_settings['unusedMediaAgeDays'] ) ) {
			$val = (int) $new_settings['unusedMediaAgeDays'];
			if ( $val >= 0 && $val <= 3650 ) {
				$current_settings['unusedMediaAgeDays'] = $val;
			}
		}

		if ( isset( $new_settings['enableWebpServing'] ) ) {
			$current_settings['enableWebpServing'] = (bool) $new_settings['enableWebpServing'];
		}

		if ( isset( $new_settings['webpQuality'] ) ) {
			$val = (int) $new_settings['webpQuality'];
			if ( $val >= 1 && $val <= 100 ) {
				$current_settings['webpQuality'] = $val;
			}
		}

		if ( isset( $new_settings['enableSvgUploads'] ) ) {
			$current_settings['enableSvgUploads'] = (bool) $new_settings['enableSvgUploads'];
		}

		update_option( 'hoatzinmedia_settings', $current_settings );

		if ( $schedule_changed ) {
			Scheduler::get_instance()->schedule_scan( $current_settings['scanSchedule'] );
		}

		if ( class_exists( 'HoatzinMedia\\Service\\WebP_Server' ) ) {
			WebP_Server::get_instance()->maybe_update_htaccess();
		}

		return new \WP_REST_Response(
			array(
				'success'  => true,
				'settings' => $current_settings,
			)
		);
	}
}
