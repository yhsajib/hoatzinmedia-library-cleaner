<?php
namespace HoatzinMedia\Rest;

use HoatzinMedia\Service\Scanner;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Unused_Results_Controller {

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
            '/unused-results',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_unused_results' ],
                'permission_callback' => [ $this, 'permissions_check' ],
                'args'                => [
                    'limit' => [
                        'sanitize_callback' => 'absint',
                    ],
                    'page'  => [
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ]
        );
        $server = function_exists( 'rest_get_server' ) ? rest_get_server() : null;
        $routes = $server && is_object( $server ) && method_exists( $server, 'get_routes' ) ? $server->get_routes() : [];
        if ( !isset( $routes['/hoatzinmedia/v1/delete-unused'] ) ) {
            register_rest_route(
                'hoatzinmedia/v1',
                '/delete-unused',
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'handle_delete_unused' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                ]
            );
        }
        if ( !isset( $routes['/hoatzinmedia/v1/delete-unused-all'] ) ) {
            register_rest_route(
                'hoatzinmedia/v1',
                '/delete-unused-all',
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'handle_delete_unused_all' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                ]
            );
        }
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

    public function get_unused_results( $request ) {
        $cache_ver = (int) get_option( 'hoatzinmedia_cache_ver', 1 );

        $page = (int) $request->get_param( 'page' );
        $limit = (int) $request->get_param( 'limit' );

        if ( $page <= 0 ) {
            $page = 1;
        }

        if ( $limit <= 0 ) {
            $limit = 20;
        } elseif ( $limit > 200 ) {
            $limit = 200;
        }

        $offset = ( $page - 1 ) * $limit;

        $ids_cache_key = 'unused_ids_last_' . $cache_ver;
        $unused_ids = wp_cache_get( $ids_cache_key, 'hoatzinmedia' );
        $scan_meta = get_option( 'hoatzinmedia_last_unused_meta', [] );
        if ( !is_array( $unused_ids ) ) {
            $ids_opt = get_option( 'hoatzinmedia_last_unused_ids', [] );
            $unused_ids = is_array( $ids_opt ) ? $ids_opt : [];
            $unused_ids = array_values( array_unique( array_filter( array_map( 'intval', $unused_ids ) ) ) );
            wp_cache_set( $ids_cache_key, $unused_ids, 'hoatzinmedia', 15 * MINUTE_IN_SECONDS );
        }
        $total = is_array( $unused_ids ) ? count( $unused_ids ) : 0;

        $results = [];

        if ( $total > 0 && $offset < $total ) {
            $page_ids = array_slice( $unused_ids, $offset, $limit );
            foreach ( $page_ids as $attachment_id ) {
                $attachment_id = (int) $attachment_id;
                if ( $attachment_id <= 0 ) {
                    continue;
                }
                $url = wp_get_attachment_url( $attachment_id );
                $filename = $url ? wp_basename( $url ) : '';
                $size_bytes = 0;
                if ( class_exists( 'HoatzinMedia\\Service\\Converter' ) ) {
                    $size_bytes = (int) \HoatzinMedia\Service\Converter::get_instance()->get_attachment_total_size_bytes( $attachment_id );
                }
                if ( $size_bytes <= 0 ) {
                    $path = get_attached_file( $attachment_id );
                    if ( $path && @is_readable( $path ) ) {
                        $size_raw = @filesize( $path );
                        if ( false !== $size_raw && $size_raw > 0 ) {
                            $size_bytes = (int) $size_raw;
                        }
                    }
                }
                $size_readable = $size_bytes > 0 ? size_format( $size_bytes ) : '';
                $thumbnail_src = wp_get_attachment_image_src( $attachment_id, 'thumbnail' );
                $thumbnail_url = is_array( $thumbnail_src ) && !empty( $thumbnail_src[0] ) ? $thumbnail_src[0] : '';
                $date_uploaded = get_post_field( 'post_date', $attachment_id );
                $edit_url = get_edit_post_link( $attachment_id, 'raw' );
                $results[] = [
                    'attachment_id'   => $attachment_id,
                    'file_name'       => $filename ? sanitize_file_name( $filename ) : '',
                    'file_size'       => $size_readable ? sanitize_text_field( (string) $size_readable ) : '',
                    'file_size_bytes' => $size_bytes,
                    'thumbnail_url'   => $thumbnail_url ? esc_url_raw( $thumbnail_url ) : '',
                    'file_url'        => $url ? esc_url_raw( $url ) : '',
                    'edit_url'        => $edit_url ? esc_url_raw( $edit_url ) : '',
                    'date_uploaded'   => $date_uploaded ? sanitize_text_field( (string) $date_uploaded ) : '',
                ];
            }
        }

        $total_pages = 0;

        if ( $limit > 0 && $total > 0 ) {
            $total_pages = (int) ceil( $total / $limit );
        }

        $data = [
            'page'        => $page,
            'limit'       => $limit,
            'total'       => $total,
            'total_pages' => $total_pages,
            'results'     => $results,
            'scanned'     => $total > 0 || ( is_array( $scan_meta ) && !empty( $scan_meta['scan_id'] ) ),
            'scan_meta'   => is_array( $scan_meta ) ? $scan_meta : [],
        ];

        return new \WP_REST_Response( $data );
    }

    public function handle_delete_unused( $request ) {
        $ids = $request->get_param( 'attachment_ids' );
        if ( !is_array( $ids ) ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_request',
                esc_html__( 'attachment_ids must be an array.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => 400,
                ]
            );
        }
        $verify = $request->get_param( 'verify' );
        $use_fast_verify = ( 'fast' === $verify || '0' === (string) $verify || 0 === (int) $verify || false === $verify );
        $attachment_ids = [];
        foreach ( $ids as $id ) {
            $id = absint( $id );
            if ( $id > 0 ) {
                $attachment_ids[] = $id;
            }
        }
        $attachment_ids = array_values( array_unique( $attachment_ids ) );
        if ( empty( $attachment_ids ) ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_request',
                esc_html__( 'No valid attachment IDs provided.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => 400,
                ]
            );
        }
        $restrict_to_scanned = false;
        $allowed_ids = [];
        $meta_by_id = [];
        $deleted_count = 0;
        $total_space_freed = 0;
        $deleted_ids = [];
        foreach ( $attachment_ids as $attachment_id ) {
            $is_unused = $use_fast_verify
                ? Scanner::get_instance()->is_unused_attachment_fast( $attachment_id )
                : Scanner::get_instance()->is_unused_attachment( $attachment_id );
            if ( !$is_unused ) {
                continue;
            }
            $post = get_post( $attachment_id );
            if ( !$post || 'attachment' !== $post->post_type ) {
                continue;
            }
            $file_path = get_attached_file( $attachment_id );
            $url = wp_get_attachment_url( $attachment_id );
            $filename = $url ? wp_basename( $url ) : '';
            $user_id = get_current_user_id();
            $meta = isset( $meta_by_id[$attachment_id] ) ? $meta_by_id[$attachment_id] : [];
            if ( !is_array( $meta ) ) {
                $meta = [];
            }
            $size_bytes = isset( $meta['size_bytes'] ) ? (int) $meta['size_bytes'] : 0;
            if ( $size_bytes <= 0 ) {
                if ( class_exists( 'HoatzinMedia\\Service\\Converter' ) ) {
                    $size_bytes = (int) \HoatzinMedia\Service\Converter::get_instance()->get_attachment_total_size_bytes( $attachment_id );
                }
                if ( $size_bytes <= 0 ) {
                    if ( $file_path && @is_readable( $file_path ) ) {
                        $size = @filesize( $file_path );
                        if ( false !== $size && $size > 0 ) {
                            $size_bytes = (int) $size;
                        }
                    }
                }
            }
            $result = wp_delete_attachment( $attachment_id, true );
            if ( !$result || is_wp_error( $result ) ) {
                continue;
            }
            if ( $size_bytes > 0 ) {
                $total_space_freed += $size_bytes;
            }
            $deleted_count++;
            $deleted_ids[] = $attachment_id;
        }
        if ( !empty( $deleted_ids ) ) {
            $stored_ids = get_option( 'hoatzinmedia_last_unused_ids', [] );
            if ( is_array( $stored_ids ) ) {
                $stored_ids = array_values( array_unique( array_filter( array_map( 'intval', $stored_ids ) ) ) );
                $stored_ids = array_values( array_diff( $stored_ids, $deleted_ids ) );
                update_option( 'hoatzinmedia_last_unused_ids', $stored_ids, false );
            }
        }
        $ver = (int) get_option( 'hoatzinmedia_cache_ver', 1 );
        update_option( 'hoatzinmedia_cache_ver', $ver + 1, false );
        return new \WP_REST_Response(
            [
                'deleted_count'     => $deleted_count,
                'total_space_freed' => $total_space_freed,
            ]
        );
    }

    public function handle_delete_unused_all( $request ) {
        $verify = $request->get_param( 'verify' );
        $use_fast_verify = ( 'fast' === $verify || '0' === (string) $verify || 0 === (int) $verify || false === $verify );
        $stored_ids = get_option( 'hoatzinmedia_last_unused_ids', [] );
        $attachment_ids = is_array( $stored_ids ) ? $stored_ids : [];
        $attachment_ids = array_values( array_unique( array_filter( array_map( 'intval', $attachment_ids ) ) ) );

        if ( empty( $attachment_ids ) ) {
            $ver = (int) get_option( 'hoatzinmedia_cache_ver', 1 );
            update_option( 'hoatzinmedia_cache_ver', $ver + 1, false );
            return new \WP_REST_Response(
                [
                    'deleted_count'     => 0,
                    'total_space_freed' => 0,
                    'remaining_count'   => 0,
                ]
            );
        }

        $deleted_count = 0;
        $total_space_freed = 0;
        $deleted_ids = [];
        $remaining_ids = [];

        foreach ( $attachment_ids as $attachment_id ) {
            $attachment_id = absint( $attachment_id );
            if ( $attachment_id <= 0 ) {
                continue;
            }
            $is_unused = $use_fast_verify
                ? Scanner::get_instance()->is_unused_attachment_fast( $attachment_id )
                : Scanner::get_instance()->is_unused_attachment( $attachment_id );
            if ( !$is_unused ) {
                $remaining_ids[] = $attachment_id;
                continue;
            }
            $post = get_post( $attachment_id );
            if ( !$post || 'attachment' !== $post->post_type ) {
                continue;
            }

            $file_path = get_attached_file( $attachment_id );
            $size_bytes = 0;
            if ( class_exists( 'HoatzinMedia\\Service\\Converter' ) ) {
                $size_bytes = (int) \HoatzinMedia\Service\Converter::get_instance()->get_attachment_total_size_bytes( $attachment_id );
            }
            if ( $size_bytes <= 0 ) {
                if ( $file_path && @is_readable( $file_path ) ) {
                    $size = @filesize( $file_path );
                    if ( false !== $size && $size > 0 ) {
                        $size_bytes = (int) $size;
                    }
                }
            }

            $result = wp_delete_attachment( $attachment_id, true );
            if ( !$result || is_wp_error( $result ) ) {
                $remaining_ids[] = $attachment_id;
                continue;
            }

            if ( $size_bytes > 0 ) {
                $total_space_freed += $size_bytes;
            }
            $deleted_count++;
            $deleted_ids[] = $attachment_id;
        }

        $remaining_ids = array_values( array_unique( array_filter( array_map( 'intval', $remaining_ids ) ) ) );
        update_option( 'hoatzinmedia_last_unused_ids', $remaining_ids, false );

        $ver = (int) get_option( 'hoatzinmedia_cache_ver', 1 );
        update_option( 'hoatzinmedia_cache_ver', $ver + 1, false );

        return new \WP_REST_Response(
            [
                'deleted_count'     => $deleted_count,
                'total_space_freed' => $total_space_freed,
                'remaining_count'   => count( $remaining_ids ),
            ]
        );
    }
}
