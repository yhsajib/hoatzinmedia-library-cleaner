<?php
namespace HoatzinMedia\Rest;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Large_Files_Controller {

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
            '/large-files',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_large_files' ],
                'permission_callback' => [ $this, 'permissions_check' ],
                'args'                => [
                    'size'     => [
                        'sanitize_callback' => 'absint',
                    ],
                    'page'     => [
                        'sanitize_callback' => 'absint',
                    ],
                    'per_page' => [
                        'sanitize_callback' => 'absint',
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

    public function get_large_files( $request ) {
        $size_param = $request->get_param( 'size' );
        $size_mb = (int) $size_param;

        if ( 1 !== $size_mb && 3 !== $size_mb && 5 !== $size_mb ) {
            $size_mb = 3;
        }

        $threshold_bytes = $size_mb * 1024 * 1024;

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
                'fields'                 => 'ids',
                'no_found_rows'          => true,
                'update_post_meta_cache' => false,
                'update_post_term_cache' => false,
            ]
        );

        $items = [];

        if ( $query->have_posts() ) {
            foreach ( $query->posts as $attachment_id ) {
                $attachment_id = (int) $attachment_id;

                if ( $attachment_id <= 0 ) {
                    continue;
                }

                $path = get_attached_file( $attachment_id );

                if ( !$path || !@is_readable( $path ) ) {
                    continue;
                }

                $size = @filesize( $path );

                if ( false === $size || $size <= 0 ) {
                    continue;
                }

                $size = (int) $size;

                if ( $size <= $threshold_bytes ) {
                    continue;
                }

                $url = wp_get_attachment_url( $attachment_id );
                $filename = $url ? wp_basename( $url ) : '';

                $items[] = [
                    'id'            => $attachment_id,
                    'filename'      => sanitize_file_name( $filename ),
                    'size_readable' => sanitize_text_field( (string) size_format( $size ) ),
                    'url'           => $url ? esc_url_raw( $url ) : '',
                    'size_bytes'    => $size,
                ];
            }
        }

        if ( !empty( $items ) ) {
            usort(
                $items,
                function ( $a, $b ) {
                    if ( $a['size_bytes'] === $b['size_bytes'] ) {
                        return 0;
                    }

                    return ( $a['size_bytes'] > $b['size_bytes'] ) ? -1 : 1;
                }
            );
        }

        foreach ( $items as &$item ) {
            unset( $item['size_bytes'] );
        }
        unset( $item );

        $data = [
            'size_mb'  => $size_mb,
            'page'     => $page,
            'per_page' => $per_page,
            'results'  => $items,
        ];

        return new \WP_REST_Response( $data );
    }
}