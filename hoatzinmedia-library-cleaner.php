<?php
/**
 * Plugin Name: HoatzinMedia — Library Cleaner & Storage Optimizer
 * Description: Smart media library cleaner and storage optimizer with scan history and trash management.
 * Version: 1.0.0
 * Author: Hoatzinlabs
 * Author URI: https://hoatzinlabs.com
 * Text Domain: hoatzinmedia-library-cleaner
 * Domain Path: /languages
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Tags: media cleaner, storage optimizer, unused files, duplicate finder, large files
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'HOATZINMEDIA_PLUGIN_FILE', __FILE__ );
define( 'HOATZINMEDIA_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'HOATZINMEDIA_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'HOATZINMEDIA_VERSION', '1.0.0' );

require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/class-plugin.php';
require_once HOATZINMEDIA_PLUGIN_DIR . 'includes/Database/class-installer.php';

register_activation_hook(
	HOATZINMEDIA_PLUGIN_FILE,
	array( 'HoatzinMedia\\Database\\Installer', 'activate' )
);

register_uninstall_hook(
	HOATZINMEDIA_PLUGIN_FILE,
	array( 'HoatzinMedia\\Database\\Installer', 'uninstall' )
);

HoatzinMedia\Plugin::get_instance();