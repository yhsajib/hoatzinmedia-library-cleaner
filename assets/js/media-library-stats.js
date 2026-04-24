jQuery(document).ready(function($) {
    function shouldShowStats() {
        try {
            var mode = null;
            if (typeof window !== 'undefined' && window.location && window.location.search) {
                var params = new URLSearchParams(window.location.search);
                mode = params.get('mode');
            }
            if (mode && mode !== 'grid') {
                return false;
            }
        } catch (_e) {}

        var hasListTable = $('.wp-list-table.media').length > 0;
        var hasGridUi = $('#wp-media-grid').length > 0 || $('.media-frame').length > 0 || $('body').hasClass('media-grid');

        if (hasListTable && !hasGridUi) {
            return false;
        }

        return true;
    }

    // Function to render or move the stats
    function renderMediaStats() {
        if (!shouldShowStats()) {
            return;
        }
        var $stats = $('#hm-media-library-stats');
        var stats = window.hoatzinMediaStats || {};
        var statsHtml = '';

        if ($stats.length === 0) {
            // Build HTML if not exists
            statsHtml = '<div id="hm-media-library-stats">';
            
            if (stats.total) {
                statsHtml += '<span class="hm-stat-item"><strong>' + stats.total + '</strong>&nbsp;Total</span>';
            }
            if (stats.image) {
                statsHtml += '<span class="hm-stat-item" title="Images"><span class="dashicons dashicons-format-image"></span>' + stats.image + '</span>';
            }
            if (stats.video) {
                statsHtml += '<span class="hm-stat-item" title="Videos"><span class="dashicons dashicons-video-alt3"></span>' + stats.video + '</span>';
            }
            if (stats.audio) {
                statsHtml += '<span class="hm-stat-item" title="Audio"><span class="dashicons dashicons-format-audio"></span>' + stats.audio + '</span>';
            }
            if (stats.document) {
                statsHtml += '<span class="hm-stat-item" title="Documents"><span class="dashicons dashicons-media-document"></span>' + stats.document + '</span>';
            }
            
            statsHtml += '</div>';
            $stats = $(statsHtml);
        }

        // Strategy 1: Look for Elementor AI container
        var $elementorContainer = $('#e-image-ai-media-library');
        if ($elementorContainer.length > 0) {
            // Check if already in correct place
            if ($stats.prev().attr('id') !== 'e-image-ai-media-library') {
                $elementorContainer.after($stats);
            }
            return;
        }

        // Strategy 2: Look for "Add New" button (.page-title-action)
        // Only insert if not already in DOM
        if ($('#hm-media-library-stats').length === 0) {
            var $addNewBtn = $('.page-title-action');
            if ($addNewBtn.length > 0) {
                $addNewBtn.after($stats);
                return;
            }
            
            // Strategy 3: Fallback to inside h1
            var $h1 = $('.wp-heading-inline');
            if ($h1.length > 0) {
                $h1.after($stats);
            }
        }
    }

    // Attempt to render immediately
    renderMediaStats();

    // Also observe DOM changes in case Elementor injects later
    var observer = new MutationObserver(function(mutations) {
        var $elementorContainer = $('#e-image-ai-media-library');
        var $stats = $('#hm-media-library-stats');
        
        // If Elementor container appears and stats are not after it
        if ($elementorContainer.length > 0) {
             if ($stats.length === 0 || $stats.prev().attr('id') !== 'e-image-ai-media-library') {
                 renderMediaStats();
             }
        } else if ($stats.length === 0) {
             // If stats not present at all, try to render (fallback)
             renderMediaStats();
        }
    });

    var wpBody = document.getElementById('wpbody-content');
    if (wpBody) {
        observer.observe(wpBody, { childList: true, subtree: true });
    }
});
