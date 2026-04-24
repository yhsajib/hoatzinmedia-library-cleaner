<?php
namespace HoatzinMedia\Database;

if ( !defined( 'ABSPATH' ) ) {
    exit;
}
class Installer {

    public static function activate() {
        self::create_tables();
    }

    public static function uninstall() {
        self::drop_tables();
    }

    private static function get_tables() {
        global $wpdb;

        $prefix = $wpdb->prefix;

        return [
            'scans' => $prefix . 'hoatzinmedia_scans',
        ];
    }

    private static function create_tables() {
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset_collate = $wpdb->get_charset_collate();
        $tables = self::get_tables();

        $scans_sql = 'CREATE TABLE ' . $tables['scans'] . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			media_id bigint(20) unsigned NOT NULL,
			status varchar(50) NOT NULL,
			meta longtext NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY media_id (media_id),
			KEY status (status)
		) $charset_collate;";

        dbDelta( $scans_sql );
    }

    private static function drop_tables() {
        global $wpdb;

        $tables = self::get_tables();
        $table = esc_sql( $tables['scans'] );
        $wpdb->query( 'DROP TABLE IF EXISTS `' . $table . '`' ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange
    }
}