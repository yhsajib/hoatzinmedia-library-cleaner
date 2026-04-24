<?php

namespace HoatzinMedia;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Plugin {

	/**
	 * @var Plugin
	 */
	private static $instance;

	/**
	 * Plugin constructor.
	 */
	private function __construct() {
		$this->register_hooks();
	}

	/**
	 * Get singleton instance.
	 *
	 * @return Plugin
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Register core hooks.
	 */
	private function register_hooks() {
		add_action( 'admin_init', array( $this, 'ensure_capabilities' ) );

		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Service/class-media-health.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Service/class-media-stats.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Service/class-scanner.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Service/class-scheduler.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Service/class-converter.php';	
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Service/class-webp-server.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Service/class-svg-support.php';
		Service\Scheduler::get_instance();
		Service\Svg_Support::get_instance();
		

		add_action(
			'save_post',
			function ( $post_id, $post, $update ) {
				$post_id = (int) $post_id;
				if ( $post_id <= 0 ) {
					return;
				}
				if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
					return;
				}
				if ( ! $post || ! is_object( $post ) ) {
					return;
				}
				if ( isset( $post->post_type ) && in_array( (string) $post->post_type, array( 'revision', 'attachment' ), true ) ) {
					return;
				}
				$ver = (int) get_option( 'hoatzinmedia_cache_ver', 1 );
				update_option( 'hoatzinmedia_cache_ver', $ver + 1, false );
			},
			10,
			3
		);

		add_action(
			'init',
			function () {
				$defaults = array(
					'maxFileSize'         => '2',
					'scanSchedule'        => 'daily',
					'enableImageExtLabel' => true,
					'autoConvertUploads'  => 'webp',
					'enableMediaUsageButton' => true,
					'unusedMediaAgeDays'  => 7,
					'enableWebpServing'   => true,
					'webpQuality'         => 80,
					'enableSvgUploads'    => false,
				);
				$settings = get_option( 'hoatzinmedia_settings', $defaults );
				if ( ! is_array( $settings ) ) {
					$settings = $defaults;
				}
				$frequency = isset( $settings['scanSchedule'] ) ? $settings['scanSchedule'] : 'manual';
				Service\Scheduler::get_instance()->ensure_schedule( $frequency );
				if ( class_exists( 'HoatzinMedia\\Service\\WebP_Server' ) ) {
					Service\WebP_Server::get_instance()->maybe_update_htaccess();
				}
			}
		);

		add_action(
			'add_attachment',
			function ( $post_id ) {
				$post_id = (int) $post_id;
				if ( $post_id <= 0 ) {
					return;
				}
				$mime = get_post_mime_type( $post_id );
				if ( ! in_array( $mime, array( 'image/jpeg', 'image/png' ), true ) ) {
					return;
				}
				$defaults = array(
					'maxFileSize'         => '2',
					'scanSchedule'        => 'daily',
					'enableImageExtLabel' => true,
					'autoConvertUploads'  => 'webp',
					'enableMediaUsageButton' => true,
					'unusedMediaAgeDays'  => 7,
					'enableWebpServing'   => true,
					'webpQuality'         => 80,
					'enableSvgUploads'    => false,
				);
				$settings = get_option( 'hoatzinmedia_settings', $defaults );
				if ( ! is_array( $settings ) ) {
					$settings = $defaults;
				}
				$format = isset( $settings['autoConvertUploads'] ) ? $settings['autoConvertUploads'] : 'disabled';
				if ( $format === 'webp' || $format === 'avif' ) {
					$result = Service\Converter::get_instance()->convert_attachment( $post_id, $format );
					if ( is_wp_error( $result ) ) {
						return;
					}
				}
			}
		);

		add_action(
			'delete_attachment',
			function ( $post_id ) {
				$post_id = (int) $post_id;
				if ( $post_id <= 0 ) {
					return;
				}
				if ( class_exists( 'HoatzinMedia\\Service\\Converter' ) ) {
					Service\Converter::get_instance()->delete_converted_variants( $post_id );
				}
			}
		);

		if ( is_admin() ) {
			$this->init_admin();
		}

		$this->init_rest();
	}

	

	/**
	 * Ensure capabilities exist.
	 */
	public function ensure_capabilities() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
	}

	/**
	 * Initialize admin functionality.
	 */
	private function init_admin() {
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Admin/class-admin.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Admin/class-media-library-ui.php';
		Admin\Admin::get_instance();
		Admin\Media_Library_UI::get_instance();
	}

	/**
	 * Initialize REST API functionality.
	 */
	private function init_rest() {
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-rest-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-dashboard-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-scan-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-large-files-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-unused-results-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-modules-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-duplicates-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-image-formats-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-settings-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-converter-settings-controller.php';
		require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Rest/class-regenerate-controller.php';
		Rest\Rest_Controller::get_instance();
		Rest\Dashboard_Controller::get_instance();
		Rest\Scan_Controller::get_instance();
		Rest\Large_Files_Controller::get_instance();
		Rest\Unused_Results_Controller::get_instance();
		Rest\Modules_Controller::get_instance();
		Rest\Duplicates_Controller::get_instance();
		Rest\Image_Formats_Controller::get_instance();
		Rest\Settings_Controller::get_instance();
		Rest\Converter_Settings_Controller::get_instance();
		Rest\Regenerate_Controller::get_instance();
	}
}
