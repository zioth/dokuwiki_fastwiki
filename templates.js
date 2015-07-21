/**
* If the template doesn't natively support this plugin, go through some hard-coded cases to create reasonable coverage.
*/
if (!window.tpl_fastwiki_support) {
	(function($) {
		var m_showRow, m_editRow;

		var m_utils = {
			makeShowLink: function(url) {
				url = url.replace(/\?do=.*$/, '');
				return '<a href="' + url + '" class="action show" accesskey="v" rel="nofollow" title="' + JSINFO.fastwiki.text_btn_show + ' [V]"><span>' + JSINFO.fastwiki.text_btn_show + '</span></a>';
			},

			// Add a "show" link for templates which have a <ul> list of action links.
			makeShowRowLI: function(pagetools, mode) {
				var showLink = $("a[href $= 'do=']", pagetools);
				if (showLink.length > 0)
					m_showRow = $(showLink.parents('li')[0]);
				else {
					var link = $("a[href *= 'do=']", pagetools)[0];
					if (link) {
						m_showRow = $('<li>' + m_utils.makeShowLink(link.href) + '</li>').toggle(mode != 'show');
						pagetools.prepend(m_showRow);
					}
				}
			},

			// Update button bars
			fixButtons: function(showParent, allButtons, mode) {
				var showBtn = $('.button.btn_show', showParent);
				if (showBtn.length == 0) {
					var url = $('form.button', allButtons)[0].action;
					showBtnHtml = '<form class="button btn_show" method="get" action="' + url + '"><div class="no"><input type="hidden" name="do" value=""><input type="submit" value="' + JSINFO.fastwiki.text_btn_show + '" class="button" accesskey="v" title="' + JSINFO.fastwiki.text_btn_show + ' [V]"></div></form>';
					showParent.each(function(idx, elt) {
						var newBtn = $(showBtnHtml);
						showBtn = showBtn.add(newBtn);
						$(elt).prepend(newBtn.toggle(mode!='show'));
					});
				}
				var editBtn = $('.button.btn_edit', allButtons);
				if (editBtn.length > 0)
					m_editRow = m_editRow ? m_editRow.add(editBtn) : editBtn;
				m_showRow = m_showRow ? m_showRow.add(showBtn) : showBtn;
			}
		};

		// dokuwiki, starter, greensteel
		if ($('#dokuwiki__pagetools').length > 0) {
			// Only show is supported as a start mode, because otherwise, we'd have to add pagetools for each action and check for actions being allowed.
			window.tpl_fastwiki_startmode_support = {show:1};
			$(window).on({
				'fastwiki:init': function(e, mode) {
					m_utils.makeShowRowLI($("#dokuwiki__pagetools ul"), mode);
				},
				'fastwiki:afterSwitch': function(e, mode, isSectionEdit, prevMode) {
					// The dokuwiki template hides the sidebar in non-show modes
					$("#dokuwiki__top").toggleClass("showSidebar hasSidebar", mode=='show');
					$("#dokuwiki__aside").css('display', mode=='show' ? '' : 'none');
					m_showRow.toggle(mode != 'show');
				}
			});
		}
		// arctic
		else if (JSINFO.fastwiki.templatename == 'arctic') {
			window.tpl_fastwiki_startmode_support = {show:1};
			$(window).on({
				'fastwiki:init': function(e, mode) {
					var buttonBars = $('#bar__bottom, #bar__top');
					if ($('.button', buttonBars).length > 0)
						m_utils.fixButtons($('.bar-left'), buttonBars, mode);
					else {
						var pagetools = $('.bar-left');
						m_editRow = $("a[href *= 'do=edit']", pagetools);
						m_showRow = $("a[href $= 'do=']", pagetools[0]);
						if (m_showRow.length == 0) {
							var url = $("a[href *= 'do=']")[0].href;
							m_showRow = $();
							pagetools.each(function(idx, elt) {
								var show = $(m_utils.makeShowLink(url)).toggle(mode != 'show');
								m_showRow = m_showRow.add(show);
								$(elt).prepend(show);
							});
						}
					}
				},
				'fastwiki:afterSwitch': function(e, mode, isSectionEdit, prevMode) {
					m_showRow.toggle(mode != 'show');
					m_editRow.toggle(mode != 'edit' && mode != 'draft');
					$(".left_sidebar, .right_sidebar").css('display', mode=='show' ? '' : 'none');
				}
			});
		}
		// starterbootstrap
		else if ($('ul.nav.navbar-nav').length > 0) {
			window.tpl_fastwiki_startmode_support = {show:1};
			$(window).on({
				'fastwiki:init': function(e, mode) {
					var pagetools = $("ul.nav.navbar-nav");
					m_utils.makeShowRowLI(pagetools, mode);
					m_editRow = $($('li', pagetools)[0]);
				},
				'fastwiki:afterSwitch': function(e, mode, isSectionEdit, prevMode) {
					m_showRow.toggle(mode != 'show');
					m_editRow.toggle(mode != 'edit' && mode != 'draft');
				},
				'fastwiki:updateToc': function(e, tocObj) {
					$('#dw_toc').remove();

					if (tocObj.length > 0)
						$('.content_initial').prepend($('<div id="dw_toc"></div>').append(tocObj.html()));
					tocObj.remove();
				}
			});
		}
		// scanlines
		else if ($('.stylehead .bar_top .bar_top_content').length > 0) {
			$(window).on({
				'fastwiki:init': function(e, mode) {
					// If the toolbox is enabled.
					var toolbox = $(".sidebar_content .li_toolbox ul");
					m_utils.makeShowRowLI(toolbox, mode);
					m_editRow = $('.action.edit', toolbox).parent();

					// Button bar
					m_utils.fixButtons($('.bar_bottom_content .bar-right'), $('.bar_bottom_content .bar-right'), mode);
				},
				'fastwiki:afterSwitch': function(e, mode, isSectionEdit, prevMode) {
					$(".right_sidebar, .left_sidebar").css('display', mode=='edit' ? 'none' : '');
					m_showRow.toggle(mode != 'show');
					m_editRow.toggle(mode != 'edit' && mode != 'draft');

					// In this template, two levels of DOM structure are missing in edit mode. Clear out their styles.
					if (mode == 'edit' || mode == 'draft') {
						$('.page_720').css({border: 0, textAlign: 'inherit'});
						$('.left_page, .right_page').css({float:'none', width:'auto'});
					}
					else {
						$('.page_720').css({border: '', textAlign: ''});
						$('.left_page, .right_page').css({float:'', width:''});
					}
				}
			});
		}
	})(jQuery);
}
