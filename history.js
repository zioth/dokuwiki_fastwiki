/**
* Use HTML5 history.pushState to make the browser's back and forward buttons work as expected.
*/
function CBrowserHistory() {
	var m_inPopState = false;
	var m_curBaseUrl = document.location.pathname;
	var m_prevTitle = '__UNDEFINED__';
	var m_loadPageFunc = null; //TODO: Not great that this is a member var...
	var self = this;

	//TODO: Test with doku?id urls.
	function base(url, withId) {
		if (withId) {
			var id = url.replace(/.*id=([^&]+).*/, '$1');
			if (id.match(/^[a-zA-Z0-9_\-:]+$/))
				return url.replace(/\?.*/, '') + '?id='+id;
		}
		return url.replace(/\?.*/, '');
	}


	/**
	* Get the expected title of the wiki page.
	*
	* @private
	* @return {String} the title.
	*/
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
	* Initialize this class
	*
	* @param {Function} loadFunc - The function to call after a new page is loaded.
	*/
	this.init = function(loadFunc) {
		m_prevTitle = _getWikiTitle() || '__UNDEFINED__';
		m_loadPageFunc = loadFunc;

		window.addEventListener('popstate', function(e) {
			document.title = e.state.title;
			m_inPopState = true;
			self.switchBasePath(e.state.url);
			//TODO: Set m_viewMode=null with a callback. Put current view mode in the state. Generalize with a getPageState() and pageStateCallback()
		});
	};


	/**
	* Get the id of the page, or null if switching to that page doesn't support fastshow.
	*
	* @param {String} newpage - The new page URL.
	* @param {Boolean} force - Ignore fastshow rules.
	* @return {Object} with two members: id (page id) and ns (namespace).
	*/
	this.getSwitchId = function(newpage, force) {
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
	};


	/**
	* Get a regex which matches the current page id in a url.
	*
	* @returns {RegExp}
	*/
	this.getSelfRefRegex = function() {
		return new RegExp('doku\\.php\\?id='+JSINFO.id+'$|\\/'+JSINFO.id.replace(/:/g, '/')+'$|^#$');
	};


	/**
	* @return {String} the current base url.
	*/
	this.getBaseUrl = function() {
		return m_curBaseUrl;
	};


	/**
	* Switch to a different page id (fastshow feature).
	*
	* @param {String} newpage - The URL of the new page.
	*/
	this.switchBasePath = function(newpage) {
		//TODO Bug: Doesn't work with httpd mode unless doku is in the base directory. Could fix by assuming same namespace.
		var pageinfo = this.getSwitchId(newpage);
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


		// TODO: Need to have newpage in non-switch case to get history for other actions.
		m_curBaseUrl = base(newpage); //TODO: Always?
		var prevpage = document.location.href;

		m_loadPageFunc('show', null, {fastwiki_compareid:oldid}, true, function() {
			setTimeout(function() {
				if (!m_inPopState) {
					// If we do things like save and subscribe, we end up back on 'show'.
					//if (m_viewMode == 'show' && newpage == prevpage)
					//	window.history.back();
					//else {
						// When switching modes, just replace the url. When changing to a new page or in or out of show, push.
						history.replaceState({url: prevpage, title: document.title}, "", prevpage);
					//	if (m_viewMode == 'show' || m_prevViewMode == 'show') { //TODO
							history.pushState({url: newpage, title: document.title}, "", newpage);
							$(window).trigger('fastwiki:afterIdChange', [prevpage, m_curBaseUrl]);
					//	}
					//}
				}
				// Set this here instead of in the popstate listener, so that callbacks and setTimeout will work.
				m_inPopState = false;

				self.refreshPageTitle(true);
			}, 1); // setTimeout so it happens after all other page manipulations. This won't be needed if I do history in _action().
		});

		return true;
	};


	/**
	* Refresh the page title based on the top heading.
	*
	* @param {Boolean} fromIdSwitch - Is this refresh triggered by an id switch?
	*/
	this.refreshPageTitle = function(fromIdSwitch) {
		var title = _getWikiTitle();

		document.title = title;

		//TODO: Close, but I need to get the prevTitle from h1,h2,etc like above. Or better, return it from the server.
		if (!fromIdSwitch) {
			$('a').each(function(idx, elt) {
				var $this = $(this);
				var href = $this.attr('href');
				if (href && href.match(self.getSelfRefRegex()) && $this.text() == m_prevTitle)
					$this.text(document.title);
			});
		}

		m_prevTitle = title;
	};
}
