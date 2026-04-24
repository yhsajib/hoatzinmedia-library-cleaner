jQuery(document).ready(function($) {
    if (typeof wp === 'undefined' || !wp.media || !wp.media.view) {
        return;
    }

    var Attachment = wp.media.view.Attachment;
    var originalRender = Attachment.prototype.render;

    Attachment.prototype.render = function() {
        var result = originalRender.apply(this, arguments);
        
        // Add extension label
        var filename = this.model.get('filename');
        if (filename) {
            var ext = filename.split('.').pop();
            if (ext) {
                // Check if label already exists to avoid duplication
                if (this.$el.find('.hm-media-ext-label').length === 0) {
                    this.$el.append('<span class="hm-media-ext-label">' + ext + '</span>');
                }
            }
        }
        
        return result;
    };
});
