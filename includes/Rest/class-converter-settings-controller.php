<?php
namespace HoatzinMedia\Rest;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Converter_Settings_Controller {
	private static $instance;

	private function __construct() {
		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
	}

	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	public function register_routes() {
		register_rest_route(
			'hoatzinmedia/v1',
			'/converter-settings',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'get_settings' ],
					'permission_callback' => [ $this, 'permissions_check' ],
				],
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'save_settings' ],
					'permission_callback' => [ $this, 'permissions_check' ],
				],
			]
		);

		register_rest_route(
			'hoatzinmedia/v1',
			'/converter-settings/scan',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'scan_sources' ],
					'permission_callback' => [ $this, 'permissions_check' ],
				],
			]
		);
	}

	public function permissions_check( $request ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'hoatzinmedia_forbidden',
				esc_html__( 'You are not allowed to perform this action.', 'hoatzinmedia-library-cleaner' ),
				[
					'status' => rest_authorization_required_code(),
				]
			);
		}

		$nonce = $request->get_header( 'X-WP-Nonce' );

		if ( ! $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new \WP_Error(
				'hoatzinmedia_invalid_nonce',
				esc_html__( 'Invalid security token.', 'hoatzinmedia-library-cleaner' ),
				[
					'status' => rest_authorization_required_code(),
				]
			);
		}

		return true;
	}

	public function get_settings() {
		return new \WP_REST_Response( $this->load_settings() );
	}

	public function save_settings( $request ) {
		$incoming = $request->get_json_params();
		if ( ! is_array( $incoming ) ) {
			$incoming = [];
		}

		$current = $this->load_settings();

		if ( isset( $incoming['scope'] ) ) {
			$val = sanitize_text_field( (string) $incoming['scope'] );
			if ( in_array( $val, [ 'uploads', 'uploads-only' ], true ) ) {
				$current['scope'] = $val;
			}
		}

		if ( isset( $incoming['imageTypes'] ) ) {
			$val = sanitize_text_field( (string) $incoming['imageTypes'] );
			if ( in_array( $val, [ 'both', 'jpeg', 'png' ], true ) ) {
				$current['imageTypes'] = $val;
			}
		}

		if ( isset( $incoming['destinationFolder'] ) ) {
			$val = sanitize_text_field( (string) $incoming['destinationFolder'] );
			if ( in_array( $val, [ 'separate', 'same' ], true ) ) {
				$current['destinationFolder'] = $val;
			}
		}

		if ( isset( $incoming['fileExtension'] ) ) {
			$val = sanitize_text_field( (string) $incoming['fileExtension'] );
			if ( in_array( $val, [ 'append-webp', 'replace-webp', 'append-avif', 'replace-avif' ], true ) ) {
				$current['fileExtension'] = $val;
			}
		}

		if ( isset( $incoming['destinationStructure'] ) ) {
			$val = sanitize_text_field( (string) $incoming['destinationStructure'] );
			if ( in_array( $val, [ 'image-roots', 'mirror-structure', 'flat' ], true ) ) {
				$current['destinationStructure'] = $val;
			}
		}

		if ( isset( $incoming['cacheControl'] ) ) {
			$val = sanitize_text_field( (string) $incoming['cacheControl'] );
			if ( in_array( $val, [ 'do-not-set', 'public-1year', 'public-30days', 'no-cache' ], true ) ) {
				$current['cacheControl'] = $val;
			}
		}

		if ( array_key_exists( 'preventLargerWebp', $incoming ) ) {
			$current['preventLargerWebp'] = (bool) $incoming['preventLargerWebp'];
		}

		update_option( 'hoatzinmedia_converter_settings', $current, false );

		return new \WP_REST_Response( $current );
	}

	public function scan_sources( $request ) {
		$settings = $this->load_settings();

		$scope = $request->get_param( 'scope' );
		$image_types = $request->get_param( 'imageTypes' );

		if ( is_string( $scope ) && in_array( $scope, [ 'uploads', 'uploads-only' ], true ) ) {
			$settings['scope'] = $scope;
		}
		if ( is_string( $image_types ) && in_array( $image_types, [ 'both', 'jpeg', 'png' ], true ) ) {
			$settings['imageTypes'] = $image_types;
		}

		$exts = [ 'jpg', 'jpeg', 'png' ];
		if ( $settings['imageTypes'] === 'jpeg' ) {
			$exts = [ 'jpg', 'jpeg' ];
		} elseif ( $settings['imageTypes'] === 'png' ) {
			$exts = [ 'png' ];
		}

		$uploads = wp_upload_dir();
		$uploads_dir = isset( $uploads['basedir'] ) ? wp_normalize_path( (string) $uploads['basedir'] ) : '';
		$uploads_found = $this->scan_dir_for_images( $uploads_dir, $exts, 2000 );

		$theme_dirs = [];
		$stylesheet_dir = function_exists( 'get_stylesheet_directory' ) ? (string) get_stylesheet_directory() : '';
		$template_dir = function_exists( 'get_template_directory' ) ? (string) get_template_directory() : '';
		if ( $stylesheet_dir ) {
			$theme_dirs[] = wp_normalize_path( $stylesheet_dir );
		}
		if ( $template_dir && $template_dir !== $stylesheet_dir ) {
			$theme_dirs[] = wp_normalize_path( $template_dir );
		}
		$theme_dirs = array_values( array_unique( array_filter( array_map( 'strval', $theme_dirs ) ) ) );

		$theme_found = [
			'count'   => 0,
			'limited' => false,
			'sample'  => [],
		];

		if ( $settings['scope'] === 'uploads' ) {
			foreach ( $theme_dirs as $dir ) {
				$r = $this->scan_dir_for_images( $dir, $exts, 1000 );
				$theme_found['count'] += (int) $r['count'];
				$theme_found['limited'] = $theme_found['limited'] || ! empty( $r['limited'] );
				if ( count( $theme_found['sample'] ) < 25 && ! empty( $r['sample'] ) ) {
					$space = 25 - count( $theme_found['sample'] );
					$theme_found['sample'] = array_merge( $theme_found['sample'], array_slice( $r['sample'], 0, $space ) );
				}
			}
		}

		return new \WP_REST_Response(
			[
				'settings' => $settings,
				'uploads'  => $uploads_found,
				'theme'    => $theme_found,
			]
		);
	}

	private function load_settings() {
		$defaults = [
			'scope'               => 'uploads',
			'imageTypes'          => 'both',
			'destinationFolder'   => 'separate',
			'fileExtension'       => 'replace-webp',
			'destinationStructure'=> 'mirror-structure',
			'cacheControl'        => 'do-not-set',
			'preventLargerWebp'   => true,
		];

		$settings = get_option( 'hoatzinmedia_converter_settings', $defaults );
		if ( ! is_array( $settings ) ) {
			$settings = $defaults;
		}

		$settings = wp_parse_args( $settings, $defaults );

		$settings['scope'] = in_array( $settings['scope'], [ 'uploads', 'uploads-only' ], true ) ? $settings['scope'] : 'uploads';
		$settings['imageTypes'] = in_array( $settings['imageTypes'], [ 'both', 'jpeg', 'png' ], true ) ? $settings['imageTypes'] : 'both';
		$settings['destinationFolder'] = in_array( $settings['destinationFolder'], [ 'separate', 'same' ], true ) ? $settings['destinationFolder'] : 'separate';
		$settings['fileExtension'] = in_array( $settings['fileExtension'], [ 'append-webp', 'replace-webp', 'append-avif', 'replace-avif' ], true ) ? $settings['fileExtension'] : 'replace-webp';
		$settings['destinationStructure'] = in_array( $settings['destinationStructure'], [ 'image-roots', 'mirror-structure', 'flat' ], true ) ? $settings['destinationStructure'] : 'mirror-structure';
		$settings['cacheControl'] = in_array( $settings['cacheControl'], [ 'do-not-set', 'public-1year', 'public-30days', 'no-cache' ], true ) ? $settings['cacheControl'] : 'do-not-set';
		$settings['preventLargerWebp'] = (bool) $settings['preventLargerWebp'];

		return $settings;
	}

	private function scan_dir_for_images( $dir, array $exts, $limit ) {
		$dir = wp_normalize_path( (string) $dir );
		$limit = (int) $limit;
		if ( $limit <= 0 ) {
			$limit = 500;
		}

		if ( '' === $dir || ! is_dir( $dir ) ) {
			return [
				'count'   => 0,
				'limited' => false,
				'sample'  => [],
			];
		}

		$exts = array_values( array_unique( array_filter( array_map( 'strtolower', array_map( 'strval', $exts ) ) ) ) );
		if ( empty( $exts ) ) {
			return [
				'count'   => 0,
				'limited' => false,
				'sample'  => [],
			];
		}

		$exclude_dirs = [ 'node_modules', 'vendor', '.git', '.svn', '.idea' ];
		$count = 0;
		$sample = [];
		$limited = false;

		try {
			$iterator = new \RecursiveIteratorIterator(
				new \RecursiveCallbackFilterIterator(
					new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS ),
					function ( $current ) use ( $exclude_dirs ) {
						if ( $current->isDir() ) {
							$name = $current->getFilename();
							return ! in_array( $name, $exclude_dirs, true );
						}
						return true;
					}
				),
				\RecursiveIteratorIterator::LEAVES_ONLY
			);

			foreach ( $iterator as $file ) {
				if ( ! $file->isFile() ) {
					continue;
				}
				$ext = strtolower( (string) $file->getExtension() );
				if ( ! in_array( $ext, $exts, true ) ) {
					continue;
				}
				$count++;
				if ( count( $sample ) < 25 ) {
					$sample[] = wp_normalize_path( (string) $file->getPathname() );
				}
				if ( $count >= $limit ) {
					$limited = true;
					break;
				}
			}
		} catch ( \Exception $e ) {
			return [
				'count'   => 0,
				'limited' => false,
				'sample'  => [],
			];
		}

		return [
			'count'   => $count,
			'limited' => $limited,
			'sample'  => $sample,
		];
	}
}