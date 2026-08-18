<?php

namespace HoatzinMedia\Service;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Folders_Manager {

	/**
	 * Taxonomy name for virtual folders.
	 */
	const TAXONOMY = 'hoatzinmedia_folder';

	/**
	 * @var Folders_Manager
	 */
	private static $instance;

	/**
	 * Get singleton instance.
	 *
	 * @return Folders_Manager
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'register_taxonomy' ) );
		add_filter( 'ajax_query_attachments_args', array( $this, 'filter_attachments_grid' ) );
		add_action( 'pre_get_posts', array( $this, 'filter_attachments_list' ) );
		add_filter( 'rest_attachment_query', array( $this, 'filter_rest_attachments' ), 10, 2 );

		// Hook attachment assignment on all possible attachment creation hooks
		add_action( 'add_attachment', array( $this, 'auto_assign_uploaded_attachment' ), 20, 1 );
		add_action( 'edit_attachment', array( $this, 'auto_assign_uploaded_attachment' ), 20, 1 );
		add_action( 'wp_insert_attachment', array( $this, 'auto_assign_uploaded_attachment' ), 20, 1 );
		add_action( 'rest_insert_attachment', array( $this, 'auto_assign_uploaded_attachment' ), 20, 1 );
	}

	/**
	 * Automatically assign uploaded attachment to selected folder if provided in request or user meta.
	 *
	 * @param int $post_id
	 */
	public function auto_assign_uploaded_attachment( $post_id ) {
		$post_id = (int) $post_id;
		if ( $post_id <= 0 ) {
			return;
		}

		$folder_id = 0;
		if ( isset( $_REQUEST['hoatzinmedia_folder'] ) && (int) $_REQUEST['hoatzinmedia_folder'] > 0 ) {
			$folder_id = (int) $_REQUEST['hoatzinmedia_folder'];
		} elseif ( isset( $_POST['hoatzinmedia_folder'] ) && (int) $_POST['hoatzinmedia_folder'] > 0 ) {
			$folder_id = (int) $_POST['hoatzinmedia_folder'];
		} elseif ( isset( $_POST['post_data'] ) && is_array( $_POST['post_data'] ) && ! empty( $_POST['post_data']['hoatzinmedia_folder'] ) ) {
			$folder_id = (int) $_POST['post_data']['hoatzinmedia_folder'];
		}

		// Fallback to active user meta folder setting if request param is absent
		if ( $folder_id <= 0 && is_user_logged_in() ) {
			$folder_id = (int) get_user_meta( get_current_user_id(), '_hoatzinmedia_active_upload_folder', true );
		}

		if ( $folder_id > 0 ) {
			$term = get_term( $folder_id, self::TAXONOMY );
			if ( $term && ! is_wp_error( $term ) ) {
				wp_set_object_terms( $post_id, array( (int) $term->term_id ), self::TAXONOMY, false );
				wp_set_post_terms( $post_id, array( (int) $term->term_id ), self::TAXONOMY, false );
				clean_post_cache( $post_id );
				wp_update_term_count_now( array( (int) $term->term_id ), self::TAXONOMY );
			}
		}
	}

	/**
	 * Register the virtual folder custom taxonomy for attachments.
	 */
	public function register_taxonomy() {
		$labels = array(
			'name'              => _x( 'Media Folders', 'taxonomy general name', 'hoatzinmedia-library-cleaner' ),
			'singular_name'     => _x( 'Media Folder', 'taxonomy singular name', 'hoatzinmedia-library-cleaner' ),
			'search_items'      => __( 'Search Media Folders', 'hoatzinmedia-library-cleaner' ),
			'all_items'         => __( 'All Media Folders', 'hoatzinmedia-library-cleaner' ),
			'parent_item'       => __( 'Parent Media Folder', 'hoatzinmedia-library-cleaner' ),
			'parent_item_colon' => __( 'Parent Media Folder:', 'hoatzinmedia-library-cleaner' ),
			'edit_item'         => __( 'Edit Media Folder', 'hoatzinmedia-library-cleaner' ),
			'update_item'       => __( 'Update Media Folder', 'hoatzinmedia-library-cleaner' ),
			'add_new_item'      => __( 'Add New Media Folder', 'hoatzinmedia-library-cleaner' ),
			'new_item_name'     => __( 'New Media Folder Name', 'hoatzinmedia-library-cleaner' ),
			'menu_name'         => __( 'Media Folders', 'hoatzinmedia-library-cleaner' ),
		);

		$args = array(
			'labels'            => $labels,
			'hierarchical'      => true,
			'public'            => false,
			'show_ui'           => false,
			'show_admin_column' => false,
			'show_in_nav_menus' => false,
			'query_var'         => true,
			'rewrite'           => false,
		);

		register_taxonomy( self::TAXONOMY, array( 'attachment' ), $args );
	}

	/**
	 * Filter media grid query (AJAX query-attachments).
	 *
	 * @param array $query Query arguments.
	 * @return array Modified query arguments.
	 */
	public function filter_attachments_grid( $query ) {
		$folder_id = 0;
		if ( isset( $_REQUEST['hoatzinmedia_folder'] ) ) {
			$folder_id = (int) $_REQUEST['hoatzinmedia_folder'];
		} elseif ( isset( $_REQUEST['query']['hoatzinmedia_folder'] ) ) {
			$folder_id = (int) $_REQUEST['query']['hoatzinmedia_folder'];
		}

		if ( $folder_id !== 0 ) {
			$query = $this->apply_folder_filter( $query, $folder_id );
		}

		return $query;
	}

	/**
	 * Filter REST API attachment query.
	 *
	 * @param array           $args
	 * @param \WP_REST_Request $request
	 * @return array
	 */
	public function filter_rest_attachments( $args, $request ) {
		$folder_id = (int) $request->get_param( 'hoatzinmedia_folder' );
		if ( $folder_id !== 0 ) {
			$args = $this->apply_folder_filter( $args, $folder_id );
		}
		return $args;
	}

	/**
	 * Filter media list query (WP_Query in upload.php).
	 *
	 * @param \WP_Query $query WP_Query instance.
	 */
	public function filter_attachments_list( $query ) {
		if ( ! is_admin() || ! $query->is_main_query() ) {
			return;
		}

		global $pagenow;
		if ( 'upload.php' !== $pagenow ) {
			return;
		}

		if ( isset( $_GET['hoatzinmedia_folder'] ) ) {
			$folder_id = (int) $_GET['hoatzinmedia_folder'];
			$query_args = $this->apply_folder_filter( array(), $folder_id );
			if ( ! empty( $query_args['tax_query'] ) ) {
				$query->set( 'tax_query', $query_args['tax_query'] );
			}
		}
	}

	/**
	 * Helper to apply tax_query to query array.
	 *
	 * @param array $query
	 * @param int   $folder_id
	 * @return array
	 */
	private function apply_folder_filter( array $query, $folder_id ) {
		if ( $folder_id === -1 ) {
			// Uncategorized
			$query['tax_query'] = array(
				array(
					'taxonomy' => self::TAXONOMY,
					'operator' => 'NOT EXISTS',
				),
			);
		} elseif ( $folder_id > 0 ) {
			$query['tax_query'] = array(
				array(
					'taxonomy'         => self::TAXONOMY,
					'field'            => 'term_id',
					'terms'            => (int) $folder_id,
					'include_children' => true,
				),
			);
		}

		return $query;
	}
}
