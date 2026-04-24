<?php

namespace HoatzinMedia\Service;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Svg_Support {

	/**
	 * @var Svg_Support
	 */
	private static $instance;

	private function __construct() {
		add_filter( 'upload_mimes', array( $this, 'filter_upload_mimes' ), 20, 2 );
		add_filter( 'wp_check_filetype_and_ext', array( $this, 'filter_check_filetype_and_ext' ), 10, 4 );
		add_filter( 'wp_handle_upload_prefilter', array( $this, 'prefilter_upload' ) );
		add_filter( 'wp_handle_sideload_prefilter', array( $this, 'prefilter_upload' ) );
		add_filter( 'elementor/files/allow_unfiltered_upload', array( $this, 'filter_elementor_allow_unfiltered_upload' ), 20, 1 );
		add_filter( 'elementor/files/allow-file-type/svg', array( $this, 'filter_elementor_allow_file_type_svg' ), 20, 1 );
	}

	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function is_enabled() {
		$settings = get_option( 'hoatzinmedia_settings', array() );
		$enabled = is_array( $settings ) && ! empty( $settings['enableSvgUploads'] );
		if ( ! $enabled ) {
			return false;
		}

		$modules = get_option( 'hoatzinmedia_modules', array() );
		if ( is_array( $modules ) && isset( $modules['svg_support'] ) && is_array( $modules['svg_support'] ) ) {
			if ( array_key_exists( 'enabled', $modules['svg_support'] ) && false === $modules['svg_support']['enabled'] ) {
				return false;
			}
		}

		return true;
	}

	private function is_elementor_active() {
		if ( defined( 'ELEMENTOR_VERSION' ) ) {
			return true;
		}
		if ( class_exists( '\\Elementor\\Plugin' ) ) {
			return true;
		}
		return false;
	}

	private function get_user_for_check( $user ) {
		if ( $user instanceof \WP_User ) {
			return $user;
		}
		if ( function_exists( 'wp_get_current_user' ) ) {
			$u = wp_get_current_user();
			if ( $u instanceof \WP_User ) {
				return $u;
			}
		}
		return null;
	}

	private function request_has_svg_upload() {
		if ( empty( $_FILES ) || ! is_array( $_FILES ) ) {
			return false;
		}
		foreach ( $_FILES as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$name = isset( $entry['name'] ) ? (string) $entry['name'] : '';
			if ( '' === $name ) {
				continue;
			}
			$ext = strtolower( (string) pathinfo( $name, PATHINFO_EXTENSION ) );
			if ( 'svg' === $ext ) {
				return true;
			}
		}
		return false;
	}

	private function is_enabled_for_request( $user = null ) {
		if ( ! $this->is_enabled() ) {
			return false;
		}

		$u = $this->get_user_for_check( $user );
		if ( ! $u || ! $u->exists() ) {
			return false;
		}
		if ( ! user_can( $u, 'upload_files' ) ) {
			return false;
		}

		if ( user_can( $u, 'manage_options' ) || user_can( $u, 'unfiltered_upload' ) ) {
			return true;
		}

		if ( $this->is_elementor_active() ) {
			return true;
		}

		return false;
	}

	public function filter_elementor_allow_unfiltered_upload( $enabled ) {
		if ( $enabled ) {
			return $enabled;
		}
		if ( ! $this->is_enabled_for_request() ) {
			return $enabled;
		}
		if ( ! $this->request_has_svg_upload() ) {
			return $enabled;
		}
		return true;
	}

	public function filter_elementor_allow_file_type_svg( $is_allowed ) {
		if ( true === $is_allowed ) {
			return $is_allowed;
		}
		if ( ! $this->is_enabled_for_request() ) {
			return $is_allowed;
		}
		return true;
	}

	public function filter_upload_mimes( $mimes, $user ) {
		if ( ! $this->is_enabled_for_request( $user ) ) {
			return $mimes;
		}
		if ( ! is_array( $mimes ) ) {
			$mimes = array();
		}
		$mimes['svg'] = 'image/svg+xml';
		return $mimes;
	}

	public function filter_check_filetype_and_ext( $data, $file, $filename, $mimes ) {
		if ( ! $this->is_enabled_for_request() ) {
			return $data;
		}

		$ext = strtolower( (string) pathinfo( (string) $filename, PATHINFO_EXTENSION ) );
		if ( 'svg' !== $ext ) {
			return $data;
		}

		if ( ! is_array( $data ) ) {
			$data = array();
		}
		$data['ext']  = 'svg';
		$data['type'] = 'image/svg+xml';
		return $data;
	}

	public function prefilter_upload( $file ) {
		if ( ! $this->is_enabled_for_request() ) {
			return $file;
		}

		if ( ! is_array( $file ) ) {
			return $file;
		}

		$name = isset( $file['name'] ) ? (string) $file['name'] : '';
		$tmp  = isset( $file['tmp_name'] ) ? (string) $file['tmp_name'] : '';
		$type = isset( $file['type'] ) ? (string) $file['type'] : '';

		if ( '' === $name || '' === $tmp ) {
			return $file;
		}

		$ext = strtolower( (string) pathinfo( $name, PATHINFO_EXTENSION ) );
		if ( 'svg' !== $ext && 'image/svg+xml' !== $type ) {
			return $file;
		}

		$result = $this->sanitize_tmp_file( $tmp );
		if ( is_wp_error( $result ) ) {
			$file['error'] = $result->get_error_message();
			return $file;
		}

		$file['type'] = 'image/svg+xml';
		return $file;
	}

	private function sanitize_tmp_file( $tmp_path ) {
		$tmp_path = (string) $tmp_path;
		if ( '' === $tmp_path ) {
			return new \WP_Error( 'hoatzinmedia_svg_invalid', esc_html__( 'Invalid SVG upload.', 'hoatzinmedia-library-cleaner' ) );
		}
		if ( ! @is_readable( $tmp_path ) ) {
			return new \WP_Error( 'hoatzinmedia_svg_unreadable', esc_html__( 'SVG file could not be read for sanitization.', 'hoatzinmedia-library-cleaner' ) );
		}
		if ( ! @is_writable( $tmp_path ) ) {
			return new \WP_Error( 'hoatzinmedia_svg_unwritable', esc_html__( 'SVG file could not be sanitized (temporary file not writable).', 'hoatzinmedia-library-cleaner' ) );
		}

		$raw = @file_get_contents( $tmp_path );
		if ( ! is_string( $raw ) || '' === $raw ) {
			return new \WP_Error( 'hoatzinmedia_svg_empty', esc_html__( 'SVG file is empty or unreadable.', 'hoatzinmedia-library-cleaner' ) );
		}

		$clean = $this->sanitize_svg( $raw );
		if ( is_wp_error( $clean ) ) {
			return $clean;
		}

		$written = @file_put_contents( $tmp_path, $clean );
		if ( false === $written ) {
			return new \WP_Error( 'hoatzinmedia_svg_write_failed', esc_html__( 'Failed to write sanitized SVG.', 'hoatzinmedia-library-cleaner' ) );
		}

		return true;
	}

	private function sanitize_svg( $svg ) {
		$svg = (string) $svg;

		if ( strlen( $svg ) > 1024 * 1024 ) {
			return new \WP_Error( 'hoatzinmedia_svg_too_large', esc_html__( 'SVG is too large to sanitize safely.', 'hoatzinmedia-library-cleaner' ) );
		}

		if ( preg_match( '/<!DOCTYPE/i', $svg ) || preg_match( '/<!ENTITY/i', $svg ) ) {
			return new \WP_Error( 'hoatzinmedia_svg_doctype', esc_html__( 'SVG contains a doctype/entity declaration and was rejected.', 'hoatzinmedia-library-cleaner' ) );
		}

		if ( ! class_exists( '\\DOMDocument' ) ) {
			return new \WP_Error( 'hoatzinmedia_svg_dom_missing', esc_html__( 'Server cannot sanitize SVG safely (DOM extension missing).', 'hoatzinmedia-library-cleaner' ) );
		}

		$previous = libxml_use_internal_errors( true );
		$dom      = new \DOMDocument();
		$dom->preserveWhiteSpace = false;
		$loaded   = false;

		try {
			$loaded = $dom->loadXML( $svg, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING );
		} catch ( \Exception $e ) {
			$loaded = false;
		}

		libxml_clear_errors();
		libxml_use_internal_errors( $previous );

		if ( ! $loaded || ! $dom->documentElement ) {
			return new \WP_Error( 'hoatzinmedia_svg_invalid_xml', esc_html__( 'SVG is not valid XML.', 'hoatzinmedia-library-cleaner' ) );
		}

		$root = $dom->documentElement;
		if ( strtolower( (string) $root->tagName ) !== 'svg' ) {
			return new \WP_Error( 'hoatzinmedia_svg_invalid_root', esc_html__( 'Invalid SVG root element.', 'hoatzinmedia-library-cleaner' ) );
		}

		$this->sanitize_dom_element( $root );

		$out = $dom->saveXML( $root );
		if ( ! is_string( $out ) || '' === $out ) {
			return new \WP_Error( 'hoatzinmedia_svg_sanitize_failed', esc_html__( 'SVG sanitization failed.', 'hoatzinmedia-library-cleaner' ) );
		}

		if ( false === strpos( $out, '<svg' ) ) {
			return new \WP_Error( 'hoatzinmedia_svg_empty_after', esc_html__( 'SVG was rejected after sanitization.', 'hoatzinmedia-library-cleaner' ) );
		}

		return $out . "\n";
	}

	private function sanitize_dom_element( \DOMElement $element ) {
		$allowed_tags = array(
			'svg' => true,
			'g' => true,
			'path' => true,
			'circle' => true,
			'ellipse' => true,
			'line' => true,
			'polyline' => true,
			'polygon' => true,
			'rect' => true,
			'text' => true,
			'tspan' => true,
			'defs' => true,
			'symbol' => true,
			'clippath' => true,
			'mask' => true,
			'pattern' => true,
			'metadata' => true,
			'lineargradient' => true,
			'radialgradient' => true,
			'stop' => true,
			'title' => true,
			'desc' => true,
			'use' => true,
		);

		$allowed_attrs = array(
			'xmlns' => true,
			'xmlns:xlink' => true,
			'viewbox' => true,
			'preserveaspectratio' => true,
			'width' => true,
			'height' => true,
			'fill' => true,
			'fill-opacity' => true,
			'fill-rule' => true,
			'stroke' => true,
			'stroke-width' => true,
			'stroke-opacity' => true,
			'stroke-linecap' => true,
			'stroke-linejoin' => true,
			'stroke-miterlimit' => true,
			'stroke-dasharray' => true,
			'stroke-dashoffset' => true,
			'opacity' => true,
			'd' => true,
			'cx' => true,
			'cy' => true,
			'r' => true,
			'rx' => true,
			'ry' => true,
			'x' => true,
			'y' => true,
			'x1' => true,
			'y1' => true,
			'x2' => true,
			'y2' => true,
			'points' => true,
			'transform' => true,
			'version' => true,
			'class' => true,
			'id' => true,
			'focusable' => true,
			'role' => true,
			'aria-hidden' => true,
			'aria-label' => true,
			'aria-labelledby' => true,
			'clip-path' => true,
			'mask' => true,
			'patternunits' => true,
			'patterncontentunits' => true,
			'gradientunits' => true,
			'gradienttransform' => true,
			'offset' => true,
			'stop-color' => true,
			'stop-opacity' => true,
			'text-anchor' => true,
			'dominant-baseline' => true,
			'font-family' => true,
			'font-size' => true,
			'font-weight' => true,
			'letter-spacing' => true,
			'href' => true,
			'xlink:href' => true,
		);

		$tag = strtolower( (string) $element->tagName );
		if ( empty( $allowed_tags[ $tag ] ) ) {
			$parent = $element->parentNode;
			if ( $parent ) {
				$parent->removeChild( $element );
			}
			return;
		}

		if ( $element->hasAttributes() ) {
			$remove = array();
			foreach ( $element->attributes as $attr ) {
				$name = strtolower( (string) $attr->nodeName );
				$value = (string) $attr->nodeValue;

				if ( 0 === strpos( $name, 'on' ) ) {
					$remove[] = $attr->nodeName;
					continue;
				}
				if ( 'style' === $name ) {
					$remove[] = $attr->nodeName;
					continue;
				}
				if ( empty( $allowed_attrs[ $name ] ) ) {
					$remove[] = $attr->nodeName;
					continue;
				}

				if ( 'href' === $name || 'xlink:href' === $name ) {
					$v = trim( $value );
					if ( '' !== $v && 0 !== strpos( $v, '#' ) ) {
						$remove[] = $attr->nodeName;
						continue;
					}
				}
			}
			foreach ( $remove as $attr_name ) {
				$element->removeAttribute( $attr_name );
			}
		}

		$child = $element->firstChild;
		while ( $child ) {
			$next = $child->nextSibling;
			if ( $child->nodeType === XML_ELEMENT_NODE ) {
				$this->sanitize_dom_element( $child );
			} elseif ( $child->nodeType === XML_TEXT_NODE ) {
				$child->nodeValue = (string) $child->nodeValue;
			} else {
				$element->removeChild( $child );
			}
			$child = $next;
		}
	}
}
