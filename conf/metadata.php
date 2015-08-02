<?php
if (!defined("DOKU_INC"))
	die();

$meta["secedit"] = array("onoff");
$meta["preview"] = array("onoff");
$meta["fastpages"] = array("onoff");
$meta["save"] = array("onoff");
$meta["fastshow"] = array("onoff");
$meta["fastshow_same_ns"] = array("onoff");
$meta["fastshow_include"] = array("");
$meta["fastshow_exclude"] = array("");
if (function_exists('curl_init')) {
	$meta["preload"] = array("onoff");
	$meta["preload_batchsize"] = array("numeric", "_min"=>1, "_max"=>20);
	$meta["preload_per_page"] = array("numeric", "_min"=>4, "_max"=>200);
}
