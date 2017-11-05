<?php
if (!defined("DOKU_INC"))
	die();

$conf["secedit"] = 1;
$conf["preview"] = 1;
$conf["fastpages"] = 1;
$conf["save"] = 0;
$conf["fastshow"] = 0;
$conf["fastshow_same_ns"] = 1;
$conf["fastshow_include"] = "";
$conf["fastshow_exclude"] = "";
if (function_exists('curl_init')) {
	$conf["preload"] = 0;
	$conf["preload_batchsize"] = 10;
	$conf["preload_per_page"] = 100;
}
