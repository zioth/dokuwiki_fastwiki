<?php
if (!defined("DOKU_INC"))
	die();

$lang["secedit"] = "Allow inline section edit.";
$lang["preview"] = "Allow inline edit preview.";
$lang["fastpages"] = "Load page modes (edit, revisions, subscribe etc) without reloading the page.";
$lang["save"] = "Save from the editor without reloading the page (work in progress).";
$lang["fastshow"] = "When changing to another page, don't reload the page. This setting may not work with all plugins.";
$lang["fastshow_same_ns"] = "If enabled, fastshow will only work with pages in the same namespace. Use this setting if your sidebar, header or footer changes based on namespace.";
$lang["fastshow_include"] = "Only enable fastshow for this comma-delimited list of namespaces and pages";
$lang["fastshow_exclude"] = "Disable fastshow for this comma-delimited list of namespaces and pages";
$lang["preload"] = "Super speed boost! Preload pages so they're ready when the user wants them. Requires fastshow to be on. Warning: This will increase your network usage a lot.";
$lang["preload_batchsize"] = "Maximum number of pages to preload per batch.";
$lang["preload_per_page"] = "Maximum number of pages to preload per page.";
