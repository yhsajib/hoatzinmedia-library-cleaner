<?php
namespace HoatzinMedia\Rest;

use HoatzinMedia\Service\Converter;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Image_Formats_Controller {

    private static $instance;

    private function __construct() {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
        add_action( 'hoatzinmedia_convert_job_run', [ $this, 'run_job' ], 10, 1 );
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
            '/image-formats/library',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'get_library_items' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'page'     => [
                            'sanitize_callback' => 'absint',
                        ],
                        'per_page' => [
                            'sanitize_callback' => 'absint',
                        ],
                    ],
                ],
            ]
        );
        register_rest_route(
            'hoatzinmedia/v1',
            '/image-formats/library/ids',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'get_all_ids' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                ],
            ]
        );

        register_rest_route(
            'hoatzinmedia/v1',
            '/image-formats/convert',
            [
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'convert_items' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'ids'                => [],
                        'format'             => [],
                        'workflow'           => [],
                        'quality'            => [],
                        'destinationFolder'  => [],
                        'destinationStructure' => [],
                    ],
                ],
            ]
        );
        register_rest_route(
            'hoatzinmedia/v1',
            '/image-formats/background',
            [
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'background_enqueue' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'ids'                => [],
                        'format'             => [],
                        'quality'            => [],
                        'destinationFolder'  => [],
                        'destinationStructure' => [],
                    ],
                ],
            ]
        );
        register_rest_route(
            'hoatzinmedia/v1',
            '/image-formats/background/status',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'background_status' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'job_id' => [
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                    ],
                ],
            ]
        );
        register_rest_route(
            'hoatzinmedia/v1',
            '/image-formats/background/log',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'background_log' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'job_id' => [
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                    ],
                ],
            ]
        );
        register_rest_route(
            'hoatzinmedia/v1',
            '/image-formats/background/cancel',
            [
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'background_cancel' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'job_id' => [
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                    ],
                ],
            ]
        );

        register_rest_route(
            'hoatzinmedia/v1',
            '/image-formats/background/pause',
            [
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'background_pause' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'job_id' => [
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                    ],
                ],
            ]
        );

        register_rest_route(
            'hoatzinmedia/v1',
            '/image-formats/background/resume',
            [
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'background_resume' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'job_id' => [
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                    ],
                ],
            ]
        );

        register_rest_route(
            'hoatzinmedia/v1',
            '/image-formats/delete',
            [
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'delete_attachments' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'ids' => [],
                    ],
                ],
            ]
        );
    }

    public function permissions_check( $request ) {
        if ( !current_user_can( 'manage_options' ) ) {
            return new \WP_Error(
                'hoatzinmedia_forbidden',
                esc_html__( 'You are not allowed to perform this action.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => rest_authorization_required_code(),
                ]
            );
        }

        $nonce = $request->get_header( 'X-WP-Nonce' );

        if ( !$nonce || !wp_verify_nonce( $nonce, 'wp_rest' ) ) {
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

    public function get_library_items( $request ) {
        $page = (int) $request->get_param( 'page' );
        $per_page = (int) $request->get_param( 'per_page' );

        if ( $page <= 0 ) {
            $page = 1;
        }

        if ( $per_page <= 0 ) {
            $per_page = 20;
        } elseif ( $per_page > 100 ) {
            $per_page = 100;
        }

        $query = new \WP_Query(
            [
                'post_type'              => 'attachment',
                'post_status'            => 'inherit',
                'posts_per_page'         => $per_page,
                'paged'                  => $page,
                'orderby'                => 'ID',
                'order'                  => 'DESC',
                'fields'                 => 'ids',
                'no_found_rows'          => false,
                'update_post_meta_cache' => false,
                'update_post_term_cache' => false,
                'post_mime_type'         => [ 'image/jpeg', 'image/png' ],
                'meta_query'             => [
                    'relation' => 'AND',
                    [
                        'key'     => '_hoatzinmedia_converted_webp',
                        'compare' => 'NOT EXISTS',
                    ],
                    [
                        'key'     => '_hoatzinmedia_converted_avif',
                        'compare' => 'NOT EXISTS',
                    ],
                ],
            ]
        );

        $items = [];

        if ( $query->have_posts() ) {
            foreach ( $query->posts as $attachment_id ) {
                $attachment_id = (int) $attachment_id;

                if ( $attachment_id <= 0 ) {
                    continue;
                }

                $existing = $this->mark_converted_meta_if_files_exist( $attachment_id );
                if ( ! empty( $existing['webp'] ) || ! empty( $existing['avif'] ) ) {
                    continue;
                }

                $url = wp_get_attachment_url( $attachment_id );
                $path = get_attached_file( $attachment_id );

                if ( !$url || !$path ) {
                    continue;
                }

                $basename = wp_basename( $url );

                $meta = wp_get_attachment_metadata( $attachment_id );
                $filesize = isset( $meta['filesize'] ) ? $meta['filesize'] : 0;

                if ( !$filesize ) {
                    if ( $path && @is_readable( $path ) ) {
                        $filesize = @filesize( $path );
                    }
                }

                $items[] = [
                    'id'            => $attachment_id,
                    'file_name'     => sanitize_file_name( $basename ),
                    'file_url'      => esc_url_raw( $url ),
                    'mime_type'     => get_post_mime_type( $attachment_id ),
                    'date'          => get_the_date( 'Y-m-d', $attachment_id ),
                    'size_readable' => size_format( $filesize ),
                    'thumbnail_url' => wp_get_attachment_image_url( $attachment_id, 'thumbnail' ),
                    'has_webp'      => false,
                    'has_avif'      => false,
                    'can_convert'   => true,
                ];
            }
        }

        $total = count( $items );
        $total_pages = 0;

        if ( $per_page > 0 && $total > 0 ) {
            $total_pages = (int) ceil( $total / $per_page );
        }

        $data = [
            'page'        => $page,
            'per_page'    => $per_page,
            'total'       => $total,
            'total_pages' => $total_pages,
            'items'       => $items,
        ];

        return new \WP_REST_Response( $data );
    }

    public function get_all_ids( $request ) {
        $q = new \WP_Query(
            [
                'post_type'              => 'attachment',
                'post_status'            => 'inherit',
                'posts_per_page'         => -1,
                'orderby'                => 'ID',
                'order'                  => 'DESC',
                'fields'                 => 'ids',
                'no_found_rows'          => true,
                'update_post_meta_cache' => false,
                'update_post_term_cache' => false,
                'post_mime_type'         => [ 'image/jpeg', 'image/png' ],
                'meta_query'             => [
                    'relation' => 'AND',
                    [
                        'key'     => '_hoatzinmedia_converted_webp',
                        'compare' => 'NOT EXISTS',
                    ],
                    [
                        'key'     => '_hoatzinmedia_converted_avif',
                        'compare' => 'NOT EXISTS',
                    ],
                ],
            ]
        );
        $ids = [];
        if ( $q->have_posts() ) {
            foreach ( $q->posts as $attachment_id ) {
                $attachment_id = (int) $attachment_id;
                if ( $attachment_id <= 0 ) {
                    continue;
                }

                $existing = $this->mark_converted_meta_if_files_exist( $attachment_id );
                if ( ! empty( $existing['webp'] ) || ! empty( $existing['avif'] ) ) {
                    continue;
                }

                $ids[] = $attachment_id;
            }
        }
        return new \WP_REST_Response(
            [
                'ids'   => $ids,
                'total' => count( $ids ),
            ]
        );
    }

    private function mark_converted_meta_if_files_exist( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return [ 'webp' => false, 'avif' => false ];
        }

        $has_webp = (bool) get_post_meta( $attachment_id, '_hoatzinmedia_converted_webp', true );
        $has_avif = (bool) get_post_meta( $attachment_id, '_hoatzinmedia_converted_avif', true );

        if ( $has_webp && $has_avif ) {
            return [ 'webp' => true, 'avif' => true ];
        }

        $rel = get_post_meta( $attachment_id, '_wp_attached_file', true );
        if ( ! is_string( $rel ) || '' === $rel ) {
            $abs = get_attached_file( $attachment_id );
            $uploads = wp_upload_dir();
            $base = isset( $uploads['basedir'] ) ? wp_normalize_path( rtrim( (string) $uploads['basedir'], '/\\' ) ) : '';
            $absn = wp_normalize_path( (string) $abs );
            if ( $base && $absn && 0 === strpos( $absn, $base ) ) {
                $rel = ltrim( substr( $absn, strlen( $base ) ), '/\\' );
            }
        }

        if ( ! is_string( $rel ) || '' === $rel ) {
            return [ 'webp' => $has_webp, 'avif' => $has_avif ];
        }

        $rel = ltrim( str_replace( '\\', '/', $rel ), '/' );
        $dir = dirname( $rel );
        if ( '.' === $dir ) {
            $dir = '';
        }
        $base = wp_basename( $rel );
        $dot = strrpos( $base, '.' );
        $name = false !== $dot ? substr( $base, 0, $dot ) : $base;
        $ext = false !== $dot ? strtolower( substr( $base, $dot + 1 ) ) : '';
        if ( '' === $name ) {
            return [ 'webp' => $has_webp, 'avif' => $has_avif ];
        }

        $converted_root = wp_normalize_path( rtrim( WP_CONTENT_DIR, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-images' );
        $mirror_dir = $dir ? wp_normalize_path( $converted_root . DIRECTORY_SEPARATOR . str_replace( '/', DIRECTORY_SEPARATOR, $dir ) ) : $converted_root;
        $flat_dir = $converted_root;

        $candidates = [
            'webp' => [],
            'avif' => [],
        ];

        $candidates['webp'][] = $name . '.webp';
        $candidates['avif'][] = $name . '.avif';
        if ( '' !== $ext ) {
            $candidates['webp'][] = $name . '.' . $ext . '.webp';
            $candidates['avif'][] = $name . '.' . $ext . '.avif';
        }

        foreach ( $candidates['webp'] as $file ) {
            if ( file_exists( $mirror_dir . DIRECTORY_SEPARATOR . $file ) || file_exists( $flat_dir . DIRECTORY_SEPARATOR . $file ) ) {
                $has_webp = true;
                break;
            }
        }
        foreach ( $candidates['avif'] as $file ) {
            if ( file_exists( $mirror_dir . DIRECTORY_SEPARATOR . $file ) || file_exists( $flat_dir . DIRECTORY_SEPARATOR . $file ) ) {
                $has_avif = true;
                break;
            }
        }

        if ( $has_webp && ! get_post_meta( $attachment_id, '_hoatzinmedia_converted_webp', true ) ) {
            update_post_meta( $attachment_id, '_hoatzinmedia_converted_webp', '1' );
        }
        if ( $has_avif && ! get_post_meta( $attachment_id, '_hoatzinmedia_converted_avif', true ) ) {
            update_post_meta( $attachment_id, '_hoatzinmedia_converted_avif', '1' );
        }

        return [ 'webp' => $has_webp, 'avif' => $has_avif ];
    }
    public function convert_items( $request ) {
        $ids = $request->get_param( 'ids' );
        $format = $request->get_param( 'format' );
        $workflow = $request->get_param( 'workflow' );
        $quality = $request->get_param( 'quality' );

        if ( !is_array( $ids ) ) {
            $ids = [];
        }

        $format = is_string( $format ) ? strtolower( $format ) : '';
        $workflow = is_string( $workflow ) ? strtolower( $workflow ) : '';
        $destination_folder = $request->get_param( 'destinationFolder' );
        $destination_structure = $request->get_param( 'destinationStructure' );

        $converter_defaults = [
            'destinationFolder'    => 'separate',
            'destinationStructure' => 'mirror-structure',
            'fileExtension'        => 'replace-webp',
            'cacheControl'         => 'do-not-set',
            'preventLargerWebp'    => true,
        ];
        $converter_settings = get_option( 'hoatzinmedia_converter_settings', $converter_defaults );
        if ( ! is_array( $converter_settings ) ) {
            $converter_settings = $converter_defaults;
        }
        $converter_settings = wp_parse_args( $converter_settings, $converter_defaults );

        $ids = array_filter(
            array_map(
                function ( $value ) {
                    return (int) $value;
                },
                $ids
            ),
            function ( $value ) {
                return $value > 0;
            }
        );

        if ( empty( $ids ) ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_request',
                esc_html__( 'No images selected for conversion.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => 400,
                ]
            );
        }

        if ( 'webp' !== $format && 'avif' !== $format ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_format',
                esc_html__( 'Unsupported target format.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => 400,
                ]
            );
        }

        if ( 'upload' !== $workflow && 'bulk' !== $workflow && 'single' !== $workflow ) {
            $workflow = 'single';
        }

        $destination_folder = is_string( $destination_folder ) && '' !== $destination_folder ? strtolower( $destination_folder ) : strtolower( (string) $converter_settings['destinationFolder'] );
        if ( 'separate' !== $destination_folder ) {
            $destination_folder = 'same';
        }

        $destination_structure = is_string( $destination_structure ) && '' !== $destination_structure ? strtolower( $destination_structure ) : strtolower( (string) $converter_settings['destinationStructure'] );
        if ( ! in_array( $destination_structure, [ 'mirror-structure', 'image-roots', 'flat', 'roots', 'date' ], true ) ) {
            $destination_structure = 'mirror-structure';
        }

        $q = null;
        if ( is_numeric( $quality ) ) {
            $q = (int) $quality;
            if ( $q < 1 ) {
                $q = 1;
            } elseif ( $q > 100 ) {
                $q = 100;
            }
        }

        $results = [];

        foreach ( $ids as $attachment_id ) {
            $result = Converter::get_instance()->convert_attachment( $attachment_id, $format, $q, $destination_folder, $destination_structure, $converter_settings );

            if ( is_wp_error( $result ) ) {
                $results[] = [
                    'id'      => $attachment_id,
                    'status'  => 'error',
                    'message' => $result->get_error_message(),
                ];
            } else {
                $results[] = [
                    'id'       => $attachment_id,
                    'status'   => 'success',
                    'message'  => __( 'Converted successfully.', 'hoatzinmedia-library-cleaner' ),
                    'new_file' => $result,
                ];
            }
        }

        $data = [
            'format'   => $format,
            'workflow' => $workflow,
            'results'  => $results,
        ];

        return new \WP_REST_Response( $data );
    }

    private function get_job_option_key( $job_id ) {
        return 'hoatzinmedia_convert_job_' . $job_id;
    }

    private function get_logs_dir() {
        $uploads = wp_upload_dir();
        $base = isset( $uploads['basedir'] ) ? (string) $uploads['basedir'] : '';
        if ( '' === $base ) {
            return '';
        }
        return rtrim( $base, '/\\' ) . DIRECTORY_SEPARATOR . 'hoatzinmedia-logs';
    }

    private function ensure_log_file( array $job ) {
        if ( isset( $job['log_file'] ) && is_string( $job['log_file'] ) && '' !== $job['log_file'] ) {
            return $job;
        }
        $dir = $this->get_logs_dir();
        if ( '' === $dir ) {
            return $job;
        }
        if ( !wp_mkdir_p( $dir ) ) {
            return $job;
        }
        $job_id = isset( $job['job_id'] ) ? (string) $job['job_id'] : '';
        if ( '' === $job_id ) {
            return $job;
        }
        $job['log_file'] = $dir . DIRECTORY_SEPARATOR . 'convert-' . sanitize_file_name( $job_id ) . '.log';
        return $job;
    }

    private function append_log( $file, $line ) {
        $path = is_string( $file ) ? $file : '';
        if ( '' === $path ) {
            return;
        }
        $text = is_string( $line ) ? $line : '';
        if ( '' === $text ) {
            return;
        }
        if ( substr( $text, -1 ) !== "\n" ) {
            $text .= "\n";
        }
        @file_put_contents( $path, $text, FILE_APPEND | LOCK_EX );
    }

    private function job_log_download_url( $job_id ) {
        $job_id = is_string( $job_id ) ? $job_id : '';
        if ( '' === $job_id ) {
            return '';
        }
        return rest_url( 'hoatzinmedia/v1/image-formats/background/log?job_id=' . rawurlencode( $job_id ) );
    }

    private function build_preview_items( array $ids ) {
        $preview = [];
        $slice = array_slice( $ids, 0, 6 );
        foreach ( $slice as $attachment_id ) {
            $attachment_id = (int) $attachment_id;
            if ( $attachment_id <= 0 ) {
                continue;
            }
            $thumb = wp_get_attachment_image_url( $attachment_id, 'thumbnail' );
            $url = wp_get_attachment_url( $attachment_id );
            $name = $url ? wp_basename( $url ) : '';
            $preview[] = [
                'id'            => $attachment_id,
                'thumbnail_url' => $thumb ? esc_url_raw( $thumb ) : '',
                'file_url'      => $url ? esc_url_raw( $url ) : '',
                'file_name'     => $name ? sanitize_file_name( $name ) : '',
            ];
        }
        return $preview;
    }

    public function background_enqueue( $request ) {
        $ids = $request->get_param( 'ids' );
        $format = $request->get_param( 'format' );
        $quality = $request->get_param( 'quality' );
        $destination_folder = $request->get_param( 'destinationFolder' );
        $destination_structure = $request->get_param( 'destinationStructure' );

        $converter_defaults = [
            'destinationFolder'    => 'separate',
            'destinationStructure' => 'mirror-structure',
            'fileExtension'        => 'replace-webp',
            'cacheControl'         => 'do-not-set',
            'preventLargerWebp'    => true,
        ];
        $converter_settings = get_option( 'hoatzinmedia_converter_settings', $converter_defaults );
        if ( ! is_array( $converter_settings ) ) {
            $converter_settings = $converter_defaults;
        }
        $converter_settings = wp_parse_args( $converter_settings, $converter_defaults );

        if ( !is_array( $ids ) ) {
            $ids = [];
        }
        $ids = array_filter(
            array_map(
                function ( $v ) {
                    return (int) $v;
                },
                $ids
            ),
            function ( $v ) {
                return $v > 0;
            }
        );
        $format = is_string( $format ) ? strtolower( $format ) : '';
        if ( 'webp' !== $format && 'avif' !== $format ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_format',
                esc_html__( 'Unsupported target format.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 400 ]
            );
        }

        $destination_folder = is_string( $destination_folder ) && '' !== $destination_folder ? strtolower( $destination_folder ) : strtolower( (string) $converter_settings['destinationFolder'] );
        if ( 'separate' !== $destination_folder ) {
            $destination_folder = 'same';
        }

        $destination_structure = is_string( $destination_structure ) && '' !== $destination_structure ? strtolower( $destination_structure ) : strtolower( (string) $converter_settings['destinationStructure'] );
        if ( ! in_array( $destination_structure, [ 'mirror-structure', 'image-roots', 'flat', 'roots', 'date' ], true ) ) {
            $destination_structure = 'mirror-structure';
        }

        $q = null;
        if ( is_numeric( $quality ) ) {
            $q = (int) $quality;
            if ( $q < 1 ) {
                $q = 1;
            } elseif ( $q > 100 ) {
                $q = 100;
            }
        }
        if ( empty( $ids ) ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_request',
                esc_html__( 'No images selected for conversion.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 400 ]
            );
        }
        $job_id = function_exists( 'wp_generate_uuid4' ) ? wp_generate_uuid4() : uniqid( 'hmc_', true );
        $job = [
            'job_id'      => $job_id,
            'status'      => 'queued',
            'total'       => count( $ids ),
            'processed'   => 0,
            'cursor'      => 0,
            'success'     => 0,
            'error'       => 0,
            'logs'        => [],
            'ids'         => $ids,
            'format'      => $format,
            'quality'     => $q,
            'destinationFolder'  => $destination_folder,
            'destinationStructure' => $destination_structure,
            'converterSettings' => $converter_settings,
            'created_at'  => time(),
            'started_at'  => null,
            'finished_at' => null,
            'preview'     => $this->build_preview_items( $ids ),
            'pause_requested'  => false,
            'cancel_requested' => false,
        ];
        $job = $this->ensure_log_file( $job );
        if ( isset( $job['log_file'] ) && is_string( $job['log_file'] ) && '' !== $job['log_file'] ) {
            $this->append_log( $job['log_file'], 'Job ' . $job_id . ' created at ' . gmdate( 'c' ) );
            $this->append_log( $job['log_file'], 'Format: ' . $format . ' Quality: ' . ( null === $q ? '-' : (string) $q ) . ' Total: ' . (string) count( $ids ) );
        }
        update_option( $this->get_job_option_key( $job_id ), $job, false );
        wp_schedule_single_event( time() + 1, 'hoatzinmedia_convert_job_run', [ $job_id ] );
        if ( ! wp_doing_cron() ) {
            $cron_started = false;
            if ( ! defined( 'DISABLE_WP_CRON' ) || ! DISABLE_WP_CRON ) {
                if ( function_exists( 'spawn_cron' ) ) {
                    $cron_started = (bool) spawn_cron();
                }
            }
            if ( ! $cron_started ) {
                do_action( 'hoatzinmedia_convert_job_run', $job_id );
            }
        }
        return new \WP_REST_Response(
            [
                'job_id' => $job_id,
                'status' => 'queued',
            ]
        );
    }

    public function run_job( $job_id ) {
        $option_key = $this->get_job_option_key( (string) $job_id );
        $job = get_option( $option_key );
        if ( !is_array( $job ) ) {
            return;
        }
        $job = $this->ensure_log_file( $job );
        if ( !empty( $job['cancel_requested'] ) ) {
            $job['status'] = 'cancelled';
            $job['finished_at'] = time();
            if ( isset( $job['log_file'] ) && is_string( $job['log_file'] ) && '' !== $job['log_file'] ) {
                $this->append_log( $job['log_file'], 'Cancelled at ' . gmdate( 'c' ) );
            }
            update_option( $option_key, $job, false );
            return;
        }

        if ( !empty( $job['pause_requested'] ) ) {
            $job['status'] = 'paused';
            if ( isset( $job['log_file'] ) && is_string( $job['log_file'] ) && '' !== $job['log_file'] ) {
                $this->append_log( $job['log_file'], 'Paused at ' . gmdate( 'c' ) );
            }
            update_option( $option_key, $job, false );
            return;
        }

        $job['status'] = 'running';
        if ( empty( $job['started_at'] ) ) {
            $job['started_at'] = time();
        }
        update_option( $option_key, $job, false );
        $ids = isset( $job['ids'] ) && is_array( $job['ids'] ) ? $job['ids'] : [];
        $format = isset( $job['format'] ) ? (string) $job['format'] : 'webp';
        $q = isset( $job['quality'] ) ? $job['quality'] : null;
        $destination_folder = isset( $job['destinationFolder'] ) ? (string) $job['destinationFolder'] : 'same';
        $destination_structure = isset( $job['destinationStructure'] ) ? (string) $job['destinationStructure'] : 'roots';
        $converter_settings = isset( $job['converterSettings'] ) && is_array( $job['converterSettings'] ) ? $job['converterSettings'] : [];
        $cursor = isset( $job['cursor'] ) ? (int) $job['cursor'] : 0;
        if ( $cursor < 0 ) {
            $cursor = 0;
        }
        $total_count = count( $ids );
        $batch_size = 5;
        $batch_end = $cursor + $batch_size;
        if ( $batch_end > $total_count ) {
            $batch_end = $total_count;
        }
        for ( $i = $cursor; $i < $batch_end; $i++ ) {
            $attachment_id = (int) $ids[ $i ];
            $job = get_option( $option_key );
            if ( !is_array( $job ) ) {
                return;
            }
            if ( !empty( $job['cancel_requested'] ) ) {
                $job['status'] = 'cancelled';
                $job['finished_at'] = time();
                if ( isset( $job['log_file'] ) && is_string( $job['log_file'] ) && '' !== $job['log_file'] ) {
                    $this->append_log( $job['log_file'], 'Cancelled at ' . gmdate( 'c' ) );
                }
                update_option( $option_key, $job, false );
                return;
            }
            if ( !empty( $job['pause_requested'] ) ) {
                $job['status'] = 'paused';
                if ( isset( $job['log_file'] ) && is_string( $job['log_file'] ) && '' !== $job['log_file'] ) {
                    $this->append_log( $job['log_file'], 'Paused at ' . gmdate( 'c' ) );
                }
                update_option( $option_key, $job, false );
                return;
            }

            $result = Converter::get_instance()->convert_attachment( $attachment_id, $format, $q, $destination_folder, $destination_structure, $converter_settings );
            if ( is_wp_error( $result ) ) {
                $job['error']++;
                $job['processed']++;
                $job['cursor'] = $i + 1;
                $job['logs'][] = [
                    'time'    => time(),
                    'message' => sprintf( 'ID %d: %s', $attachment_id, $result->get_error_message() ),
                ];
                if ( isset( $job['log_file'] ) && is_string( $job['log_file'] ) && '' !== $job['log_file'] ) {
                    $this->append_log( $job['log_file'], gmdate( 'c' ) . ' ID ' . (string) $attachment_id . ' ERROR ' . $result->get_error_message() );
                }
                update_option( $option_key, $job, false );
                continue;
            }
            $job['success']++;
            $job['processed']++;
            $job['cursor'] = $i + 1;
            $job['logs'][] = [
                'time'    => time(),
                    'message' => sprintf( 'ID %d: %s', $attachment_id, __( 'Converted successfully.', 'hoatzinmedia-library-cleaner' ) ),
            ];
            if ( isset( $job['log_file'] ) && is_string( $job['log_file'] ) && '' !== $job['log_file'] ) {
                $this->append_log( $job['log_file'], gmdate( 'c' ) . ' ID ' . (string) $attachment_id . ' OK ' . ( is_string( $result ) ? $result : '' ) );
            }
            update_option( $option_key, $job, false );
        }
        $job = get_option( $option_key );
        if ( !is_array( $job ) ) {
            return;
        }
        $next_cursor = isset( $job['cursor'] ) ? (int) $job['cursor'] : (int) $job['processed'];
        if ( $next_cursor < $total_count ) {
            $job['status'] = 'queued';
            update_option( $option_key, $job, false );
            wp_schedule_single_event( time() + 1, 'hoatzinmedia_convert_job_run', [ (string) $job_id ] );
            return;
        }
        $job['status'] = 'done';
        $job['finished_at'] = time();
        if ( isset( $job['log_file'] ) && is_string( $job['log_file'] ) && '' !== $job['log_file'] ) {
            $this->append_log( $job['log_file'], 'Done at ' . gmdate( 'c' ) . ' Success: ' . (string) (int) $job['success'] . ' Error: ' . (string) (int) $job['error'] );
        }
        update_option( $option_key, $job, false );
    }

    public function background_status( $request ) {
        $job_id = (string) $request->get_param( 'job_id' );
        $option_key = $this->get_job_option_key( $job_id );
        $job = get_option( $option_key );
        if ( !is_array( $job ) ) {
            return new \WP_Error(
                'hoatzinmedia_not_found',
                esc_html__( 'Job not found.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 404 ]
            );
        }
        return new \WP_REST_Response(
            [
                'job_id'           => $job['job_id'],
                'status'           => $job['status'],
                'total'            => (int) $job['total'],
                'processed'        => (int) $job['processed'],
                'cursor'           => isset( $job['cursor'] ) ? (int) $job['cursor'] : (int) $job['processed'],
                'success'          => (int) $job['success'],
                'error'            => (int) $job['error'],
                'logs'             => $job['logs'],
                'created_at'       => (int) $job['created_at'],
                'started_at'       => $job['started_at'],
                'finished_at'      => $job['finished_at'],
                'cancel_requested' => !empty( $job['cancel_requested'] ),
                'pause_requested'  => !empty( $job['pause_requested'] ),
                'format'           => isset( $job['format'] ) ? (string) $job['format'] : '',
                'quality'          => isset( $job['quality'] ) ? $job['quality'] : null,
                'preview'          => isset( $job['preview'] ) && is_array( $job['preview'] ) ? $job['preview'] : [],
                'log_download_url' => $this->job_log_download_url( isset( $job['job_id'] ) ? (string) $job['job_id'] : '' ),
            ]
        );
    }

    public function background_log( $request ) {
        $job_id = (string) $request->get_param( 'job_id' );
        $option_key = $this->get_job_option_key( $job_id );
        $job = get_option( $option_key );
        if ( !is_array( $job ) ) {
            return new \WP_Error(
                'hoatzinmedia_not_found',
                esc_html__( 'Job not found.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 404 ]
            );
        }
        $job = $this->ensure_log_file( $job );
        $file = isset( $job['log_file'] ) && is_string( $job['log_file'] ) ? $job['log_file'] : '';
        if ( '' === $file || !@is_readable( $file ) ) {
            return new \WP_Error(
                'hoatzinmedia_log_missing',
                esc_html__( 'Log file not found.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 404 ]
            );
        }
        $content = (string) @file_get_contents( $file );
        $resp = new \WP_REST_Response( $content );
        $resp->header( 'Content-Type', 'text/plain; charset=utf-8' );
        $resp->header( 'Content-Disposition', 'attachment; filename="' . basename( $file ) . '"' );
        return $resp;
    }

    public function background_cancel( $request ) {
        $job_id = (string) $request->get_param( 'job_id' );
        $option_key = $this->get_job_option_key( $job_id );
        $job = get_option( $option_key );
        if ( !is_array( $job ) ) {
            return new \WP_Error(
                'hoatzinmedia_not_found',
                esc_html__( 'Job not found.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 404 ]
            );
        }
        $job['cancel_requested'] = true;
        update_option( $option_key, $job, false );
        return new \WP_REST_Response(
            [
                'job_id' => $job_id,
                'status' => 'cancelling',
            ]
        );
    }

    public function background_pause( $request ) {
        $job_id = (string) $request->get_param( 'job_id' );
        $option_key = $this->get_job_option_key( $job_id );
        $job = get_option( $option_key );
        if ( !is_array( $job ) ) {
            return new \WP_Error(
                'hoatzinmedia_not_found',
                esc_html__( 'Job not found.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 404 ]
            );
        }
        $job['pause_requested'] = true;
        if ( isset( $job['status'] ) && 'queued' === $job['status'] ) {
            $job['status'] = 'paused';
        }
        update_option( $option_key, $job, false );
        return new \WP_REST_Response(
            [
                'job_id' => $job_id,
                'status' => 'pausing',
            ]
        );
    }

    public function background_resume( $request ) {
        $job_id = (string) $request->get_param( 'job_id' );
        $option_key = $this->get_job_option_key( $job_id );
        $job = get_option( $option_key );
        if ( !is_array( $job ) ) {
            return new \WP_Error(
                'hoatzinmedia_not_found',
                esc_html__( 'Job not found.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 404 ]
            );
        }
        if ( !empty( $job['cancel_requested'] ) ) {
            return new \WP_Error(
                'hoatzinmedia_cancelled',
                esc_html__( 'Job has been cancelled.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 409 ]
            );
        }
        $job['pause_requested'] = false;
        $job['status'] = 'queued';
        update_option( $option_key, $job, false );
        wp_schedule_single_event( time() + 1, 'hoatzinmedia_convert_job_run', [ $job_id ] );
        if ( ! wp_doing_cron() ) {
            $cron_started = false;
            if ( ! defined( 'DISABLE_WP_CRON' ) || ! DISABLE_WP_CRON ) {
                if ( function_exists( 'spawn_cron' ) ) {
                    $cron_started = (bool) spawn_cron();
                }
            }
            if ( ! $cron_started ) {
                do_action( 'hoatzinmedia_convert_job_run', $job_id );
            }
        }
        return new \WP_REST_Response(
            [
                'job_id' => $job_id,
                'status' => 'queued',
            ]
        );
    }

    public function delete_attachments( $request ) {
        $ids = $request->get_param( 'ids' );
        if ( !is_array( $ids ) ) {
            $ids = [];
        }
        $attachment_ids = array_values(
            array_unique(
                array_filter(
                    array_map(
                        function ( $v ) {
                            return (int) $v;
                        },
                        $ids
                    ),
                    function ( $v ) {
                        return $v > 0;
                    }
                )
            )
        );
        if ( empty( $attachment_ids ) ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_request',
                esc_html__( 'No valid attachment IDs provided.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 400 ]
            );
        }
        $deleted = 0;
        foreach ( $attachment_ids as $attachment_id ) {
            $post = get_post( $attachment_id );
            if ( !$post || 'attachment' !== $post->post_type ) {
                continue;
            }
            $result = wp_delete_attachment( $attachment_id, true );
            if ( $result && !is_wp_error( $result ) ) {
                $deleted++;
            }
        }
        return new \WP_REST_Response(
            [
                'deleted_count' => $deleted,
            ]
        );
    }
}