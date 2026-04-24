<?php
namespace HoatzinMedia\Service;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WebP_Server {
	private static $instance;

	private const UPLOADS_MARKER_BEGIN = '# BEGIN HoatzinMedia Converted Image Serving';
	private const UPLOADS_MARKER_END   = '# END HoatzinMedia Converted Image Serving';

	private const CONVERTED_MARKER_BEGIN = '# BEGIN HoatzinMedia Converted Image MIME';
	private const CONVERTED_MARKER_END   = '# END HoatzinMedia Converted Image MIME';

	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	public function maybe_update_htaccess() {
		$enabled = $this->is_serving_enabled();
		if ( $enabled ) {
			$this->ensure_htaccess_rules();
			return;
		}

		$this->remove_htaccess_rules();
	}

	public function auto_update_htaccess() {
		delete_transient( 'hoatzinmedia_converted_files_exist' );
		$this->maybe_update_htaccess();
	}

	private function is_serving_enabled() {
		$defaults = array(
			'enableWebpServing' => true,
		);
		$settings = get_option( 'hoatzinmedia_settings', $defaults );
		if ( ! is_array( $settings ) ) {
			$settings = $defaults;
		}

		if ( ! empty( $settings['enableWebpServing'] ) ) {
			return true;
		}

		return $this->converted_files_exist();
	}

	private function converted_files_exist() {
		$cached = get_transient( 'hoatzinmedia_converted_files_exist' );
		if ( false !== $cached ) {
			return (bool) $cached;
		}

		$converted_dir = wp_normalize_path( rtrim( WP_CONTENT_DIR, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-images' );
		if ( '' === $converted_dir || ! is_dir( $converted_dir ) ) {
			set_transient( 'hoatzinmedia_converted_files_exist', 0, 6 * HOUR_IN_SECONDS );
			return false;
		}

		try {
			$iterator = new \RecursiveIteratorIterator(
				new \RecursiveDirectoryIterator( $converted_dir, \FilesystemIterator::SKIP_DOTS ),
				\RecursiveIteratorIterator::LEAVES_ONLY
			);

			foreach ( $iterator as $file ) {
				if ( ! $file->isFile() ) {
					continue;
				}
				$ext = strtolower( (string) $file->getExtension() );
				if ( 'webp' === $ext || 'avif' === $ext ) {
					set_transient( 'hoatzinmedia_converted_files_exist', 1, 6 * HOUR_IN_SECONDS );
					return true;
				}
			}
		} catch ( \Exception $e ) {
			set_transient( 'hoatzinmedia_converted_files_exist', 0, 30 * MINUTE_IN_SECONDS );
			return false;
		}

		set_transient( 'hoatzinmedia_converted_files_exist', 0, 6 * HOUR_IN_SECONDS );
		return false;
	}

	private function ensure_htaccess_rules() {
		$uploads = wp_upload_dir();
		$uploads_dir = isset( $uploads['basedir'] ) ? (string) $uploads['basedir'] : '';
		$uploads_dir = wp_normalize_path( $uploads_dir );
		if ( '' === $uploads_dir || ! is_dir( $uploads_dir ) ) {
			return;
		}

		$uploads_htaccess_path = trailingslashit( $uploads_dir ) . '.htaccess';
		$this->upsert_htaccess_block( $uploads_htaccess_path, self::UPLOADS_MARKER_BEGIN, self::UPLOADS_MARKER_END, $this->get_uploads_rules_block() );

		$converted_dir = wp_normalize_path( rtrim( WP_CONTENT_DIR, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-images' );
		if ( ! is_dir( $converted_dir ) ) {
			wp_mkdir_p( $converted_dir );
		}
		if ( is_dir( $converted_dir ) ) {
			$converted_htaccess_path = trailingslashit( $converted_dir ) . '.htaccess';
			$this->upsert_htaccess_block( $converted_htaccess_path, self::CONVERTED_MARKER_BEGIN, self::CONVERTED_MARKER_END, $this->get_converted_mime_block() );
		}
	}

	private function remove_htaccess_rules() {
		$uploads = wp_upload_dir();
		$uploads_dir = isset( $uploads['basedir'] ) ? (string) $uploads['basedir'] : '';
		$uploads_dir = wp_normalize_path( $uploads_dir );
		if ( '' !== $uploads_dir && is_dir( $uploads_dir ) ) {
			$uploads_htaccess_path = trailingslashit( $uploads_dir ) . '.htaccess';
			$this->remove_htaccess_block( $uploads_htaccess_path, self::UPLOADS_MARKER_BEGIN, self::UPLOADS_MARKER_END );
		}

		$converted_dir = wp_normalize_path( rtrim( WP_CONTENT_DIR, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-images' );
		if ( is_dir( $converted_dir ) ) {
			$converted_htaccess_path = trailingslashit( $converted_dir ) . '.htaccess';
			$this->remove_htaccess_block( $converted_htaccess_path, self::CONVERTED_MARKER_BEGIN, self::CONVERTED_MARKER_END );
		}
	}

	private function get_uploads_rules_block() {
		$converter_settings = $this->get_converter_settings();
		$webp_style         = $this->get_file_extension_style_for_format( $converter_settings, 'webp' );
		$avif_style         = $this->get_file_extension_style_for_format( $converter_settings, 'avif' );
		$structure          = isset( $converter_settings['destinationStructure'] ) ? (string) $converter_settings['destinationStructure'] : 'mirror-structure';
		$mirror_enabled     = ( 'mirror-structure' === $structure );
		$flat_enabled       = ! $mirror_enabled;

		$lines = array(
			self::UPLOADS_MARKER_BEGIN,
			'<IfModule mod_rewrite.c>',
			'RewriteEngine On',
		);

		$lines = array_merge(
			$lines,
			$this->get_rewrite_rules_for_format( 'avif', 'image/avif', $avif_style, $mirror_enabled, $flat_enabled ),
			$this->get_rewrite_rules_for_format( 'webp', 'image/webp', $webp_style, $mirror_enabled, $flat_enabled )
		);

		$lines = array_merge(
			$lines,
			array(
				'</IfModule>',
				'<IfModule mod_headers.c>',
				'Header append Vary Accept env=hm_accept',
				'</IfModule>',
				self::UPLOADS_MARKER_END,
				'',
			)
		);

		return implode( "\n", $lines );
	}

	private function get_rewrite_rules_for_format( $format, $accept, $name_style, $mirror_enabled, $flat_enabled ) {
		$format = strtolower( (string) $format );
		$accept = (string) $accept;

		$uri_pattern = '^/(.*)wp-content/uploads/((?:.+/)?)([^/]+)\\.(jpe?g|png)$';
		$suffix      = ( 'append' === $name_style ) ? '.%4.' . $format : '.' . $format;

		$rules = array();

		if ( $mirror_enabled ) {
			$rules[] = 'RewriteCond %{REQUEST_FILENAME} -f';
			$rules[] = 'RewriteCond %{HTTP_ACCEPT} ' . $accept . ' [NC]';
			$rules[] = 'RewriteCond %{REQUEST_URI} ' . $uri_pattern . ' [NC]';
			$rules[] = 'RewriteCond %{DOCUMENT_ROOT}/%1wp-content/hoatzinmedia-images/%2%3' . $suffix . ' -f';
			$rules[] = 'RewriteRule ^.+\\.(jpe?g|png)$ /%1wp-content/hoatzinmedia-images/%2%3' . $suffix . ' [T=' . $accept . ',E=hm_accept:1,L]';
		}

		if ( $flat_enabled ) {
			$rules[] = 'RewriteCond %{REQUEST_FILENAME} -f';
			$rules[] = 'RewriteCond %{HTTP_ACCEPT} ' . $accept . ' [NC]';
			$rules[] = 'RewriteCond %{REQUEST_URI} ' . $uri_pattern . ' [NC]';
			$rules[] = 'RewriteCond %{DOCUMENT_ROOT}/%1wp-content/hoatzinmedia-images/%3' . $suffix . ' -f';
			$rules[] = 'RewriteRule ^.+\\.(jpe?g|png)$ /%1wp-content/hoatzinmedia-images/%3' . $suffix . ' [T=' . $accept . ',E=hm_accept:1,L]';
		}

		return $rules;
	}

	private function get_converter_settings() {
		$defaults = array(
			'destinationStructure' => 'mirror-structure',
			'fileExtension'        => 'replace-webp',
		);

		$settings = get_option( 'hoatzinmedia_converter_settings', $defaults );
		if ( ! is_array( $settings ) ) {
			$settings = $defaults;
		}

		$settings = wp_parse_args( $settings, $defaults );

		$structure = isset( $settings['destinationStructure'] ) ? (string) $settings['destinationStructure'] : 'mirror-structure';
		if ( ! in_array( $structure, array( 'mirror-structure', 'image-roots', 'flat' ), true ) ) {
			$structure = 'mirror-structure';
		}
		$settings['destinationStructure'] = $structure;

		$file_extension = isset( $settings['fileExtension'] ) ? (string) $settings['fileExtension'] : 'replace-webp';
		if ( ! in_array( $file_extension, array( 'append-webp', 'replace-webp', 'append-avif', 'replace-avif' ), true ) ) {
			$file_extension = 'replace-webp';
		}
		$settings['fileExtension'] = $file_extension;

		return $settings;
	}

	private function get_file_extension_style_for_format( array $settings, $format ) {
		$format = strtolower( (string) $format );
		$opt    = isset( $settings['fileExtension'] ) ? (string) $settings['fileExtension'] : '';

		if ( 'webp' === $format ) {
			return ( 'append-webp' === $opt ) ? 'append' : 'replace';
		}

		if ( 'avif' === $format ) {
			return ( 'append-avif' === $opt ) ? 'append' : 'replace';
		}

		return 'replace';
	}

	private function get_converted_mime_block() {
		$lines = array(
			self::CONVERTED_MARKER_BEGIN,
			'<IfModule mod_mime.c>',
			'AddType image/webp .webp',
			'AddType image/avif .avif',
			'</IfModule>',
			'<IfModule mod_headers.c>',
			'Header append Vary Accept',
			'</IfModule>',
			self::CONVERTED_MARKER_END,
			'',
		);

		return implode( "\n", $lines );
	}

	private function upsert_htaccess_block( $htaccess_path, $marker_begin, $marker_end, $block ) {
		$existing = '';
		if ( file_exists( $htaccess_path ) ) {
			$existing = (string) file_get_contents( $htaccess_path );
		}

		$clean = $this->strip_marker_block( $existing, $marker_begin, $marker_end );
		$clean = rtrim( $clean, "\r\n" );
		if ( '' !== $clean ) {
			$clean .= "\n\n";
		}

		$new_contents = $clean . $block;
		if ( $new_contents === $existing ) {
			return;
		}
		@file_put_contents( $htaccess_path, $new_contents );
	}

	private function remove_htaccess_block( $htaccess_path, $marker_begin, $marker_end ) {
		if ( ! file_exists( $htaccess_path ) ) {
			return;
		}

		$existing = (string) file_get_contents( $htaccess_path );
		$clean = $this->strip_marker_block( $existing, $marker_begin, $marker_end );
		$clean = rtrim( $clean, "\r\n" );
		$clean .= "\n";
		if ( $clean === $existing ) {
			return;
		}
		@file_put_contents( $htaccess_path, $clean );
	}

	private function strip_marker_block( $contents, $marker_begin, $marker_end ) {
		$pattern = '/' . preg_quote( $marker_begin, '/' ) . '.*?' . preg_quote( $marker_end, '/' ) . '\R*/s';
		return (string) preg_replace( $pattern, '', (string) $contents );
	}
}