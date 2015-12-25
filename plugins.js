// Support for certain plugins.

// Hidden plugin
if (window.installPluginHiddenJS) {
	jQuery(window).on('fastwiki:afterSwitch', function(evt, viewMode, isSectionEdit, prevViewMode) {
		// First uninstall.
		jQuery(".hiddenActive, .hiddenSwitch").each(function(){
			jQuery(this).off('click');
		});

		if (viewMode == "show")
			installPluginHiddenJS();
	});
}
