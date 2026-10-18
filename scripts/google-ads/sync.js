/**
 * Moments in Light: Google Ads -> Moments Studio (docs/MIL-Ads-SEO-Command-Centre-Spec.md)
 *
 * Paste into Google Ads: Tools > Bulk actions > Scripts > + (New script). Authorise it, then set
 * Frequency to Hourly. Copy it from Studio > SEO > Ads, which puts your key in below.
 *
 * Each run asks the studio what to do. Once a day (and straight away the first time) it sends the
 * last 30 days (90 the first time) of campaigns, keywords and search terms, plus settings, ads,
 * negatives, locations and conversion actions. It only reads your account for now: nothing in
 * Google Ads is changed. Every request is signed with your key.
 */
var SITE = 'https://www.momentsinlight.co.nz';
var KEY = '__PASTE_KEY__';
var CHUNK = 1000;

function main() {
  var state = call('/api/ads/state', {});
  if (!state) return;
  if (state.export_due) exportAll(state.days || 30);
  else Logger.log('Nothing to send this hour.');
}

// ---- Talking to the studio ----
function hex(bytes) {
  return bytes.map(function (b) { var v = (b + 256) % 256; return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}
function call(path, data) {
  var body = JSON.stringify(data);
  var ts = String(new Date().getTime());
  var sig = hex(Utilities.computeHmacSha256Signature(ts + '.' + body, KEY, Utilities.Charset.UTF_8));
  for (var attempt = 1; attempt <= 3; attempt++) {
    var res = UrlFetchApp.fetch(SITE + path, {
      method: 'post', contentType: 'application/json; charset=utf-8', payload: body, muteHttpExceptions: true,
      headers: { 'X-Timestamp': ts, 'X-Signature': sig },
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return JSON.parse(res.getContentText());
    Logger.log('Studio said ' + code + ' to ' + path + ': ' + res.getContentText().slice(0, 300));
    if (code === 401 || code === 400) return null;
    Utilities.sleep(3000 * attempt);
  }
  return null;
}
function send(report, rows) {
  for (var i = 0; i < rows.length; i += CHUNK) call('/api/ads/ingest', { report: report, rows: rows.slice(i, i + CHUNK) });
  Logger.log(report + ': ' + rows.length + ' rows');
}

// ---- Reports (GAQL in one place, so it's easy to update when Google changes things) ----
function rowsOf(query, map) {
  var out = [];
  var it = AdsApp.search(query);
  while (it.hasNext()) { var r = map(it.next()); if (r) out.push(r); }
  return out;
}
function day(d) { return Utilities.formatDate(d, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd'); }
function v(obj, path) { // safe nested read: v(row, 'campaign.id')
  var parts = path.split('.');
  for (var i = 0; i < parts.length; i++) { if (obj === null || obj === undefined) return null; obj = obj[parts[i]]; }
  return obj === undefined ? null : obj;
}

function exportAll(days) {
  var end = new Date(); var start = new Date(end.getTime() - days * 86400000);
  var range = "segments.date BETWEEN '" + day(start) + "' AND '" + day(end) + "'";
  var errors = [];
  var sentKinds = [];
  function run(name, fn) {
    try { fn(); } catch (e) { errors.push({ id: name, error: String(e && e.message || e) }); Logger.log(name + ' failed: ' + e); }
  }

  run('campaigns', function () {
    send('campaigns', rowsOf(
      'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.advertising_channel_sub_type, ' +
      'campaign.bidding_strategy_type, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, ' +
      'campaign.network_settings.target_content_network, campaign.geo_target_type_setting.positive_geo_target_type, ' +
      'campaign_budget.amount_micros FROM campaign WHERE campaign.status != REMOVED',
      function (r) {
        return { id: v(r, 'campaign.id'), name: v(r, 'campaign.name'), status: v(r, 'campaign.status'), channel: v(r, 'campaign.advertisingChannelType'),
          sub: v(r, 'campaign.advertisingChannelSubType'), bidding: v(r, 'campaign.biddingStrategyType'),
          search: v(r, 'campaign.networkSettings.targetGoogleSearch'), partners: v(r, 'campaign.networkSettings.targetSearchNetwork'),
          display: v(r, 'campaign.networkSettings.targetContentNetwork'), geo: v(r, 'campaign.geoTargetTypeSetting.positiveGeoTargetType'),
          budget_micros: v(r, 'campaignBudget.amountMicros') };
      }));
  });
  run('campaign_daily', function () {
    send('campaign_daily', rowsOf(
      'SELECT segments.date, campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, ' +
      'metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE ' + range,
      function (r) {
        return { date: v(r, 'segments.date'), campaign_id: v(r, 'campaign.id'), cost_micros: v(r, 'metrics.costMicros'), impressions: v(r, 'metrics.impressions'),
          clicks: v(r, 'metrics.clicks'), conversions: v(r, 'metrics.conversions'), value: v(r, 'metrics.conversionsValue'),
          is: v(r, 'metrics.searchImpressionShare'), lost_budget: v(r, 'metrics.searchBudgetLostImpressionShare'), lost_rank: v(r, 'metrics.searchRankLostImpressionShare') };
      }));
  });
  run('keyword_daily', function () {
    send('keyword_daily', rowsOf(
      'SELECT segments.date, campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ' +
      'ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions ' +
      'FROM keyword_view WHERE ' + range,
      function (r) {
        return { date: v(r, 'segments.date'), campaign_id: v(r, 'campaign.id'), ad_group_id: v(r, 'adGroup.id'), criterion_id: v(r, 'adGroupCriterion.criterionId'),
          text: v(r, 'adGroupCriterion.keyword.text'), match: v(r, 'adGroupCriterion.keyword.matchType'), status: v(r, 'adGroupCriterion.status'),
          qs: v(r, 'adGroupCriterion.qualityInfo.qualityScore'), cost_micros: v(r, 'metrics.costMicros'), impressions: v(r, 'metrics.impressions'),
          clicks: v(r, 'metrics.clicks'), conversions: v(r, 'metrics.conversions') };
      }));
  });
  run('search_term_daily', function () {
    send('search_term_daily', rowsOf(
      'SELECT segments.date, campaign.id, ad_group.id, search_term_view.search_term, segments.keyword.info.text, segments.keyword.info.match_type, ' +
      'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM search_term_view WHERE ' + range,
      function (r) {
        return { date: v(r, 'segments.date'), campaign_id: v(r, 'campaign.id'), ad_group_id: v(r, 'adGroup.id'), term: v(r, 'searchTermView.searchTerm'),
          keyword: v(r, 'segments.keyword.info.text'), match: v(r, 'segments.keyword.info.matchType'), cost_micros: v(r, 'metrics.costMicros'),
          impressions: v(r, 'metrics.impressions'), clicks: v(r, 'metrics.clicks'), conversions: v(r, 'metrics.conversions') };
      }));
  });

  // Lists sent in full (each replaces what the studio had).
  function entity(kind, query, map) {
    run(kind, function () { send('entity:' + kind, rowsOf(query, map)); sentKinds.push(kind); });
  }
  entity('ad_group', 'SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id FROM ad_group WHERE ad_group.status != REMOVED',
    function (r) { return { id: v(r, 'adGroup.id'), name: v(r, 'adGroup.name'), status: v(r, 'adGroup.status'), type: v(r, 'adGroup.type'), campaign_id: v(r, 'campaign.id') }; });
  entity('keyword', 'SELECT ad_group_criterion.criterion_id, ad_group.id, campaign.id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ' +
    'ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.quality_info.quality_score FROM ad_group_criterion ' +
    "WHERE ad_group_criterion.type = KEYWORD AND ad_group_criterion.status != REMOVED",
    function (r) { return { id: v(r, 'adGroup.id') + '~' + v(r, 'adGroupCriterion.criterionId'), ad_group_id: v(r, 'adGroup.id'), campaign_id: v(r, 'campaign.id'),
      text: v(r, 'adGroupCriterion.keyword.text'), match: v(r, 'adGroupCriterion.keyword.matchType'), status: v(r, 'adGroupCriterion.status'),
      negative: v(r, 'adGroupCriterion.negative'), qs: v(r, 'adGroupCriterion.qualityInfo.qualityScore') }; });
  entity('ad', 'SELECT ad_group_ad.ad.id, ad_group.id, campaign.id, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ' +
    'ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.policy_summary.approval_status ' +
    'FROM ad_group_ad WHERE ad_group_ad.status != REMOVED',
    function (r) { var rsa = v(r, 'adGroupAd.ad.responsiveSearchAd') || {};
      return { id: v(r, 'adGroupAd.ad.id'), ad_group_id: v(r, 'adGroup.id'), campaign_id: v(r, 'campaign.id'), status: v(r, 'adGroupAd.status'), type: v(r, 'adGroupAd.ad.type'),
        urls: v(r, 'adGroupAd.ad.finalUrls'), approval: v(r, 'adGroupAd.policySummary.approvalStatus'),
        headlines: (rsa.headlines || []).map(function (h) { return h.text; }), descriptions: (rsa.descriptions || []).map(function (h) { return h.text; }) }; });
  entity('campaign_negative', 'SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type ' +
    'FROM campaign_criterion WHERE campaign_criterion.type = KEYWORD AND campaign_criterion.negative = TRUE',
    function (r) { return { id: v(r, 'campaign.id') + '~' + v(r, 'campaignCriterion.criterionId'), campaign_id: v(r, 'campaign.id'),
      text: v(r, 'campaignCriterion.keyword.text'), match: v(r, 'campaignCriterion.keyword.matchType') }; });
  entity('shared_negative', 'SELECT shared_set.id, shared_set.name, shared_criterion.criterion_id, shared_criterion.keyword.text, shared_criterion.keyword.match_type ' +
    'FROM shared_criterion WHERE shared_set.type = NEGATIVE_KEYWORDS',
    function (r) { return { id: v(r, 'sharedSet.id') + '~' + v(r, 'sharedCriterion.criterionId'), list: v(r, 'sharedSet.name'),
      text: v(r, 'sharedCriterion.keyword.text'), match: v(r, 'sharedCriterion.keyword.matchType') }; });
  entity('shared_list_use', 'SELECT campaign.id, shared_set.id, shared_set.name FROM campaign_shared_set WHERE shared_set.type = NEGATIVE_KEYWORDS',
    function (r) { return { id: v(r, 'campaign.id') + '~' + v(r, 'sharedSet.id'), campaign_id: v(r, 'campaign.id'), list: v(r, 'sharedSet.name') }; });
  entity('location', 'SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.type, campaign_criterion.negative, ' +
    'campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units, ' +
    'campaign_criterion.proximity.address.city_name FROM campaign_criterion WHERE campaign_criterion.type IN (LOCATION, PROXIMITY)',
    function (r) { return { id: v(r, 'campaign.id') + '~' + v(r, 'campaignCriterion.criterionId'), campaign_id: v(r, 'campaign.id'), type: v(r, 'campaignCriterion.type'),
      negative: v(r, 'campaignCriterion.negative'), geo: v(r, 'campaignCriterion.location.geoTargetConstant'),
      radius: v(r, 'campaignCriterion.proximity.radius'), units: v(r, 'campaignCriterion.proximity.radiusUnits'), city: v(r, 'campaignCriterion.proximity.address.cityName') }; });
  entity('conversion_action', 'SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.category, conversion_action.status, ' +
    'conversion_action.primary_for_goal, conversion_action.counting_type, conversion_action.include_in_conversions_metric FROM conversion_action WHERE conversion_action.status != REMOVED',
    function (r) { return { id: v(r, 'conversionAction.id'), name: v(r, 'conversionAction.name'), type: v(r, 'conversionAction.type'), category: v(r, 'conversionAction.category'),
      status: v(r, 'conversionAction.status'), primary: v(r, 'conversionAction.primaryForGoal'), counting: v(r, 'conversionAction.countingType'),
      in_conversions: v(r, 'conversionAction.includeInConversionsMetric') }; });
  // Totals over the period, split different ways (for the audit).
  entity('conversions_by_action', 'SELECT campaign.id, segments.conversion_action_name, metrics.all_conversions, metrics.conversions FROM campaign WHERE ' + range,
    function (r) { return { id: v(r, 'campaign.id') + '~' + v(r, 'segments.conversionActionName'), campaign_id: v(r, 'campaign.id'), action: v(r, 'segments.conversionActionName'),
      all: v(r, 'metrics.allConversions'), conversions: v(r, 'metrics.conversions') }; });
  entity('by_device', 'SELECT campaign.id, segments.device, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE ' + range,
    function (r) { return { id: v(r, 'campaign.id') + '~' + v(r, 'segments.device'), campaign_id: v(r, 'campaign.id'), device: v(r, 'segments.device'),
      cost_micros: v(r, 'metrics.costMicros'), clicks: v(r, 'metrics.clicks'), impressions: v(r, 'metrics.impressions'), conversions: v(r, 'metrics.conversions') }; });
  entity('by_network', 'SELECT campaign.id, segments.ad_network_type, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE ' + range,
    function (r) { return { id: v(r, 'campaign.id') + '~' + v(r, 'segments.adNetworkType'), campaign_id: v(r, 'campaign.id'), network: v(r, 'segments.adNetworkType'),
      cost_micros: v(r, 'metrics.costMicros'), clicks: v(r, 'metrics.clicks'), impressions: v(r, 'metrics.impressions'), conversions: v(r, 'metrics.conversions') }; });
  entity('by_hour', 'SELECT segments.day_of_week, segments.hour, metrics.cost_micros, metrics.clicks, metrics.conversions FROM campaign WHERE ' + range,
    function (r) { return { id: v(r, 'segments.dayOfWeek') + '~' + v(r, 'segments.hour'), day: v(r, 'segments.dayOfWeek'), hour: v(r, 'segments.hour'),
      cost_micros: v(r, 'metrics.costMicros'), clicks: v(r, 'metrics.clicks'), conversions: v(r, 'metrics.conversions') }; });
  entity('by_location', 'SELECT campaign.id, geographic_view.location_type, segments.geo_target_city, segments.geo_target_region, metrics.cost_micros, metrics.clicks, metrics.conversions ' +
    'FROM geographic_view WHERE ' + range,
    function (r) { return { id: [v(r, 'campaign.id'), v(r, 'geographicView.locationType'), v(r, 'segments.geoTargetCity'), v(r, 'segments.geoTargetRegion')].join('~'),
      campaign_id: v(r, 'campaign.id'), location_type: v(r, 'geographicView.locationType'), city: v(r, 'segments.geoTargetCity'), region: v(r, 'segments.geoTargetRegion'),
      cost_micros: v(r, 'metrics.costMicros'), clicks: v(r, 'metrics.clicks'), conversions: v(r, 'metrics.conversions') }; });
  // Performance Max search term groups (Google only allows one campaign per query).
  run('pmax_search_term', function () {
    var rows = [];
    var camps = AdsApp.search("SELECT campaign.id FROM campaign WHERE campaign.advertising_channel_type = PERFORMANCE_MAX AND campaign.status != REMOVED");
    while (camps.hasNext()) {
      var cid = v(camps.next(), 'campaign.id');
      rows = rows.concat(rowsOf('SELECT campaign_search_term_insight.category_label, metrics.clicks, metrics.impressions, metrics.conversions ' +
        'FROM campaign_search_term_insight WHERE campaign_search_term_insight.campaign_id = ' + cid + ' AND ' + range,
        function (r) { return { id: cid + '~' + v(r, 'campaignSearchTermInsight.categoryLabel'), campaign_id: cid,
          label: v(r, 'campaignSearchTermInsight.categoryLabel'), clicks: v(r, 'metrics.clicks'), impressions: v(r, 'metrics.impressions'), conversions: v(r, 'metrics.conversions') }; }));
    }
    send('entity:pmax_search_term', rows);
    sentKinds.push('pmax_search_term');
  });
  // Place names for the location ids used above.
  run('geo_names', function () {
    var ids = {};
    var it = AdsApp.search('SELECT campaign_criterion.location.geo_target_constant FROM campaign_criterion WHERE campaign_criterion.type = LOCATION');
    while (it.hasNext()) { var g = v(it.next(), 'campaignCriterion.location.geoTargetConstant'); if (g) ids[g] = 1; }
    var it2 = AdsApp.search('SELECT segments.geo_target_city FROM geographic_view WHERE ' + range);
    while (it2.hasNext()) { var c = v(it2.next(), 'segments.geoTargetCity'); if (c) ids[c] = 1; }
    var list = Object.keys(ids);
    var rows = [];
    for (var i = 0; i < list.length; i += 200) {
      rows = rows.concat(rowsOf("SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.target_type " +
        "FROM geo_target_constant WHERE geo_target_constant.resource_name IN ('" + list.slice(i, i + 200).join("','") + "')",
        function (r) { return { id: v(r, 'geoTargetConstant.resourceName'), name: v(r, 'geoTargetConstant.name'), full: v(r, 'geoTargetConstant.canonicalName'), type: v(r, 'geoTargetConstant.targetType') }; }));
    }
    send('entity:geo_name', rows);
  });

  send('entity:script_error', errors.length ? errors : [{ id: 'none', error: '' }]);
  sentKinds.push('script_error');
  call('/api/ads/ingest', { report: 'done', rows: sentKinds });
  Logger.log('Sent. ' + (errors.length ? errors.length + ' report(s) failed: see the studio.' : 'All reports went.'));
}
