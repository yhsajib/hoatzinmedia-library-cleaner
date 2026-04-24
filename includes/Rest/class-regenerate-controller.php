<?php
namespace HoatzinMedia\Rest;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Regenerate_Controller {

    private static $instance;

    private function __construct() {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
        add_action( 'hoatzinmedia_regenerate_job_run', [ $this, 'run_job' ], 10, 1 );
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
            '/regenerate/library',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'get_library' ],
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
            '/regenerate/library/ids',
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
            '/regenerate/sizes',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'get_sizes' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                ],
            ]
        );

        register_rest_route(
            'hoatzinmedia/v1',
            '/regenerate',
            [
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'regenerate' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'ids'           => [],
                        'all'           => [],
                        'exclude_ids'   => [],
                        'skip_existing' => [],
                    ],
                ],
            ]
        );
        register_rest_route(
            'hoatzinmedia/v1',
            '/regenerate/background',
            [
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'background_enqueue' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'ids'           => [],
                        'all'           => [],
                        'exclude_ids'   => [],
                        'skip_existing' => [],
                    ],
                ],
            ]
        );
        register_rest_route(
            'hoatzinmedia/v1',
            '/regenerate/background/status',
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
            '/regenerate/background/cancel',
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
    }

    private function query_all_image_attachment_ids() {
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
                'post_mime_type'         => [ 'image/jpeg', 'image/png', 'image/webp', 'image/avif' ],
            ]
        );
        $ids = [];
        if ( $q->have_posts() ) {
            foreach ( $q->posts as $attachment_id ) {
                $ids[] = (int) $attachment_id;
            }
        }
        return $ids;
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

    public function get_library( $request ) {
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
                'post_mime_type'         => [ 'image/jpeg', 'image/png', 'image/webp', 'image/avif' ],
            ]
        );

        $items = [];

        if ( $query->have_posts() ) {
            foreach ( $query->posts as $attachment_id ) {
                $attachment_id = (int) $attachment_id;

                if ( $attachment_id <= 0 ) {
                    continue;
                }

                $url = wp_get_attachment_url( $attachment_id );
                $thumb_url = wp_get_attachment_image_url( $attachment_id, 'thumbnail' );
                $path = get_attached_file( $attachment_id );

                $basename = $url ? wp_basename( $url ) : wp_basename( $path );
                $meta = wp_get_attachment_metadata( $attachment_id );
                $filesize = isset( $meta['filesize'] ) ? $meta['filesize'] : 0;
                if ( !$filesize && $path && @is_readable( $path ) ) {
                    $size_raw = @filesize( $path );
                    if ( false !== $size_raw && $size_raw > 0 ) {
                        $filesize = (int) $size_raw;
                    }
                }

                $items[] = [
                    'id'            => $attachment_id,
                    'file_name'     => sanitize_file_name( (string) $basename ),
                    'file_url'      => $url ? esc_url_raw( $url ) : '',
                    'thumbnail_url' => $thumb_url ? esc_url_raw( $thumb_url ) : '',
                    'size_readable' => size_format( $filesize ),
                    'mime_type'     => sanitize_text_field( (string) get_post_mime_type( $attachment_id ) ),
                    'date'          => get_the_date( 'Y-m-d', $attachment_id ),
                ];
            }
        }

        $total = (int) $query->found_posts;
        $total_pages = 0;
        if ( $per_page > 0 && $total > 0 ) {
            $total_pages = (int) ceil( $total / $per_page );
        }

        return new \WP_REST_Response(
            [
                'page'        => $page,
                'per_page'    => $per_page,
                'total'       => $total,
                'total_pages' => $total_pages,
                'items'       => $items,
            ]
        );
    }

    public function get_all_ids( $request ) {
        $ids = $this->query_all_image_attachment_ids();
        return new \WP_REST_Response(
            [
                'ids'   => $ids,
                'total' => count( $ids ),
            ]
        );
    }

    public function regenerate( $request ) {
        $ids = $request->get_param( 'ids' );
        if ( !is_array( $ids ) ) {
            $ids = [];
        }
        $all = filter_var( (string) $request->get_param( 'all' ), FILTER_VALIDATE_BOOLEAN );
        $exclude_ids = $request->get_param( 'exclude_ids' );
        if ( !is_array( $exclude_ids ) ) {
            $exclude_ids = [];
        }
        $skip_existing = filter_var( (string) $request->get_param( 'skip_existing' ), FILTER_VALIDATE_BOOLEAN );

        $exclude_ids = array_filter(
            array_map(
                function ( $v ) {
                    return (int) $v;
                },
                $exclude_ids
            ),
            function ( $v ) {
                return $v > 0;
            }
        );

        if ( $all ) {
            $ids = $this->query_all_image_attachment_ids();
        } else {
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
        }

        if ( !empty( $exclude_ids ) ) {
            $ids = array_values( array_diff( $ids, $exclude_ids ) );
        }

        if ( empty( $ids ) ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_request',
                esc_html__( 'No media selected.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 400 ]
            );
        }

        if ( !function_exists( 'wp_generate_attachment_metadata' ) ) {
            require_once ABSPATH . 'wp-admin/includes/image.php';
        }

        $defaults = array(
            'webpQuality' => 80,
        );
        $settings = get_option( 'hoatzinmedia_settings', $defaults );
        if ( ! is_array( $settings ) ) {
            $settings = $defaults;
        }
        $quality = isset( $settings['webpQuality'] ) ? (int) $settings['webpQuality'] : 80;

        $results = [];
        foreach ( $ids as $attachment_id ) {
            $path = get_attached_file( $attachment_id );
            if ( !$path || !file_exists( $path ) ) {
                $results[] = [
                    'id'      => $attachment_id,
                    'status'  => 'error',
                    'message' => __( 'File not found.', 'hoatzinmedia-library-cleaner' ),
                ];
                continue;
            }
            if ( $skip_existing ) {
                $last_regen = get_post_meta( $attachment_id, 'hoatzinmedia_last_regen', true );
                if ( !empty( $last_regen ) ) {
                    $results[] = [
                        'id'      => $attachment_id,
                        'status'  => 'skipped',
                        'message' => __( 'Already regenerated, skipped.', 'hoatzinmedia-library-cleaner' ),
                    ];
                    continue;
                }
            }

            $mime = get_post_mime_type( $attachment_id );
            if ( in_array( $mime, array( 'image/webp', 'image/avif' ), true ) ) {
                $editor = wp_get_image_editor( $path );
                if ( is_wp_error( $editor ) ) {
                    $results[] = [
                        'id'      => $attachment_id,
                        'status'  => 'skipped',
                        'message' => __( 'This image format is not supported by the server image editor.', 'hoatzinmedia-library-cleaner' ),
                    ];
                    continue;
                }
            }

            $meta = wp_generate_attachment_metadata( $attachment_id, $path );
            if ( empty( $meta ) || !is_array( $meta ) ) {
                $results[] = [
                    'id'      => $attachment_id,
                    'status'  => 'error',
                    'message' => __( 'Failed to generate metadata.', 'hoatzinmedia-library-cleaner' ),
                ];
                continue;
            }
            wp_update_attachment_metadata( $attachment_id, $meta );
            update_post_meta( $attachment_id, 'hoatzinmedia_last_regen', time() );
            if ( class_exists( 'HoatzinMedia\\Service\\Converter' ) ) {
                \HoatzinMedia\Service\Converter::get_instance()->sync_converted_variants_for_attachment( $attachment_id, $quality );
            }

            $results[] = [
                'id'      => $attachment_id,
                'status'  => 'success',
                'message' => __( 'Thumbnails regenerated.', 'hoatzinmedia-library-cleaner' ),
            ];
        }

        return new \WP_REST_Response(
            [
                'results' => $results,
            ]
        );
    }

    public function get_sizes( $request ) {
        if ( !function_exists( 'wp_generate_attachment_metadata' ) ) {
            require_once ABSPATH . 'wp-admin/includes/image.php';
        }

        global $_wp_additional_image_sizes;
        if ( !is_array( $_wp_additional_image_sizes ) ) {
            $_wp_additional_image_sizes = [];
        }

        $names = get_intermediate_image_sizes();
        $sizes = [];

        foreach ( $names as $name ) {
            $width = (int) get_option( "{$name}_size_w", 0 );
            $height = (int) get_option( "{$name}_size_h", 0 );
            $crop = get_option( "{$name}_crop", null );

            if ( isset( $_wp_additional_image_sizes[$name] ) && is_array( $_wp_additional_image_sizes[$name] ) ) {
                $info = $_wp_additional_image_sizes[$name];
                if ( isset( $info['width'] ) ) {
                    $width = (int) $info['width'];
                }
                if ( isset( $info['height'] ) ) {
                    $height = (int) $info['height'];
                }
                if ( array_key_exists( 'crop', $info ) ) {
                    $crop = (bool) $info['crop'];
                }
            }

            $sizes[] = [
                'name'   => sanitize_key( $name ),
                'width'  => $width,
                'height' => $height,
                'crop'   => (bool) $crop,
            ];
        }

        return new \WP_REST_Response(
            [
                'sizes' => $sizes,
            ]
        );
    }

    private function get_job_option_key( $job_id ) {
        return 'hoatzinmedia_regen_job_' . $job_id;
    }

    public function background_enqueue( $request ) {
        $ids = $request->get_param( 'ids' );
        if ( !is_array( $ids ) ) {
            $ids = [];
        }
        $all = filter_var( (string) $request->get_param( 'all' ), FILTER_VALIDATE_BOOLEAN );
        $exclude_ids = $request->get_param( 'exclude_ids' );
        if ( !is_array( $exclude_ids ) ) {
            $exclude_ids = [];
        }
        $skip_existing = filter_var( (string) $request->get_param( 'skip_existing' ), FILTER_VALIDATE_BOOLEAN );
        $exclude_ids = array_filter(
            array_map(
                function ( $v ) {
                    return (int) $v;
                },
                $exclude_ids
            ),
            function ( $v ) {
                return $v > 0;
            }
        );
        if ( $all ) {
            $ids = $this->query_all_image_attachment_ids();
        } else {
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
        }
        if ( !empty( $exclude_ids ) ) {
            $ids = array_values( array_diff( $ids, $exclude_ids ) );
        }
        if ( empty( $ids ) ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_request',
                esc_html__( 'No media selected.', 'hoatzinmedia-library-cleaner' ),
                [ 'status' => 400 ]
            );
        }
        $job_id = function_exists( 'wp_generate_uuid4' ) ? wp_generate_uuid4() : uniqid( 'hm_', true );
        $job = [
            'job_id'        => $job_id,
            'status'        => 'queued',
            'total'         => count( $ids ),
            'processed'     => 0,
            'success'       => 0,
            'error'         => 0,
            'skipped'       => 0,
            'logs'          => [],
            'ids'           => $ids,
            'skip_existing' => $skip_existing ? 1 : 0,
            'created_at'    => time(),
            'started_at'    => null,
            'finished_at'   => null,
        ];
        update_option( $this->get_job_option_key( $job_id ), $job, false );
        wp_schedule_single_event( time() + 1, 'hoatzinmedia_regenerate_job_run', [ $job_id ] );
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
        if ( !function_exists( 'wp_generate_attachment_metadata' ) ) {
            require_once ABSPATH . 'wp-admin/includes/image.php';
        }

        $defaults = array(
            'webpQuality' => 80,
        );
        $settings = get_option( 'hoatzinmedia_settings', $defaults );
        if ( ! is_array( $settings ) ) {
            $settings = $defaults;
        }
        $quality = isset( $settings['webpQuality'] ) ? (int) $settings['webpQuality'] : 80;

        $job['status'] = 'running';
        $job['started_at'] = time();
        update_option( $option_key, $job, false );
        $ids = isset( $job['ids'] ) && is_array( $job['ids'] ) ? $job['ids'] : [];
        $skip_existing = !empty( $job['skip_existing'] );
        foreach ( $ids as $attachment_id ) {
            $attachment_id = (int) $attachment_id;
            $path = get_attached_file( $attachment_id );
            $job = get_option( $option_key );
            if ( is_array( $job ) && !empty( $job['cancel_requested'] ) ) {
                $job['status'] = 'cancelled';
                $job['finished_at'] = time();
                update_option( $option_key, $job, false );
                return;
            }
            if ( !$path || !file_exists( $path ) ) {
                $job['error']++;
                $job['processed']++;
                $job['logs'][] = [
                    'time'    => time(),
                    'message' => sprintf( 'ID %d: %s', $attachment_id, __( 'File not found.', 'hoatzinmedia-library-cleaner' ) ),
                ];
                update_option( $option_key, $job, false );
                continue;
            }
            if ( $skip_existing ) {
                $last_regen = get_post_meta( $attachment_id, 'hoatzinmedia_last_regen', true );
                if ( !empty( $last_regen ) ) {
                    $job['skipped']++;
                    $job['processed']++;
                    $job['logs'][] = [
                        'time'    => time(),
                        'message' => sprintf( 'ID %d: %s', $attachment_id, __( 'Already regenerated, skipped.', 'hoatzinmedia-library-cleaner' ) ),
                    ];
                    update_option( $option_key, $job, false );
                    continue;
                }
            }

            $mime = get_post_mime_type( $attachment_id );
            if ( in_array( $mime, array( 'image/webp', 'image/avif' ), true ) ) {
                $editor = wp_get_image_editor( $path );
                if ( is_wp_error( $editor ) ) {
                    $job['skipped']++;
                    $job['processed']++;
                    $job['logs'][] = [
                        'time'    => time(),
                        'message' => sprintf( 'ID %d: %s', $attachment_id, __( 'Skipped (format not supported by server image editor).', 'hoatzinmedia-library-cleaner' ) ),
                    ];
                    update_option( $option_key, $job, false );
                    continue;
                }
            }

            $meta = wp_generate_attachment_metadata( $attachment_id, $path );
            if ( empty( $meta ) || !is_array( $meta ) ) {
                $job['error']++;
                $job['processed']++;
                $job['logs'][] = [
                    'time'    => time(),
                    'message' => sprintf( 'ID %d: %s', $attachment_id, __( 'Failed to generate metadata.', 'hoatzinmedia-library-cleaner' ) ),
                ];
                update_option( $option_key, $job, false );
                continue;
            }
            wp_update_attachment_metadata( $attachment_id, $meta );
            update_post_meta( $attachment_id, 'hoatzinmedia_last_regen', time() );
            if ( class_exists( 'HoatzinMedia\\Service\\Converter' ) ) {
                \HoatzinMedia\Service\Converter::get_instance()->sync_converted_variants_for_attachment( $attachment_id, $quality );
            }
            $job['success']++;
            $job['processed']++;
            $job['logs'][] = [
                'time'    => time(),
                'message' => sprintf( 'ID %d: %s', $attachment_id, __( 'Thumbnails regenerated.', 'hoatzinmedia-library-cleaner' ) ),
            ];
            update_option( $option_key, $job, false );
        }
        $job['status'] = 'done';
        $job['finished_at'] = time();
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
                'success'          => (int) $job['success'],
                'error'            => (int) $job['error'],
                'skipped'          => (int) ( isset( $job['skipped'] ) ? $job['skipped'] : 0 ),
                'logs'             => $job['logs'],
                'created_at'       => (int) $job['created_at'],
                'started_at'       => $job['started_at'],
                'finished_at'      => $job['finished_at'],
                'cancel_requested' => !empty( $job['cancel_requested'] ),
            ]
        );
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
}