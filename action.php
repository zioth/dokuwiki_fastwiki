<?php
if (!defined('DOKU_INC'))
	die();

/**
 * Fastwiki plugin, used for inline section editing, and loading of do= actions without a page refresh.
 *
 * @see http://dokuwiki.org/plugin:fastwiki
 * @license GPL 2 http://www.gnu.org/licenses/gpl-2.0.html
 * @author Eli Fenton
 */
class action_plugin_fastwiki extends DokuWiki_Action_Plugin {
	protected $m_inPartial = false;
	protected $m_no_content = false;
	protected $m_preload_head = '====47hsjwycv782nwncv8b920m8bv72jmdm3929bno3b3====';
	protected $m_orig_act;

	/**
	* Register callback functions
	*
	* @param {Doku_Event_Handler} $controller DokuWiki's event controller object
	*/
	public function register(Doku_Event_Handler $controller) {
		// Listed in order of when they happen.
		$controller->register_hook('DOKUWIKI_STARTED', 'BEFORE', $this, 'handle_start');
		$controller->register_hook('DOKUWIKI_STARTED', 'AFTER', $this, 'override_loadskin');
		$controller->register_hook('ACTION_ACT_PREPROCESS', 'BEFORE', $this, 'handle_action_before');
		$controller->register_hook('TPL_ACT_UNKNOWN', 'BEFORE', $this, 'unknown_action');
		$controller->register_hook('ACTION_SHOW_REDIRECT', 'BEFORE', $this, 'block_redirect');
		$controller->register_hook('ACTION_HEADERS_SEND', 'BEFORE', $this, 'block_headers');
		$controller->register_hook('ACTION_HEADERS_SEND', 'AFTER', $this, 'instead_of_template');
		$controller->register_hook('TPL_ACT_RENDER', 'BEFORE', $this, 'pre_render');
	}


	/**
	* Start processing the request. This happens after doku init.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	public function handle_start(Doku_Event &$event, $param) {
		global $conf, $INPUT, $ACT;

		$this->m_orig_act = $ACT;

		if ($INPUT->str('partial') == '1') {
			$this->m_inPartial = true;
			// Because so much is declared in global scope in doku.php, it's impossible to call tpl_content() without
			// rendering the whole template. This hack loads a blank template, so we only render the page's inner content.
			$conf['template'] = '../plugins/fastwiki/tplblank';
		}
		else {
			global $lang, $JSINFO;

			$JSINFO['fastwiki'] = array(
				// Configuration
				'secedit'       => $this->getConf('secedit'),
				'preview'       => $this->getConf('preview'),
				'fastpages'     => $this->getConf('fastpages'),
				'save'          => $this->getConf('save'),
				'fastshow'      => $this->getConf('fastshow'),
				'fastshow_same_ns' => $this->getConf('fastshow_same_ns'),
				'fastshow_include' => $this->getConf('fastshow_include'),
				'fastshow_exclude' => $this->getConf('fastshow_exclude'),
				'preload'          => function_exists('curl_init') ? $this->getConf('preload') : false,
				'preload_head'     => $this->m_preload_head,
				'preload_batchsize'=> $this->getConf('preload_batchsize'),
				'preload_per_page' => $this->getConf('preload_per_page'),

				// Needed for the initialization of the partial edit page.
				'locktime'      => $conf['locktime'] - 60,
				'usedraft'      => $conf['usedraft'] ? $conf['usedraft'] : '0',

				// Miscellaneous
				'text_btn_show' => $lang['btn_show'],
				'templatename'  => $conf['template']
			);
		}
	}


	/**
	* The Loadskin plugin changes $conf['template'] in multiple places. Make sure we cover them all.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	public function override_loadskin(Doku_Event &$event, $param) {
		global $conf;
		if ($this->m_inPartial)
			$conf['template'] = '../plugins/fastwiki/tplblank';
	}


	/**
	* Define special actions.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	public function unknown_action(Doku_Event &$event, $param) {
		if ($event->data == 'fastwiki_preload')
			$event->preventDefault();
	}


	/**
	* Hook into the pre-processor for the action handler to catch subscribe sub-actions before the action name changes.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	public function handle_action_before(Doku_Event &$event, $param) {
		if (!$this->m_inPartial)
			return;
		global $ACT, $INPUT;

		// For partials, we don't want output from subscribe actions -- just success/error messages.
		if ($this->m_orig_act == 'subscribe' && $INPUT->str('sub_action'))
			$this->m_no_content = true;
		else if ($this->getConf('preload') && $this->m_orig_act == 'fastwiki_preload')
			$event->preventDefault();
	}


	/**
	* Don't output headers while proxying preload pages.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	public function block_headers(Doku_Event &$event, $param) {
		global $INPUT;
		if ($INPUT->str('fastwiki_preload_proxy'))
			$event->preventDefault();
	}


	/**
	* Some actions, like save and subscribe, normally redirect. Block that for partials.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	function block_redirect(Doku_Event &$event, $param) {
		if ($this->m_inPartial)
			$event->preventDefault();
	}


	/**
	* Handle the "partial" action, using the blank template to deliver nothing but the inner page content.
	* This happens right before the template code would normally execute.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	public function instead_of_template(Doku_Event &$event, $param) {
		if (!$this->m_inPartial)
			return;
		global $ACT, $INPUT, $ID, $INFO;
		$preload = $this->getConf('preload') && $this->m_orig_act == 'fastwiki_preload';

		// Output error messages.
		html_msgarea();

		$compareid = $INPUT->str('fastwiki_compareid');
		if ($compareid && (auth_quickaclcheck($ID) != auth_quickaclcheck($compareid)))
			echo 'PERMISSION_CHANGE';

		// Some partials only want an error message.
		else if (!$this->m_no_content) {
			// Update revision numbers for section edit, in case the file was saved.
			if ($this->m_orig_act == 'save')
				$INFO['lastmod'] = @filemtime($INFO['filepath']);

			// Preload page content.
			else if ($preload)
				$this->_preload_pages();

			else {
				//global $_COOKIE;
				//$cookies = array();
				//foreach ($_COOKIE as $name=>$value)
				//	array_push($cookies, $name . '=' . addslashes($value));
				//$cookies = join('; ', $cookies);
				//echo "[{$_SERVER["REMOTE_USER"]}, $cookies]";
			}
			// Section save. This won't work, unless I return new "range" inputs for all sections.
//			$secedit = $ACT == 'show' && $INPUT->str('target') == 'section' && ($INPUT->str('prefix') || $INPUT->str('suffix'));
//			if ($secedit)
//				$this->render_text($INPUT->str('wikitext')); //+++ render_text isn't outputting anything.
//			else


			if (!$preload)
				tpl_content($ACT == 'show');
		}
	}


	/**
	* The template is about to render the main content area. Plop in a marker div so the javascript can
	* figure out where the main content area is. NOTE: Templates that don't wrap tpl_content()
	* in an HTML tag won't work with this plugin.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	public function pre_render(Doku_Event &$event, $param) {
		global $ACT, $INPUT, $ID;
		if (!$this->m_inPartial)
			print '<div class="plugin_fastwiki_marker" style="display:none"></div>';
	}


	/**
	* Preload pages based on URL parameters, and return them.
	*/
	protected function _preload_pages() {
		global $INPUT, $_COOKIE, $ID;

		$maxpages = $this->getConf('preload_batchsize');
		$pages = split(',', $INPUT->str('fastwiki_preload_pages'));
		$count = min($maxpages, count($pages));
		$headers = getallheaders();
		$requests = array();

		$filtered = array();
		for ($x=0; $x<$count; $x++) {
			$newid = cleanID($pages[$x]);
			// ACL must be exactly the same.
			if (page_exists($newid) && (auth_quickaclcheck($ID) == auth_quickaclcheck($newid)))
				$filtered[] = $newid;
		}
		$pages = $filtered;
		$count = count($pages);

		if (function_exists('curl_init')) {
			for ($x=0; $x<$count; $x++) {
				$newid = $pages[$x];
				// Because there's no way to call doku recursively, curl is the only way to get a fresh context.
				// Without a fresh context, there's no easy way to get action plugins to run or TOC to render properly.
				/*
				From include plugin. Interesting.
				extract($page);
				$id = $page['id'];
				$exists = $page['exists'];

				Or maybe open a new doku process with popen?
				*/
				$ch = curl_init(DOKU_URL.'doku.php');
				curl_setopt($ch, CURLOPT_POST, 1);
				curl_setopt($ch, CURLOPT_POSTFIELDS, "id={$newid}&partial=1&fastwiki_preload_proxy=1");
				curl_setopt($ch, CURLOPT_COOKIE, $headers['Cookie']);
				curl_setopt($ch, CURLOPT_USERAGENT, $headers['User-Agent']);
				curl_setopt($ch, CURLOPT_HTTPHEADER, array('Accept-Language: ' . $headers['Accept-Language']));
				curl_setopt($ch, CURLOPT_REFERER, $headers['Referer']);
				curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 0); // Ignore redirects. TODO: Really? What about redirect plugin?
				curl_setopt($ch, CURLOPT_HEADER, 0);
				curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
				array_push($requests, array($ch, $newid));
			}

			// Request URLs with multiple threads.
			// TODO: This currently hangs. Enable the array_push above, and remove curl_exec, to test.
			if (count($requests) > 0) {
				$multicurl = curl_multi_init();
				foreach ($requests as $req)
					curl_multi_add_handle($multicurl, $req[0]);

				$active = null;
				// Strange loop becuase php 5.3.18 broke curl_multi_select
				do {
					do {
						$mrc = curl_multi_exec($multicurl, $active);
					} while ($mrc == CURLM_CALL_MULTI_PERFORM);
					// Wait 10ms to fix a bug where multi_select returns -1 forever.
					usleep(10000);
				} while(curl_multi_select($multicurl) === -1);

				while ($active && $mrc == CURLM_OK) {
					if (curl_multi_select($multicurl) != -1) {
						do {
							$mrc = curl_multi_exec($multicurl, $active);
						} while ($mrc == CURLM_CALL_MULTI_PERFORM);
					}
				}

				foreach ($requests as $idx=>$req) {
					if ($idx > 0)
						print $this->m_preload_head;
					print $req[1] . "\n";
					echo curl_multi_getcontent($req[0]);
					curl_multi_remove_handle($multicurl, $req[0]);
				}
				curl_multi_close($multicurl);
			}
		}
		// TODO: WORKING
		// Fallback when curl isn't installed. Not parallelized, but it works!
		// Note that this will not work with connections that do chunking.
		//TODO DOCUMENT: Needs allow_url_fopen.
		//TODO Replicate client's User-Agent, Accept-Language header. Copy COOKIE header instead of reconstructing.
		//TODO: This is VERY slow.
		else {
			return;

			global $_SERVER;
			$hostname = $_SERVER['SERVER_NAME'];
			for ($x=0; $x<$count; $x++) {
				$newid = $pages[$x];

				$headers = array(
					"POST " . DOKU_URL . "doku.php HTTP/1.1",
					"Host: " . $hostname,
					"Cookie: " . $cookies,
					"Content-Type: application/x-www-form-urlencoded; charset=UTF-8",
					//"Accept: text/plain, */*",
					"", "");
				$body = "id={$newid}&partial=1&fastwiki_preload_proxy=1";

print implode("\r\n", $headers) . "id={$newid}&partial=1&fastwiki_preload_proxy=1\n\n\n";
continue;
				$remote = fsockopen($hostname, 80, $errno, $errstr, 5);
				fwrite($remote, implode("\r\n", $headers) . $body);

				$response = '';
				while (!feof($remote))
					$response .= fread($remote, 8192);
				fclose($remote);

				if ($x > 0)
					print $this->m_preload_head;
				print "$newid\n";
				echo $response;
			}
		}
	}
}


if (!function_exists('getallheaders')) {
	function getallheaders() {
		$headers = '';
		foreach ($_SERVER as $name => $value) {
			if (substr($name, 0, 5) == 'HTTP_')
				$headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
		}
		return $headers;
	}
}
