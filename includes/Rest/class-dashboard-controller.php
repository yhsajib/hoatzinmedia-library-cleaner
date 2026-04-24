<?php
namespace HoatzinMedia\Rest;

use HoatzinMedia\Service\Media_Health;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Dashboard_Controller {

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
            '/dashboard',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_dashboard' ],
                'permission_callback' => [ $this, 'permissions_check' ],
                'args'                => [
                    'force' => [
                        'type'    => 'boolean',
                        'default' => false,
                    ],
                ],
            ]
        );

        register_rest_route(
            'hoatzinmedia/v1',
            '/dashboard/uploads-breakdown',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_uploads_breakdown' ],
                'permission_callback' => [ $this, 'permissions_check' ],
                'args'                => [
                    'force' => [
                        'type'    => 'boolean',
                        'default' => false,
                    ],
                    'depth' => [
                        'type'    => 'integer',
                        'default' => 2,
                    ],
                    'max_entries' => [
                        'type'    => 'integer',
                        'default' => 200,
                    ],
                ],
            ]
        );
    }

    public function permissions_check() {
        return (bool) current_user_can( 'manage_options' );
    }

    public function get_dashboard( $request ) {
        $force_param = $request->get_param( 'force' );
        $force = $force_param ? filter_var( $force_param, FILTER_VALIDATE_BOOLEAN ) : false;

        if ( $force ) {
            delete_transient( 'hoatzinmedia_dashboard_stats' );
        }

        $cached = get_transient( 'hoatzinmedia_dashboard_stats' );

        if ( !$force && false !== $cached && is_array( $cached ) && isset( $cached['server_requirements'] ) ) {
            return $this->prepare_response( $cached );
        }

        $stats = $this->calculate_stats();

        set_transient( 'hoatzinmedia_dashboard_stats', $stats, 10 * MINUTE_IN_SECONDS );

        return $this->prepare_response( $stats );
    }

    public function get_uploads_breakdown( $request ) {
        $force_param = $request->get_param( 'force' );
        $force = $force_param ? filter_var( $force_param, FILTER_VALIDATE_BOOLEAN ) : false;

        $depth = (int) $request->get_param( 'depth' );
        if ( $depth < 1 ) {
            $depth = 1;
        }
        if ( $depth > 2 ) {
            $depth = 2;
        }

        $max_entries = (int) $request->get_param( 'max_entries' );
        if ( $max_entries < 10 ) {
            $max_entries = 10;
        }
        if ( $max_entries > 500 ) {
            $max_entries = 500;
        }

        $transient_key = 'hoatzinmedia_uploads_breakdown_d' . $depth . '_m' . $max_entries;

        if ( $force ) {
            delete_transient( $transient_key );
        }

        $cached = get_transient( $transient_key );
        if ( !$force && false !== $cached && is_array( $cached ) && isset( $cached['entries'] ) ) {
            return new \WP_REST_Response( $this->prepare_uploads_breakdown_response( $cached ) );
        }

        $breakdown = $this->calculate_uploads_breakdown( $depth, $max_entries );
        set_transient( $transient_key, $breakdown, 10 * MINUTE_IN_SECONDS );

        return new \WP_REST_Response( $this->prepare_uploads_breakdown_response( $breakdown ) );
    }

    private function calculate_stats() {
        $unused_count = 0;
        $last_meta = get_option( 'hoatzinmedia_last_unused_meta', [] );
        if ( is_array( $last_meta ) && isset( $last_meta['found'] ) ) {
            $unused_count = (int) $last_meta['found'];
        }

        $counts_by_mime = $this->get_counts_by_mime_type();
        $this->add_hoatzinmedia_images_file_types( $counts_by_mime );

        $total_files = 0;
        foreach ( $counts_by_mime as $mime => $count ) {
            if ( 'trash' === $mime ) {
                continue;
            }
            $total_files += (int) $count;
        }

        $total_size_bytes = 0;
        $large_files_over_3mb = 0;
        $largest_files_buffer = [];

        $max_ids_to_sample = 2000;
        $processed = 0;

        $paged = 1;
        $posts_per_page = 250;

        do {
            if ( $processed >= $max_ids_to_sample ) {
                break;
            }

            $query = new \WP_Query(
                [
                    'post_type'              => 'attachment',
                    'post_status'            => 'inherit',
                    'posts_per_page'         => $posts_per_page,
                    'paged'                  => $paged,
                    'fields'                 => 'ids',
                    'no_found_rows'          => true,
                    'update_post_meta_cache' => false,
                    'update_post_term_cache' => false,
                ]
            );

            if ( !$query->have_posts() ) {
                break;
            }

            foreach ( $query->posts as $attachment_id ) {
                if ( $processed >= $max_ids_to_sample ) {
                    break;
                }

                $processed++;
                $attachment_id = (int) $attachment_id;
                if ( $attachment_id <= 0 ) {
                    continue;
                }

                $size = $this->get_attachment_size_from_metadata( $attachment_id );
                if ( $size <= 0 ) {
                    continue;
                }

                $total_size_bytes += $size;

                if ( $size > ( 3 * 1024 * 1024 ) ) {
                    $large_files_over_3mb++;
                }

                $this->maybe_add_largest_file( $largest_files_buffer, $attachment_id, $size );
            }

            $paged++;
        } while ( $query->max_num_pages >= $paged );

        $largest_files = $this->normalize_largest_files( $largest_files_buffer );

        $total_files = (int) $total_files;
        $total_size_bytes = (int) $total_size_bytes;
        $unused_count = (int) $unused_count;
        $large_files_over_3mb = (int) $large_files_over_3mb;

        $health_service = new Media_Health();
        $health = $health_service->calculate(
            $total_files,
            $unused_count,
            $total_size_bytes,
            $large_files_over_3mb
        );

        $health_score = isset( $health['score'] ) ? (int) $health['score'] : 0;
        $total_size_readable = size_format( $total_size_bytes );

        $file_types_distribution = [];

        foreach ( $counts_by_mime as $type => $count ) {
            $key = (string) $type;
            $file_types_distribution[$key] = (int) $count;
        }

        $server_requirements = [
            'php_version'         => phpversion(),
            'memory_limit'        => ini_get( 'memory_limit' ),
            'upload_max_filesize' => ini_get( 'upload_max_filesize' ),
            'post_max_size'       => ini_get( 'post_max_size' ),
            'max_execution_time'  => ini_get( 'max_execution_time' ),
            'gd_installed'        => extension_loaded( 'gd' ),
            'imagick_installed'   => extension_loaded( 'imagick' ),
        ];

        return [
            'total_files'             => $total_files,
            'total_size_bytes'        => $total_size_bytes,
            'total_size_readable'     => sanitize_text_field( (string) $total_size_readable ),
            'unused_count'            => $unused_count,
            'largest_files'           => $largest_files,
            'file_types_distribution' => $file_types_distribution,
            'health_score'            => $health_score,
            'server_requirements'     => $server_requirements,
        ];
    }

    private function add_hoatzinmedia_images_file_types( &$file_types_counts ) {
        if ( ! is_array( $file_types_counts ) ) {
            $file_types_counts = [];
        }

        $dir = wp_normalize_path( rtrim( WP_CONTENT_DIR, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-images' );
        if ( '' === $dir || ! is_dir( $dir ) ) {
            return;
        }

        try {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS ),
                \RecursiveIteratorIterator::LEAVES_ONLY
            );
        } catch ( \Exception $e ) {
            return;
        }

        foreach ( $iterator as $file ) {
            try {
                if ( ! $file->isFile() ) {
                    continue;
                }
                $path = $file->getPathname();
                if ( ! is_string( $path ) || '' === $path ) {
                    continue;
                }

                $basename = wp_basename( $path );
                if ( ! is_string( $basename ) || '' === $basename ) {
                    continue;
                }
                if ( '.' === $basename[0] ) {
                    continue;
                }

                $info = wp_check_filetype( $basename );
                $mime = ( is_array( $info ) && ! empty( $info['type'] ) ) ? (string) $info['type'] : '';
                if ( '' === $mime || 0 !== strpos( $mime, 'image/' ) ) {
                    continue;
                }

                if ( ! isset( $file_types_counts[ $mime ] ) ) {
                    $file_types_counts[ $mime ] = 0;
                }
                $file_types_counts[ $mime ]++;
            } catch ( \Exception $e ) {
                continue;
            }
        }
    }

    private function get_attachment_size_from_metadata( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return 0;
        }

        $meta = wp_get_attachment_metadata( $attachment_id );
        if ( is_array( $meta ) ) {
            if ( isset( $meta['filesize'] ) ) {
                $size = (int) $meta['filesize'];
                if ( $size > 0 ) {
                    return $size;
                }
            }
            if ( isset( $meta['sizes'] ) && is_array( $meta['sizes'] ) ) {
                $sum = 0;
                foreach ( $meta['sizes'] as $size_meta ) {
                    if ( ! is_array( $size_meta ) ) {
                        continue;
                    }
                    if ( isset( $size_meta['filesize'] ) ) {
                        $s = (int) $size_meta['filesize'];
                        if ( $s > 0 ) {
                            $sum += $s;
                        }
                    }
                }
                if ( $sum > 0 ) {
                    return $sum;
                }
            }
        }

        $raw = get_post_meta( $attachment_id, '_wp_attachment_filesize', true );
        if ( is_numeric( $raw ) ) {
            $size = (int) $raw;
            return $size > 0 ? $size : 0;
        }

        return 0;
    }

    private function get_counts_by_mime_type() {
        $counts = [];
        $raw = wp_count_attachments();
        if ( is_object( $raw ) ) {
            $raw = get_object_vars( $raw );
        }
        if ( ! is_array( $raw ) ) {
            return $counts;
        }
        foreach ( $raw as $mime => $count ) {
            $key = (string) $mime;
            $counts[ $key ] = (int) $count;
        }
        return $counts;
    }

    private function get_recent_unoptimized_media() {
        $query = new \WP_Query(
            [
                'post_type'              => 'attachment',
                'post_status'            => 'inherit',
                'posts_per_page'         => 5,
                'post_mime_type'         => [ 'image/jpeg', 'image/png' ],
                'orderby'                => 'date',
                'order'                  => 'DESC',
                'fields'                 => 'ids',
                'no_found_rows'          => true,
                'update_post_meta_cache' => false,
                'update_post_term_cache' => false,
            ]
        );

        $results = [];

        foreach ( $query->posts as $id ) {
            $meta = wp_get_attachment_metadata( $id );
            $filesize = isset( $meta['filesize'] ) ? $meta['filesize'] : 0;

            if ( !$filesize ) {
                $path = get_attached_file( $id );
                if ( $path && @is_readable( $path ) ) {
                    $filesize = @filesize( $path );
                }
            }

            $results[] = [
                'id'            => $id,
                'filename'      => wp_basename( get_attached_file( $id ) ),
                'url'           => wp_get_attachment_url( $id ),
                'mime_type'     => get_post_mime_type( $id ),
                'date'          => get_the_date( 'Y-m-d', $id ),
                'size_readable' => size_format( $filesize ),
                'thumbnail_url' => wp_get_attachment_image_url( $id, 'thumbnail' ),
            ];
        }

        return $results;
    }

    private function maybe_add_largest_file( array &$buffer, $attachment_id, $size ) {
        $buffer[] = [
            'id'         => (int) $attachment_id,
            'size_bytes' => (int) $size,
        ];

        usort(
            $buffer,
            function ( $a, $b ) {
                if ( $a['size_bytes'] === $b['size_bytes'] ) {
                    return 0;
                }

                return ( $a['size_bytes'] > $b['size_bytes'] ) ? -1 : 1;
            }
        );

        if ( count( $buffer ) > 10 ) {
            $buffer = array_slice( $buffer, 0, 10 );
        }
    }

    private function normalize_largest_files( array $buffer ) {
        $result = [];

        foreach ( $buffer as $entry ) {
            $attachment_id = (int) $entry['id'];
            $size_bytes = (int) $entry['size_bytes'];

            $url = wp_get_attachment_url( $attachment_id );
            $filename = wp_basename( $url );
            $mime_type = (string) get_post_mime_type( $attachment_id );

            $variant = $this->get_preferred_converted_variant_for_attachment( $attachment_id );
            if ( ! empty( $variant ) ) {
                $url = isset( $variant['url'] ) ? (string) $variant['url'] : $url;
                $filename = isset( $variant['filename'] ) ? (string) $variant['filename'] : $filename;
                $mime_type = isset( $variant['mime_type'] ) ? (string) $variant['mime_type'] : $mime_type;
                if ( isset( $variant['size_bytes'] ) && (int) $variant['size_bytes'] > 0 ) {
                    $size_bytes = (int) $variant['size_bytes'];
                }
            }

            $result[] = [
                'id'            => $attachment_id,
                'size_bytes'    => $size_bytes,
                'size_readable' => sanitize_text_field( (string) size_format( $size_bytes ) ),
                'url'           => esc_url_raw( $url ),
                'filename'      => sanitize_file_name( $filename ),
                'mime_type'     => sanitize_text_field( $mime_type ),
            ];
        }

        usort(
            $result,
            function ( $a, $b ) {
                $as = isset( $a['size_bytes'] ) ? (int) $a['size_bytes'] : 0;
                $bs = isset( $b['size_bytes'] ) ? (int) $b['size_bytes'] : 0;
                if ( $as === $bs ) {
                    return 0;
                }
                return ( $as > $bs ) ? -1 : 1;
            }
        );

        return $result;
    }

    private function get_preferred_converted_variant_for_attachment( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return [];
        }

        $mime = (string) get_post_mime_type( $attachment_id );
        if ( $mime === 'image/webp' || $mime === 'image/avif' ) {
            return [];
        }

        $chosen_path = '';
        $chosen_mime = '';

        if ( class_exists( 'HoatzinMedia\\Service\\Converter' ) ) {
            $variants = \HoatzinMedia\Service\Converter::get_instance()->get_converted_variant_paths( $attachment_id );
            if ( is_array( $variants ) ) {
                $avif_path = isset( $variants['avif'] ) ? (string) $variants['avif'] : '';
                $webp_path = isset( $variants['webp'] ) ? (string) $variants['webp'] : '';

                if ( '' !== $avif_path && file_exists( $avif_path ) && is_readable( $avif_path ) ) {
                    $chosen_path = $avif_path;
                    $chosen_mime = 'image/avif';
                } elseif ( '' !== $webp_path && file_exists( $webp_path ) && is_readable( $webp_path ) ) {
                    $chosen_path = $webp_path;
                    $chosen_mime = 'image/webp';
                }
            }
        }

        if ( '' === $chosen_path ) {
            return [];
        }

        $size_raw = @filesize( $chosen_path );
        $size_bytes = ( false !== $size_raw && $size_raw > 0 ) ? (int) $size_raw : 0;
        $url = $this->get_content_url_from_path( $chosen_path );
        if ( '' === $url ) {
            return [];
        }

        $payload = [
            'url'       => esc_url_raw( $url ),
            'filename'  => sanitize_file_name( wp_basename( $chosen_path ) ),
            'mime_type' => sanitize_text_field( $chosen_mime ),
        ];

        if ( $size_bytes > 0 ) {
            $payload['size_bytes'] = $size_bytes;
        }

        return $payload;
    }

    private function get_content_url_from_path( $path ) {
        $content_dir = wp_normalize_path( rtrim( WP_CONTENT_DIR, '/\\' ) );
        $content_url = rtrim( WP_CONTENT_URL, '/\\' );
        $normalized_path = wp_normalize_path( (string) $path );

        if ( '' === $content_dir || '' === $content_url || '' === $normalized_path ) {
            return '';
        }

        if ( 0 !== strpos( $normalized_path, $content_dir ) ) {
            return '';
        }

        $relative = ltrim( substr( $normalized_path, strlen( $content_dir ) ), '/\\' );
        return $content_url . '/' . str_replace( '\\', '/', $relative );
    }

    private function prepare_response( array $data ) {
        $response = [
            'total_files'             => isset( $data['total_files'] ) ? (int) $data['total_files'] : 0,
            'total_size_bytes'        => isset( $data['total_size_bytes'] ) ? (int) $data['total_size_bytes'] : 0,
            'total_size_readable'     => isset( $data['total_size_readable'] ) ? sanitize_text_field( (string) $data['total_size_readable'] ) : '',
            'unused_count'            => isset( $data['unused_count'] ) ? (int) $data['unused_count'] : 0,
            'largest_files'           => [],
            'file_types_distribution' => [],
            'health_score'            => isset( $data['health_score'] ) ? (int) $data['health_score'] : 0,
            'server_requirements'     => isset( $data['server_requirements'] ) ? $data['server_requirements'] : [],
            'recent_unoptimized'      => isset( $data['recent_unoptimized'] ) ? $data['recent_unoptimized'] : [],
        ];

        if ( !empty( $data['largest_files'] ) && is_array( $data['largest_files'] ) ) {
            foreach ( $data['largest_files'] as $entry ) {
                $response['largest_files'][] = [
                    'id'            => isset( $entry['id'] ) ? (int) $entry['id'] : 0,
                    'size_bytes'    => isset( $entry['size_bytes'] ) ? (int) $entry['size_bytes'] : 0,
                    'size_readable' => isset( $entry['size_readable'] ) ? sanitize_text_field( (string) $entry['size_readable'] ) : '',
                    'url'           => isset( $entry['url'] ) ? esc_url_raw( $entry['url'] ) : '',
                    'filename'      => isset( $entry['filename'] ) ? sanitize_file_name( $entry['filename'] ) : '',
                    'mime_type'     => isset( $entry['mime_type'] ) ? sanitize_text_field( (string) $entry['mime_type'] ) : '',
                ];
            }
        }

        if ( !empty( $data['file_types_distribution'] ) && is_array( $data['file_types_distribution'] ) ) {
            foreach ( $data['file_types_distribution'] as $type => $count ) {
                $key = (string) $type;
                $response['file_types_distribution'][$key] = (int) $count;
            }
        }

        if ( ! empty( $response['largest_files'] ) ) {
            usort(
                $response['largest_files'],
                function ( $a, $b ) {
                    $as = isset( $a['size_bytes'] ) ? (int) $a['size_bytes'] : 0;
                    $bs = isset( $b['size_bytes'] ) ? (int) $b['size_bytes'] : 0;
                    if ( $as === $bs ) {
                        return 0;
                    }
                    return ( $as > $bs ) ? -1 : 1;
                }
            );
        }

        return new \WP_REST_Response( $response );
    }

    private function calculate_uploads_breakdown( $depth, $max_entries ) {
        $depth = (int) $depth;
        $max_entries = (int) $max_entries;

        $counts = [
            'uploads'          => [],
            'hoatzinmedia-images' => [],
        ];

        $totals = [
            'uploads'            => 0,
            'hoatzinmedia-images' => 0,
            'overall'            => 0,
        ];

        $this->add_attachments_breakdown_counts( $counts['uploads'], $totals['uploads'], $depth );
        $this->add_hoatzinmedia_images_breakdown_counts( $counts['hoatzinmedia-images'], $totals['hoatzinmedia-images'], $depth );
        $totals['overall'] = (int) $totals['uploads'] + (int) $totals['hoatzinmedia-images'];

        $entries = [];
        foreach ( $counts as $base => $folders ) {
            if ( ! is_array( $folders ) ) {
                continue;
            }
            foreach ( $folders as $folder => $count ) {
                $folder = (string) $folder;
                if ( '' === $folder ) {
                    continue;
                }
                $entries[] = [
                    'base'       => (string) $base,
                    'folder'     => $folder,
                    'file_count' => (int) $count,
                    'truncated'  => false,
                ];
            }
        }

        usort(
            $entries,
            function ( $a, $b ) {
                $ac = isset( $a['file_count'] ) ? (int) $a['file_count'] : 0;
                $bc = isset( $b['file_count'] ) ? (int) $b['file_count'] : 0;
                if ( $ac === $bc ) {
                    return 0;
                }
                return ( $ac > $bc ) ? -1 : 1;
            }
        );

        $limited = $entries;
        if ( $max_entries > 0 && count( $limited ) > $max_entries ) {
            $limited = array_slice( $limited, 0, $max_entries );
        }

        return [
            'generated_at' => time(),
            'depth'        => $depth,
            'max_entries'  => $max_entries,
            'totals'       => $totals,
            'entries'      => $limited,
        ];
    }

    private function add_attachments_breakdown_counts( array &$counts, &$total, $depth ) {
        $total = 0;

        $paged = 1;
        $posts_per_page = 500;

        do {
            $query = new \WP_Query(
                [
                    'post_type'              => 'attachment',
                    'post_status'            => [ 'inherit', 'private' ],
                    'posts_per_page'         => $posts_per_page,
                    'paged'                  => $paged,
                    'fields'                 => 'ids',
                    'update_post_meta_cache' => false,
                    'update_post_term_cache' => false,
                ]
            );

            if ( !$query->have_posts() ) {
                break;
            }

            foreach ( $query->posts as $attachment_id ) {
                $attachment_id = (int) $attachment_id;
                if ( $attachment_id <= 0 ) {
                    continue;
                }

                $rel = get_post_meta( $attachment_id, '_wp_attached_file', true );
                if ( ! is_string( $rel ) || '' === $rel ) {
                    continue;
                }
                $rel = wp_normalize_path( $rel );
                $folder = $this->get_breakdown_folder_from_relative_path( $rel, $depth );
                if ( '' === $folder ) {
                    $folder = 'unknown';
                }

                if ( ! isset( $counts[ $folder ] ) ) {
                    $counts[ $folder ] = 0;
                }
                $counts[ $folder ]++;
                $total++;
            }

            $paged++;
        } while ( true );
    }

    private function add_hoatzinmedia_images_breakdown_counts( array &$counts, &$total, $depth ) {
        $total = 0;
        $dir = wp_normalize_path( rtrim( WP_CONTENT_DIR, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-images' );
        if ( '' === $dir || ! is_dir( $dir ) ) {
            return;
        }

        try {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS ),
                \RecursiveIteratorIterator::LEAVES_ONLY
            );
        } catch ( \Exception $e ) {
            return;
        }

        $dir_prefix = rtrim( $dir, '/\\' ) . '/';

        foreach ( $iterator as $file ) {
            try {
                if ( ! $file->isFile() ) {
                    continue;
                }
                $path = $file->getPathname();
                if ( ! is_string( $path ) || '' === $path ) {
                    continue;
                }
                $path = wp_normalize_path( $path );

                $basename = wp_basename( $path );
                if ( ! is_string( $basename ) || '' === $basename ) {
                    continue;
                }
                if ( '.' === $basename[0] ) {
                    continue;
                }

                $info = wp_check_filetype( $basename );
                $mime = ( is_array( $info ) && ! empty( $info['type'] ) ) ? (string) $info['type'] : '';
                if ( '' === $mime || 0 !== strpos( $mime, 'image/' ) ) {
                    continue;
                }

                $rel = $path;
                if ( 0 === strpos( $path, $dir_prefix ) ) {
                    $rel = substr( $path, strlen( $dir_prefix ) );
                }
                $folder = $this->get_breakdown_folder_from_relative_path( $rel, $depth );
                if ( '' === $folder ) {
                    $folder = 'unknown';
                }

                if ( ! isset( $counts[ $folder ] ) ) {
                    $counts[ $folder ] = 0;
                }
                $counts[ $folder ]++;
                $total++;
            } catch ( \Exception $e ) {
                continue;
            }
        }
    }

    private function get_breakdown_folder_from_relative_path( $rel_path, $depth ) {
        $rel_path = wp_normalize_path( (string) $rel_path );
        $rel_path = ltrim( $rel_path, '/\\' );

        if ( '' === $rel_path ) {
            return '';
        }

        $parts = explode( '/', $rel_path );
        $parts = array_values( array_filter( $parts, 'strlen' ) );
        if ( empty( $parts ) ) {
            return '';
        }

        $first = isset( $parts[0] ) ? (string) $parts[0] : '';
        $second = isset( $parts[1] ) ? (string) $parts[1] : '';

        if ( 2 === (int) $depth && preg_match( '/^\d{4}$/', $first ) && preg_match( '/^\d{2}$/', $second ) ) {
            return $first . '/' . $second;
        }

        return $first;
    }

    private function count_files_in_dir( $dir, $max_files ) {
        $dir = wp_normalize_path( (string) $dir );
        $max_files = (int) $max_files;
        if ( $max_files <= 0 ) {
            $max_files = 500000;
        }

        $count = 0;
        $truncated = false;

        try {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS ),
                \RecursiveIteratorIterator::LEAVES_ONLY
            );
        } catch ( \Exception $e ) {
            return [
                'count'     => 0,
                'truncated' => false,
            ];
        }

        foreach ( $iterator as $file ) {
            try {
                if ( ! $file->isFile() ) {
                    continue;
                }
                $count++;
                if ( $count >= $max_files ) {
                    $truncated = true;
                    break;
                }
            } catch ( \Exception $e ) {
                continue;
            }
        }

        return [
            'count'     => (int) $count,
            'truncated' => (bool) $truncated,
        ];
    }

    private function prepare_uploads_breakdown_response( array $data ) {
        $response = [
            'generated_at' => isset( $data['generated_at'] ) ? (int) $data['generated_at'] : 0,
            'depth'        => isset( $data['depth'] ) ? (int) $data['depth'] : 2,
            'max_entries'  => isset( $data['max_entries'] ) ? (int) $data['max_entries'] : 0,
            'totals'       => [
                'uploads'            => 0,
                'hoatzinmedia-images' => 0,
                'overall'            => 0,
            ],
            'entries'      => [],
        ];

        if ( isset( $data['totals'] ) && is_array( $data['totals'] ) ) {
            $response['totals'] = [
                'uploads'            => isset( $data['totals']['uploads'] ) ? (int) $data['totals']['uploads'] : 0,
                'hoatzinmedia-images' => isset( $data['totals']['hoatzinmedia-images'] ) ? (int) $data['totals']['hoatzinmedia-images'] : 0,
                'overall'            => isset( $data['totals']['overall'] ) ? (int) $data['totals']['overall'] : 0,
            ];
        }

        if ( isset( $data['entries'] ) && is_array( $data['entries'] ) ) {
            foreach ( $data['entries'] as $entry ) {
                if ( ! is_array( $entry ) ) {
                    continue;
                }
                $base = isset( $entry['base'] ) ? sanitize_key( (string) $entry['base'] ) : '';
                $folder = isset( $entry['folder'] ) ? sanitize_text_field( (string) $entry['folder'] ) : '';
                if ( '' === $folder ) {
                    continue;
                }
                if ( '' === $base ) {
                    $base = 'uploads';
                }
                if ( 'hoatzinmedia-images' !== $base ) {
                    $base = 'uploads';
                }
                $response['entries'][] = [
                    'base'       => $base,
                    'folder'     => $folder,
                    'file_count' => isset( $entry['file_count'] ) ? (int) $entry['file_count'] : 0,
                    'truncated'  => isset( $entry['truncated'] ) ? (bool) $entry['truncated'] : false,
                ];
            }
        }

        return $response;
    }
}
