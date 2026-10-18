/**
 * Moments in Light: Google Ads -> Moments Studio (docs/MIL-Ads-SEO-Command-Centre-Spec.md)
 *
 * Paste into Google Ads: Tools > Bulk actions > Scripts > + (New script). Authorise it, then set
 * Frequency to Hourly. Copy it from Studio > SEO > Google Ads, which puts your key in below.
 *
 * All the code it will ever run is below. Each run it asks the studio which reports to fetch:
 * read-only queries (it refuses anything that isn't a plain SELECT), runs them, and sends the rows
 * back. New reports are added in the studio (functions-lib/ads-reports.js) with no change here.
 *
 * The only changes it can make, and only ones you approved in the studio (signed in with your
 * Google account):
 *   - add a negative keyword to a campaign (plain words only, at most 20 a run);
 *   - add an image to a campaign (only your own photos from photos.momentsinlight.co.nz/ads/,
 *     JPEG under 5 MB, at most 5 a run, never past Google's 20 images).
 * It never removes anything, and never touches bids, budgets, ads or keywords. Every request is
 * signed with your key.
 */
var SITE = 'https://www.momentsinlight.co.nz';
var KEY = '__PASTE_KEY__';
var CHUNK = 1000;
var MAX_CHANGES = 20;
var MAX_IMAGES = 5;
var IMAGE_HOME = 'https://photos.momentsinlight.co.nz/ads/';

function main() {
  var state = call('/api/ads/state', {});
  if (!state) return;
  applyApproved(state.actions || []);
  if (!state.export_due) { Logger.log('Nothing to send this hour.'); return; }
  var end = new Date();
  var start = new Date(end.getTime() - (state.days || 30) * 86400000);
  var range = "segments.date BETWEEN '" + day(start) + "' AND '" + day(end) + "'";
  var errors = [];
  var full = {};
  (state.reports || []).forEach(function (rep) {
    try {
      var rows = [];
      var ids = [null];
      if (rep.per) {
        ids = [];
        var it = search(rep.per.query);
        while (it.hasNext()) ids.push(v(it.next(), rep.per.path));
      }
      ids.forEach(function (id) {
        var q = rep.query.split('{range}').join(range);
        if (id !== null) q = q.split('{id}').join(String(id).replace(/[^0-9]/g, ''));
        var it2 = search(q);
        while (it2.hasNext()) rows.push(shape(it2.next(), rep));
      });
      send(rep.report, rows);
      if (rep.report.indexOf('entity:') === 0 && !rep.keep) full[rep.report.slice(7)] = 1;
    } catch (e) {
      errors.push({ id: rep.report + ' ' + (errors.length + 1), error: String((e && e.message) || e) });
      Logger.log(rep.report + ' failed: ' + e);
    }
  });
  send('entity:script_error', errors.length ? errors : [{ id: 'none', error: '' }]);
  full.script_error = 1;
  call('/api/ads/ingest', { report: 'done', rows: Object.keys(full) });
  Logger.log('Sent. ' + (errors.length ? errors.length + ' report(s) failed: the studio has the details.' : 'All reports went.'));
}

// Changes you approved in the studio: negative keywords and images. Nothing else is ever changed.
function applyApproved(actions) {
  if (!actions.length) return;
  if (AdsApp.getExecutionInfo().isPreview()) { Logger.log(actions.length + ' approved change(s) waiting: a preview makes no changes, so click Run.'); return; }
  var results = [];
  var images = 0;
  actions.slice(0, MAX_CHANGES).forEach(function (a) {
    if (a.type === 'add_image') {
      if (images++ >= MAX_IMAGES) return; // the rest go next run
      results.push(addImage(a));
      return;
    }
    var r = { id: a.id, ok: false, error: '' };
    try {
      var p = a.payload || {};
      var text = String(p.text || '');
      if (a.type !== 'add_negative') throw new Error('Not a change this script makes.');
      if (!/^[a-z0-9][a-z0-9 '&.-]{0,79}$/i.test(text)) throw new Error('Plain words only.');
      var kw = p.match === 'EXACT' ? '[' + text + ']' : p.match === 'PHRASE' ? '"' + text + '"' : p.match === 'BROAD' ? text : null;
      if (!kw) throw new Error('Unknown match type.');
      var it = AdsApp.campaigns().withIds([Number(String(p.campaign_id).replace(/[^0-9]/g, ''))]).get();
      if (!it.hasNext()) throw new Error('Campaign not found.');
      it.next().createNegativeKeyword(kw);
      r.ok = true;
      Logger.log('Added negative ' + kw);
    } catch (e) {
      r.error = String((e && e.message) || e);
      Logger.log('Couldn\'t add negative "' + (a.payload && a.payload.text) + '": ' + r.error);
    }
    results.push(r);
  });
  call('/api/ads/ingest', { report: 'actions', rows: results });
}

// One of your photos, made in the studio, added to a campaign's images.
function addImage(a) {
  var r = { id: a.id, ok: false, error: '' };
  try {
    var p = a.payload || {};
    var url = String(p.url || '');
    var campaignId = String(p.campaign_id || '').replace(/[^0-9]/g, '');
    if (url.indexOf(IMAGE_HOME) !== 0) throw new Error('Not one of your photos, so it was skipped.');
    if (!campaignId) throw new Error('Which campaign?');
    var count = 0;
    var it = search('SELECT campaign_asset.resource_name FROM campaign_asset WHERE campaign.id = ' + campaignId + ' AND campaign_asset.field_type = AD_IMAGE AND campaign_asset.status = ENABLED');
    while (it.hasNext()) { it.next(); count++; }
    if (count >= 20) throw new Error('The campaign already has 20 images (Google’s limit). Remove one in Google Ads first.');
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Couldn’t fetch the photo (' + res.getResponseCode() + ').');
    var bytes = res.getContent();
    if (bytes.length > 5 * 1048576 || (bytes[0] & 255) !== 0xff || (bytes[1] & 255) !== 0xd8) throw new Error('Not a JPEG under 5 MB.');
    var made = AdsApp.mutate({ assetOperation: { create: { name: String(p.name || 'Moments in Light').slice(0, 100), type: 'IMAGE', imageAsset: { data: Utilities.base64Encode(bytes) } } } });
    if (!made.isSuccessful()) throw new Error(made.getErrorMessages().join('; '));
    var customer = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
    var linked = AdsApp.mutate({ campaignAssetOperation: { create: { asset: made.getResourceName(), campaign: 'customers/' + customer + '/campaigns/' + campaignId, fieldType: 'AD_IMAGE' } } });
    if (!linked.isSuccessful()) throw new Error(linked.getErrorMessages().join('; '));
    r.ok = true;
    r.asset = made.getResourceName();
    Logger.log('Added image ' + p.name);
  } catch (e) {
    r.error = String((e && e.message) || e);
    Logger.log('Couldn’t add image "' + (a.payload && a.payload.name) + '": ' + r.error);
  }
  return r;
}

// Only plain read queries are run.
function search(q) {
  if (!/^\s*SELECT\s/i.test(q) || /;/.test(q)) throw new Error('Not a read-only query, so it was skipped.');
  return AdsApp.search(q);
}

// A row as the studio asked for it: fields { name: 'path' } ("=text" for a fixed value, "list[].x" maps an array).
function shape(r, rep) {
  var out = {};
  for (var k in rep.fields) out[k] = v(r, rep.fields[k]);
  if (rep.id) out.id = rep.id.map(function (p) { return v(r, p); }).join('~');
  return out;
}
function v(obj, path) {
  if (path.charAt(0) === '=') return path.slice(1);
  var parts = path.split('.');
  for (var i = 0; i < parts.length; i++) {
    if (obj === null || obj === undefined) return null;
    var p = parts[i];
    if (p.slice(-2) === '[]') {
      var list = obj[p.slice(0, -2)] || [];
      var rest = parts.slice(i + 1).join('.');
      return list.map(function (x) { return rest ? v(x, rest) : x; });
    }
    obj = obj[p];
  }
  return obj === undefined ? null : obj;
}
function day(d) { return Utilities.formatDate(d, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd'); }

// ---- Talking to the studio (signed with your key) ----
function hex(bytes) {
  return bytes.map(function (b) { var x = (b + 256) % 256; return (x < 16 ? '0' : '') + x.toString(16); }).join('');
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
