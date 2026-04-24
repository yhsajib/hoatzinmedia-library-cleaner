<?php
namespace HoatzinMedia\Rest;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Rest_Controller {

    /**
     * @var Rest_Controller
     */
    private static $instance;

    private function __construct() {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
    }

    /**
     * Get singleton instance.
     *
     * @return Rest_Controller
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
            '/status',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_status' ],
                'permission_callback' => [ $this, 'permissions_check' ],
            ]
        );
    }

    public function permissions_check() {
        return current_user_can( 'manage_options' );
    }

    public function get_status() {
        return [
            'success' => true,
            'version' => HOATZINMEDIA_VERSION,
        ];
    }
}