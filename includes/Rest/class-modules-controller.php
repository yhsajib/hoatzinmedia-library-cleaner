<?php
namespace HoatzinMedia\Rest;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Modules_Controller {

    /**
     * @var Modules_Controller
     */
    private static $instance;

    private function __construct() {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
    }

    /**
     * Get singleton instance.
     *
     * @return Modules_Controller
     */
    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    public function register_routes() {
        register_rest_route(
            'hoatzinmedia/v1',
            '/modules',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'get_modules' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                ],
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'update_modules' ],
                    'permission_callback' => [ $this, 'permissions_check' ],
                    'args'                => [
                        'modules' => [
                            'required'          => true,
                            'validate_callback' => function ( $value ) {
                                return is_array( $value );
                            },
                        ],
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

    public function get_modules() {
        $modules = get_option( 'hoatzinmedia_modules', [] );

        if ( !is_array( $modules ) ) {
            $modules = [];
        }

        return new \WP_REST_Response(
            [
                'modules' => $modules,
            ]
        );
    }

    public function update_modules( $request ) {
        $incoming = $request->get_param( 'modules' );

        if ( !is_array( $incoming ) ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_modules_payload',
                esc_html__( 'Modules payload must be an array.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => 400,
                ]
            );
        }

        $sanitized = [];

        foreach ( $incoming as $id => $data ) {
            $key = sanitize_key( (string) $id );

            if ( '' === $key ) {
                continue;
            }

            if ( !is_array( $data ) ) {
                $data = [];
            }

            $enabled = isset( $data['enabled'] ) ? (bool) $data['enabled'] : true;
            $is_pro = isset( $data['isPro'] ) ? (bool) $data['isPro'] : false;

            $sanitized[$key] = [
                'enabled' => $enabled,
                'isPro'   => $is_pro,
            ];
        }

        update_option( 'hoatzinmedia_modules', $sanitized );

        return new \WP_REST_Response(
            [
                'success' => true,
                'modules' => $sanitized,
            ]
        );
    }
}