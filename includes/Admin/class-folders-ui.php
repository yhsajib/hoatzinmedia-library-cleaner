<?php

namespace HoatzinMedia\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Folders_UI {

	/**
	 * @var Folders_UI
	 */
	private static $instance;

	/**
	 * Get singleton instance.
	 *
	 * @return Folders_UI
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
	}

	/**
	 * Enqueue folder UI assets on upload.php.
	 *
	 * @param string $hook
	 */
	public function enqueue_scripts( $hook ) {
		if ( 'upload.php' !== $hook && 'media-new.php' !== $hook ) {
			return;
		}

		wp_enqueue_media();

		$js_path    = HOATZINMEDIA_PLUGIN_DIR . 'assets/js/media-folders-ui.js';
		$version    = HOATZINMEDIA_VERSION;
		if ( file_exists( $js_path ) ) {
			$version = (string) filemtime( $js_path );
		}

		wp_enqueue_script(
			'hoatzinmedia-media-folders-ui',
			HOATZINMEDIA_PLUGIN_URL . 'assets/js/media-folders-ui.js',
			array( 'jquery', 'wp-element', 'wp-api-fetch' ),
			$version,
			true
		);

		wp_localize_script(
			'hoatzinmedia-media-folders-ui',
			'hoatzinMediaFoldersData',
			array(
				'restBase' => esc_url_raw( rest_url( 'hoatzinmedia/v1' ) ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'i18n'     => array(
					'allMedia'       => __( 'All Files', 'hoatzinmedia-library-cleaner' ),
					'uncategorized'  => __( 'Uncategorized', 'hoatzinmedia-library-cleaner' ),
					'addFolder'      => __( 'New Folder', 'hoatzinmedia-library-cleaner' ),
					'renameFolder'   => __( 'Rename', 'hoatzinmedia-library-cleaner' ),
					'deleteFolder'   => __( 'Delete', 'hoatzinmedia-library-cleaner' ),
					'folders'        => __( 'Virtual Folders', 'hoatzinmedia-library-cleaner' ),
					'folderName'     => __( 'Folder Name', 'hoatzinmedia-library-cleaner' ),
					'confirmDelete'  => __( 'Are you sure you want to delete this folder? (Media files will NOT be deleted off disk).', 'hoatzinmedia-library-cleaner' ),
				),
			)
		);
	}
}
