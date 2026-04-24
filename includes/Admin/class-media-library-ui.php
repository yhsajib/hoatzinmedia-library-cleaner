<?php

namespace HoatzinMedia\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Media_Library_UI {

	/**
	 * @var Media_Library_UI
	 */
	private static $instance;

	private function __construct() {
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
		add_filter( 'manage_upload_columns', array( $this, 'add_usage_column' ) );
		add_filter( 'manage_media_columns', array( $this, 'add_usage_column' ) );
		add_action( 'manage_media_custom_column', array( $this, 'render_usage_column' ), 10, 2 );
	}

	/**
	 * Get singleton instance.
	 *
	 * @return Media_Library_UI
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	public function enqueue_scripts( $hook ) {
		// Only run on media library page (upload.php)
		if ( 'upload.php' !== $hook ) {
			return;
		}

		$defaults = array(
			'enableImageExtLabel'      => false,
			'enableMediaUsageButton'   => true,
		);

		$settings = get_option( 'hoatzinmedia_settings', $defaults );
		if ( ! is_array( $settings ) ) {
			$settings = $defaults;
		}
		$settings = wp_parse_args( $settings, $defaults );

		// Feature: Image Extension Labels
		if ( ! empty( $settings['enableImageExtLabel'] ) ) {
			wp_enqueue_script(
				'hoatzinmedia-media-grid-labels',
				HOATZINMEDIA_PLUGIN_URL . 'assets/js/media-grid-labels.js',
				array( 'jquery', 'media-views' ),
				HOATZINMEDIA_VERSION,
				true
			);

			// Add some basic styles for the label
			$css = "
				.hm-media-ext-label {
					position: absolute;
					top: 5px;
					left: 5px;
					background: rgba(0, 0, 0, 0.7);
					color: #fff;
					padding: 2px 5px;
					font-size: 10px;
					border-radius: 3px;
					z-index: 10;
					pointer-events: none;
					text-transform: uppercase;
					font-weight: 600;
				}
			";
			wp_add_inline_style( 'media-views', $css );
		}

		// Feature: Media Library Stats (Always enabled for now)
		$stats_js_version = HOATZINMEDIA_VERSION;
		$stats_js_path    = HOATZINMEDIA_PLUGIN_DIR . 'assets/js/media-library-stats.js';
		if ( file_exists( $stats_js_path ) ) {
			$stats_js_version = (string) filemtime( $stats_js_path );
		}
		wp_enqueue_script(
			'hoatzinmedia-media-library-stats',
			HOATZINMEDIA_PLUGIN_URL . 'assets/js/media-library-stats.js',
			array( 'jquery', 'media-views' ),
			$stats_js_version,
			true
		);

		wp_enqueue_script( 'wp-api-fetch' );

		// Localize stats data
		wp_localize_script(
			'hoatzinmedia-media-library-stats',
			'hoatzinMediaStats',
			\HoatzinMedia\Service\Media_Stats::get_counts()
		);

		$enable_usage = ! empty( $settings['enableMediaUsageButton'] );

		if ( $enable_usage ) {
			wp_localize_script(
				'hoatzinmedia-media-library-stats',
				'hoatzinMediaUsage',
				array(
					'nonce' => wp_create_nonce( 'wp_rest' ),
				)
			);

			$usage_js = <<<'JS'
(function($){
	if(!window.wp||!wp.apiFetch){return;}
	var nonce=(window.hoatzinMediaUsage&&window.hoatzinMediaUsage.nonce)?window.hoatzinMediaUsage.nonce:'';
	if(nonce&&wp.apiFetch.createNonceMiddleware){wp.apiFetch.use(wp.apiFetch.createNonceMiddleware(nonce));}
	var $modalBackdrop=null;
	var $modal=null;
	var $modalTitle=null;
	var $modalBody=null;
	function cleanupAttachmentDetails(){
		try{
			$('.media-modal .hm-ml-usage-wrap, .media-frame .hm-ml-usage-wrap').remove();
			$('.media-modal .hm-ml-usage-details, .media-frame .hm-ml-usage-details').remove();
			$('.media-modal .hm-ml-usage-head, .media-frame .hm-ml-usage-head').remove();
		}catch(_e){}
	}
	function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];});}
	function renderUsage($panel, usages){
		if(!usages||!usages.length){$panel.html('<div class="hm-ml-usage-muted">No usage detected.</div>');return;}
		var html='<div class="hm-ml-usage-list">';
		usages.forEach(function(u){
			var post=u&&u.post?u.post:null;
			var contexts=u&&u.contexts?u.contexts:[];
			var ctxText=contexts&&contexts.length?contexts.join(', '):'';
			if(post&&post.id){
				var href=post.edit_link||post.view_link||'#';
				html+='<div class="hm-ml-usage-item"><a class="hm-ml-usage-link" target="_blank" rel="noopener noreferrer" href="'+esc(href)+'">'+esc(post.title||'')+(post.post_type?(' ('+esc(post.post_type)+')'):'')+'</a>'+(ctxText?('<span class="hm-ml-usage-muted"> · '+esc(ctxText)+'</span>'):'')+'</div>';
			}else{
				var label=u&&u.label?u.label:'';
				html+='<div class="hm-ml-usage-item"><span class="hm-ml-usage-muted">'+esc(label)+'</span></div>';
			}
		});
		html+='</div>';
		$panel.html(html);
	}
	function loadUsage(id){
		return wp.apiFetch({path:'hoatzinmedia/v1/attachment-usage?attachment_id='+id+'&limit=20',method:'GET'});
	}
	function ensureModal(){
		if($modalBackdrop&&$modal){return;}
		$modalBackdrop=$('<div class="hm-ml-usage-modal-backdrop" style="display:none"></div>');
		$modal=$('<div class="hm-ml-usage-modal" style="display:none"></div>');
		var $header=$('<div class="hm-ml-usage-modal-header"></div>');
		$modalTitle=$('<div class="hm-ml-usage-modal-title">Usage</div>');
		var $close=$('<button type="button" class="hm-ml-usage-modal-close" aria-label="Close">×</button>');
		$modalBody=$('<div class="hm-ml-usage-modal-body"></div>');
		$header.append($modalTitle).append($close);
		$modal.append($header).append($modalBody);
		$('body').append($modalBackdrop).append($modal);
		function close(){
			$modalBackdrop.hide();
			$modal.hide();
		}
		$close.on('click', function(e){e.preventDefault();close();});
		$modalBackdrop.on('click', function(){close();});
		$(document).on('keydown', function(e){
			if(e&&e.key==='Escape'&&$modal&&$modal.is(':visible')){close();}
		});
	}
	function openUsageModal(id){
		ensureModal();
		var safeId=parseInt(id,10)||0;
		if(!safeId){return;}
		$modalTitle.text('Usage (ID ' + safeId + ')');
		$modalBody.html('<div class="hm-ml-usage-muted">Loading…</div>');
		$modalBackdrop.show();
		$modal.show();
		loadUsage(safeId)
			.then(function(res){
				renderUsage($modalBody, res&&res.usages?res.usages:[]);
			})
			.catch(function(){
				$modalBody.html('<div class="hm-ml-usage-muted">Failed to load usage.</div>');
			});
	}
	$(document).on('click','.hm-ml-usage-toggle',function(e){
		e.preventDefault();
		var $btn=$(this);
		var id=parseInt($btn.data('attachmentId')||$btn.data('attachment-id'),10)||0;
		if(!id){return;}
		var $wrap=$btn.closest('.hm-ml-usage-wrap');
		var $panel=$wrap.find('.hm-ml-usage-panel');
		if(!$panel.length){return;}
		var isOpen=$panel.hasClass('is-open');
		if(isOpen){$panel.removeClass('is-open').hide();$btn.text('Show usage');return;}
		$panel.addClass('is-open').show();
		$btn.text('Hide usage');
		$panel.html('<div class="hm-ml-usage-muted">Loading…</div>');
		loadUsage(id).then(function(res){renderUsage($panel,res&&res.usages?res.usages:[]);}).catch(function(){$panel.html('<div class="hm-ml-usage-muted">Failed to load usage.</div>');});
	});
	function patchMediaGridButtons(){
		if(!wp.media||!wp.media.view||!wp.media.view.Attachment){return;}
		var proto=wp.media.view.Attachment.prototype;
		if(proto.__hmUsageGridPatched){return;}
		proto.__hmUsageGridPatched=true;
		var orig=proto.render;
		proto.render=function(){
			orig.apply(this,arguments);
			try{
				var id=this.model&&this.model.get?this.model.get('id'):0;
				if(!id){return this;}
				if(this.$el&&this.$el.find&&this.$el.find('.hm-ml-usage-grid-btn').length){return this;}
				var $btn=$('<button type="button" class="hm-ml-usage-grid-btn">Usage</button>');
				$btn.on('click', function(e){
					e.preventDefault();
					e.stopPropagation();
					openUsageModal(id);
				});
				if(this.$el&&this.$el.append){this.$el.append($btn);}
			}catch(_e){}
			return this;
		};
	}
	$(function(){
		cleanupAttachmentDetails();
		try{
			var target=document.body;
			if(target&&window.MutationObserver){
				var obs=new MutationObserver(function(){cleanupAttachmentDetails();});
				obs.observe(target,{childList:true,subtree:true});
			}
		}catch(_e){}
		patchMediaGridButtons();
	});
})(jQuery);
JS;
			wp_add_inline_script( 'hoatzinmedia-media-library-stats', $usage_js, 'after' );
		}

		// Add styles for the stats bar
		$stats_css = "
			#wp-media-modal .hm-ml-usage-grid-btn {
				display: none;
			}
			#hm-media-library-stats {
				display: inline-flex;
				align-items: center;
				background: #fff;
				border: 1px solid #c3c4c7;
				border-radius: 4px;
				padding: 4px 10px;
				margin-left: 10px;
				box-shadow: 0 1px 1px rgba(0,0,0,0.04);
				vertical-align: middle;
				height: 28px;
			}
			.hm-stat-item {
				margin-right: 15px;
				font-size: 13px;
				font-weight: 500;
				color: #3c434a;
				display: inline-flex;
				align-items: center;
				white-space: nowrap;
			}
			.hm-stat-item:last-child {
				margin-right: 0;
			}
			.hm-stat-item .dashicons {
				font-size: 16px;
				width: 18px;
				height: 18px;
				line-height: 1.1;
				margin-right: 4px;
				color: #2271b1;
			}
			.hm-stat-item strong {
				font-weight: 700;
				color: #1d2327;
			}
			/* Dark Mode Support (Basic) if any dark mode plugin is active */
			@media (prefers-color-scheme: dark) {
				/* This might need adjustment based on specific WP dark mode implementations */
			}
			.hm-ml-usage-wrap {
				margin-top: 6px;
			}
			.hm-ml-usage-details {
				display: none !important;
			}
			.hm-ml-usage-panel {
				margin-top: 6px;
				padding: 8px 10px;
				background: #f6f7f7;
				border: 1px solid #dcdcde;
				border-radius: 4px;
			}
			.hm-ml-usage-list {
				display: flex;
				flex-direction: column;
				gap: 6px;
			}
			.hm-ml-usage-item {
				font-size: 12px;
				line-height: 1.3;
			}
			.hm-ml-usage-link {
				color: #2271b1;
				text-decoration: none;
			}
			.hm-ml-usage-link:hover {
				text-decoration: underline;
			}
			.hm-ml-usage-muted {
				color: #646970;
				font-size: 12px;
			}
			.hm-ml-usage-grid-btn {
				position: absolute;
				top: 5px;
				right: 5px;
				background: rgba(0, 0, 0, 0.7);
				color: #fff;
				padding: 2px 5px;
				font-size: 10px;
				border-radius: 3px;
				z-index: 50;				
				text-transform: uppercase;
				font-weight: 600;
				cursor: pointer;
			}
			.hm-ml-usage-grid-btn:hover {
				background: #ffffff;
				color: #0f172a;
			}
			.hm-ml-usage-modal-backdrop {
				position: fixed;
				inset: 0;
				background: rgba(15, 23, 42, 0.55);
				z-index: 100000;
			}
			.hm-ml-usage-modal {
				position: fixed;
				top: 50%;
				left: 50%;
				transform: translate(-50%, -50%);
				width: 640px;
				max-width: calc(100vw - 40px);
				max-height: calc(100vh - 80px);
				overflow: auto;
				background: #ffffff;
				border-radius: 12px;
				box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
				z-index: 100001;
			}
			.hm-ml-usage-modal-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				padding: 12px 14px;
				border-bottom: 1px solid rgba(226, 232, 240, 0.8);
			}
			.hm-ml-usage-modal-title {
				font-size: 14px;
				font-weight: 600;
				color: #0f172a;
			}
			.hm-ml-usage-modal-close {
				width: 34px;
				height: 34px;
				border-radius: 10px;
				border: 1px solid rgba(226, 232, 240, 0.9);
				background: #fff;
				color: #0f172a;
				font-size: 20px;
				line-height: 30px;
				cursor: pointer;
			}
			.hm-ml-usage-modal-body {
				padding: 12px 14px;
			}
		";
		wp_add_inline_style( 'media-views', $stats_css );
	}

	public function add_usage_column( $columns ) {
		$settings = get_option( 'hoatzinmedia_settings', array() );
		$enable_usage = is_array( $settings ) && ! empty( $settings['enableMediaUsageButton'] );
		if ( ! $enable_usage ) {
			return $columns;
		}

		if ( ! is_array( $columns ) ) {
			$columns = array();
		}

		if ( isset( $columns['hm_usage'] ) ) {
			return $columns;
		}

		$next = array();
		foreach ( $columns as $key => $label ) {
			$next[ $key ] = $label;
			if ( 'title' === $key ) {
				$next['hm_usage'] = __( 'Usage', 'hoatzinmedia-library-cleaner' );
			}
		}

		if ( ! isset( $next['hm_usage'] ) ) {
			$next['hm_usage'] = __( 'Usage', 'hoatzinmedia-library-cleaner' );
		}

		return $next;
	}

	public function render_usage_column( $column_name, $post_id ) {
		if ( 'hm_usage' !== $column_name ) {
			return;
		}

		$settings = get_option( 'hoatzinmedia_settings', array() );
		$enable_usage = is_array( $settings ) && ! empty( $settings['enableMediaUsageButton'] );
		if ( ! $enable_usage ) {
			return;
		}

		$post_id = (int) $post_id;
		if ( $post_id <= 0 ) {
			return;
		}

		echo '<div class="hm-ml-usage-wrap">';
		echo '<button type="button" class="button-link hm-ml-usage-toggle" data-attachment-id="' . esc_attr( $post_id ) . '">Show usage</button>';
		echo '<div class="hm-ml-usage-panel" style="display:none"></div>';
		echo '</div>';
	}
}