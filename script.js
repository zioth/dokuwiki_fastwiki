/**
* The fastwiki plugin loads 'do' actions as AJAX requests when possible, to speed up the page. It also adds section editing.
*/
var plugin_fastwiki = (function($) {
	var m_viewMode, m_origViewMode, m_prevView; // show, edit, subscribe etc
	var m_isSecedit, m_wasSecedit;
	var m_hasDraft;
	var m_pageObjs = {}; // Edit objects
	var m_content;
	var m_initialId;
	var m_curBaseUrl = document.location.pathname;
	var m_debug = document.location.host == 'localhost';
	var m_cache = new CPageCache(JSINFO.fastwiki.preload_per_page, JSINFO.fastwiki.preload_batchsize, m_debug);
	var m_supportedActions = {'':1, edit:1, draft:1, history:1, recent:1, revisions:1, show:1, subscribe:1, backlink:1, index:1, profile:1, media:1, diff:1, save:1};
	var m_modeClassElt;
	var m_prevTitle = '__UNDEFINED__';

	/**
	* The CPageCache class allows you to store pages in memory.
	*
	* @param {int} maxSize - The maximum number of pages to store in memory.
	* @private
	* @class
	*/
	function CPageCache(maxSize, batchSize, debug) {
		var m_queue = [];
		var m_p1Queue = []; // Priority 1 queue. These can only be bumped by other p1 pages.
		var m_pages = {}, m_p1Ids = {};
		var m_maxSize = maxSize;
		var m_batchSize = batchSize;
		var m_maxP1Size = 10;

		if (debug) {
			window.cpagecache_pages = m_pages;
			window.cpagecache_queue = m_queue;
		}

		// @param {Boolean} p1 - Pages the user actually visited are stored longer than preloads.
		this.add = function(id, data, p1) {
			if (p1)
				_addPage(id, m_p1Queue, m_p1Ids, 1, m_maxP1Size);
			_addPage(id, m_queue, m_pages, data, m_maxSize, m_p1Queue);
		};
		this.remove = function(id) {
			if (id in m_pages) {
				m_queue.splice(m_queue.indexOf(id), 1);
				delete m_pages[id];

				var p1Idx = m_p1Queue.indexOf(id);
				if (p1Idx >= 0) {
					m_queue.splice(p1Idx, 1);
					delete m_p1Ids[id];
				}
			}
		};
		this.get = function(id) {
			if (id in m_pages) {
				// If it's accessed, it goes to the front.
				_pushToFront(id, m_queue);
				_pushToFront(id, m_p1Queue);
				return m_pages[id];
			}
			return null;
		};
		this.has = function(id) {
			return id in m_pages;
		};

		// Load initial cache, based on hrefs in an element
		this.load = function(elt) {
			var self = this;
			var ids = {};
			$('a', elt).each(function(idx, a) {
				var href = a.getAttribute('href'); // Use getAttribute because some browsers make href appear to be canonical.
				if (href && href.indexOf('://') < 0) {
					var numParams = href.split('=').length;
					if (href.indexOf('id=') >= 0)
						numParams--;
					if (numParams == 1) {
						var pageinfo = _getSwitchId(href);
						if (pageinfo && !m_cache.has(pageinfo.id))
							ids[pageinfo.id] = 1;
					}
				}
			});

			var idsA = [];
			for (var id in ids)
				idsA.push(id);

			if (idsA.length > m_maxSize) {
				// There are so many links that the chances of preloading the right one are basically zero.
				// TODO: Sort by vertical position and preload near the top of the page?
			}
			else if (idsA.length > 0) {
				if (idsA.length > m_maxSize)
					idsA.length = m_maxSize;

				// Split pages into at least 4 batches if possible.
				var batchSize = m_batchSize;
				if (idsA.length / batchSize < 4)
					batchSize = Math.ceil(idsA.length / 4);
				var requests = [];
				for (var x=0; x<Math.ceil(idsA.length / batchSize); x++) {
					var sublist = idsA.slice(x*batchSize, (x+1)*batchSize);
					var params = {partial: 1};
					params['do'] = 'fastwiki_preload';
					params.fastwiki_preload_pages = sublist.join(',');
					requests.push(params);
				}

				// Make the first 4 requests. Limit to 4 so as not to monopolize all the browser's sockets (there are 6 in modern browsers).
				for (var x=0; x<Math.min(4, requests.length); x++)
					doPost(requests.shift());

				function doPost(params) {
					m_debug && console.log("Preloading " + params.fastwiki_preload_pages);
					$.post(DOKU_BASE + 'doku.php', params, function(data) {
						var pages = data.split(JSINFO.fastwiki.preload_head);
						for (var p=0; p<pages.length; p++) {
							var line1End = pages[p].indexOf('\n');
							var id = pages[p].substr(0, line1End);
							pages[p] = pages[p].substr(line1End+1);
							m_debug && console.log("Loaded " + [id, pages[p].length]);
							// If a bug causes a whole page to be loaded, don't cache it.
							if (pages[p].indexOf('<body') >= 0)
								m_debug && console.log("ERROR: Body found!");
							else
								self.add(id, pages[p]);
						}

						if (requests.length > 0)
							doPost(requests.shift());
					}, 'text');
				}
			}
		};

		function _pushToFront(id, queue) {
			var idx = queue.indexOf(id);
			if (idx >= 0) {
				queue.splice(idx, 1);
				queue.push(id);
			}
		}
		function _addPage(id, queue, hash, data, maxSize, exclude) {
			if (id in hash)
				_pushToFront(id, queue);
			else if (data) {
				if (queue.length > maxSize) {
					if (exclude) {
						for (var x=0; x<queue.length; x++) {
							if (!exclude[queue[x]]) {
								delete hash[queue[x]];
								queue.splice(x, 1);
							}
						}
					}
					else
						delete hash[queue.shift()];
				}
				queue.push(id);
			}

			if (data)
				hash[id] = data;
		}
	}



	//////////
	// On load initialization
	//////////
	$(function() {
		// Leaving imgdetail with ajax is just too complicated to support.
		if (document.location.href.indexOf("detail.php") >= 0)
			m_viewMode = 'unsupported';
		else {
			var urlParams = _urlToObj(document.location.href);
			m_viewMode = urlParams['do'] || 'show';
			if (!m_supportedActions[m_viewMode])
				m_viewMode = 'unsupported';
			else if (window.tpl_fastwiki_startmode_support && !(m_viewMode in tpl_fastwiki_startmode_support))
				m_viewMode = 'unsupported';
		}
		m_origViewMode = m_viewMode;

		// plugin_fastwiki_marker was added by the action plugin. It makes it possible to find the main content area regardless of the template used.
		m_content = $('.plugin_fastwiki_marker').parent();
		m_content.addClass('content_initial');
		m_initialId = m_content.attr('id');

		m_modeClassElt = m_content.hasClass('dokuwiki') ? m_content : $(m_content.parents('.dokuwiki')[0] || document.body);
		m_prevTitle = _getWikiTitle() || '__UNDEFINED__';

		$(window).trigger('fastwiki:init', [m_viewMode]);

		if (JSINFO.fastwiki.fastpages)
			fixActionLinks(document.body);

		// The feature is not supported by IE 9 and below.
		if (JSINFO.fastwiki.fastshow && (m_origViewMode != 'show' || !window.history || !history.pushState))
			JSINFO.fastwiki.fastshow = false;

		if (JSINFO.fastwiki.fastshow) {
			window.addEventListener('popstate', function(e) {
				document.title = e.state.title;
				_switchBasePath(e.state.url, true);
			});
		}
	});


	/**
	* Find supported action links (do=???) and references to the current page, and turn them into AJAX requests.
	*
	* @param {DOMNode} elt - Do it inside this element.
	*/
	function fixActionLinks(elt) {
		if (m_origViewMode == 'unsupported')
			return;

		// Unsupported actions, and reason for lack of support:
		// login, register and resendpwd: Templates, plugins or future versions of dokuwiki might make them https.
		// admin: Admin can change things outside the main content area.
		// conflict, denied and locked: I don't know what they do.
		var formActions = {search: 1};
		var supportedFields = {'do':1, rev:1, id:1};

		// TODO: Support search: Hook search box, not just href. Note that supporting search changes doku behavior -- search results now have namespaces and origin pages.
		//		Because of this, search will have to be a separate config setting.
		// TODO: Profile needs button hooks.

		// Intercept all action (do=) urls, switching them to AJAX.
		$('a[href *= "?do="]', elt).click(function(e) {
			var params = _urlToObj(this.href);
			if (!params['do'])
				params['do'] = 'show';

			if (params['do'] in m_supportedActions) {
				e.preventDefault();
				load(params['do'], null, params);
			}
		});

		$('input[type="submit"], input[type="button"], button', elt).click(function(e) {
			var form = $(this).parents('form');
			if (form.length > 0 && form[0]['do'] && form[0]['do'].value in m_supportedActions) {
				// For now, only allow very simple forms
				var supported = true;
				$('input[type != "submit"]', form).each(function(idx, elt) {
					if (elt.type != 'button' && (elt.type != 'hidden' || !(elt.name in supportedFields)))
						supported = false;
				});

				if (supported) {
					e.preventDefault();
					var params = _formToObj(form[0]);
					if (!params['do'])
						params['do'] = 'show';
					load(params['do'], null, params);
				}
			}
		});

		// Only fix self-referrential links if we started out in show mode.
		if (m_origViewMode == 'show' && window.JSINFO) {
			var pathId = JSINFO.id.replace(/:/g, '/');
			// Handle all anchors instead of using CSS selectors to narrow it down, since the current id can change.
			$('a', elt).click(function(e) {
				// TODO Document: Doesn't work with cannonical url feature.
				var href = this.getAttribute('href'); // Use getAttribute because some browsers make href appear to be cannonical.
				if (href && href.indexOf('://') < 0) {
					if (href.match(_getSelfRefRegex())) {
						load('show');
						e.preventDefault();
					}
					else if (JSINFO.fastwiki.fastshow) {
						var numParams = href.split('=').length;
						if (href.indexOf('id=') >= 0)
							numParams--;
						if (numParams == 1) {
							//TODO: What about pages that aren't in the wiki at all? Forums etc. Use a config field?
							if (_switchBasePath(href))
								e.preventDefault();
						}
					}
				}
			});
			// Old selector:
			// 'a[href $= "doku.php?id=' + JSINFO.id + '"], a[href $= "doku.php/' + pathId + '"], a[href = "/' + pathId + '"]'
		}

		// Inline section edit
		if (JSINFO.fastwiki.secedit) {
			$('.btn_secedit input[type=submit]', elt).click(function(e) {
				e.preventDefault();
				var form = $(this).parents('form');
				load('edit', form, _formToObj(form));
			});
		}

		if (JSINFO.fastwiki.preload)
			m_cache.load(elt);
	}


	/**
	* Preview a page edit without reloading the page.
	*
	* @private
	* @param {Form=} sectionForm - If a section is being edited instead of the whole document, this is the form in that section.
	*/
	function _preview(sectionForm) {
		var body = $(document.body);
		var params = _formToObj($('#dw__editform'));
		params['do'] = 'preview';
		_sendPartial(params, $('.dokuwiki .editBox'), function(data) {
			var preview = $('<div id="preview_container">' + data + '</div>');

			// In case anything changed, migrate values over to the existing form.
			var pvEditor = preview.find('#dw__editform');
			var editor = $('#dw__editform')[0];
			pvEditor.find('input[type=hidden]').each(function(idx, elt) {
				editor[elt.name].value = elt.value;
			});

			// Strip out the editor. We already have that.
			preview.find('#scroll__here').prevAll().remove();

			var oldpreview = $('#preview_container');
			if (oldpreview.length > 0)
				oldpreview.replaceWith(preview);
			else
				$('.content_partial').append(preview);

			setTimeout(function() {
				$('html,body').animate({scrollTop: $('#scroll__here').offset().top+'px'}, 300);
			}, 1);
		}, 'text');
	}


	/**
	* Get an editable page section.
	* Algorithm taken from dw_page.sectionHighlight().
	*
	* @private
	* @param {Form=} sectionForm - The form representing the editable section.
	*/
	function _getSection(sectionForm) {
		var pieces = $();
		var target = sectionForm.parent();
		var nr = target.attr('class').match(/(\s+|^)editbutton_(\d+)(\s+|$)/)[2];

		// Walk the dom tree in reverse to find the sibling which is or contains the section edit marker
		while (target.length > 0 && !(target.hasClass('sectionedit' + nr) || target.find('.sectionedit' + nr).length)) {
			target = target.prev();

			// If it's already highlighted, get all children.
			if (target.hasClass('section_highlight'))
				pieces = pieces.add(target.children());
			pieces = pieces.add(target);
		}
		return pieces;
	}


	/**
	* Switch focus to the editor.
	*/
	function _focusEdit() {
		var $edit_text = $('#wiki__text');
		if ($edit_text.length > 0 && !$edit_text.attr('readOnly')) {
			// set focus and place cursor at the start
			var sel = DWgetSelection($edit_text[0]);
			sel.start = 0;
			sel.end = 0;
			DWsetSelection(sel);
			$edit_text.focus();
		}
	}


	/**
	* Initialize a page edit. This must be called every time the editor is loaded.
	* Most of this function was derived from core DokuWiki scripts, because Doku doesn't have init functions -- it does
	* all initialization in global jQuery DOMContentReady scope.
	*
	* @private
	*/
	function _initEdit() {
		dw_editor.init();
		dw_locktimer.init(JSINFO.fastwiki.locktime, JSINFO.fastwiki.usedraft);

		// From edit.js
		var $editform = $('#dw__editform');
		if ($editform.length == 0)
			return;

		var $edit_text = $('#wiki__text');

		$editform.on("change keydown", function(e) {
			window.textChanged = true;
			summaryCheck();
		});

		m_pageObjs.content = $edit_text.val();
		window.onbeforeunload = function() {
			if (window.textChanged && m_pageObjs.content != $edit_text.val())
				return LANG.notsavedyet;
		};
		window.onunload = deleteDraft;

		$('#edbtn__preview').click(function(e) {
			if (JSINFO.fastwiki.preview) {
				e.preventDefault();
				_preview(m_pageObjs.sectionForm);
				m_hasDraft = true;
				dw_locktimer.reset();
			}
			else {
				// Original behavior from edit.js.
				window.onbeforeunload = '';
				textChanged = false;
				window.keepDraft = true;
			}
		});

		$('#edit__summary').on("change keyup", summaryCheck);
		if (textChanged)
			summaryCheck();

		// From toolbar.js
		initToolbar('tool__bar','wiki__text',toolbar);
		$('#tool__bar').attr('role', 'toolbar');

		// reset change memory var on submit
		$('#edbtn__save').click(function(e) {
			textChanged = false;

			// Do a fast save if we started on 'show' and we're not creating or deleting the page.
			if (JSINFO.fastwiki.save && m_origViewMode == 'show' && $edit_text.val().length>0 && m_pageObjs.content.length>0) {
				e.preventDefault();
				load('save', null, _formToObj($('#dw__editform')));
			}
			// Invalidate the cache if fastwiki.save is off. If it's on, the cache will be updated after save.
			else
				m_cache.remove(JSINFO.id);

			window.onbeforeunload = '';
			dw_locktimer.clear();
		});

		// Cancel button on edit, or Delete Draft button on draft.
		$('input[name="do[draftdel]"]', $editform).click(function(e) {
			e.preventDefault();
			var id = $editform.find('input[name=id]').val();
			load('show');

			if (!window.keepDraft) {
				// Silently remove a possibly saved draft using ajax.
				jQuery.post(DOKU_BASE + 'lib/exe/ajax.php', {
					call: 'draftdel',
					id: id,
					success: function(data, textStatus, jqXHR) {
						m_hasDraft = false;
					}
				});
			}
		});
		// Cancel button on draft
		$('input[name="do[show]"]', $editform).click(function(e) {
			e.preventDefault();
			load('show');
		});

		$('.picker.pk_hl').addClass('dokuwiki');
	}


	/**
	* Change the current body class to represent the given action.
	*
	* @private
	* @param {String} action - The new page action.
	* @param {String=} target - The part of the page being targetted. Can be one of: {section}
	*/
	function _setBodyClass(action, target) {
		for (var k in m_supportedActions)
			m_modeClassElt.removeClass('mode_' + k);
		m_modeClassElt.addClass('mode_'+action);
		// Special case for section edit.
		if (target == 'section')
			m_modeClassElt.removeClass('mode_edit').addClass('mode_show mode_secedit');

		$('.content_partial').toggle(m_viewMode != m_origViewMode);
		$('.content_initial').toggle(m_viewMode == m_origViewMode || target == 'section');
	}


	/**
	* Update page objects on view switch.
	*
	* @private
	*/
	function _updatePageObjsOnSwitch() {
		if (m_pageObjs.showOnSwitch)
			m_pageObjs.showOnSwitch.show();
		delete m_pageObjs.showOnSwitch;
		delete m_pageObjs.content;
		delete m_pageObjs.sectionForm;

		var hasToc = {show: 1, admin: 1};

		// #dw__toc is common to all templates. #dw_toc_head is from the zioth template. #dw_toc is from starterbootstrap
		$("#dw__toc, #dw_toc_head, #dw_toc").css('display', m_viewMode in hasToc ? '' : 'none');
	}


	/**
	* Convert a form to an object suitable for $.post().
	*
	* @private
	*/
	function _formToObj(form) {
		var obj = {};
		$(form).serializeArray().map(function(item){obj[item.name] = item.value;});
		return obj;
	}


	/**
	* Convert a url to an object suitable for $.post().
	*
	* @private
	*/
	function _urlToObj(url) {
		var obj = {};
		var a = url.replace(/.*\?/, '').split('&');
		for (var x=0; x<a.length; x++) {
			var parts = unescape(a[x]).split('=');
			var name = parts.shift();
			obj[name] = parts.join('='); // Restore any lost = signs from the split.
		}
		return obj;
	}


	/**
	* Side effects of performing various actions.
	*
	* @private
	*/
	var m_actionEffects = {
		subscribe: function(params, extraData) {
			// Subscribe actions are a special case. Rather than replace the content, they add a success or error message to the top.
			function subscribeAction(sparams) {
				_sendPartial(sparams, _getVisibleContent(), function(data) {
					// data is just a success or error message.
					load(m_origViewMode);

					var body = $('<div class="message_partial"></div>').append(data);
					$('.content_initial').before(body);
				}, 'text');
			}

			var form = $('#subscribe__form');
			$('input[name="do[subscribe]"]', form).click(function(e) {
				e.preventDefault();
				subscribeAction(_formToObj(form));
			});

			$('.content_partial .unsubscribe').click(function(e) {
				e.preventDefault();
				subscribeAction(_urlToObj(this.href));
			});
		},
		index: function(params, extraData) {
			// Global init from index.js
			dw_index.$obj = $('#index__tree');
			dw_index.init();
		},
		edit: function(params, extraData) {
			var draft = params['do'] == 'draft';
			if (m_hasDraft === true)
				draft = true;
			else if (m_hasDraft === false)
				draft = params.rev = null;
			if (extraData.sectionForm) {
				// Define showOnSwitch here, not above, so _updatePageObjsOnSwitch doesn't re-show them too early.
				m_pageObjs.sectionForm = extraData.sectionForm; // Redefine.
				extraData.sectionParts = extraData.sectionParts.add('.editbutton_section');
				m_pageObjs.showOnSwitch = extraData.sectionParts;
				m_pageObjs.showOnSwitch.hide();
				_initEdit();
				_focusEdit();
			}
			else
				_initEdit();

			setTimeout(function() {
				// Focusing the editor causes the browser to scroll, so wait until it's likely to be in view (after the page is rearranged) before calling this.
				_focusEdit();

				if (document.body.scrollTop > 0)
					$('html,body').animate({scrollTop: Math.max(0, Math.floor($('.content_partial').offset().top)-20)+'px'}, 300);
			}, 1);
		},
		revisions: function(params, extraData) {
			$('.content_partial form').each(function(idx, form) {
				$('input[name="do[diff]"]', form).click(function(e) {
					e.preventDefault();
					load('diff', null, _formToObj(form));
				});
			});
		},
		save: function(params, extraData) {
			// If dates don't match, there's a conflict.
			if ($('.content_partial #a_newer_version_exists').length > 0) {
				m_viewMode = 'edit';
				m_actionEffects.edit(params, m_pageObjs.sectionForm ? {sectionForm: m_pageObjs.sectionForm, sectionParts:_getSection(m_pageObjs.sectionForm)} : {});

				var editform = $('#dw__editform');
				$('input[name="do[save]"]', editform).click(function(e) {
					e.preventDefault();
					load('save', null, _formToObj(editform));
					window.onbeforeunload = '';
					dw_locktimer.clear();
				});

				// Cancel button on edit, or Delete Draft button on draft.
				$('input[name="do[cancel]"]', editform).click(function(e) {
					e.preventDefault();
					var id = editform.find('input[name=id]').val();
					load('show');

					if (!window.keepDraft) {
						// Silently remove a possibly saved draft using ajax.
						jQuery.post(DOKU_BASE + 'lib/exe/ajax.php', {
							call: 'draftdel',
							id: id,
							success: function(data, textStatus, jqXHR) {
								m_hasDraft = false;
							}
						});
					}
				});
			}
			// Recoverable error. Return to the edit form.
			else if ($('.content_partial #dw__editform').length > 0) {
				m_viewMode = 'edit';
				m_actionEffects.edit(params, m_pageObjs.sectionForm ? {sectionForm: m_pageObjs.sectionForm, sectionParts:_getSection(m_pageObjs.sectionForm)} : {});
			}
			// When ACL fails, a preview is returned.
			else if ($('.content_partial #preview').length > 0) {
				//TODO: How do I handle this case? Test.
				load('show');
			}
			else {
				$('.content_initial').html($('.content_partial').html());
				$('.content_partial').remove();
				// The html() transfer above lost dynamic events. Reset.
				fixActionLinks($('.content_initial'));
				_refreshPageTitle(false);

				load('show');
				// These two lines are from dw_page.init()
				dw_page.sectionHighlight();
				jQuery('a.fn_top').mouseover(dw_page.footnoteDisplay);
			}
		},
		show: function(params, extraData) {
			$('.content_initial').html($('.content_partial').html());
			$('.content_partial').remove();
			// The html() transfer above lost dynamic events. Reset.
			fixActionLinks($('.content_initial'));
			// These two lines are from dw_page.init()
			dw_page.sectionHighlight();
			jQuery('a.fn_top').mouseover(dw_page.footnoteDisplay);
		}
	};
	m_actionEffects.draft = m_actionEffects.edit;
	m_actionEffects.diff = m_actionEffects.revisions;


	/**
	* Perform a standard partial AJAX action (edit, history, etc).
	*
	* @param {DOMNode=} insertLoc - Optional
	* @private
	*/
	function _action(action, params, callback, insertLoc, extraData) {
		params['do'] = action;

		function cb(data) {
			$('.content_partial, .message_partial').remove();
			$('.content_initial').attr('id', m_initialId);
			var body = $('<div class="content_partial"></div>').append(data);

			//TODO: I don't like having to put special case code here. Is there any better place to put it? m_actionEffects is too late.
			if (insertLoc && action=='edit') {
				var newform = $('#dw__editform', body);
				if (newform.find('input[name=prefix]').val() == '.' && newform.find('input[name=suffix]').val() == '') {
					// There was an error and the whole page is being edited, or there was only one section on the page.
					delete m_pageObjs.sectionForm;
					if (extraData)
						delete extraData.sectionForm;
					insertLoc = null;
				}
			}

			if (insertLoc)
				$(insertLoc[insertLoc.length - 1]).after(body);
			// This kind of partial replaces the whole content area.
			else {
				// Swap ids and classes, so the new element is styled correctly.
				var initial = $('.content_initial');
				body.addClass(initial[0].className.replace(/content_initial/, '')).attr('id', m_initialId);
				initial.attr('id', '').after(body);
			}

			// fwJustincase is to catch the case where the callbacks modify the DOM enough that this element not longer exists.
			var newToc = $('.content_partial #dw__toc').addClass('fwJustincase');
			var hasNewToc = newToc.length > 0;

			_updatePageObjsOnSwitch();

			if (callback)
				callback(data, extraData);
			if (m_actionEffects[action])
				m_actionEffects[action](params, extraData||{});
			// Update TOC. The default behavior is just to leave it in place, where it comes in.
			newToc = $('.fwJustincase').removeClass('fwJustincase');
			if (m_viewMode == 'show')
				$(window).trigger('fastwiki:updateToc', [newToc]);

			// Initialize TOC. Must happen after m_actionEffects, which can overwrite the HTML and lose events.
			if (hasNewToc)
				dw_page.makeToggle('#dw__toc h3','#dw__toc > div');

			// Update links in the content area.
			fixActionLinks($('.content_partial'));

			// It's important to use m_viewMode here instead of action, because the callbacks can change the action.
			_setBodyClass(m_viewMode, m_pageObjs.sectionForm ? "section" : null);

			// Cache the page.
			if (m_viewMode == 'show')
				m_cache.add(JSINFO.id, data, true);

			// Update doku state.
			if (!insertLoc)
				dw_behaviour.init();

			$(window).trigger('fastwiki:afterSwitch', [m_pageObjs.sectionForm?'show':m_viewMode, !!m_pageObjs.sectionForm, m_prevView]);

			if (!m_isSecedit && !m_wasSecedit) {
				setTimeout(function() {
					$('html,body').animate({scrollTop: 0}, 300);
				}, 1);
			}
		}

		//TODO: On save, refresh cache.
		// If the page is cached, load it from cache.
		if (action == 'show' && m_cache.get(JSINFO.id)) {
			m_debug && console.log("Getting from cache: " + JSINFO.id);
			cb(m_cache.get(JSINFO.id));
		}
		else
			_sendPartial(params, _getVisibleContent(), cb, 'text');
	}


	/**
	* Send a "partial" action, used for AJAX editing, previews, subscribe etc.
	*
	* @param {Object} params - Parameters to send to doku.php.
	* @param {DOMNode} spinnerParent - Center the loading spinner in this object.
	* @param {Function} callback - Call this function, with the content HTML as a parameter, when the action is complete.
	* @private
	*/
	function _sendPartial(params, spinnerParent, callback) {
		if ($('.partialsLoading').length == 0) {
			var spinnerCss = spinnerParent.height() + spinnerParent.offset().top > $(window).height() ? {top: $(window).height() / 2} : {top: '50%'};
			spinnerParent.append($('<div class="partialsLoading"></div>').css('display', 'none').css(spinnerCss));
			// Give it some time in case the server is really responsive.
			setTimeout(function() {$('.partialsLoading').css('display', '');}, 500);
		}

		params.partial = 1;
		jQuery[!params['do'] || params['do']=='show' ? 'get' : 'post'](m_curBaseUrl, params, function(data) {
			// Special error conditions
			if (data == 'PERMISSION_CHANGE') {
				delete params.partial;
				delete params.fastwiki_compareid;
				var url = m_curBaseUrl + '?' + $.param(params);
				document.location.href = url;
			}
			else
				callback(data);

			// Remove all loading spinners, in case a bug let some extras slip in.
			$('.partialsLoading').remove();
		}, 'text');
	}


	/**
	* Return the currently visible content area.
	*/
	function _getVisibleContent() {
		var parentElt = $('.content_partial');
		if (parentElt.length == 0)
			parentElt = $('.content_initial');
		return parentElt;
	}


	/**
	* Load a new view, using AJAX to avoid page re-load.
	*
	* @param {String} page - The view to load. This can be 'show,' or the value of a do= action param.
	* @param {Form=} sectionForm - Only valid when page=='edit' or page=='draft'. Used to edit a section inline.
	* @param {Object=} params - Additional parameters to pass to the AJAX request. For example, 'rev' if a revision is being edited.
	* @param {boolean=} force - Force an AJAX load, even if the code thinks it can optimize it out.
	* @param {Function=} callback - Called after the new page is loaded.
	*/
	function load(page, sectionForm, params, force, callback) {
		// If edit text has changed, confirm before switching views.
		if ((m_viewMode == 'edit' || m_viewMode == 'draft') && (page != 'save' && page != 'preview') && m_pageObjs.content != $('#wiki__text').val()) {
			if (!confirm(LANG.notsavedyet))
				return;
		}

		m_prevView = m_viewMode;
		// Edit: was=false, is=true
		// Save: was=true, is=true
		// Show: was=true, is=false
		m_wasSecedit = m_isSecedit;
		m_isSecedit = !!sectionForm || (m_wasSecedit && page=='save');
		m_viewMode = page;
		if (!params)
			params = {};
		window.onbeforeunload = '';
		dw_locktimer.clear();

		// First switch back to the original mode, canceling other modes.
		_updatePageObjsOnSwitch();

		// If we're back to the original mode, just clean up and quit.
		if (page == m_origViewMode && !force) {
			$('.content_partial, .message_partial').remove();
			$('.content_initial').attr('id', m_initialId);

			if (m_prevView != page) {
				// Scroll to top.
				if (!m_isSecedit && !m_wasSecedit) {
					setTimeout(function() {
						$('html,body').animate({scrollTop: 0}, 300);
					}, 1);
				}

				_setBodyClass(page);
				$(window).trigger('fastwiki:afterSwitch', [m_pageObjs.sectionForm?'show':m_viewMode, !!m_pageObjs.sectionForm]);
			}
			if (callback)
				callback();
		}
		// Sectionedit is special. Other special handlers are in m_actionEffects.
		else if ((page == 'draft' || page == 'edit') && sectionForm) {
			var sectionParts = _getSection(sectionForm);
			_action(page, params, callback, sectionParts, {sectionForm: sectionForm, sectionParts:sectionParts});
		}
		// Default action
		else
			_action(page, params, callback);
	}


	/**
	* Get the id of the page, or null if switching to that page doesn't support fastshow.
	*
	* @param {String} newpage - The new page URL.
	* @param {Boolean} force - Ignore fastshow rules.
	* @return {Object} with two members: id (page id) and ns (namespace).
	*/
	function _getSwitchId(newpage, force) {
		//TODO Bug: Doesn't work with httpd mode unless doku is in the base directory. Could fix by assuming same namespace.
		var pageid = newpage.substr(1).replace(/.*doku.php(\?id=|\/)/, '').replace(/\//g, ':');
		var ns = pageid.replace(/:[^:]+$/, '');

		if (!force) {
			if (JSINFO.fastwiki.fastshow_same_ns && ns != JSINFO.namespace)
				return false;
			var incl = JSINFO.fastwiki.fastshow_include, excl = JSINFO.fastwiki.fastshow_exclude;
			// Include namespaces and pages
			if (incl && !pageid.match('^(' + incl.split(/\s*,\s*/).join('|') + ')'))
				return false;
			// Exclude namespaces and pages
			if (excl && pageid.match('^(' + excl.split(/\s*,\s*/).join('|') + ')'))
				return false;
		}

		return {id:pageid, ns:ns};
	}


	/**
	* Switch to a different page id (fastshow feature).
	*
	* @param {String} newpage - The URL of the new page.
	* @param {Boolean=false} fromPopstate - True if function was called in the onpopstate event.
	*/
	function _switchBasePath(newpage, fromPopstate) {
		//TODO Bug: Doesn't work with httpd mode unless doku is in the base directory. Could fix by assuming same namespace.
		var pageinfo = _getSwitchId(newpage);
		if (!pageinfo)
			return false;

		// Update JSINFO
		var oldid = JSINFO.id;
		JSINFO.id = pageinfo.id;
		JSINFO.namespace = pageinfo.ns;

		// Replace 'id' fields.
		$('form').each(function(idx, form) {
			if ($(form).find('input[name="do"]').length > 0) {
				var input = $('input[name="id"]', form);
				if (input.val() == oldid)
					input.val(pageinfo.id);
			}
		});


		var prevPage = m_curBaseUrl;
		m_curBaseUrl = newpage;
		m_viewMode = null;
		load('show', null, {fastwiki_compareid:oldid}, true, function() {
			// Use HTML5 history.pushState to make the browser's back and forward buttons work.
			setTimeout(function() {
				_refreshPageTitle(true);
				if (!fromPopstate) {
					history.replaceState({url: prevPage, title: document.title}, "", prevPage);
					history.pushState({url: newpage, title:document.title}, "", newpage);
				}

				$(window).trigger('fastwiki:afterIdChange', [prevPage, newpage]);
			}, 1); // setTimeout so it happens after all other page manipulations. This won't be needed if I do history in _action().
		});

		return true;
	}


	/**
	* Get a regex which matches the current page id in a url.
	*
	* @returns {RegExp}
	*/
	function _getSelfRefRegex() {
		return new RegExp('doku\\.php\\?id='+JSINFO.id+'$|\\/'+JSINFO.id.replace(/:/g, '/')+'$|^#$');
	}


	function _getWikiTitle() {
		var titleElt;
		$('h1, h2, h3, h4, h5, h6', $('.content_initial')).each(function(idx, elt) {
			if (elt.className.indexOf('sectionedit') >= 0) {
				titleElt = elt;
				return false; // Break out of each().
			}
		});
		return titleElt ? $(titleElt).text() : '';
	}


	/**
	* Refresh the page title based on the top heading.
	*
	* @param {Boolean} fromIdSwitch - Is this refresh triggered by an id switch?
	*/
	function _refreshPageTitle(fromIdSwitch) {
		var title = _getWikiTitle();

		document.title = title;

		//TODO: Close, but I need to get the prevTitle from h1,h2,etc like above.
		if (!fromIdSwitch) {
			$('a').each(function(idx, elt) {
				var $this = $(this);
				var href = $this.attr('href');
				if (href && href.match(_getSelfRefRegex()) && $this.text() == m_prevTitle)
					$this.text(document.title);
			});
		}

		m_prevTitle = title;
	}


	return {
		load: load,
		fixActionLinks: fixActionLinks
	};
})(jQuery);

/* DOKUWIKI:include templates.js */
