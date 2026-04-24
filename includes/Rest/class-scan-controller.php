<?php
namespace HoatzinMedia\Rest;

use HoatzinMedia\Service\Scanner;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Scan_Controller {

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
            '/scan',
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'handle_scan' ],
                'permission_callback' => [ $this, 'permissions_check' ],
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

    public function handle_scan( $request ) {
        $scan_id = $request->get_param( 'scan_id' );

        if ( !is_string( $scan_id ) ) {
            $scan_id = '';
        }

        $scan_id = sanitize_text_field( $scan_id );

        if ( '' === $scan_id ) {
            return $this->start_new_scan();
        }

        return $this->continue_scan( $scan_id );
    }

    private function start_new_scan() {
        $lock_scan_id = get_transient( 'hoatzinmedia_scan_lock' );

        if ( $lock_scan_id && is_string( $lock_scan_id ) ) {
            delete_transient( 'hoatzinmedia_scan_lock' );
            delete_transient( 'hoatzinmedia_scan_' . $lock_scan_id );
            delete_transient( 'hoatzinmedia_scan_found_' . $lock_scan_id );
        }

        $state = Scanner::get_instance()->start_new_scan();

        if ( is_wp_error( $state ) ) {
            return $state;
        }

        return $this->process_batch( $state );
    }

    private function continue_scan( $scan_id ) {
        $state = Scanner::get_instance()->get_scan_state( $scan_id );

        if ( is_wp_error( $state ) ) {
            return $state;
        }

        return $this->process_batch( $state );
    }

    private function process_batch( array $state ) {
        $state = Scanner::get_instance()->process_batch( $state, 5, 6 );

        delete_transient( 'hoatzinmedia_dashboard_stats' );

        if ( isset( $state['finished'] ) && $state['finished'] ) {
            $ver = (int) get_option( 'hoatzinmedia_cache_ver', 1 );
            update_option( 'hoatzinmedia_cache_ver', $ver + 1, false );
        }

        return $this->build_response( $state );
    }

    private function build_response( array $state ) {
        return new \WP_REST_Response(
            [
                'scan_id'     => $state['scan_id'],
                'processed'   => $state['processed'],
                'total'       => $state['total'],
                'found'       => $state['found'],
                'found_bytes' => $state['found_bytes'],
                'finished'    => $state['finished'],
            ]
        );
    }
}
