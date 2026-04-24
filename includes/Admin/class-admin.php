<?php

namespace HoatzinMedia\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Admin {

	/**
	 * @var Admin
	 */
	private static $instance;

	private function __construct() {
		$this->register_hooks();
	}

	/**
	 * Get singleton instance.
	 *
	 * @return Admin
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function register_hooks() {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'admin_init', array( $this, 'register_media_settings_section' ) );
		add_action( 'admin_init', array( $this, 'redirect_legacy_media_pages' ) );
		add_filter( 'parent_file', array( $this, 'filter_parent_file' ) );
		add_filter( 'submenu_file', array( $this, 'filter_submenu_file' ), 10, 2 );
		add_filter( 'plugin_action_links_' . plugin_basename( HOATZINMEDIA_PLUGIN_FILE ), array( $this, 'add_plugin_action_links' ) );
	}

	private function get_admin_page_slug() {
		$page = filter_input( INPUT_GET, 'page', FILTER_SANITIZE_FULL_SPECIAL_CHARS );
		if ( ! is_string( $page ) ) {
			$page = '';
		}
		$page = sanitize_key( wp_unslash( $page ) );
		return $page;
	}

	private function is_hoatzinmedia_admin_page() {
		$page = $this->get_admin_page_slug();
		return $page && strpos( $page, 'hoatzinmedia' ) === 0;
	}

	public function filter_parent_file( $parent_file ) {
		if ( $this->is_hoatzinmedia_admin_page() ) {
			return 'hoatzinmedia';
		}

		return $parent_file;
	}

	public function filter_submenu_file( $submenu_file, $parent_file ) {
		if ( $this->is_hoatzinmedia_admin_page() ) {
			$page = $this->get_admin_page_slug();
			return $page ? $page : 'hoatzinmedia';
		}

		return $submenu_file;
	}

	/**
	 * Add settings link to plugin action links.
	 *
	 * @param array $links Plugin action links.
	 * @return array Modified plugin action links.
	 */
	public function add_plugin_action_links( $links ) {
		$settings_link = '<a href="' . esc_url( admin_url( 'admin.php?page=hoatzinmedia' ) ) . '">' . esc_html__( 'Settings', 'hoatzinmedia-library-cleaner' ) . '</a>';
		array_unshift( $links, $settings_link );
		return $links;
	}

	public function redirect_legacy_media_pages() {
		if ( ! is_admin() ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		global $pagenow;
		$page = $this->get_admin_page_slug();

		if ( 'upload.php' !== $pagenow || '' === $page ) {
			return;
		}

		if ( strpos( $page, 'hoatzinmedia' ) !== 0 ) {
			return;
		}

		wp_safe_redirect( admin_url( 'admin.php?page=' . $page ) );
		exit;
	}

	public function register_menu() {
		$modules_option     = get_option( 'hoatzinmedia_modules', array() );
		$smart_scan_enabled = true;
		$large_files_enabled = true;
		if ( is_array( $modules_option ) ) {
			if ( isset( $modules_option['smart_scan'] ) && is_array( $modules_option['smart_scan'] ) ) {
				$smart_scan_enabled = isset( $modules_option['smart_scan']['enabled'] ) ? (bool) $modules_option['smart_scan']['enabled'] : true;
			}
			if ( isset( $modules_option['large_files'] ) && is_array( $modules_option['large_files'] ) ) {
				$large_files_enabled = isset( $modules_option['large_files']['enabled'] ) ? (bool) $modules_option['large_files']['enabled'] : true;
			}
			$duplicates_enabled   = true;
			$image_formats_enabled = true;
			$regenerate_enabled    = true;
			if ( isset( $modules_option['duplicates'] ) && is_array( $modules_option['duplicates'] ) ) {
				$duplicates_enabled = isset( $modules_option['duplicates']['enabled'] ) ? (bool) $modules_option['duplicates']['enabled'] : true;
			}
			if ( isset( $modules_option['image_formats'] ) && is_array( $modules_option['image_formats'] ) ) {
				$image_formats_enabled = isset( $modules_option['image_formats']['enabled'] ) ? (bool) $modules_option['image_formats']['enabled'] : true;
			}
			if ( isset( $modules_option['regenerate'] ) && is_array( $modules_option['regenerate'] ) ) {
				$regenerate_enabled = isset( $modules_option['regenerate']['enabled'] ) ? (bool) $modules_option['regenerate']['enabled'] : true;
			}
		}
		$icon_url = trailingslashit( HOATZINMEDIA_PLUGIN_URL ) . 'assets/img/hm-iconfav.png';
		add_menu_page(
			__( 'HoatzinMedia', 'hoatzinmedia-library-cleaner' ),
			__( 'HoatzinMedia', 'hoatzinmedia-library-cleaner' ),
			'manage_options',
			'hoatzinmedia',
			array( $this, 'render_app' ),
			$icon_url,
			18
		);

		if ( $smart_scan_enabled ) {
			add_submenu_page(
				'hoatzinmedia',
				__( 'Smart Scan & Unused Media', 'hoatzinmedia-library-cleaner' ),
				__( 'Smart Scan & Unused Media', 'hoatzinmedia-library-cleaner' ),
				'manage_options',
				'hoatzinmedia-smart-scan',
				array( $this, 'render_app' )
			);
		}

		if ( $large_files_enabled ) {
			add_submenu_page(
				'hoatzinmedia',
				__( 'Large Files', 'hoatzinmedia-library-cleaner' ),
				__( 'Large Files', 'hoatzinmedia-library-cleaner' ),
				'manage_options',
				'hoatzinmedia-large-files',
				array( $this, 'render_app' )
			);
		}

		if ( $duplicates_enabled ) {
			add_submenu_page(
				'hoatzinmedia',
				__( 'Duplicate Checker', 'hoatzinmedia-library-cleaner' ),
				__( 'Duplicate Checker', 'hoatzinmedia-library-cleaner' ),
				'manage_options',
				'hoatzinmedia-duplicates',
				array( $this, 'render_app' )
			);
		}

		if ( $image_formats_enabled ) {
			add_submenu_page(
				'hoatzinmedia',
				__( 'Convert (WebP / AVIF)', 'hoatzinmedia-library-cleaner' ),
				__( 'Convert (WebP / AVIF)', 'hoatzinmedia-library-cleaner' ),
				'manage_options',
				'hoatzinmedia-image-formats',
				array( $this, 'render_app' )
			);
		}

		if ( $regenerate_enabled ) {
			add_submenu_page(
				'hoatzinmedia',
				__( 'Regenerate Thumbnails', 'hoatzinmedia-library-cleaner' ),
				__( 'Regenerate Thumbnails', 'hoatzinmedia-library-cleaner' ),
				'manage_options',
				'hoatzinmedia-regenerate',
				array( $this, 'render_app' )
			);
		}

		

		add_submenu_page(
			'hoatzinmedia',
			__( 'Settings', 'hoatzinmedia-library-cleaner' ),
			__( 'Settings', 'hoatzinmedia-library-cleaner' ),
			'manage_options',
			'hoatzinmedia-general-settings',
			array( $this, 'render_app' )
		);

		add_submenu_page(
			'hoatzinmedia',
			__( 'Modules', 'hoatzinmedia-library-cleaner' ),
			__( 'Modules', 'hoatzinmedia-library-cleaner' ),
			'manage_options',
			'hoatzinmedia-settings',
			array( $this, 'render_app' )
		);
	}

	public function enqueue_assets( $hook_suffix ) {
		if ( strpos( $hook_suffix, 'hoatzinmedia' ) === false ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$handle       = 'hoatzinmedia-admin';
		$style_handle = 'hoatzinmedia-admin';

		$style_file = 'assets/css/admin.css';
		if ( ! file_exists( HOATZINMEDIA_PLUGIN_DIR . $style_file ) ) {
			$style_file = 'assets/css/admin.min.css';
		}

		$base_url = trailingslashit( HOATZINMEDIA_PLUGIN_URL );
		$style_version = HOATZINMEDIA_VERSION;
		$style_path    = HOATZINMEDIA_PLUGIN_DIR . $style_file;
		if ( file_exists( $style_path ) ) {
			$style_version = (string) filemtime( $style_path );
		}
		wp_register_style(
			$style_handle,
			$base_url . $style_file,
			array(),
			$style_version
		);

		wp_enqueue_style( $style_handle );

		// Removed external CDN registration to comply with WordPress.org guidelines.

		$script_file = 'assets/js/admin.js';
		if ( ! file_exists( HOATZINMEDIA_PLUGIN_DIR . $script_file ) ) {
			$script_file = 'assets/js/admin.min.js';
		}

		$script_version = HOATZINMEDIA_VERSION;
		$script_path    = HOATZINMEDIA_PLUGIN_DIR . $script_file;
		if ( file_exists( $script_path ) ) {
			$script_version = (string) filemtime( $script_path );
		}
		wp_register_script(
			$handle,
			$base_url . $script_file,
			array( 'wp-element', 'wp-i18n', 'wp-api-fetch' ),
			$script_version,
			true
		);

		if ( function_exists( 'wp_set_script_translations' ) ) {
			wp_set_script_translations( $handle, 'hoatzinmedia-library-cleaner', HOATZINMEDIA_PLUGIN_DIR . 'languages' );
		}

		$module = 'dashboard';
		$page   = $this->get_admin_page_slug();

		if ( 'hoatzinmedia-smart-scan' === $page ) {
			$module = 'smart_scan';
		} elseif ( 'hoatzinmedia-unused-media' === $page ) {
			$module = 'unused_media';
		} elseif ( 'hoatzinmedia-large-files' === $page ) {
			$module = 'large_files';
		} elseif ( 'hoatzinmedia-duplicates' === $page ) {
			$module = 'duplicates';
		} elseif ( 'hoatzinmedia-image-formats' === $page ) {
			$module = 'image_formats';
		} elseif ( 'hoatzinmedia-regenerate' === $page ) {
			$module = 'regenerate';
		} elseif ( 'hoatzinmedia-general-settings' === $page ) {
			$module = 'general_settings';
		} elseif ( 'hoatzinmedia-settings' === $page ) {
			$module = 'settings';
		}

		$settings = get_option('hoatzinmedia_settings', array());
		$items_per_page = isset($settings['itemsPerPage']) ? (int) $settings['itemsPerPage'] : 10;
		$modules_option = get_option( 'hoatzinmedia_modules', array() );
		if ( ! is_array( $modules_option ) ) {
			$modules_option = array();
		}

		$rest_nonce = wp_create_nonce( 'wp_rest' );

		wp_localize_script(
			$handle,
			'HoatzinMediaSettings',
			array(
				'restUrl' => esc_url_raw( rest_url( 'hoatzinmedia/v1' ) ),
				'nonce'   => $rest_nonce,
				'module'  => $module,
				'logoUrl' => esc_url_raw( $base_url . 'assets/img/logo.png' ),
				'itemsPerPage' => $items_per_page,
				'modules' => $modules_option,
			)
		);

		$inline = '(function(){try{if(!window.wp||!wp.apiFetch){return;}var root=' . wp_json_encode( esc_url_raw( rest_url() ) ) . ';var nonce=' . wp_json_encode( $rest_nonce ) . ';if(wp.apiFetch.createRootURLMiddleware){wp.apiFetch.use(wp.apiFetch.createRootURLMiddleware(root));}if(wp.apiFetch.createNonceMiddleware){wp.apiFetch.use(wp.apiFetch.createNonceMiddleware(nonce));}}catch(e){}})();';
		wp_add_inline_script( $handle, $inline, 'before' );

		wp_enqueue_script( $handle );
	}

	public function render_app() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		require HOATZINMEDIA_PLUGIN_DIR . 'includes/Admin/views/admin-page.php';
	}

	public function register_media_settings_section() {
		add_settings_section(
			'hoatzinmedia_custom_sizes',
			__( 'Custom image sizes', 'hoatzinmedia-library-cleaner' ),
			function () {
				$sizes = wp_get_additional_image_sizes();
				$count = is_array( $sizes ) ? count( $sizes ) : 0;
				$link  = admin_url( 'admin.php?page=hoatzinmedia' );
				$hdr   = 'display:flex;align-items:center;justify-content:space-between;width:100%;max-width:1150px;';
				$brand = 'display:inline-flex;align-items:center;gap:8px;font-weight:600;';
				$tag   = 'display:inline-flex;align-items:center;background:#eef2ff;color:#1d4ed8;border:1px solid rgba(148,163,184,.35);border-radius:999px;padding:3px 10px;font-size:11px;';
				echo '<div style="' . esc_attr( $hdr ) . '">';
				echo '<span style="' . esc_attr( $brand ) . '"><span class="dashicons dashicons-image-filter" style="color:#2271b1;"></span>' . esc_html__( 'Provided by HoatzinMedia', 'hoatzinmedia-library-cleaner' ) . '</span>';
				echo '<a href="' . esc_url( $link ) . '" style="' . esc_attr( $tag ) . '">' . esc_html__( 'Open HoatzinMedia', 'hoatzinmedia-library-cleaner' ) . '</a>';
				echo '</div>';
				echo '<p style="margin-top:6px;">' . esc_html__( 'Custom sizes registered:', 'hoatzinmedia-library-cleaner' ) . ' ' . (int) $count . '</p>';
			},
			'media'
		);

		add_settings_field(
			'hoatzinmedia_custom_sizes_list',
			__( 'Registered sizes', 'hoatzinmedia-library-cleaner' ),
			function () {
				$sizes = wp_get_additional_image_sizes();
				if ( empty( $sizes ) || ! is_array( $sizes ) ) {
					echo '<em>' . esc_html__( 'No custom sizes found.', 'hoatzinmedia-library-cleaner' ) . '</em>';
					return;
				}
				$box   = 'background:#fff;border:1px solid #c3c4c7;border-radius:8px;padding:10px 12px;box-shadow:0 1px 1px rgba(0,0,0,.04);width:100%;max-width:900px;margin-top:6px;';
				$row   = 'display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid rgba(226,232,240,.6);';
				$name  = 'font-weight:600;color:#1d2327;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
				$meta  = 'color:#3c434a;';
				echo '<div style="' . esc_attr( $box ) . '">';
				foreach ( $sizes as $name => $data ) {
					$w    = isset( $data['width'] ) ? (int) $data['width'] : 0;
					$h    = isset( $data['height'] ) ? (int) $data['height'] : 0;
					$crop = isset( $data['crop'] ) ? $data['crop'] : false;
					$crop_label = is_array( $crop ) ? implode( ' ', array_map( 'esc_html', $crop ) ) : ( $crop ? __( 'hard', 'hoatzinmedia-library-cleaner' ) : __( 'soft', 'hoatzinmedia-library-cleaner' ) );
					echo '<div style="' . esc_attr( $row ) . '">';
					echo '<div style="' . esc_attr( $name ) . '">' . esc_html( $name ) . '</div>';
					echo '<div style="' . esc_attr( $meta ) . '">' . esc_html( $w ) . ' × ' . esc_html( $h ) . ' · ' . esc_html( $crop_label ) . '</div>';
					echo '</div>';
				}
				echo '</div>';
			},
			'media',
			'hoatzinmedia_custom_sizes'
		);
	}
}
