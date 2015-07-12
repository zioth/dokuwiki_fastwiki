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
	var $m_inPartial = false;
	var $m_no_content = false;

	/**
	* Register callback functions
	*
	* @param {Doku_Event_Handler} $controller DokuWiki's event controller object
	*/
	public function register(Doku_Event_Handler $controller) {
		$controller->register_hook('DOKUWIKI_STARTED', 'BEFORE', $this, 'handle_start');
		$controller->register_hook('ACTION_ACT_PREPROCESS', 'BEFORE', $this, 'handle_action_before');
		$controller->register_hook('ACTION_ACT_PREPROCESS', 'AFTER', $this, 'handle_action');
		$controller->register_hook('TPL_ACT_RENDER', 'BEFORE', $this, 'pre_render');
		$controller->register_hook('ACTION_SHOW_REDIRECT', 'BEFORE', $this, 'handle_redirect');
	}


	/**
	* Start processing the request. This happens after doku init.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	public function handle_start(Doku_Event &$event, $param) {
		global $conf, $INPUT;

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
		if ($ACT == 'subscribe' && $INPUT->str('sub_action'))
			$this->m_no_content = true;
	}


	/**
	* Handle the "partial" action, using the blank template to deliver nothing but the inner page content.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	public function handle_action(Doku_Event &$event, $param) {
		if (!$this->m_inPartial)
			return;
		global $ACT, $INPUT, $ID;

		// Compare permissions between the current page and the passed-in id.
		$compareid = $INPUT->str('fastwiki_compareid');
		if ($compareid && (auth_quickaclcheck($ID) != auth_quickaclcheck($compareid)))
			echo 'PERMISSION_CHANGE';

		// Some partials only want an error message.
		else if (!$this->m_no_content) {
			// Section save. This won't work, unless I return new "range" inputs for all sections.
//			$secedit = $ACT == 'show' && $INPUT->str('target') == 'section' && ($INPUT->str('prefix') || $INPUT->str('suffix'));
//			if ($secedit)
//				$this->render_text($INPUT->str('wikitext')); //+++ render_text isn't outputting anything.
//			else
			tpl_content(false);

			if ($ACT == 'show')
				tpl_toc();
		}

		// Output error messages.
		html_msgarea();
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
		if (!$this->m_inPartial)
			print '<div class="plugin_fastwiki_marker" style="display:none"></div>';
	}


	/**
	* Some actions normally redirect. Block that for partials.
	*
	* @param {Doku_Event} $event - The DokuWiki event object.
	* @param {mixed} $param  - The fifth argument to register_hook().
	*/
	function handle_redirect(Doku_Event &$event, $param) {
		global $ACT;
		if ($this->m_inPartial && ($event->data['preact'] == 'subscribe') || ($event->data['preact'] == 'save')) {
			// Undo the action override, which sets $ACT to 'show.'
			$ACT = $event->data['preact'];
			$event->preventDefault();
		}
	}
}
