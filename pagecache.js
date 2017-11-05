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
	this.load = function(elt, history) {
		var self = this;
		var ids = {};
		$('a', elt).each(function(idx, a) {
			var href = a.getAttribute('href'); // Use getAttribute because some browsers make href appear to be canonical.
			if (href && href.indexOf('://') < 0) {
				var numParams = href.split('=').length;
				if (href.indexOf('id=') >= 0)
					numParams--;
				if (numParams == 1) {
					var pageinfo = history.getSwitchId(href);
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

			// Make the first 4 requests. Limit to 4 so as not to monopolize all the browser's sockets (there are 6 in modern browsers).
			for (var x=0; x<Math.min(4, requests.length); x++)
				doPost(requests.shift());
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
