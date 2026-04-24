=== HoatzinMedia — Library Cleaner & Storage Optimizer ===
Contributors: wpfeaturekits22
Tags: media, cleanup, optimization, performance, storage
Requires at least: 5.8
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Smart media cleaner: detect unused files, duplicates and large attachments; optimize storage safely.

== Description ==

HoatzinMedia scans your WordPress media library for unused files, large attachments and storage pressure signals. It provides a dashboard overview, safe trash mechanism and batch-based scanning that is friendly to large sites.

Core features:

1. Dashboard with media health score and live metrics
2. Unused media scanner with batch processing and locking
3. Safe trash table for reversible deletions
4. Large file explorer by size threshold
5. Translation-ready UI and REST responses

== Installation ==

1. Upload the hoatzinmedia-library-cleaner folder to the /wp-content/plugins/ directory.
2. Activate HoatzinMedia through the Plugins menu in WordPress.
3. Open the HoatzinMedia page under the main admin menu.

== Usage ==

1. Review the media health score and high-level stats on the dashboard.
2. Run an unused media scan from the Unused media scanner panel.
3. Inspect results and move files to the HoatzinMedia trash.
4. Use the large file explorer to identify heavy attachments by size.

== Frequently Asked Questions ==

= Does HoatzinMedia delete files immediately? =

No. By default, deletions use a custom HoatzinMedia trash table so items can be restored before permanent removal.

= Is it safe on large libraries? =

Yes. Scans run in batches with locking to avoid concurrent runs and to keep requests small.

== Screenshots ==

1. HoatzinMedia dashboard with health score and metrics
2. Unused media scanner with progress and badges
3. Large file explorer with filters and table view

== Changelog ==

= 1.0.0 =
Initial release.

