// The reports the Google Ads script fetches (read-only GAQL queries), kept here so new reports need
// no change to the script in Google Ads. The script (scripts/google-ads/sync.js) only runs SELECT
// queries and sends back the fields listed. Field paths read the script's row objects (camelCase);
// "list[].text" maps an array. {range} becomes "segments.date BETWEEN 'a' AND 'b'".
// report: campaigns | campaign_daily | keyword_daily | search_term_daily go to their own tables;
// entity:<kind> are kept as-is in ads_entity (id = the id paths joined with ~).
// per: run the query once for each id from per.query (put in place of {id}).

const f = (o) => o; // readability

export const REPORTS = [
  { report: 'campaigns',
    query: 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.advertising_channel_sub_type, campaign.bidding_strategy_type, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.geo_target_type_setting.positive_geo_target_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != REMOVED',
    fields: f({ id: 'campaign.id', name: 'campaign.name', status: 'campaign.status', channel: 'campaign.advertisingChannelType', sub: 'campaign.advertisingChannelSubType',
      bidding: 'campaign.biddingStrategyType', search: 'campaign.networkSettings.targetGoogleSearch', partners: 'campaign.networkSettings.targetSearchNetwork',
      display: 'campaign.networkSettings.targetContentNetwork', geo: 'campaign.geoTargetTypeSetting.positiveGeoTargetType', budget_micros: 'campaignBudget.amountMicros' }) },
  { report: 'campaign_daily',
    query: 'SELECT segments.date, campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE {range}',
    fields: f({ date: 'segments.date', campaign_id: 'campaign.id', cost_micros: 'metrics.costMicros', impressions: 'metrics.impressions', clicks: 'metrics.clicks',
      conversions: 'metrics.conversions', value: 'metrics.conversionsValue', is: 'metrics.searchImpressionShare', lost_budget: 'metrics.searchBudgetLostImpressionShare',
      lost_rank: 'metrics.searchRankLostImpressionShare' }) },
  { report: 'keyword_daily',
    query: 'SELECT segments.date, campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM keyword_view WHERE {range}',
    fields: f({ date: 'segments.date', campaign_id: 'campaign.id', ad_group_id: 'adGroup.id', criterion_id: 'adGroupCriterion.criterionId', text: 'adGroupCriterion.keyword.text',
      match: 'adGroupCriterion.keyword.matchType', status: 'adGroupCriterion.status', qs: 'adGroupCriterion.qualityInfo.qualityScore', cost_micros: 'metrics.costMicros',
      impressions: 'metrics.impressions', clicks: 'metrics.clicks', conversions: 'metrics.conversions' }) },
  { report: 'search_term_daily',
    query: 'SELECT segments.date, campaign.id, ad_group.id, search_term_view.search_term, segments.keyword.info.text, segments.keyword.info.match_type, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM search_term_view WHERE {range}',
    fields: f({ date: 'segments.date', campaign_id: 'campaign.id', ad_group_id: 'adGroup.id', term: 'searchTermView.searchTerm', keyword: 'segments.keyword.info.text',
      match: 'segments.keyword.info.matchType', cost_micros: 'metrics.costMicros', impressions: 'metrics.impressions', clicks: 'metrics.clicks', conversions: 'metrics.conversions' }) },

  { report: 'entity:ad_group', id: ['adGroup.id'],
    query: 'SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id FROM ad_group WHERE ad_group.status != REMOVED',
    fields: f({ name: 'adGroup.name', status: 'adGroup.status', type: 'adGroup.type', campaign_id: 'campaign.id' }) },
  { report: 'entity:keyword', id: ['adGroup.id', 'adGroupCriterion.criterionId'],
    query: 'SELECT ad_group_criterion.criterion_id, ad_group.id, campaign.id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.quality_info.quality_score FROM ad_group_criterion WHERE ad_group_criterion.type = KEYWORD AND ad_group_criterion.status != REMOVED',
    fields: f({ ad_group_id: 'adGroup.id', campaign_id: 'campaign.id', text: 'adGroupCriterion.keyword.text', match: 'adGroupCriterion.keyword.matchType',
      status: 'adGroupCriterion.status', negative: 'adGroupCriterion.negative', qs: 'adGroupCriterion.qualityInfo.qualityScore' }) },
  { report: 'entity:ad', id: ['adGroupAd.ad.id'],
    query: 'SELECT ad_group_ad.ad.id, ad_group.id, campaign.id, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE ad_group_ad.status != REMOVED',
    fields: f({ ad_group_id: 'adGroup.id', campaign_id: 'campaign.id', status: 'adGroupAd.status', type: 'adGroupAd.ad.type', urls: 'adGroupAd.ad.finalUrls',
      approval: 'adGroupAd.policySummary.approvalStatus', headlines: 'adGroupAd.ad.responsiveSearchAd.headlines[].text', descriptions: 'adGroupAd.ad.responsiveSearchAd.descriptions[].text' }) },
  { report: 'entity:campaign_negative', id: ['campaign.id', 'campaignCriterion.criterionId'],
    query: 'SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.type = KEYWORD AND campaign_criterion.negative = TRUE',
    fields: f({ campaign_id: 'campaign.id', text: 'campaignCriterion.keyword.text', match: 'campaignCriterion.keyword.matchType' }) },
  { report: 'entity:shared_negative', id: ['sharedSet.id', 'sharedCriterion.criterionId'],
    query: 'SELECT shared_set.id, shared_set.name, shared_criterion.criterion_id, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.type = NEGATIVE_KEYWORDS',
    fields: f({ list: 'sharedSet.name', text: 'sharedCriterion.keyword.text', match: 'sharedCriterion.keyword.matchType' }) },
  { report: 'entity:shared_list_use', id: ['campaign.id', 'sharedSet.id'],
    query: 'SELECT campaign.id, shared_set.id, shared_set.name FROM campaign_shared_set WHERE shared_set.type = NEGATIVE_KEYWORDS',
    fields: f({ campaign_id: 'campaign.id', list: 'sharedSet.name' }) },
  { report: 'entity:location', id: ['campaign.id', 'campaignCriterion.criterionId'],
    query: 'SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units, campaign_criterion.proximity.address.city_name FROM campaign_criterion WHERE campaign_criterion.type IN (LOCATION, PROXIMITY)',
    fields: f({ campaign_id: 'campaign.id', type: 'campaignCriterion.type', negative: 'campaignCriterion.negative', geo: 'campaignCriterion.location.geoTargetConstant',
      radius: 'campaignCriterion.proximity.radius', units: 'campaignCriterion.proximity.radiusUnits', city: 'campaignCriterion.proximity.address.cityName' }) },
  { report: 'entity:conversion_action', id: ['conversionAction.id'],
    query: 'SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.category, conversion_action.status, conversion_action.primary_for_goal, conversion_action.counting_type, conversion_action.include_in_conversions_metric FROM conversion_action WHERE conversion_action.status != REMOVED',
    fields: f({ name: 'conversionAction.name', type: 'conversionAction.type', category: 'conversionAction.category', status: 'conversionAction.status',
      primary: 'conversionAction.primaryForGoal', counting: 'conversionAction.countingType', in_conversions: 'conversionAction.includeInConversionsMetric' }) },
  { report: 'entity:conversions_by_action', id: ['campaign.id', 'segments.conversionActionName'],
    query: 'SELECT campaign.id, segments.conversion_action_name, metrics.all_conversions, metrics.conversions FROM campaign WHERE {range}',
    fields: f({ campaign_id: 'campaign.id', action: 'segments.conversionActionName', all: 'metrics.allConversions', conversions: 'metrics.conversions' }) },
  { report: 'entity:by_device', id: ['campaign.id', 'segments.device'],
    query: 'SELECT campaign.id, segments.device, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE {range}',
    fields: f({ campaign_id: 'campaign.id', device: 'segments.device', cost_micros: 'metrics.costMicros', clicks: 'metrics.clicks', impressions: 'metrics.impressions', conversions: 'metrics.conversions' }) },
  { report: 'entity:by_network', id: ['campaign.id', 'segments.adNetworkType'],
    query: 'SELECT campaign.id, segments.ad_network_type, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE {range}',
    fields: f({ campaign_id: 'campaign.id', network: 'segments.adNetworkType', cost_micros: 'metrics.costMicros', clicks: 'metrics.clicks', impressions: 'metrics.impressions', conversions: 'metrics.conversions' }) },
  { report: 'entity:by_hour', id: ['segments.dayOfWeek', 'segments.hour'],
    query: 'SELECT segments.day_of_week, segments.hour, metrics.cost_micros, metrics.clicks, metrics.conversions FROM campaign WHERE {range}',
    fields: f({ day: 'segments.dayOfWeek', hour: 'segments.hour', cost_micros: 'metrics.costMicros', clicks: 'metrics.clicks', conversions: 'metrics.conversions' }) },
  { report: 'entity:by_location', id: ['campaign.id', 'geographicView.locationType', 'segments.geoTargetCity', 'segments.geoTargetRegion'],
    query: 'SELECT campaign.id, geographic_view.location_type, segments.geo_target_city, segments.geo_target_region, metrics.cost_micros, metrics.clicks, metrics.conversions FROM geographic_view WHERE {range}',
    fields: f({ campaign_id: 'campaign.id', location_type: 'geographicView.locationType', city: 'segments.geoTargetCity', region: 'segments.geoTargetRegion',
      cost_micros: 'metrics.costMicros', clicks: 'metrics.clicks', conversions: 'metrics.conversions' }) },
  { report: 'entity:pmax_search_term', id: ['campaignSearchTermInsight.campaignId', 'campaignSearchTermInsight.categoryLabel'],
    per: { query: 'SELECT campaign.id FROM campaign WHERE campaign.advertising_channel_type = PERFORMANCE_MAX AND campaign.status != REMOVED', path: 'campaign.id' },
    query: 'SELECT campaign_search_term_insight.campaign_id, campaign_search_term_insight.category_label, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign_search_term_insight WHERE campaign_search_term_insight.campaign_id = {id} AND {range}',
    fields: f({ campaign_id: 'campaignSearchTermInsight.campaignId', label: 'campaignSearchTermInsight.categoryLabel', clicks: 'metrics.clicks', impressions: 'metrics.impressions', conversions: 'metrics.conversions' }) },
  // Images: first every linked image, then again with impressions and clicks (the second replaces the first).
  ...['customer_asset', 'campaign_asset', 'ad_group_asset'].flatMap((table) => {
    const level = { customer_asset: 'account', campaign_asset: 'campaign', ad_group_asset: 'ad_group' }[table];
    const owner = { customer_asset: [], campaign_asset: ['campaign.id'], ad_group_asset: ['adGroup.id'] }[table];
    const sel = { customer_asset: '', campaign_asset: 'campaign.id, ', ad_group_asset: 'ad_group.id, ' }[table];
    const camel = table.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const fields = { level: `=${level}`, owner: owner[0] ?? '=account', asset_id: 'asset.id', name: 'asset.name', url: 'asset.imageAsset.fullSize.url',
      width: 'asset.imageAsset.fullSize.widthPixels', height: 'asset.imageAsset.fullSize.heightPixels', field: `${camel}.fieldType`, status: `${camel}.status` };
    const base = `SELECT ${sel}asset.id, asset.name, asset.image_asset.full_size.url, asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels, ${table}.field_type, ${table}.status`;
    return [
      { report: 'entity:image', id: [`=${level}`, ...owner, 'asset.id'], query: `${base} FROM ${table} WHERE asset.type = IMAGE`, fields },
      { report: 'entity:image', id: [`=${level}`, ...owner, 'asset.id'], query: `${base}, metrics.impressions, metrics.clicks FROM ${table} WHERE asset.type = IMAGE AND {range}`,
        fields: { ...fields, impressions: 'metrics.impressions', clicks: 'metrics.clicks' } },
    ];
  }),
];

/** The reports for this run, plus place names for any location ids we've seen but not named. */
export async function reportsFor(db) {
  const ids = new Set();
  const rows = (await db.prepare(`SELECT json_extract(data, '$.geo') g, json_extract(data, '$.city') c, json_extract(data, '$.region') r FROM ads_entity WHERE kind IN ('location', 'by_location')`).all()).results;
  for (const x of rows) for (const v of [x.g, x.c, x.r]) if (v && String(v).startsWith('geoTargetConstants/')) ids.add(v);
  const named = new Set((await db.prepare(`SELECT id FROM ads_entity WHERE kind = 'geo_name'`).all()).results.map((r) => r.id));
  const todo = [...ids].filter((i) => !named.has(i)).slice(0, 400);
  const list = [...REPORTS];
  if (todo.length) list.push({ report: 'entity:geo_name', id: ['geoTargetConstant.resourceName'],
    query: `SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.resource_name IN ('${todo.join("','")}')`,
    fields: { name: 'geoTargetConstant.name', full: 'geoTargetConstant.canonicalName', type: 'geoTargetConstant.targetType' }, keep: true });
  return list;
}
