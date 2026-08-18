<?php

namespace HoatzinMedia\Rest;

use HoatzinMedia\Service\Folders_Manager;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Folders_Controller {

	/**
	 * @var Folders_Controller
	 */
	private static $instance;

	/**
	 * Get singleton instance.
	 *
	 * @return Folders_Controller
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes() {
		$namespace = 'hoatzinmedia/v1';

		register_rest_route(
			$namespace,
			'/folders',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_folders' ),
					'permission_callback' => array( $this, 'permissions_check' ),
				),
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_folder' ),
					'permission_callback' => array( $this, 'permissions_check' ),
				),
			)
		);

		register_rest_route(
			$namespace,
			'/folders/(?P<id>\d+)',
			array(
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_folder' ),
					'permission_callback' => array( $this, 'permissions_check' ),
				),
				array(
					'methods'             => \WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_folder' ),
					'permission_callback' => array( $this, 'permissions_check' ),
				),
			)
		);

		register_rest_route(
			$namespace,
			'/folders/assign',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'assign_attachments' ),
				'permission_callback' => array( $this, 'permissions_check' ),
			)
		);

		register_rest_route(
			$namespace,
			'/folders/active-upload-folder',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'set_active_upload_folder' ),
				'permission_callback' => array( $this, 'permissions_check' ),
			)
		);
	}

	public function set_active_upload_folder( \WP_REST_Request $request ) {
		$folder_id = (int) $request->get_param( 'folder_id' );
		$user_id   = get_current_user_id();

		if ( $user_id > 0 ) {
			update_user_meta( $user_id, '_hoatzinmedia_active_upload_folder', $folder_id );
		}

		return new \WP_REST_Response( array( 'success' => true, 'folder_id' => $folder_id ), 200 );
	}

	public function permissions_check() {
		return current_user_can( 'upload_files' );
	}

	/**
	 * Get all virtual folders with counts.
	 */
	public function get_folders() {
		$terms = get_terms(
			array(
				'taxonomy'   => Folders_Manager::TAXONOMY,
				'hide_empty' => false,
				'orderby'    => 'name',
				'order'      => 'ASC',
			)
		);

		if ( is_wp_error( $terms ) ) {
			return new \WP_REST_Response( array( 'error' => $terms->get_error_message() ), 500 );
		}

		// Calculate total count and uncategorized count
		$total_attachments = (int) wp_count_posts( 'attachment' )->inherit;

		// Calculate uncategorized attachments
		$uncategorized_query = new \WP_Query(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'posts_per_page' => 1,
				'tax_query'      => array(
					array(
						'taxonomy' => Folders_Manager::TAXONOMY,
						'operator' => 'NOT EXISTS',
					),
				),
			)
		);
		$uncategorized_count = $uncategorized_query->found_posts;

		$folder_list = array();
		foreach ( $terms as $term ) {
			$folder_list[] = array(
				'id'        => (int) $term->term_id,
				'name'      => $term->name,
				'slug'      => $term->slug,
				'parent'    => (int) $term->parent,
				'count'     => (int) $term->count,
			);
		}

		return new \WP_REST_Response(
			array(
				'folders'             => $folder_list,
				'total_attachments'   => $total_attachments,
				'uncategorized_count' => $uncategorized_count,
			),
			200
		);
	}

	/**
	 * Create a new folder.
	 */
	public function create_folder( \WP_REST_Request $request ) {
		$name      = sanitize_text_field( $request->get_param( 'name' ) );
		$parent_id = (int) $request->get_param( 'parent_id' );

		if ( empty( $name ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'Folder name is required.', 'hoatzinmedia-library-cleaner' ) ), 400 );
		}

		$args = array(
			'parent' => $parent_id > 0 ? $parent_id : 0,
		);

		$result = wp_insert_term( $name, Folders_Manager::TAXONOMY, $args );

		if ( is_wp_error( $result ) ) {
			return new \WP_REST_Response( array( 'message' => $result->get_error_message() ), 400 );
		}

		$term = get_term( $result['term_id'], Folders_Manager::TAXONOMY );

		return new \WP_REST_Response(
			array(
				'folder' => array(
					'id'     => (int) $term->term_id,
					'name'   => $term->name,
					'slug'   => $term->slug,
					'parent' => (int) $term->parent,
					'count'  => (int) $term->count,
				),
			),
			201
		);
	}

	/**
	 * Update an existing folder.
	 */
	public function update_folder( \WP_REST_Request $request ) {
		$id        = (int) $request->get_param( 'id' );
		$name      = sanitize_text_field( $request->get_param( 'name' ) );
		$parent_id = $request->get_param( 'parent_id' );

		if ( $id <= 0 ) {
			return new \WP_REST_Response( array( 'message' => __( 'Invalid folder ID.', 'hoatzinmedia-library-cleaner' ) ), 400 );
		}

		$args = array();
		if ( ! empty( $name ) ) {
			$args['name'] = $name;
		}
		if ( null !== $parent_id ) {
			$args['parent'] = (int) $parent_id;
		}

		$result = wp_update_term( $id, Folders_Manager::TAXONOMY, $args );

		if ( is_wp_error( $result ) ) {
			return new \WP_REST_Response( array( 'message' => $result->get_error_message() ), 400 );
		}

		$term = get_term( $id, Folders_Manager::TAXONOMY );

		return new \WP_REST_Response(
			array(
				'folder' => array(
					'id'     => (int) $term->term_id,
					'name'   => $term->name,
					'slug'   => $term->slug,
					'parent' => (int) $term->parent,
					'count'  => (int) $term->count,
				),
			),
			200
		);
	}

	/**
	 * Delete a folder.
	 */
	public function delete_folder( \WP_REST_Request $request ) {
		$id = (int) $request->get_param( 'id' );

		if ( $id <= 0 ) {
			return new \WP_REST_Response( array( 'message' => __( 'Invalid folder ID.', 'hoatzinmedia-library-cleaner' ) ), 400 );
		}

		$result = wp_delete_term( $id, Folders_Manager::TAXONOMY );

		if ( is_wp_error( $result ) || ! $result ) {
			return new \WP_REST_Response( array( 'message' => __( 'Failed to delete folder.', 'hoatzinmedia-library-cleaner' ) ), 400 );
		}

		return new \WP_REST_Response( array( 'success' => true, 'deleted_id' => $id ), 200 );
	}

	/**
	 * Assign attachments to a folder (or remove from folder if folder_id is 0 or -1).
	 */
	public function assign_attachments( \WP_REST_Request $request ) {
		$attachment_ids = $request->get_param( 'attachment_ids' );
		$folder_id      = (int) $request->get_param( 'folder_id' );

		if ( ! is_array( $attachment_ids ) || empty( $attachment_ids ) ) {
			return new \WP_REST_Response( array( 'message' => __( 'No attachment IDs provided.', 'hoatzinmedia-library-cleaner' ) ), 400 );
		}

		$assigned_count = 0;
		foreach ( $attachment_ids as $attachment_id ) {
			$attachment_id = (int) $attachment_id;
			if ( $attachment_id <= 0 ) {
				continue;
			}

			if ( $folder_id <= 0 ) {
				// Remove folder assignment (Uncategorize)
				wp_set_object_terms( $attachment_id, array(), Folders_Manager::TAXONOMY );
			} else {
				// Assign to specified folder ID
				wp_set_object_terms( $attachment_id, array( $folder_id ), Folders_Manager::TAXONOMY );
			}
			$assigned_count++;
		}

		return new \WP_REST_Response(
			array(
				'success'        => true,
				'assigned_count' => $assigned_count,
				'folder_id'      => $folder_id,
			),
			200
		);
	}
}
