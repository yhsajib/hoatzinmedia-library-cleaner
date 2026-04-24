<?php
namespace HoatzinMedia\Service;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Converter {

    /**
     * @var Converter
     */
    private static $instance;

    /**
     * Get singleton instance.
     *
     * @return Converter
     */
    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    public function convert_attachment( $attachment_id, $format, $quality = null, $destinationFolder = 'same', $destinationStructure = 'roots', $options = [] ) {
        $path = get_attached_file( $attachment_id );

        if ( !$path || !file_exists( $path ) ) {
            return new \WP_Error( 'file_not_found', __( 'File not found.', 'hoatzinmedia-library-cleaner' ) );
        }

        $converter_settings = $this->get_converter_settings();
        if ( is_array( $options ) ) {
            $converter_settings = wp_parse_args( $options, $converter_settings );
        }

        $editor = wp_get_image_editor( $path );

        if ( is_wp_error( $editor ) ) {
            return $editor;
        }

        // Check if format is supported
        if ( !$editor->supports_mime_type( "image/$format" ) ) {
            return new \WP_Error( 'format_not_supported', __( 'Selected format is not supported by the current image editor.', 'hoatzinmedia-library-cleaner' ) );
        }

        if ( is_numeric( $quality ) ) {
            $q = (int) $quality;
            if ( $q < 1 ) {
                $q = 1;
            } elseif ( $q > 100 ) {
                $q = 100;
            }
            if ( method_exists( $editor, 'set_quality' ) ) {
                $editor->set_quality( $q );
            }
        }

        $info = pathinfo( $path );
        $new_filename = $info['filename'] . '.' . $format;

        if ( 'separate' === $destinationFolder ) {
            $base_name = (string) $info['filename'];
            $source_ext = isset( $info['extension'] ) ? strtolower( (string) $info['extension'] ) : '';
            $name_style = $this->get_file_extension_style_for_format( $converter_settings, $format );
            if ( 'append' === $name_style && '' !== $source_ext ) {
                $base_name = $base_name . '.' . $source_ext;
            }

            $destinationStructure = $this->normalize_destination_structure( $destinationStructure, $converter_settings );

            $new_path = $this->build_separate_destination_path( $path, $base_name, $format, $destinationStructure );
            if ( is_wp_error( $new_path ) ) {
                return $new_path;
            }
        } else {
            $new_path = $info['dirname'] . '/' . $new_filename;
        }

        // Prevent overwriting if file exists (though unlikely if converting to new format)
        $i = 1;
        while ( file_exists( $new_path ) ) {
            $new_filename = $info['filename'] . '-' . $i . '.' . $format;
            if ( 'separate' === $destinationFolder ) {
                $new_path = $this->build_separate_destination_path( $path, $info['filename'] . '-' . $i, $format, $destinationStructure );
            } else {
                $new_path = $info['dirname'] . '/' . $new_filename;
            }
            if ( is_wp_error( $new_path ) ) {
                return $new_path;
            }
            $i++;
        }

        $saved = $editor->save( $new_path, "image/$format" );

        if ( is_wp_error( $saved ) ) {
            return $saved;
        }

        if ( 'separate' === $destinationFolder && ! empty( $converter_settings['preventLargerWebp'] ) ) {
            $orig_size = @filesize( $path );
            $new_size = @filesize( $new_path );
            if ( false !== $orig_size && false !== $new_size && $orig_size > 0 && $new_size > 0 && $new_size > $orig_size ) {
                wp_delete_file( $new_path );
                return new \WP_Error( 'converted_larger', __( 'Converted file is larger than the original.', 'hoatzinmedia-library-cleaner' ) );
            }
        }

        $result_url = '';

        if ( 'same' === $destinationFolder ) {
            // Update attachment
            update_attached_file( $attachment_id, $new_path );

            // Update MIME type
            $mime_type = "image/$format";
            wp_update_post( [
                'ID'             => $attachment_id,
                'post_mime_type' => $mime_type,
            ] );

            // Remove any old separate-folder converted tags for this attachment.
            delete_post_meta( $attachment_id, '_hoatzinmedia_converted_webp' );
            delete_post_meta( $attachment_id, '_hoatzinmedia_converted_avif' );

            if ( !function_exists( 'wp_generate_attachment_metadata' ) ) {
                require_once ABSPATH . 'wp-admin/includes/image.php';
            }
            $metadata = wp_generate_attachment_metadata( $attachment_id, $new_path );
            if ( empty( $metadata ) || !is_array( $metadata ) ) {
                return new \WP_Error( 'metadata_failed', __( 'Failed to generate attachment metadata.', 'hoatzinmedia-library-cleaner' ) );
            }
            wp_update_attachment_metadata( $attachment_id, $metadata );

            $result_url = wp_get_attachment_url( $attachment_id );
        } else {
            $result_url = $this->get_url_from_path( $new_path );
            update_post_meta( $attachment_id, '_hoatzinmedia_converted_' . $format, '1' );
        }

        // Ensure WebP serving rules are active after conversion
        if ( class_exists( 'HoatzinMedia\Service\WebP_Server' ) ) {
            \HoatzinMedia\Service\WebP_Server::get_instance()->auto_update_htaccess();
        }

        // Return result
        return [
            'id'       => $attachment_id,
            'url'      => $result_url,
            'filename' => wp_basename( $new_path ),
            'size'     => filesize( $new_path ),
        ];
    }

    public function get_converted_variant_paths( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return [];
        }

        $file_path = get_attached_file( $attachment_id );
        if ( !$file_path ) {
            return [];
        }

        return $this->get_converted_variant_paths_for_upload_path( $file_path );
    }

    public function delete_converted_variants( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return;
        }

        $upload_paths = $this->get_related_upload_paths( $attachment_id );
        if ( empty( $upload_paths ) ) {
            return;
        }

        $deleted_any = false;
        $root = wp_normalize_path( rtrim( WP_CONTENT_DIR, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-images' );
        $dirs_to_check = [];

        foreach ( $upload_paths as $upload_path ) {
            $paths = $this->get_converted_variant_paths_for_upload_path( $upload_path );
            foreach ( $paths as $path ) {
                if ( is_string( $path ) && '' !== $path && file_exists( $path ) ) {
                    wp_delete_file( $path );
                    $deleted_any = ! file_exists( $path ) || $deleted_any;
                    $dirs_to_check[] = dirname( $path );
                }
            }
        }

        if ( $deleted_any ) {
            delete_transient( 'hoatzinmedia_converted_files_exist' );
            $dirs_to_check = array_values( array_unique( array_filter( array_map( 'strval', $dirs_to_check ) ) ) );
            foreach ( $dirs_to_check as $dir ) {
                $this->cleanup_empty_directories( $dir, $root );
            }
        }
    }

    public function get_attachment_total_size_bytes( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return 0;
        }

        $upload_paths = $this->get_related_upload_paths( $attachment_id );
        if ( empty( $upload_paths ) ) {
            return 0;
        }

        $sum = 0;
        foreach ( $upload_paths as $upload_path ) {
            if ( $upload_path && @is_readable( $upload_path ) ) {
                $s = @filesize( $upload_path );
                if ( false !== $s && $s > 0 ) {
                    $sum += (int) $s;
                }
            }

            $variants = $this->get_converted_variant_paths_for_upload_path( $upload_path );
            foreach ( $variants as $variant_path ) {
                if ( $variant_path && @is_readable( $variant_path ) ) {
                    $vs = @filesize( $variant_path );
                    if ( false !== $vs && $vs > 0 ) {
                        $sum += (int) $vs;
                    }
                }
            }
        }

        return (int) $sum;
    }

    public function sync_converted_variants_for_attachment( $attachment_id, $quality = null ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return;
        }

        $upload_paths = $this->get_related_upload_paths( $attachment_id );
        if ( empty( $upload_paths ) ) {
            return;
        }

        $formats = [];

        $defaults = array(
            'autoConvertUploads' => 'disabled',
        );
        $settings = get_option( 'hoatzinmedia_settings', $defaults );
        if ( ! is_array( $settings ) ) {
            $settings = $defaults;
        }
        $auto = isset( $settings['autoConvertUploads'] ) ? (string) $settings['autoConvertUploads'] : 'disabled';
        if ( in_array( $auto, array( 'webp', 'avif' ), true ) ) {
            $formats[] = $auto;
        }

        if ( get_post_meta( $attachment_id, '_hoatzinmedia_converted_webp', true ) ) {
            $formats[] = 'webp';
        }
        if ( get_post_meta( $attachment_id, '_hoatzinmedia_converted_avif', true ) ) {
            $formats[] = 'avif';
        }

        foreach ( array( 'avif', 'webp' ) as $candidate ) {
            foreach ( $upload_paths as $upload_path ) {
                $variant = $this->get_converted_variant_paths_for_upload_path( $upload_path );
                $p = isset( $variant[$candidate] ) ? $variant[$candidate] : '';
                if ( $p && file_exists( $p ) ) {
                    $formats[] = $candidate;
                    break 2;
                }
            }
        }

        $formats = array_values( array_unique( array_filter( array_map( 'strval', $formats ) ) ) );
        if ( empty( $formats ) ) {
            return;
        }

        $did_any = false;

        foreach ( $upload_paths as $upload_path ) {
            if ( ! $upload_path || ! file_exists( $upload_path ) ) {
                continue;
            }

            $ext = strtolower( (string) pathinfo( $upload_path, PATHINFO_EXTENSION ) );
            if ( ! in_array( $ext, array( 'jpg', 'jpeg', 'png' ), true ) ) {
                continue;
            }

            $editor = wp_get_image_editor( $upload_path );
            if ( is_wp_error( $editor ) ) {
                continue;
            }

            if ( is_numeric( $quality ) ) {
                $q = (int) $quality;
                if ( $q < 1 ) {
                    $q = 1;
                } elseif ( $q > 100 ) {
                    $q = 100;
                }
                if ( method_exists( $editor, 'set_quality' ) ) {
                    $editor->set_quality( $q );
                }
            }

            foreach ( $formats as $format ) {
                $format = strtolower( (string) $format );
                if ( 'webp' !== $format && 'avif' !== $format ) {
                    continue;
                }
                if ( method_exists( $editor, 'supports_mime_type' ) && ! $editor->supports_mime_type( 'image/' . $format ) ) {
                    continue;
                }

                $variants = $this->get_converted_variant_paths_for_upload_path( $upload_path );
                $dest_path = isset( $variants[$format] ) ? (string) $variants[$format] : '';
                if ( '' === $dest_path ) {
                    continue;
                }

                $dest_dir = dirname( $dest_path );
                if ( ! is_dir( $dest_dir ) ) {
                    if ( ! wp_mkdir_p( $dest_dir ) ) {
                        continue;
                    }
                }

                $saved = $editor->save( $dest_path, 'image/' . $format );
                if ( is_wp_error( $saved ) ) {
                    continue;
                }
                $did_any = true;
            }
        }

        if ( $did_any ) {
            delete_transient( 'hoatzinmedia_converted_files_exist' );
            if ( class_exists( 'HoatzinMedia\\Service\\WebP_Server' ) ) {
                \HoatzinMedia\Service\WebP_Server::get_instance()->auto_update_htaccess();
            }
        }
    }

    private function build_separate_destination_path( $source_path, $base_name, $format, $destinationStructure ) {
        $uploads = wp_upload_dir();
        $upload_base = isset( $uploads['basedir'] ) ? wp_normalize_path( rtrim( $uploads['basedir'], '/\\' ) ) : '';
        $source_path_normalized = wp_normalize_path( $source_path );

        if ( $upload_base && 0 === strpos( $source_path_normalized, $upload_base ) ) {
            $relative_path = ltrim( substr( $source_path_normalized, strlen( $upload_base ) ), '/\\' );
        } else {
            $relative_path = wp_basename( $source_path_normalized );
        }

        $relative_dir = '';
        if ( 'mirror-structure' === $destinationStructure || 'roots' === $destinationStructure || 'date' === $destinationStructure ) {
            $relative_dir = dirname( $relative_path );
            if ( '.' === $relative_dir ) {
                $relative_dir = '';
            }
        }

        $destination_dir = $this->get_separate_destination_root();
        if ( '' !== $relative_dir ) {
            $destination_dir = $destination_dir . DIRECTORY_SEPARATOR . $relative_dir;
        }

        if ( !wp_mkdir_p( $destination_dir ) ) {
            return new \WP_Error( 'destination_dir_failed', __( 'Unable to create destination directory.', 'hoatzinmedia-library-cleaner' ) );
        }

        return $destination_dir . DIRECTORY_SEPARATOR . $base_name . '.' . $format;
    }

    private function get_separate_destination_root() {
        return rtrim( WP_CONTENT_DIR, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-images';
    }

    private function get_url_from_path( $path ) {
        $content_dir = wp_normalize_path( rtrim( WP_CONTENT_DIR, '/\\' ) );
        $content_url = rtrim( WP_CONTENT_URL, '/\\' );
        $normalized_path = wp_normalize_path( $path );

        if ( 0 !== strpos( $normalized_path, $content_dir ) ) {
            return '';
        }

        $relative = ltrim( substr( $normalized_path, strlen( $content_dir ) ), '/\\' );
        return $content_url . '/' . str_replace( '\\', '/', $relative );
    }

    private function get_relative_upload_path_for_attachment( $attachment_id, $file_path ) {
        $meta_rel = get_post_meta( (int) $attachment_id, '_wp_attached_file', true );
        if ( is_string( $meta_rel ) && '' !== $meta_rel ) {
            return ltrim( str_replace( '\\', '/', $meta_rel ), '/' );
        }

        $uploads = wp_upload_dir();
        $upload_base = isset( $uploads['basedir'] ) ? wp_normalize_path( rtrim( $uploads['basedir'], '/\\' ) ) : '';
        $file_path_normalized = wp_normalize_path( (string) $file_path );

        if ( $upload_base && 0 === strpos( $file_path_normalized, $upload_base ) ) {
            return ltrim( substr( $file_path_normalized, strlen( $upload_base ) ), '/\\' );
        }

        return '';
    }

    private function get_relative_upload_path_from_absolute( $file_path ) {
        $uploads = wp_upload_dir();
        $upload_base = isset( $uploads['basedir'] ) ? wp_normalize_path( rtrim( $uploads['basedir'], '/\\' ) ) : '';
        $file_path_normalized = wp_normalize_path( (string) $file_path );

        if ( $upload_base && 0 === strpos( $file_path_normalized, $upload_base ) ) {
            return ltrim( substr( $file_path_normalized, strlen( $upload_base ) ), '/\\' );
        }

        return '';
    }

    private function get_converted_variant_paths_for_upload_path( $upload_path ) {
        $relative = $this->get_relative_upload_path_from_absolute( $upload_path );
        if ( '' === $relative ) {
            return [];
        }

        $relative = ltrim( str_replace( '\\', '/', $relative ), '/' );
        $dir = dirname( $relative );
        if ( '.' === $dir ) {
            $dir = '';
        }
        $base = wp_basename( $relative );
        $dot = strrpos( $base, '.' );
        $name = false !== $dot ? substr( $base, 0, $dot ) : $base;
        $source_ext = false !== $dot ? strtolower( substr( $base, $dot + 1 ) ) : '';
        if ( '' === $name ) {
            return [];
        }

        $root = rtrim( WP_CONTENT_DIR, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-images';
        $settings = $this->get_converter_settings();
        $dest_structure = isset( $settings['destinationStructure'] ) ? (string) $settings['destinationStructure'] : 'mirror-structure';
        $dest_dir = $root;
        if ( ( 'mirror-structure' === $dest_structure || 'roots' === $dest_structure || 'date' === $dest_structure ) && $dir ) {
            $dest_dir = $root . DIRECTORY_SEPARATOR . str_replace( '/', DIRECTORY_SEPARATOR, $dir );
        }

        $webp_style = $this->get_file_extension_style_for_format( $settings, 'webp' );
        $avif_style = $this->get_file_extension_style_for_format( $settings, 'avif' );
        $webp_base = ( 'append' === $webp_style && '' !== $source_ext ) ? ( $name . '.' . $source_ext ) : $name;
        $avif_base = ( 'append' === $avif_style && '' !== $source_ext ) ? ( $name . '.' . $source_ext ) : $name;

        return [
            'webp' => $dest_dir . DIRECTORY_SEPARATOR . $webp_base . '.webp',
            'avif' => $dest_dir . DIRECTORY_SEPARATOR . $avif_base . '.avif',
        ];
    }

    private function get_related_upload_paths( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return [];
        }

        $main = get_attached_file( $attachment_id );
        if ( ! $main || ! is_string( $main ) ) {
            return [];
        }

        $paths = [ $main ];

        $meta = wp_get_attachment_metadata( $attachment_id );
        if ( is_array( $meta ) && isset( $meta['sizes'] ) && is_array( $meta['sizes'] ) ) {
            $dir = dirname( $main );
            foreach ( $meta['sizes'] as $info ) {
                if ( ! is_array( $info ) ) {
                    continue;
                }
                $file = isset( $info['file'] ) ? (string) $info['file'] : '';
                if ( '' === $file ) {
                    continue;
                }
                $paths[] = $dir . DIRECTORY_SEPARATOR . $file;
            }
        }

        $paths = array_values( array_unique( array_filter( array_map( 'strval', $paths ) ) ) );
        return $paths;
    }

    private function get_wp_filesystem() {
        global $wp_filesystem;
        if ( $wp_filesystem && is_object( $wp_filesystem ) ) {
            return $wp_filesystem;
        }

        if ( ! function_exists( 'WP_Filesystem' ) ) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }

        $ok = WP_Filesystem();
        if ( $ok && $wp_filesystem && is_object( $wp_filesystem ) ) {
            return $wp_filesystem;
        }

        return null;
    }

    private function cleanup_empty_directories( $dir, $root ) {
        $dir = wp_normalize_path( (string) $dir );
        $root = wp_normalize_path( (string) $root );

        if ( '' === $dir || '' === $root ) {
            return;
        }

        $filesystem = $this->get_wp_filesystem();
        if ( ! $filesystem ) {
            return;
        }

        while ( $dir && 0 === strpos( $dir, $root ) && $dir !== $root ) {
            $entries = @scandir( $dir );
            if ( ! is_array( $entries ) ) {
                return;
            }
            $entries = array_values(
                array_filter(
                    $entries,
                    function ( $v ) {
                        return '.' !== $v && '..' !== $v;
                    }
                )
            );
            if ( ! empty( $entries ) ) {
                return;
            }
            if ( ! $filesystem->rmdir( $dir, false ) ) {
                return;
            }
            $dir = wp_normalize_path( dirname( $dir ) );
        }
    }

    private function get_converter_settings() {
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
        $settings['preventLargerWebp'] = (bool) $settings['preventLargerWebp'];
        return $settings;
    }

    private function get_file_extension_style_for_format( array $settings, $format ) {
        $format = strtolower( (string) $format );
        $opt = isset( $settings['fileExtension'] ) ? (string) $settings['fileExtension'] : '';
        if ( $format === 'webp' ) {
            if ( $opt === 'append-webp' ) {
                return 'append';
            }
            return 'replace';
        }
        if ( $format === 'avif' ) {
            if ( $opt === 'append-avif' ) {
                return 'append';
            }
            return 'replace';
        }
        return 'replace';
    }

    private function normalize_destination_structure( $destinationStructure, array $settings ) {
        $val = is_string( $destinationStructure ) ? strtolower( $destinationStructure ) : '';
        if ( in_array( $val, [ 'image-roots', 'mirror-structure', 'flat' ], true ) ) {
            return $val;
        }
        if ( $val === 'image-roots' ) {
            return 'image-roots';
        }
        if ( $val === 'roots' ) {
            return 'mirror-structure';
        }
        if ( $val === 'date' ) {
            return 'mirror-structure';
        }
        $fallback = isset( $settings['destinationStructure'] ) ? (string) $settings['destinationStructure'] : 'mirror-structure';
        return in_array( $fallback, [ 'image-roots', 'mirror-structure', 'flat' ], true ) ? $fallback : 'mirror-structure';
    }
}
