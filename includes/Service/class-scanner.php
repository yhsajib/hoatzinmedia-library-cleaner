<?php
namespace HoatzinMedia\Service;
if ( !defined( 'ABSPATH' ) ) {
    exit;
}
class Scanner {

    /**
     * @var Scanner
     */
    private static $instance;

    /**
     * Get singleton instance.
     *
     * @return Scanner
     */
    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    public function start_new_scan() {
        $lock_scan_id = get_transient( 'hoatzinmedia_scan_lock' );

        if ( $lock_scan_id ) {
            return new \WP_Error(
                'hoatzinmedia_scan_in_progress',
                esc_html__( 'A scan is already running.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => 409,
                ]
            );
        }

        $scan_id = 'hm_scan_' . wp_generate_uuid4();
        $total = $this->count_total_attachments();

        $state = [
            'scan_id'        => $scan_id,
            'total'          => $total,
            'processed'      => 0,
            'found'          => 0,
            'found_bytes'    => 0,
            'finished'       => false,
            'cursor_last_id' => 0,
        ];

        set_transient( 'hoatzinmedia_scan_lock', $scan_id, 6 * HOUR_IN_SECONDS );
        set_transient( 'hoatzinmedia_scan_' . $scan_id, $state, 6 * HOUR_IN_SECONDS );
        set_transient( 'hoatzinmedia_scan_found_' . $scan_id, [], 6 * HOUR_IN_SECONDS );

        return $state;
    }

    public function get_scan_state( $scan_id ) {
        $lock_scan_id = get_transient( 'hoatzinmedia_scan_lock' );

        if ( $lock_scan_id && $lock_scan_id !== $scan_id ) {
            return new \WP_Error(
                'hoatzinmedia_scan_in_progress',
                esc_html__( 'Another scan is already running.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => 409,
                ]
            );
        }

        $state = get_transient( 'hoatzinmedia_scan_' . $scan_id );

        if ( !is_array( $state ) || empty( $state['scan_id'] ) ) {
            return new \WP_Error(
                'hoatzinmedia_scan_not_found',
                esc_html__( 'Scan could not be found or has expired.', 'hoatzinmedia-library-cleaner' ),
                [
                    'status' => 404,
                ]
            );
        }

        return $state;
    }

    public function process_batch( array $state, $batch_size = 100, $time_budget_seconds = 12 ) {
        $total = isset( $state['total'] ) ? (int) $state['total'] : 0;
        $processed = isset( $state['processed'] ) ? (int) $state['processed'] : 0;
        $found = isset( $state['found'] ) ? (int) $state['found'] : 0;
        $found_bytes = isset( $state['found_bytes'] ) ? (int) $state['found_bytes'] : 0;
        $scan_id = isset( $state['scan_id'] ) ? (string) $state['scan_id'] : '';
        $cursor_last_id = isset( $state['cursor_last_id'] ) ? (int) $state['cursor_last_id'] : 0;
        $batch_size = (int) $batch_size;
        if ( $batch_size <= 0 ) {
            $batch_size = 10;
        } elseif ( $batch_size > 200 ) {
            $batch_size = 200;
        }
        $time_budget_seconds = is_numeric( $time_budget_seconds ) ? (float) $time_budget_seconds : 12;
        if ( $time_budget_seconds < 2 ) {
            $time_budget_seconds = 2;
        } elseif ( $time_budget_seconds > 55 ) {
            $time_budget_seconds = 55;
        }
        $batch_started_at = microtime( true );

        $found_ids = [];
        if ( $scan_id ) {
            $found_ids_raw = get_transient( 'hoatzinmedia_scan_found_' . $scan_id );
            if ( is_array( $found_ids_raw ) ) {
                $found_ids = $found_ids_raw;
            }
        }

        $is_legacy_scan = isset( $state['attachment_ids'] ) && is_array( $state['attachment_ids'] );

        if ( $is_legacy_scan ) {
            $attachment_ids = array_values( array_filter( array_map( 'intval', $state['attachment_ids'] ) ) );
            $total = count( $attachment_ids );
            $state['total'] = $total;

            if ( $processed < 0 ) {
                $processed = 0;
            }
            if ( $processed >= $total ) {
                $state['finished'] = true;
                delete_transient( 'hoatzinmedia_scan_lock' );
                set_transient( 'hoatzinmedia_scan_' . $state['scan_id'], $state, 6 * HOUR_IN_SECONDS );
                if ( $scan_id ) {
                    $this->persist_last_scan_results( $scan_id, $found_ids, $state );
                }
                return $state;
            }

            $batch_ids = array_slice( $attachment_ids, $processed, $batch_size );
        } else {
            $batch_ids = $this->get_attachment_ids_after( $cursor_last_id, $batch_size );
        }

        if ( empty( $batch_ids ) ) {
            $state['finished'] = true;
            delete_transient( 'hoatzinmedia_scan_lock' );
            set_transient( 'hoatzinmedia_scan_' . $state['scan_id'], $state, 6 * HOUR_IN_SECONDS );

            if ( $scan_id ) {
                $this->persist_last_scan_results( $scan_id, $found_ids, $state );
            }

            return $state;
        }

        $processed_in_this_request = 0;
        $last_processed_id = 0;

        foreach ( $batch_ids as $attachment_id ) {
            if ( ( microtime( true ) - $batch_started_at ) >= $time_budget_seconds ) {
                break;
            }
            $attachment_id = (int) $attachment_id;
            if ( $attachment_id <= 0 ) {
                continue;
            }
            $last_processed_id = $attachment_id;
            $processed_in_this_request++;
            $is_unused = $this->is_unused_attachment_for_scan( $attachment_id );

            if ( $is_unused ) {
                $size_bytes = $this->get_attachment_size( $attachment_id );
                $this->store_scan_result( $attachment_id, $size_bytes );
                $found_ids[] = $attachment_id;
                $found++;
                $found_bytes += $size_bytes;
            }
        }

        $processed += $processed_in_this_request;
        if ( ! $is_legacy_scan ) {
            if ( $last_processed_id > 0 ) {
                $cursor_last_id = $last_processed_id;
            } else {
                $cursor_last_id = (int) max( array_map( 'intval', $batch_ids ) );
            }
        }

        $state['processed'] = $processed;
        $state['found'] = $found;
        $state['found_bytes'] = $found_bytes;
        if ( ! $is_legacy_scan ) {
            $state['cursor_last_id'] = $cursor_last_id;
        }

        if ( $total > 0 && $processed >= $total ) {
            $state['finished'] = true;
            delete_transient( 'hoatzinmedia_scan_lock' );
        }

        if ( $scan_id ) {
            $found_ids = array_values( array_unique( array_map( 'intval', is_array( $found_ids ) ? $found_ids : [] ) ) );
            set_transient( 'hoatzinmedia_scan_found_' . $scan_id, $found_ids, 6 * HOUR_IN_SECONDS );
        }

        set_transient( 'hoatzinmedia_scan_' . $state['scan_id'], $state, 6 * HOUR_IN_SECONDS );

        if ( isset( $state['finished'] ) && $state['finished'] && $scan_id ) {
            $this->persist_last_scan_results( $scan_id, $found_ids, $state );
        }

        return $state;
    }

    private function count_total_attachments() {
        $counts = wp_count_posts( 'attachment' );
        if ( is_object( $counts ) && isset( $counts->inherit ) ) {
            return (int) $counts->inherit;
        }
        if ( is_array( $counts ) && isset( $counts['inherit'] ) ) {
            return (int) $counts['inherit'];
        }
        return 0;
    }

    private function get_attachment_ids_after( $after_id, $limit ) {
        global $wpdb;
        $after_id = (int) $after_id;
        $limit = (int) $limit;

        if ( $limit <= 0 ) {
            $limit = 20;
        }
        if ( $limit > 200 ) {
            $limit = 200;
        }
        if ( $after_id < 0 ) {
            $after_id = 0;
        }

        $sql = $wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts} WHERE post_type = %s AND post_status = %s AND ID > %d ORDER BY ID ASC LIMIT %d",
            'attachment',
            'inherit',
            $after_id,
            $limit
        );
        $ids = $wpdb->get_col( $sql );
        if ( ! is_array( $ids ) ) {
            return [];
        }
        return array_values( array_filter( array_map( 'intval', $ids ) ) );
    }

    private function persist_last_scan_results( $scan_id, array $found_ids, array $state ) {
        $scan_id = (string) $scan_id;
        if ( '' === $scan_id ) {
            return;
        }

        $found_ids = array_values( array_unique( array_filter( array_map( 'intval', $found_ids ) ) ) );

        update_option( 'hoatzinmedia_last_unused_ids', $found_ids, false );

        $meta = [
            'scan_id'     => $scan_id,
            'finished_at' => gmdate( 'c' ),
            'total'       => isset( $state['total'] ) ? (int) $state['total'] : 0,
            'found'       => isset( $state['found'] ) ? (int) $state['found'] : count( $found_ids ),
            'found_bytes' => isset( $state['found_bytes'] ) ? (int) $state['found_bytes'] : 0,
        ];

        update_option( 'hoatzinmedia_last_unused_meta', $meta, false );

        delete_transient( 'hoatzinmedia_scan_found_' . $scan_id );
    }

    public function run_full_scan() {
        // Force start new scan
        delete_transient( 'hoatzinmedia_scan_lock' );
        $state = $this->start_new_scan();

        if ( is_wp_error( $state ) ) {
            return $state;
        }

        $max_time = 300; // 5 minutes max
        $start_time = time();

        while ( !$state['finished'] ) {
            // Check for timeout
            if ( time() - $start_time > $max_time ) {
                break;
            }

            $state = $this->process_batch( $state, 50 );
        }

        return $state;
    }

    public function is_unused_attachment( $attachment_id ) {
        $attachment_id = (int) $attachment_id;

        if ( $attachment_id <= 0 ) {
            return true;
        }

        if ( $this->is_used_as_site_setting( $attachment_id ) ) {
            return false;
        }

        if ( $this->is_used_as_woocommerce_placeholder( $attachment_id ) ) {
            return false;
        }

        if ( $this->is_used_as_featured_image( $attachment_id ) ) {
            return false;
        }

        if ( $this->is_used_in_woocommerce_gallery( $attachment_id ) ) {
            return false;
        }

        $patterns = $this->build_like_patterns_for_attachment( $attachment_id );

        if ( $this->is_used_in_post_content( $patterns ) ) {
            return false;
        }

        if ( $this->is_used_in_page_builder_meta( $patterns ) ) {
            return false;
        }

        return true;
    }

    public function is_unused_attachment_fast( $attachment_id ) {
        return $this->is_unused_attachment_for_scan( $attachment_id );
    }

    private function is_unused_attachment_for_scan( $attachment_id ) {
        $attachment_id = (int) $attachment_id;

        if ( $attachment_id <= 0 ) {
            return true;
        }

        $attachment = get_post( $attachment_id );
        if ( ! $attachment instanceof \WP_Post || 'attachment' !== $attachment->post_type ) {
            return true;
        }

        if ( $this->is_used_as_site_setting( $attachment_id ) ) {
            return false;
        }

        if ( $this->is_used_as_woocommerce_placeholder( $attachment_id ) ) {
            return false;
        }

        if ( $this->is_used_as_featured_image( $attachment_id ) ) {
            return false;
        }

        if ( $this->is_used_in_woocommerce_gallery( $attachment_id ) ) {
            return false;
        }

        $parent_id = isset( $attachment->post_parent ) ? (int) $attachment->post_parent : 0;
        if ( $parent_id > 0 ) {
            return false;
        }

        return true;
    }

    private function is_used_as_woocommerce_placeholder( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return false;
        }

        $opt = get_option( 'woocommerce_placeholder_image', '' );
        if ( is_numeric( $opt ) && (int) $opt === $attachment_id ) {
            return true;
        }

        $url = wp_get_attachment_url( $attachment_id );
        $basename = $url ? wp_basename( $url ) : '';
        if ( $basename && strpos( $basename, 'woocommerce-placeholder' ) === 0 ) {
            return true;
        }

        if ( is_string( $opt ) && '' !== $opt ) {
            if ( $url && $opt === $url ) {
                return true;
            }
            if ( $basename && $opt === $basename ) {
                return true;
            }
        }

        return false;
    }

    public function get_attachment_usage( $attachment_id, $limit = 20, $deep = false ) {
        $attachment_id = (int) $attachment_id;
        $limit = (int) $limit;
        $deep = (bool) $deep;

        if ( $attachment_id <= 0 ) {
            return [];
        }

        if ( $limit <= 0 ) {
            $limit = 20;
        } elseif ( $limit > 100 ) {
            $limit = 100;
        }

        $cache_ver = (int) get_option( 'hoatzinmedia_cache_ver', 1 );
        $usage_cache_key = 'usage_' . $cache_ver . '_' . $attachment_id . '_' . $limit . '_' . ( $deep ? '1' : '0' );
        $cached = wp_cache_get( $usage_cache_key, 'hoatzinmedia' );
        if ( false !== $cached && is_array( $cached ) ) {
            return $cached;
        }

        $contexts_by_post = [];
        $special = [];

        $attachment = get_post( $attachment_id );
        if ( $attachment instanceof \WP_Post && isset( $attachment->post_parent ) ) {
            $parent_id = (int) $attachment->post_parent;
            if ( $parent_id > 0 ) {
                $this->add_post_context( $contexts_by_post, $parent_id, 'attached_to' );
            }
        }

        $site_icon = (int) get_option( 'site_icon' );
        if ( $site_icon > 0 && $site_icon === $attachment_id ) {
            $special[] = [
                'type'  => 'site_icon',
                'label' => 'Site Icon',
            ];
        }

        $custom_logo = (int) get_theme_mod( 'custom_logo' );
        if ( $custom_logo > 0 && $custom_logo === $attachment_id ) {
            $special[] = [
                'type'  => 'site_logo',
                'label' => 'Site Logo',
            ];
        }

        if ( $this->is_used_as_woocommerce_placeholder( $attachment_id ) ) {
            $special[] = [
                'type'  => 'woocommerce_placeholder',
                'label' => 'WooCommerce Placeholder',
            ];
        }

        $featured_post_ids = $this->find_featured_image_post_ids( $attachment_id, $limit );
        foreach ( $featured_post_ids as $pid ) {
            $this->add_post_context( $contexts_by_post, $pid, 'featured_image' );
        }

        $gallery_post_ids = $this->find_woocommerce_gallery_post_ids( $attachment_id, $limit );
        foreach ( $gallery_post_ids as $pid ) {
            $this->add_post_context( $contexts_by_post, $pid, 'product_gallery' );
        }

        if ( $deep ) {
            $started_at = microtime( true );
            $time_budget = 2.5;
            $patterns = $this->build_like_patterns_for_attachment( $attachment_id );

            if ( ( microtime( true ) - $started_at ) < $time_budget ) {
                $content_post_ids = $this->find_post_content_post_ids( $patterns, $limit );
                foreach ( $content_post_ids as $pid ) {
                    $this->add_post_context( $contexts_by_post, $pid, 'post_content' );
                }
            }

            if ( ( microtime( true ) - $started_at ) < $time_budget ) {
                $builder_hits = $this->find_builder_meta_hits( $patterns, $limit );
                foreach ( $builder_hits as $hit ) {
                    $pid = isset( $hit['post_id'] ) ? (int) $hit['post_id'] : 0;
                    $meta_key = isset( $hit['meta_key'] ) ? (string) $hit['meta_key'] : '';
                    if ( $pid > 0 ) {
                        $label = $meta_key ? 'meta:' . $meta_key : 'meta';
                        $this->add_post_context( $contexts_by_post, $pid, $label );
                    }
                }
            }
        }

        $post_ids = array_keys( $contexts_by_post );
        $posts_info = $this->get_posts_info_map( $post_ids );

        $usages = [];

        foreach ( $special as $entry ) {
            $type = isset( $entry['type'] ) ? (string) $entry['type'] : '';
            $label = isset( $entry['label'] ) ? (string) $entry['label'] : '';
            if ( '' === $type ) {
                continue;
            }
            $usages[] = [
                'kind'   => 'site',
                'type'   => $type,
                'label'  => $label,
                'post'   => null,
                'contexts' => [ $type ],
            ];
        }

        foreach ( $contexts_by_post as $pid => $contexts ) {
            $pid = (int) $pid;
            $info = isset( $posts_info[$pid] ) ? $posts_info[$pid] : null;
            if ( !$info ) {
                continue;
            }
            $usages[] = [
                'kind'     => 'post',
                'type'     => 'post',
                'label'    => '',
                'post'     => $info,
                'contexts' => array_values( array_unique( array_filter( array_map( 'strval', (array) $contexts ) ) ) ),
            ];
        }

        wp_cache_set( $usage_cache_key, $usages, 'hoatzinmedia', HOUR_IN_SECONDS );
        return $usages;
    }

    private function add_post_context( array &$contexts_by_post, $post_id, $context ) {
        $post_id = (int) $post_id;
        $context = (string) $context;
        if ( $post_id <= 0 || '' === $context ) {
            return;
        }
        if ( !isset( $contexts_by_post[$post_id] ) || !is_array( $contexts_by_post[$post_id] ) ) {
            $contexts_by_post[$post_id] = [];
        }
        $contexts_by_post[$post_id][] = $context;
    }

    private function get_scan_post_types() {
        $types = get_post_types( [ 'public' => true ], 'names' );
        if ( ! is_array( $types ) ) {
            $types = [];
        }
        $types = array_values( array_diff( $types, [ 'attachment' ] ) );
        if ( empty( $types ) ) {
            $types = [ 'post', 'page' ];
        }
        return $types;
    }

    private function get_scan_post_statuses() {
        $statuses = get_post_stati( [], 'names' );
        if ( ! is_array( $statuses ) ) {
            $statuses = [];
        }
        $statuses = array_values( array_diff( $statuses, [ 'trash', 'auto-draft' ] ) );
        if ( empty( $statuses ) ) {
            $statuses = [ 'publish' ];
        }
        return $statuses;
    }

    private function patterns_to_tokens( array $patterns ) {
        $tokens = [];
        foreach ( $patterns as $pattern ) {
            if ( ! is_string( $pattern ) || '' === $pattern ) {
                continue;
            }
            $token = trim( $pattern, '%' );
            $token = stripslashes( $token );
            if ( '' !== $token ) {
                $tokens[] = $token;
            }
        }
        return array_values( array_unique( $tokens ) );
    }

    private function query_post_ids_by_content_patterns( array $patterns, $limit ) {
        $patterns = array_values( array_filter( array_map( 'strval', $patterns ) ) );
        $limit = (int) $limit;
        if ( empty( $patterns ) || $limit <= 0 ) {
            return [];
        }

        $where_filter = function ( $where, $query ) use ( $patterns ) {
            if ( ! $query instanceof \WP_Query ) {
                return $where;
            }
            if ( ! $query->get( 'hoatzinmedia_content_search' ) ) {
                return $where;
            }
            global $wpdb;
            $clauses = [];
            foreach ( $patterns as $pattern ) {
                $clauses[] = $wpdb->prepare( 'post_content LIKE %s', $pattern );
            }
            if ( ! empty( $clauses ) ) {
                $where .= ' AND (' . implode( ' OR ', $clauses ) . ')';
            }
            return $where;
        };

        add_filter( 'posts_where', $where_filter, 10, 2 );
        $query = new \WP_Query(
            [
                'post_type'                 => $this->get_scan_post_types(),
                'post_status'               => $this->get_scan_post_statuses(),
                'posts_per_page'            => $limit,
                'fields'                    => 'ids',
                'no_found_rows'             => true,
                'update_post_meta_cache'    => false,
                'update_post_term_cache'    => false,
                'ignore_sticky_posts'       => true,
                'hoatzinmedia_content_search' => true,
            ]
        );
        remove_filter( 'posts_where', $where_filter, 10 );

        $ids = isset( $query->posts ) && is_array( $query->posts ) ? $query->posts : [];
        return array_values( array_unique( array_map( 'intval', $ids ) ) );
    }

    private function find_featured_image_post_ids( $attachment_id, $limit ) {
        $attachment_id = (int) $attachment_id;
        $limit = (int) $limit;
        if ( $attachment_id <= 0 || $limit <= 0 ) {
            return [];
        }

        $cache_key = 'featured_posts_' . $attachment_id . '_' . $limit;
        $cached = wp_cache_get( $cache_key, 'hoatzinmedia' );
        if ( false !== $cached ) {
            return array_values( array_unique( array_map( 'intval', is_array( $cached ) ? $cached : [] ) ) );
        }

        $post_ids = get_posts(
            [
                'post_type'                 => $this->get_scan_post_types(),
                'post_status'               => $this->get_scan_post_statuses(),
                'posts_per_page'            => $limit,
                'fields'                    => 'ids',
                'no_found_rows'             => true,
                'update_post_meta_cache'    => false,
                'update_post_term_cache'    => false,
                'ignore_sticky_posts'       => true,
                'meta_key'                  => '_thumbnail_id',
                'meta_value'                => $attachment_id,
            ]
        );

        if ( ! is_array( $post_ids ) ) {
            $post_ids = [];
        }

        $post_ids = array_values( array_unique( array_map( 'intval', $post_ids ) ) );
        wp_cache_set( $cache_key, $post_ids, 'hoatzinmedia', HOUR_IN_SECONDS );
        return $post_ids;
    }

    private function find_woocommerce_gallery_post_ids( $attachment_id, $limit ) {
        $attachment_id = (int) $attachment_id;
        $limit = (int) $limit;
        if ( $attachment_id <= 0 || $limit <= 0 ) {
            return [];
        }

        $cache_key = 'wc_gallery_posts_' . $attachment_id . '_' . $limit;
        $cached = wp_cache_get( $cache_key, 'hoatzinmedia' );
        if ( false !== $cached ) {
            return array_values( array_unique( array_map( 'intval', is_array( $cached ) ? $cached : [] ) ) );
        }

        $id = (string) $attachment_id;

        $post_ids = get_posts(
            [
                'post_type'                 => $this->get_scan_post_types(),
                'post_status'               => $this->get_scan_post_statuses(),
                'posts_per_page'            => $limit,
                'fields'                    => 'ids',
                'no_found_rows'             => true,
                'update_post_meta_cache'    => false,
                'update_post_term_cache'    => false,
                'ignore_sticky_posts'       => true,
                'meta_query'                => [
                    'relation' => 'OR',
                    [
                        'key'     => '_product_image_gallery',
                        'value'   => $id,
                        'compare' => '=',
                    ],
                    [
                        'key'     => '_product_image_gallery',
                        'value'   => $id . ',',
                        'compare' => 'LIKE',
                    ],
                    [
                        'key'     => '_product_image_gallery',
                        'value'   => ',' . $id . ',',
                        'compare' => 'LIKE',
                    ],
                    [
                        'key'     => '_product_image_gallery',
                        'value'   => ',' . $id,
                        'compare' => 'LIKE',
                    ],
                ],
            ]
        );

        if ( ! is_array( $post_ids ) ) {
            $post_ids = [];
        }

        $post_ids = array_values( array_unique( array_map( 'intval', $post_ids ) ) );
        wp_cache_set( $cache_key, $post_ids, 'hoatzinmedia', HOUR_IN_SECONDS );
        return $post_ids;
    }

    private function find_post_content_post_ids( array $patterns, $limit ) {
        $limit = (int) $limit;
        if ( empty( $patterns ) || $limit <= 0 ) {
            return [];
        }

        $cache_key = 'content_posts_' . md5( wp_json_encode( [ $patterns, $limit ] ) );
        $cached = wp_cache_get( $cache_key, 'hoatzinmedia' );
        if ( false !== $cached ) {
            return array_values( array_unique( array_map( 'intval', is_array( $cached ) ? $cached : [] ) ) );
        }

        $ids = $this->query_post_ids_by_content_patterns( $patterns, $limit );
        wp_cache_set( $cache_key, $ids, 'hoatzinmedia', HOUR_IN_SECONDS );
        return $ids;
    }

    private function find_builder_meta_hits( array $patterns, $limit ) {
        $limit = (int) $limit;
        if ( empty( $patterns ) || $limit <= 0 ) {
            return [];
        }

        $cache_key = 'builder_hits_' . md5( wp_json_encode( [ $patterns, $limit ] ) );
        $cached = wp_cache_get( $cache_key, 'hoatzinmedia' );
        if ( false !== $cached ) {
            return is_array( $cached ) ? $cached : [];
        }

        $keys = [
            '_elementor_data',
            '_elementor_page_settings',
            '_fl_builder_data',
            '_fl_builder_draft',
            '_panels_data',
            '_et_pb_old_content',
            '_et_pb_shortcodes',
            '_et_pb_builder_settings',
            '_fusion_builder_data',
            '_cornerstone_data',
            '_ct_builder_shortcodes',
            'ct_builder_json',
            '_brizy_content',
        ];

        $keys = array_values( array_filter( array_map( 'strval', $keys ) ) );
        if ( empty( $keys ) ) {
            return [];
        }

        $tokens = $this->patterns_to_tokens( $patterns );
        if ( empty( $tokens ) ) {
            return [];
        }

        $meta_query = [ 'relation' => 'OR' ];
        foreach ( $keys as $key ) {
            $meta_query[] = [
                'key'     => $key,
                'compare' => 'EXISTS',
            ];
        }

        $candidate_limit = max( 50, min( 500, $limit * 5 ) );
        $candidate_ids = get_posts(
            [
                'post_type'                 => $this->get_scan_post_types(),
                'post_status'               => $this->get_scan_post_statuses(),
                'posts_per_page'            => $candidate_limit,
                'fields'                    => 'ids',
                'no_found_rows'             => true,
                'update_post_meta_cache'    => false,
                'update_post_term_cache'    => false,
                'ignore_sticky_posts'       => true,
                'meta_query'                => $meta_query,
            ]
        );

        if ( ! is_array( $candidate_ids ) ) {
            $candidate_ids = [];
        }

        $hits = [];
        foreach ( $candidate_ids as $pid ) {
            $pid = (int) $pid;
            if ( $pid <= 0 ) {
                continue;
            }

            foreach ( $keys as $meta_key ) {
                $val = get_post_meta( $pid, $meta_key, true );
                if ( is_scalar( $val ) ) {
                    $val = (string) $val;
                } else {
                    continue;
                }
                if ( '' === $val ) {
                    continue;
                }
                foreach ( $tokens as $token ) {
                    if ( '' !== $token && false !== strpos( $val, $token ) ) {
                        $hits[] = [
                            'post_id'  => $pid,
                            'meta_key' => $meta_key,
                        ];
                        break;
                    }
                }
                if ( count( $hits ) >= $limit ) {
                    break 2;
                }
            }
        }

        wp_cache_set( $cache_key, $hits, 'hoatzinmedia', HOUR_IN_SECONDS );
        return $hits;
    }

    private function get_posts_info_map( array $post_ids ) {
        $post_ids = array_values( array_unique( array_filter( array_map( 'intval', $post_ids ) ) ) );
        if ( empty( $post_ids ) ) {
            return [];
        }

        $map = [];
        $posts = get_posts(
            [
                'post__in'                => $post_ids,
                'posts_per_page'          => count( $post_ids ),
                'post_type'               => 'any',
                'post_status'             => 'any',
                'orderby'                 => 'post__in',
                'no_found_rows'           => true,
                'update_post_meta_cache'  => false,
                'update_post_term_cache'  => false,
                'ignore_sticky_posts'     => true,
                'suppress_filters'        => true,
            ]
        );

        if ( ! is_array( $posts ) ) {
            $posts = [];
        }

        foreach ( $posts as $post ) {
            if ( ! $post instanceof \WP_Post ) {
                continue;
            }
            $pid = isset( $post->ID ) ? (int) $post->ID : 0;
            if ( $pid <= 0 ) {
                continue;
            }
            $title = isset( $post->post_title ) ? (string) $post->post_title : '';
            $type = isset( $post->post_type ) ? (string) $post->post_type : '';
            $status = isset( $post->post_status ) ? (string) $post->post_status : '';
            $edit_link = get_edit_post_link( $pid, 'raw' );
            $view_link = get_permalink( $pid );
            $map[$pid] = [
                'id'        => $pid,
                'title'     => '' !== $title ? $title : '(no title)',
                'post_type' => $type,
                'status'    => $status,
                'edit_link' => $edit_link ? esc_url_raw( $edit_link ) : '',
                'view_link' => $view_link ? esc_url_raw( $view_link ) : '',
            ];
        }

        return $map;
    }

    private function is_used_as_site_setting( $attachment_id ) {
        $site_icon = (int) get_option( 'site_icon' );
        if ( $site_icon > 0 && $site_icon === (int) $attachment_id ) {
            return true;
        }

        $custom_logo = (int) get_theme_mod( 'custom_logo' );
        if ( $custom_logo > 0 && $custom_logo === (int) $attachment_id ) {
            return true;
        }

        return false;
    }

    private function is_used_as_featured_image( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return false;
        }

        $cache_key = 'used_featured_' . $attachment_id;
        $cached = wp_cache_get( $cache_key, 'hoatzinmedia' );
        if ( false !== $cached ) {
            return (bool) $cached;
        }

        $used = ! empty( $this->find_featured_image_post_ids( $attachment_id, 1 ) );
        wp_cache_set( $cache_key, $used, 'hoatzinmedia', HOUR_IN_SECONDS );
        return $used;
    }

    private function is_used_in_woocommerce_gallery( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        if ( $attachment_id <= 0 ) {
            return false;
        }

        $cache_key = 'used_wc_gallery_' . $attachment_id;
        $cached = wp_cache_get( $cache_key, 'hoatzinmedia' );
        if ( false !== $cached ) {
            return (bool) $cached;
        }

        $used = ! empty( $this->find_woocommerce_gallery_post_ids( $attachment_id, 1 ) );
        wp_cache_set( $cache_key, $used, 'hoatzinmedia', HOUR_IN_SECONDS );
        return $used;
    }

    private function build_like_patterns_for_attachment( $attachment_id ) {
        global $wpdb;

        $attachment_id = (int) $attachment_id;
        $patterns = [];

        $raw_tokens = [
            'wp-image-' . $attachment_id,
            'data-id="' . $attachment_id . '"',
            "data-id='" . $attachment_id . "'",
            'attachment_id="' . $attachment_id . '"',
            "attachment_id='" . $attachment_id . "'",
            '"attachment_id":' . $attachment_id,
            '"attachment_id":"' . $attachment_id . '"',
            '<!-- wp:image {"id":' . $attachment_id,
            '<!-- wp:image {"id": ' . $attachment_id,
            '<!-- wp:cover {"id":' . $attachment_id,
            '<!-- wp:cover {"id": ' . $attachment_id,
            '<!-- wp:gallery {"ids":[' . $attachment_id,
            '<!-- wp:gallery {"ids": [' . $attachment_id,
            '<!-- wp:media-text {"mediaId":' . $attachment_id,
            '<!-- wp:media-text {"mediaId": ' . $attachment_id,
            '"id":' . $attachment_id . ',"url"',
            '"id":' . $attachment_id . ', "url"',
        ];

        $url = wp_get_attachment_url( $attachment_id );
        $path = '';
        $basename = '';

        if ( $url ) {
            $path = wp_parse_url( $url, PHP_URL_PATH );
            $basename = $path ? wp_basename( $path ) : wp_basename( $url );

            $raw_tokens[] = $url;
            if ( $path ) {
                $raw_tokens[] = $path;
            }

            $escaped_url = str_replace( '/', '\\/', $url );
            $raw_tokens[] = $escaped_url;
            if ( $path ) {
                $raw_tokens[] = str_replace( '/', '\\/', $path );
            }
        }

        foreach ( $raw_tokens as $token ) {
            if ( !is_string( $token ) || '' === $token ) {
                continue;
            }
            $patterns[] = '%' . $wpdb->esc_like( $token ) . '%';
        }

        if ( $basename && $path ) {
            $dot_pos = strrpos( $basename, '.' );
            if ( false !== $dot_pos ) {
                $name = substr( $basename, 0, $dot_pos );
                $ext = strtolower( substr( $basename, $dot_pos + 1 ) );
                if ( '' !== $name && '' !== $ext ) {
                    $dir = '';
                    $slash_pos = strrpos( $path, '/' );
                    if ( false !== $slash_pos ) {
                        $dir = substr( $path, 0, $slash_pos + 1 );
                    }
                    if ( $dir ) {
                        $common_exts = [ 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg' ];
                        foreach ( $common_exts as $candidate_ext ) {
                            $candidate_name = $name . '.' . $candidate_ext;
                            $candidate_path = $dir . $candidate_name;
                            $patterns[] = '%' . $wpdb->esc_like( $candidate_path ) . '%';
                            $patterns[] = '%' . $wpdb->esc_like( str_replace( '/', '\/', $candidate_path ) ) . '%';
                            $variant_path = $dir . $name . '-%.' . $candidate_ext;
                            $patterns[] = '%' . $wpdb->esc_like( $variant_path ) . '%';
                            $patterns[] = '%' . $wpdb->esc_like( str_replace( '/', '\/', $variant_path ) ) . '%';
                        }
                    }
                }
            }
        }

        if ( $path && $basename ) {
            $uploads_segment = '/wp-content/uploads/';
            $converted_segment = '/wp-content/hoatzinmedia-images/';
            if ( false !== strpos( $path, $uploads_segment ) ) {
                $dot_pos = strrpos( $basename, '.' );
                $name = false !== $dot_pos ? substr( $basename, 0, $dot_pos ) : $basename;
                $slash_pos = strrpos( $path, '/' );
                $dir = false !== $slash_pos ? substr( $path, 0, $slash_pos + 1 ) : '';
                if ( '' !== $name && '' !== $dir ) {
                    $converted_dir = str_replace( $uploads_segment, $converted_segment, $dir );
                    foreach ( array( 'webp', 'avif' ) as $candidate_ext ) {
                        $converted_path = $converted_dir . $name . '.' . $candidate_ext;
                        $patterns[] = '%' . $wpdb->esc_like( $converted_path ) . '%';
                        $patterns[] = '%' . $wpdb->esc_like( str_replace( '/', '\/', $converted_path ) ) . '%';
                        if ( $url ) {
                            $converted_url = str_replace( $path, $converted_path, $url );
                            $patterns[] = '%' . $wpdb->esc_like( $converted_url ) . '%';
                            $patterns[] = '%' . $wpdb->esc_like( str_replace( '/', '\/', $converted_url ) ) . '%';
                        }
                    }
                }
            }
        }

        $patterns = array_values( array_unique( array_filter( $patterns ) ) );

        if ( count( $patterns ) > 30 ) {
            $patterns = array_slice( $patterns, 0, 30 );
        }

        return $patterns;
    }

    private function is_used_in_post_content( array $patterns ) {
        if ( empty( $patterns ) ) {
            return false;
        }
        $cache_key = 'used_in_content_' . md5( wp_json_encode( $patterns ) );
        $cached = wp_cache_get( $cache_key, 'hoatzinmedia' );
        if ( false !== $cached ) {
            return (bool) $cached;
        }

        $used = ! empty( $this->query_post_ids_by_content_patterns( $patterns, 1 ) );
        wp_cache_set( $cache_key, $used, 'hoatzinmedia', HOUR_IN_SECONDS );
        return $used;
    }

    private function is_used_in_page_builder_meta( array $patterns ) {
        if ( empty( $patterns ) ) {
            return false;
        }
        $cache_key = 'used_in_builder_meta_' . md5( wp_json_encode( $patterns ) );
        $cached = wp_cache_get( $cache_key, 'hoatzinmedia' );
        if ( false !== $cached ) {
            return (bool) $cached;
        }

        $used = ! empty( $this->find_builder_meta_hits( $patterns, 1 ) );
        wp_cache_set( $cache_key, $used, 'hoatzinmedia', HOUR_IN_SECONDS );
        return $used;
    }

    private function get_attachment_size( $attachment_id ) {
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

    private function store_scan_result( $attachment_id, $size_bytes ) {
        $attachment_id = (int) $attachment_id;
        $size_bytes = (int) $size_bytes;
        return;
    }
}
