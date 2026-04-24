<?php
namespace HoatzinMedia\Rest;

use HoatzinMedia\Service\Scanner;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}

class Duplicates_Controller {

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
            '/duplicates',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_duplicates' ],
                'permission_callback' => [ $this, 'permissions_check' ],
                'args'                => [
                    'page'     => [
                        'sanitize_callback' => 'absint',
                    ],
                    'per_page' => [
                        'sanitize_callback' => 'absint',
                    ],
                    'strategy' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ]
        );

        register_rest_route(
            'hoatzinmedia/v1',
            '/attachment-usage',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_attachment_usage' ],
                'permission_callback' => [ $this, 'usage_permissions_check' ],
                'args'                => [
                    'attachment_id' => [
                        'sanitize_callback' => 'absint',
                    ],
                    'limit' => [
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

    public function usage_permissions_check( $request ) {
        if ( !current_user_can( 'upload_files' ) ) {
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

    public function get_duplicates( $request ) {
        global $wpdb;

        $cache_ver = (int) get_option( 'hoatzinmedia_cache_ver', 1 );
        $page = (int) $request->get_param( 'page' );
        $per_page = (int) $request->get_param( 'per_page' );
        $strategy = (string) $request->get_param( 'strategy' );

        if ( $page <= 0 ) {
            $page = 1;
        }

        if ( $per_page <= 0 ) {
            $per_page = 20;
        } elseif ( $per_page > 100 ) {
            $per_page = 100;
        }

        // Advanced duplicate strategies:
        // - path: group by stored _wp_attached_file (legacy)
        // - hash: group by file md5 hash (recommended)
        $strategy = strtolower( $strategy );
        if ( $strategy === 'content_hash' ) {
            $strategy = 'hash';
        }

        $groups = [];
        $total_groups = 0;

        if ( $strategy === 'hash' ) {
            // Build groups by file content hash across all attachments
            $ids_cache_key = 'dup_hash_ids_' . $cache_ver;
            $attachment_ids = wp_cache_get( $ids_cache_key, 'hoatzinmedia' );
            if ( !is_array( $attachment_ids ) ) {
                $attachment_ids = get_posts(
                    [
                        'post_type'      => 'attachment',
                        'post_status'    => 'inherit',
                        'fields'         => 'ids',
                        'posts_per_page' => -1,
                        'orderby'        => 'ID',
                        'order'          => 'ASC',
                    ]
                );
                if ( is_array( $attachment_ids ) ) {
                    wp_cache_set( $ids_cache_key, $attachment_ids, 'hoatzinmedia' );
                }
            }

            $by_hash = [];

            if ( is_array( $attachment_ids ) && $attachment_ids ) {
                foreach ( $attachment_ids as $attachment_id ) {
                    $attachment_id = (int) $attachment_id;
                    if ( $attachment_id <= 0 ) {
                        continue;
                    }
                    $file_path = get_attached_file( $attachment_id );
                    if ( !$file_path || !@is_readable( $file_path ) ) {
                        continue;
                    }
                    $hash = @md5_file( $file_path );
                    if ( !$hash ) {
                        continue;
                    }
                    $file_size = 0;
                    $size_raw = @filesize( $file_path );
                    if ( false !== $size_raw && $size_raw > 0 ) {
                        $file_size = (int) $size_raw;
                    }
                    $file_url = wp_get_attachment_url( $attachment_id );
                    $file_name = wp_basename( (string) get_post_meta( $attachment_id, '_wp_attached_file', true ) );
                    $date_uploaded = get_post_field( 'post_date', $attachment_id );

                    if ( !isset( $by_hash[$hash] ) ) {
                        $by_hash[$hash] = [];
                    }
                    $by_hash[$hash][] = [
                        'attachment_id'   => $attachment_id,
                        'file_name'       => $file_name ? sanitize_file_name( $file_name ) : '',
                        'file_size'       => $file_size > 0 ? size_format( $file_size ) : '',
                        'file_size_bytes' => $file_size,
                        'file_url'        => $file_url ? esc_url_raw( $file_url ) : '',
                        'date_uploaded'   => $date_uploaded ? sanitize_text_field( (string) $date_uploaded ) : '',
                    ];
                }
            }

            // Build groups of duplicates (hashes with >1 items)
            foreach ( $by_hash as $hash_key => $items ) {
                if ( count( $items ) < 2 ) {
                    continue;
                }
                $first_name = isset( $items[0]['file_name'] ) ? $items[0]['file_name'] : '';
                $groups[] = [
                    'group_key'  => $hash_key,
                    'file_name'  => $first_name,
                    'duplicates' => count( $items ),
                    'items'      => $items,
                ];
            }

            // Sort by duplicates count desc
            if ( $groups ) {
                usort(
                    $groups,
                    function ( $a, $b ) {
                        $ad = isset( $a['duplicates'] ) ? (int) $a['duplicates'] : 0;
                        $bd = isset( $b['duplicates'] ) ? (int) $b['duplicates'] : 0;
                        if ( $ad === $bd ) {
                            return strcmp( (string) $a['group_key'], (string) $b['group_key'] );
                        }
                        return $bd - $ad;
                    }
                );
            }

            $total_groups = count( $groups );

            // Pagination on groups
            if ( $per_page > 0 && $total_groups > 0 ) {
                $offset = ( $page - 1 ) * $per_page;
                $groups = array_slice( $groups, $offset, $per_page );
            }
        } else {
            // Legacy path-based grouping
            $total_cache_key = 'dup_legacy_total_' . $cache_ver;
            $total_cached = wp_cache_get( $total_cache_key, 'hoatzinmedia' );
            if ( false !== $total_cached && is_numeric( $total_cached ) ) {
                $total_groups = (int) $total_cached;
            } else {
                $all_attachment_ids = get_posts(
                    [
                        'post_type'      => 'attachment',
                        'post_status'    => 'inherit',
                        'fields'         => 'ids',
                        'posts_per_page' => -1,
                        'orderby'        => 'ID',
                        'order'          => 'ASC',
                    ]
                );
                $counts = [];
                if ( is_array( $all_attachment_ids ) && $all_attachment_ids ) {
                    foreach ( $all_attachment_ids as $aid ) {
                        $meta_value_raw = get_post_meta( (int) $aid, '_wp_attached_file', true );
                        $meta_value = is_string( $meta_value_raw ) ? $meta_value_raw : '';
                        if ( '' === $meta_value ) {
                            continue;
                        }
                        if ( !isset( $counts[$meta_value] ) ) {
                            $counts[$meta_value] = 0;
                        }
                        $counts[$meta_value]++;
                    }
                }
                $total_groups = 0;
                if ( $counts ) {
                    foreach ( $counts as $mv => $cnt ) {
                        if ( (int) $cnt > 1 ) {
                            $total_groups++;
                        }
                    }
                }
                wp_cache_set( $total_cache_key, $total_groups, 'hoatzinmedia' );
            }

            if ( $total_groups > 0 ) {
                $offset = ( $page - 1 ) * $per_page;

                $groups_cache_key = 'dup_legacy_groups_' . $cache_ver . '_' . $page . '_' . $per_page;
                $raw_groups = wp_cache_get( $groups_cache_key, 'hoatzinmedia' );
                if ( !is_array( $raw_groups ) ) {
                    $all_attachment_ids = get_posts(
                        [
                            'post_type'      => 'attachment',
                            'post_status'    => 'inherit',
                            'fields'         => 'ids',
                            'posts_per_page' => -1,
                            'orderby'        => 'ID',
                            'order'          => 'ASC',
                        ]
                    );
                    $counts = [];
                    if ( is_array( $all_attachment_ids ) && $all_attachment_ids ) {
                        foreach ( $all_attachment_ids as $aid ) {
                            $mv_raw = get_post_meta( (int) $aid, '_wp_attached_file', true );
                            $mv = is_string( $mv_raw ) ? $mv_raw : '';
                            if ( '' === $mv ) {
                                continue;
                            }
                            if ( !isset( $counts[$mv] ) ) {
                                $counts[$mv] = 0;
                            }
                            $counts[$mv]++;
                        }
                    }
                    $group_rows = [];
                    if ( $counts ) {
                        foreach ( $counts as $mv => $cnt ) {
                            if ( (int) $cnt > 1 ) {
                                $group_rows[] = [
                                    'meta_value'        => (string) $mv,
                                    'duplicates_count'  => (int) $cnt,
                                ];
                            }
                        }
                    }
                    if ( $group_rows ) {
                        usort(
                            $group_rows,
                            function ( $a, $b ) {
                                $ad = isset( $a['duplicates_count'] ) ? (int) $a['duplicates_count'] : 0;
                                $bd = isset( $b['duplicates_count'] ) ? (int) $b['duplicates_count'] : 0;
                                if ( $ad === $bd ) {
                                    return strcmp( (string) $a['meta_value'], (string) $b['meta_value'] );
                                }
                                return $bd - $ad;
                            }
                        );
                        $raw_groups = array_slice( $group_rows, $offset, $per_page );
                    } else {
                        $raw_groups = [];
                    }
                    if ( is_array( $raw_groups ) ) {
                        wp_cache_set( $groups_cache_key, $raw_groups, 'hoatzinmedia' );
                    }
                }

                if ( is_array( $raw_groups ) ) {
                    foreach ( $raw_groups as $group_row ) {
                        $meta_value = isset( $group_row['meta_value'] ) ? (string) $group_row['meta_value'] : '';

                        if ( '' === $meta_value ) {
                            continue;
                        }

                        $item_cache_key = 'dup_legacy_items_' . $cache_ver . '_' . md5( (string) $meta_value );
                        $item_rows = wp_cache_get( $item_cache_key, 'hoatzinmedia' );
                        if ( !is_array( $item_rows ) ) {
                            $ids = get_posts(
                                [
                                    'post_type'      => 'attachment',
                                    'post_status'    => 'inherit',
                                    'fields'         => 'ids',
                                    'posts_per_page' => -1,
                                    'orderby'        => 'ID',
                                    'order'          => 'ASC',
                                    'meta_query'     => [
                                        [
                                            'key'   => '_wp_attached_file',
                                            'value' => $meta_value,
                                        ],
                                    ],
                                ]
                            );
                            $item_rows = [];
                            if ( is_array( $ids ) && $ids ) {
                                foreach ( $ids as $id ) {
                                    $item_rows[] = [ 'ID' => (int) $id ];
                                }
                            }
                            if ( is_array( $item_rows ) ) {
                                wp_cache_set( $item_cache_key, $item_rows, 'hoatzinmedia' );
                            }
                        }

                        if ( !is_array( $item_rows ) || !$item_rows ) {
                            continue;
                        }

                        $items = [];

                        foreach ( $item_rows as $item_row ) {
                            $attachment_id = isset( $item_row['ID'] ) ? (int) $item_row['ID'] : 0;

                            if ( $attachment_id <= 0 ) {
                                continue;
                            }

                            $file_path = get_attached_file( $attachment_id );
                            $file_size = 0;

                            if ( $file_path && @is_readable( $file_path ) ) {
                                $size_raw = @filesize( $file_path );
                                if ( false !== $size_raw && $size_raw > 0 ) {
                                    $file_size = (int) $size_raw;
                                }
                            }

                            $file_url = wp_get_attachment_url( $attachment_id );
                            $file_name = $meta_value ? wp_basename( $meta_value ) : '';
                            $date_uploaded = get_post_field( 'post_date', $attachment_id );

                            $items[] = [
                                'attachment_id'   => $attachment_id,
                                'file_name'       => $file_name ? sanitize_file_name( $file_name ) : '',
                                'file_size'       => $file_size > 0 ? size_format( $file_size ) : '',
                                'file_size_bytes' => $file_size,
                                'file_url'        => $file_url ? esc_url_raw( $file_url ) : '',
                                'date_uploaded'   => $date_uploaded ? sanitize_text_field( (string) $date_uploaded ) : '',
                            ];
                        }

                        if ( $items ) {
                            $groups[] = [
                                'group_key'  => $meta_value,
                                'file_name'  => wp_basename( $meta_value ),
                                'duplicates' => count( $items ),
                                'items'      => $items,
                            ];
                        }
                    }
                }
            }
        }

        $total_pages = 0;

        if ( $per_page > 0 && $total_groups > 0 ) {
            $total_pages = (int) ceil( $total_groups / $per_page );
        }

        $data = [
            'page'        => $page,
            'per_page'    => $per_page,
            'total'       => $total_groups,
            'total_pages' => $total_pages,
            'groups'      => $groups,
        ];

        return new \WP_REST_Response( $data );
    }

    public function get_attachment_usage( $request ) {
        $attachment_id = (int) $request->get_param( 'attachment_id' );
        $limit = (int) $request->get_param( 'limit' );
        $deep = (bool) $request->get_param( 'deep' );

        if ( $attachment_id <= 0 ) {
            return new \WP_Error(
                'hoatzinmedia_invalid_request',
                esc_html__( 'attachment_id is required.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => 400,
                ]
            );
        }

        if ( $limit <= 0 ) {
            $limit = 20;
        } elseif ( $limit > 100 ) {
            $limit = 100;
        }

        $usages = Scanner::get_instance()->get_attachment_usage( $attachment_id, $limit, $deep );
        if ( !is_array( $usages ) ) {
            $usages = [];
        }

        return new \WP_REST_Response(
            [
                'attachment_id' => $attachment_id,
                'usages'        => $usages,
            ]
        );
    }
}
