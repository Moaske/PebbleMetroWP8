// ─── Metro WP8 companion JS ──────────────────────────────────────────────────
// Weather, air quality, pollen, music and the next calendar event all arrive
// from PLUGINS now; this file no longer fetches any of them itself. The only
// thing it still goes out for is the week-number CSV, which is the user's own
// file at the user's own URL.
//
// Steps, sleep, heart rate and watch battery are native on-watch
// (HealthService / battery_state_service) — the phone never touches those.

var Clay = require('@rebble/clay');
var clayConfig = require('./config.json');
var customClay = require('./custom-clay.js');
var messageKeys = require('message_keys');
// autoHandleEvents:false — we send AppMessages ourselves (accent needs
// converting from hex to R/G/B before the watch can use it, so Clay's
// built-in auto-send isn't enough on its own).
// customClay injects a live watchface preview at the top of the settings
// page that reacts to the accent/theme controls as they're changed — see
// custom-clay.js for why it has to be a fully self-contained function.
var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false });

// ─── AppMessage keys ──────────────────────────────────────────────────────────
// Pulled from the generated message_keys module (built from the
// "messageKeys" array in package.json) rather than hardcoded, so this stays
// correct even if that array's order ever changes.
// Steps and sleep have no phone-side keys — the watch reads them natively
// via HealthService. Battery is also read natively on-watch.

// How often to refresh weather/AQI while the watchface is active, in ms.
var REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Launch-time fetch throttle ──────────────────────────────────────────────
// PKJS is torn down and restarted every time the watchface launches, and a
// watchface relaunches every single time the user returns to it from another
// app. So the setInterval timers in the 'ready' handler are reset constantly
// and -- for anyone who glances at their watch more often than the interval --
// never fire at all, leaving the launch itself as the only thing that ever
// fetches. Five glances in a minute meant five weather calls, five AQI calls,
// five reverse-geocodes and five CSV downloads, every one of them over
// Bluetooth.
//
// localStorage survives that restart (it is already how savedSetting() reads
// Clay's settings back), so a timestamp there is enough to tell a genuine
// refresh from a redundant one. Stamps are written only on SUCCESS, so a
// failed fetch is retried on the next launch rather than suppressed.
// Only the week CSV is still ours to fetch -- weather, air and pollen are
// pushed by plugins on their own schedules now, so there is nothing left to
// throttle there. ('mt_last_weather' may linger in localStorage from an older
// build; it is simply never read again.)
var STAMP_WEEK_CSV = 'mt_last_weekcsv';

function fetchedRecently(key, ttlMs) {
  try {
    var t = parseInt(localStorage.getItem(key), 10);
    return !!t && (Date.now() - t) < ttlMs;
  } catch (e) {
    return false;        // no storage available -> behave exactly as before
  }
}

function markFetched(key) {
  try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
}

// ─── Week-number CSV ─────────────────────────────────────────────────────────
// The whole school year crosses to the watch in one go, not just the current
// week: the watch then formats the tile itself from its own ISO week number
// and keeps working with the phone out of range or switched off. Sending only
// today's label would go stale the moment a week rolled over while
// disconnected.
//
// Layout -- 1 version byte, then 3 bytes per ISO week 1..53, indexed by week:
//   byte 0  period, as a plain number (0 also means "no period")
//   byte 1  edu week code: 0 = blank, 1 = "V", 2 = "00", n >= 3 = decimal n-3
//   byte 2  first character of Info, ASCII; 0 = none
// 160 bytes in total, comfortably inside PERSIST_DATA_MAX_LENGTH (256) so the
// watch can persist it verbatim, and inside the 512-byte AppMessage inbox.
var WEEK_TABLE_WEEKS   = 53;
var WEEK_TABLE_STRIDE  = 3;
var WEEK_TABLE_VERSION = 1;
// The CSV is a school-year calendar -- it changes when he publishes a new one,
// not during the day. Once a day is plenty.
var WEEK_CSV_INTERVAL_MS = 24 * 60 * 60 * 1000;
var WEEK_CSV_MAX_BYTES   = 8 * 1024;

// ─── WMO weather code → icon index mapping ────────────────────────────────────
// Indices match WEATHER_ICONS[] in main.c
function wmoToIconIndex(code) {
  if (code === 0)                   return 0;  // clear sky
  if (code === 1)                   return 1;  // mainly clear
  if (code === 2)                   return 2;  // partly cloudy
  if (code === 3)                   return 3;  // overcast
  if (code >= 45 && code <= 48)     return 4;  // fog
  if (code === 51 || code === 56)   return 5;  // light drizzle / light freezing drizzle
  // 53 (moderate) and 55 (dense) drizzle get the RAIN icon rather than the
  // drizzle one. The codes are accurate -- Open-Meteo derives them from a
  // modelled precipitation rate -- but a steady spell of real rain often
  // sits just under their rain threshold and comes back as 53, which then
  // showed a drizzle icon while it was plainly raining outside. Dense
  // drizzle reads as rain to anyone standing in it.
  if (code === 53 || code === 55 || code === 57) return 6;  // moderate/dense drizzle
  if (code >= 61 && code <= 65)     return 6;  // rain
  if (code >= 80 && code <= 82)     return 7;  // heavy rain / showers
  if (code >= 66 && code <= 67)     return 8;  // freezing rain
  if (code >= 71 && code <= 75)     return 9;  // snow
  if (code === 77 || code === 85 || code === 86) return 10; // heavy snow
  if (code >= 95 && code <= 96)     return 11; // thunderstorm
  if (code >= 97 && code <= 99)     return 12; // thunderstorm + hail
  return 2; // default: partly cloudy
}

// ─── Hex colour → R,G,B 0–255 ────────────────────────────────────────────────
function hexToRGB(hex) {
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16)
  };
}

// ─── "YYYY-MM-DD" -> days since 1970-01-01 ───────────────────────────────────
// Sent as a plain integer so the watch never has to parse a date string.
// Date.UTC (not local) keeps the day number stable regardless of the phone's
// timezone -- it is a calendar date, not an instant.
function dateToDayNumber(s) {
  if (!s) return -1;
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s).trim());
  if (!m) return -1;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

// ─── Plugin sources ───────────────────────────────────────────────────────────
// Weather, air quality and pollen now come from the plugin system instead of
// this file fetching Open-Meteo itself.
//
// The weather subscription deliberately does NOT name a plugin, so it resolves
// to whatever provider the user chose in the Pebble app. We still ASK for
// wmo_code: OpenMeteo answers it and we get all 13 weather icons, anyone else
// leaves it out and we fall back to the 9-value condition_code. A property the
// source doesn't declare is simply dropped, so asking costs nothing.
//
// Air quality and pollen have no shared vocabulary, so those two name the
// OpenMeteo plugin outright -- nothing else serves them.
var OPENMETEO_UUID = '25dadbd3-f061-44c3-b6c2-5d657aa9d2d0';

// Which plugin-backed tiles can actually be shown. The watch gets this as a
// bitmask so it can draw a sensible blank, and custom-clay.js reads the same
// facts out of localStorage to drop unavailable tiles from the picker.
var AVAIL_WEATHER = 1, AVAIL_AIR = 2, AVAIL_POLLEN = 4, AVAIL_MUSIC = 8, AVAIL_CAL = 16;
var AVAIL_KEY = 'mt_tile_avail';

// Must match TEMP_UNKNOWN in main.c. Sent in place of an apparent temperature
// to mean "there isn't one", which is how the feels-like toggle reaches the
// watch without main.c knowing a setting exists.
var TEMP_UNKNOWN = -999;
var avail = 0;
// Whether `avail` is an answer at all. false means enumeratePlugins() could
// not be consulted, which the settings page has to tell apart from "nothing
// installed" -- it hides options on the strength of this.
var availKnown = false;

function setAvail(bit, on) {
  var next = on ? (avail | bit) : (avail & ~bit);
  if (next === avail) return;
  avail = next;
  try { localStorage.setItem(AVAIL_KEY, String(avail)); } catch (e) {}
  var m = {}; m[messageKeys.TILE_AVAIL] = avail;
  Pebble.sendAppMessage(m, null, function (err) {
    console.log('TILE_AVAIL send failed: ' + JSON.stringify(err));
  });
}

// ─── Reading a property out of a source update ───────────────────────────────
// Every value arrives as { <shapeName>: { ... } }. A property that is absent
// means "no data" -- never a zero -- so each reader returns null instead of
// inventing a value.
function propNum(props, name) {
  var p = props && props[name];
  var v = p && p.numericValue && p.numericValue.value;
  return (typeof v === 'number' && !isNaN(v)) ? v : null;
}
function propText(props, name) {
  var p = props && props[name];
  if (p && p.shortText && typeof p.shortText.text === 'string') return p.shortText.text;
  if (p && p.longText && typeof p.longText.text === 'string') return p.longText.text;
  return null;
}
function propBool(props, name) {
  var p = props && props[name];
  var v = p && p.boolean && p.boolean.value;
  return (typeof v === 'boolean') ? v : null;
}
function propTime(props, name) {
  var p = props && props[name];
  var v = p && p.timestamp && p.timestamp.value;
  return (typeof v === 'number' && !isNaN(v)) ? v : null;
}

// Temperatures: numericValue is ALWAYS Celsius, and only the text shapes carry
// the unit the user picked in the Pebble app. So the figure and the unit both
// come out of shortText ("18°C" / "64°F"), which is what lets the temperature
// setting disappear from our own settings page.
function tempFromText(props, name) {
  var t = propText(props, name);
  if (t === null) return null;
  var m = /(-?\d+)/.exec(t);
  return m ? parseInt(m[1], 10) : null;
}
function tempUnitFromText(props, name) {
  var t = propText(props, name);
  return (t && t.indexOf('F') >= 0) ? 1 : 0;   // matches TEMP_UNIT in main.c
}

// ─── Beaufort ────────────────────────────────────────────────────────────────
// wind_speed's numericValue is metres per second whatever the user's unit is,
// and the Beaufort scale is defined in m/s, so this converts from the canonical
// figure rather than from an already-rounded km/h one.
// Bounds are each force's exclusive upper limit, WMO scale.
function msToBeaufort(ms) {
  var bounds = [0.5, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  for (var b = 0; b < bounds.length; b++) {
    if (ms < bounds[b]) return b;
  }
  return 12;
}

// Which unit string main.c should append. Must stay in step with WindUnit there.
var WIND_KMH = 0, WIND_MPH = 1, WIND_BFT_CODE = 2, WIND_MS = 3, WIND_KNOTS = 4;
function windUnitCode(text) {
  if (!text) return WIND_KMH;
  if (text.indexOf('mph') >= 0)   return WIND_MPH;
  if (text.indexOf('knot') >= 0)  return WIND_KNOTS;
  if (text.indexOf('m/s') >= 0)   return WIND_MS;
  return WIND_KMH;
}

// ─── Sunrise/sunset: unix seconds -> minutes since local midnight ────────────
// The OpenMeteo plugin publishes utc_offset in MINUTES (unit: 'min'), not
// seconds. Nothing obliges another provider to agree, so the unit is read when
// it is given and inferred from magnitude otherwise: a real offset never
// exceeds 14 hours, which is 840 as minutes but 50400 as seconds, so the two
// ranges cannot be confused.
function offsetSeconds(props) {
  var p = props && props['utc_offset'];
  var nv = p && p.numericValue;
  var v = nv && nv.value;
  if (typeof v !== 'number' || isNaN(v)) return null;
  var u = nv.unit;
  if (u === 's' || u === 'sec' || u === 'seconds') return v;
  if (u === 'min' || u === 'm' || u === 'minutes') return v * 60;
  return (Math.abs(v) <= 900) ? v * 60 : v;
}

// Open-Meteo's unixtime values are true GMT instants even with timezone=auto,
// so the offset has to be added to get local wall time. utc_offset is the
// LOCATION's, not the phone's, which matters whenever the two differ.
function tsToLocalMinutes(ts, offsetSec) {
  if (ts === null) return -1;
  if (typeof offsetSec !== 'number') {
    // The source gave no offset -- the built-in weather plugin does not
    // publish one. The phone's own timezone is the right stand-in: it is
    // correct whenever the weather location is where you are standing, which
    // is the ordinary case, and Date() applies it without us naming it.
    var d = new Date(ts * 1000);
    return d.getHours() * 60 + d.getMinutes();
  }
  var mins = Math.floor((ts + offsetSec) / 60) % 1440;
  return mins < 0 ? mins + 1440 : mins;
}

// ─── Reading the slot of a series that covers right now ──────────────────────
// A series shape carries the instant its first value describes and the step
// between values; it does NOT begin at the current hour. Open-Meteo's hourly
// block starts at local midnight, so slot 0 is midnight's figure and would sit
// there unchanged all day.
function seriesNow(props, name) {
  var s = props && props[name] && props[name].series;
  var vals = s && s.numericValue && s.numericValue.values;
  if (!vals || !vals.length) return null;
  var i = 0;
  if (typeof s.start === 'number' && typeof s.stepSec === 'number' && s.stepSec > 0) {
    i = Math.floor((Date.now() / 1000 - s.start) / s.stepSec);
    if (i < 0) i = 0;
    if (i >= vals.length) i = vals.length - 1;
  }
  var v = vals[i];
  return (typeof v === 'number' && !isNaN(v)) ? v : null;
}

// ─── condition_code -> the same icon indices wmoToIconIndex() produces ───────
// Only used when the chosen provider has no wmo_code. The nine shared values
// cannot express fog, drizzle, freezing rain or thunder, so those all land on
// their nearest neighbour and the tile loses some detail -- which is the cost
// of letting the user pick a provider other than OpenMeteo.
function conditionCodeToIconIndex(code) {
  switch (code) {
    case 'sun':           return 0;
    case 'partly_cloudy': return 2;
    case 'cloudy':        return 3;
    case 'light_rain':    return 6;
    case 'heavy_rain':    return 7;
    case 'light_snow':    return 9;
    case 'heavy_snow':    return 10;
    case 'rain_and_snow': return 8;
    default:              return 2;
  }
}

// ─── Phone battery ────────────────────────────────────────────────────────────
// Not a Pebble API — this is the standard HTML5 Battery Status API
// (navigator.getBattery() / the older navigator.battery). It's deprecated
// on the open web (most browsers dropped it around 2016 over fingerprinting
// concerns), but PebbleKit JS's own runtime isn't a regular browser tab and
// has historically supported it — same approach other Pebble companion
// apps have used to report phone battery to the watch.
function sendPhoneBattery(battery) {
  var pct = Math.round(battery.level * 100);
  var msg = {};
  msg[messageKeys.PHONE_BATTERY] = pct;
  msg[messageKeys.PHONE_CHARGING] = battery.charging ? 1 : 0;
  Pebble.sendAppMessage(msg, function() {
    console.log('Phone battery sent: ' + pct + '% charging=' + battery.charging);
  }, function(e) {
    console.log('Phone battery send failed: ' + JSON.stringify(e));
  });
}

function initPhoneBattery() {
  function attach(battery) {
    sendPhoneBattery(battery); // send once immediately
    battery.addEventListener('levelchange', function() { sendPhoneBattery(battery); });
    battery.addEventListener('chargingchange', function() { sendPhoneBattery(battery); });
  }

  if (navigator.getBattery) {
    navigator.getBattery().then(attach, function() {
      console.log('Phone battery: getBattery() promise rejected');
    });
  } else if (navigator.battery) {
    attach(navigator.battery);
  } else {
    console.log('Phone battery: Battery Status API not available in this runtime');
  }
}

// ─── Week-number CSV: parse, encode, send ────────────────────────────────────
// parseCsv and findColumn are lifted from the EduWeek app, which reads the
// same file -- keeping them identical means the two can never disagree about
// what a given CSV says. Both handle the things Excel actually emits: a UTF-8
// BOM, CRLF endings, quoted fields, and ";" as the separator in locales where
// Excel uses it.
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  var firstLine = text.split(/\r?\n/)[0] || '';
  var sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

  var rows = [], row = [], field = '', inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (inQuotes) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text.charAt(i + 1) === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function(r) { return r.join('').trim() !== ''; });
}

function findColumn(headers, names, fallback) {
  for (var i = 0; i < headers.length; i++) {
    if (names.indexOf(headers[i].trim().toLowerCase()) >= 0) return i;
  }
  return fallback;
}

// Returns the byte array described above, or null if the CSV yielded nothing
// usable -- in which case the watch keeps whatever table it already has.
function buildWeekTable(csvText) {
  var table = parseCsv(csvText);
  if (table.length < 2) return null;

  var hdr = table[0];
  var cWeek   = findColumn(hdr, ['iso week', 'isoweek', 'week', 'iso'], 0);
  var cPeriod = findColumn(hdr, ['period'], 1);
  var cEdu    = findColumn(hdr, ['edu week', 'eduweek', 'edu'], 2);
  var cInfo   = findColumn(hdr, ['info', 'note', 'notes'], 3);

  var buf = [WEEK_TABLE_VERSION];
  for (var i = 0; i < WEEK_TABLE_WEEKS * WEEK_TABLE_STRIDE; i++) buf.push(0);

  var filled = 0;
  for (var r = 1; r < table.length; r++) {
    var row = table[r];
    var iso = parseInt((row[cWeek] || '').trim(), 10);
    if (!(iso >= 1 && iso <= WEEK_TABLE_WEEKS)) continue;
    var o = 1 + (iso - 1) * WEEK_TABLE_STRIDE;

    var period = parseInt((row[cPeriod] || '').trim(), 10);
    buf[o] = (period >= 0 && period <= 255) ? period : 0;

    // "V" and "00" are their own codes because both must render back exactly
    // as written -- "00" is not the same string as "0", and V marks a holiday.
    var edu = (row[cEdu] || '').trim(), code = 0;
    if (edu.toUpperCase() === 'V') code = 1;
    else if (edu === '00')         code = 2;
    else {
      var n = parseInt(edu, 10);
      if (!isNaN(n) && n >= 0 && n <= 252) code = n + 3;
    }
    buf[o + 1] = code;

    var info = (row[cInfo] || '').trim();
    buf[o + 2] = info ? (info.charCodeAt(0) & 0x7F) : 0;
    filled++;
  }
  console.log('Week CSV: ' + filled + ' of ' + (table.length - 1) + ' rows encoded');
  return filled ? buf : null;
}

// Clay only hands settings to webviewclosed; everywhere else they have to come
// back out of the localStorage copy it writes. Keys there are the numeric
// messageKey ids, with the name as a fallback for older stored blobs.
// `dflt` is returned when the user has never saved settings at all, which is
// the normal state on a fresh install -- without it a toggle that ships ON
// would read as OFF until the first visit to the config page.
function savedSetting(numericKey, name, dflt) {
  try {
    var s = JSON.parse(localStorage.getItem('clay-settings')) || {};
    var v = s[numericKey];
    if (v === undefined) v = s[name];
    return v === undefined ? dflt : v;
  } catch (e) {
    return dflt;
  }
}

// Copying a file's address out of the GitHub UI gives you the /blob/ page --
// 200+ KB of HTML wrapping the file, not the file. Fetching that also goes
// through github.com proper, which rate-limits far more readily than the raw
// host does (it answers a burst with 429). Rewriting it is mechanical, so do
// that rather than making the user know the difference.
//   https://github.com/U/R/blob/main/path.csv
//     -> https://raw.githubusercontent.com/U/R/main/path.csv
function normalizeCsvUrl(url) {
  var m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/i.exec(url);
  if (m) {
    return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' +
           m[3].split('?')[0].split('#')[0];
  }
  // A gist page likewise needs /raw to give up the file itself.
  m = /^https?:\/\/gist\.github\.com\/([^/]+)\/([0-9a-f]+)\/?$/i.exec(url);
  if (m) return 'https://gist.githubusercontent.com/' + m[1] + '/' + m[2] + '/raw';
  return url;
}

function refreshWeekTable() {
  if (!savedSetting(messageKeys.week_use_csv, 'week_use_csv')) return;
  var raw = (savedSetting(messageKeys.week_csv_url, 'week_csv_url') || '').trim();
  if (!raw) return;
  var url = normalizeCsvUrl(raw);
  if (url !== raw) console.log('Week CSV: using raw URL ' + url);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (xhr.readyState !== 4 || xhr.status !== 200) {
      console.log('Week CSV fetch failed: status ' + xhr.status +
                  (xhr.status === 429 ? ' (rate limited - use the raw.githubusercontent.com link)' : ''));
      return;   // keep whatever the watch already has
    }
    var text = xhr.responseText || '';
    // An HTML page parses as "CSV" perfectly happily and yields garbage, so
    // catch it by shape and say what is actually wrong.
    if (/^\s*[<]/.test(text)) {
      console.log('Week CSV: that URL returned an HTML page, not a CSV. ' +
                  'Open the file on GitHub and use the "Raw" button\'s link.');
      return;
    }
    if (text.length > WEEK_CSV_MAX_BYTES) {
      console.log('Week CSV too large (' + text.length + ' chars) - ignored');
      return;
    }
    try {
      var buf = buildWeekTable(text);
      if (!buf) { console.log('Week CSV had no usable rows'); return; }
      var msg = {};
      msg[messageKeys.WEEK_TABLE] = buf;
      Pebble.sendAppMessage(msg, function() {
        markFetched(STAMP_WEEK_CSV);
        console.log('Week table sent: ' + buf.length + ' bytes');
      }, function(e) {
        console.log('Week table send failed: ' + JSON.stringify(e));
      });
    } catch (e) {
      console.log('Week CSV parse error: ' + e.message);
    }
  };
  xhr.onerror = function() { console.log('Week CSV fetch error'); };
  xhr.send();
}


// ─── Subscriptions ───────────────────────────────────────────────────────────
// A subscription is live for as long as PKJS is, which is as long as the
// watchface is. Nothing here polls: the plugin pushes when its data changes,
// and suggestedRefreshIntervalSec on each source decides how often that is
// (30 min for weather, an hour for air and pollen).
//
// A missing plugin fails ONCE with PLUGIN_UNAVAILABLE and no subscription is
// created, so there is nothing to retry. That is fine: PKJS restarts every time
// the watchface relaunches, so this all runs again the next time the user looks
// at their watch -- which is also when a newly installed plugin starts working.
var subs = [];

function subscribe(cfg) {
  try {
    subs.push(Pebble.subscribeToSource(cfg));
  } catch (e) {
    console.log('subscribe ' + cfg.category + '/' + cfg.item + ' threw: ' + e);
  }
}

function sendMsg(msg, what) {
  Pebble.sendAppMessage(msg, function () {
    console.log(what);
  }, function (err) {
    console.log(what + ' FAILED: ' + JSON.stringify(err));
  });
}

function onSourceError(what, bit) {
  return function (err) {
    var code = err && err.code;
    if (code === 'PLUGIN_UNAVAILABLE') {
      console.log(what + ': no plugin installed');
    } else if (code === 'PERMISSION_DENIED') {
      // Either the user said no, or this build is still a legacy app. The
      // second case is a packaging mistake, not a user choice, so say so.
      console.log(what + ': permission denied (' + (err.message || '') + ')');
    } else {
      console.log(what + ' error ' + code + ': ' + (err && err.message));
    }
    if (bit) setAvail(bit, false);
  };
}

// ─── weather/location ────────────────────────────────────────────────────────
// The last properties are kept so the Beaufort toggle can take effect at once.
// Flipping it changes how an unchanged wind speed is expressed, and the source
// would not push again for another half hour, so the settings page re-runs this
// mapping over the figures we already have.
var lastWeatherProps = null;

function subscribeWeather() {
  subscribe({
    category: 'weather',
    item: 'location',
    // No `plugin` here on purpose: the user's chosen provider answers this.
    properties: ['name', 'temperature', 'feels_like', 'high', 'low',
                 'condition_code', 'wmo_code', 'is_day', 'uv_index',
                 'wind_speed', 'wind_direction',
                 // Scalar first, series as the fallback -- see the read below.
                 'precipitation', 'hourly_precipitation',
                 'sunrise', 'sunset', 'utc_offset'],
    onData: function (data) {
      var inst = data && data.instances && data.instances[0];
      if (!inst) return;
      lastWeatherProps = inst.properties || {};
      setAvail(AVAIL_WEATHER, true);
      applyWeather(lastWeatherProps);
    },
    onError: onSourceError('Weather', AVAIL_WEATHER)
  });
}

function applyWeather(p) {
      var msg = {};

      // Icon: prefer the real WMO code, fall back to the shared vocabulary.
      var wmo = propNum(p, 'wmo_code');
      if (wmo !== null) {
        msg[messageKeys.WEATHER_CODE] = wmoToIconIndex(wmo);
      } else {
        var cc = propText(p, 'condition_code');
        if (cc !== null) msg[messageKeys.WEATHER_CODE] = conditionCodeToIconIndex(cc);
      }

      var isDay = propBool(p, 'is_day');
      if (isDay !== null) msg[messageKeys.IS_DAY] = isDay ? 1 : 0;

      var cur = tempFromText(p, 'temperature');
      var hi  = tempFromText(p, 'high');
      var lo  = tempFromText(p, 'low');
      var fl  = tempFromText(p, 'feels_like');
      if (cur !== null) msg[messageKeys.TEMP_CURRENT] = cur;
      if (hi  !== null) msg[messageKeys.TEMP_HIGH]    = hi;
      if (lo  !== null) msg[messageKeys.TEMP_LOW]     = lo;
      if (fl  !== null) msg[messageKeys.FEELS_LIKE]   = fl;
      // The unit rides along with the figures rather than coming from our
      // settings page, which no longer asks.
      msg[messageKeys.TEMP_UNIT] = tempUnitFromText(p, 'temperature');

      var uv = propNum(p, 'uv_index');
      if (uv !== null) msg[messageKeys.UV_INDEX] = Math.round(uv * 10);

      // Wind: numericValue is m/s, shortText is the user's unit. Beaufort is
      // computed from the m/s figure; otherwise pass through whatever unit the
      // user picked in the Pebble app and tell main.c which suffix to draw.
      var ms = propNum(p, 'wind_speed');
      if (ms !== null) {
        if (savedSetting(messageKeys.wind_bft_toggle, 'wind_bft_toggle')) {
          msg[messageKeys.WIND_SPEED] = msToBeaufort(ms);
          msg[messageKeys.WIND_UNIT]  = WIND_BFT_CODE;
        } else {
          var txt = propText(p, 'wind_speed');
          var m = txt && /(-?\d+)/.exec(txt);
          msg[messageKeys.WIND_SPEED] = m ? parseInt(m[1], 10) : Math.round(ms * 3.6);
          msg[messageKeys.WIND_UNIT]  = windUnitCode(txt);
        }
      }
      var dir = propNum(p, 'wind_direction');
      if (dir !== null) msg[messageKeys.WIND_DIR] = Math.round(dir);

      // 'precipitation' is the standard scalar: the chance of rain for the
      // hour we are in, already picked out by the source, so it works whoever
      // the provider is. The series is only the fallback, and it has to be
      // indexed -- taking slot 0 pinned the tile to midnight's figure for the
      // whole day. (hourly_precipitation_amount is the millimetres one.)
      // Feels-like is suppressed on the PHONE rather than on the watch: the
      // watch already treats TEMP_UNKNOWN as "no apparent temperature" and
      // hides the bracket on both the wide and the small tile, so one sentinel
      // drives both and main.c needs to know nothing about the setting. It has
      // to be SENT rather than merely withheld, or the watch would go on
      // showing the value it last persisted.
      if (!savedSetting(messageKeys.feels_like_toggle, 'feels_like_toggle', true)) {
        msg[messageKeys.FEELS_LIKE] = TEMP_UNKNOWN;
      }

      var pop = propNum(p, 'precipitation');
      if (pop === null) pop = seriesNow(p, 'hourly_precipitation');
      if (pop !== null) msg[messageKeys.PRECIP_PROB] = Math.round(pop);

      var off = offsetSeconds(p);
      var rise = tsToLocalMinutes(propTime(p, 'sunrise'), off);
      var set  = tsToLocalMinutes(propTime(p, 'sunset'),  off);
      if (rise >= 0) msg[messageKeys.SUNRISE_MIN] = rise;
      if (set  >= 0) msg[messageKeys.SUNSET_MIN]  = set;

      var name = propText(p, 'name');
      if (name) msg[messageKeys.LOCATION] = name;

      sendMsg(msg, 'Weather: ' + (name || '?') + ' ' + cur + ' wmo=' + wmo);
}

/** Restate the figures we already hold -- used when a setting changes them. */
function resendWeather() {
  if (lastWeatherProps) applyWeather(lastWeatherProps);
}

// ─── air/quality (OpenMeteo only) ────────────────────────────────────────────
function subscribeAir() {
  subscribe({
    plugin: OPENMETEO_UUID,
    category: 'air',
    item: 'quality',
    properties: ['european_aqi', 'ozone'],
    onData: function (data) {
      var inst = data && data.instances && data.instances[0];
      if (!inst) return;
      var p = inst.properties || {};
      var aqi = propNum(p, 'european_aqi');
      var o3  = propNum(p, 'ozone');
      setAvail(AVAIL_AIR, aqi !== null);
      var msg = {};
      if (aqi !== null) msg[messageKeys.AQI]   = Math.round(aqi);
      if (o3  !== null) msg[messageKeys.OZONE] = Math.round(o3);
      if (aqi !== null || o3 !== null) sendMsg(msg, 'Air: aqi=' + aqi + ' o3=' + o3);
    },
    onError: onSourceError('Air quality', AVAIL_AIR)
  });
}

// ─── pollen/forecast (OpenMeteo only, Europe only, in season) ────────────────
function subscribePollen() {
  subscribe({
    plugin: OPENMETEO_UUID,
    category: 'pollen',
    item: 'forecast',
    properties: ['available', 'tier'],
    onData: function (data) {
      var inst = data && data.instances && data.instances[0];
      if (!inst) return;
      var p = inst.properties || {};
      // `available` is false outside Europe and out of season, and the tier
      // properties are then absent entirely. Both have to agree before the
      // tile is worth offering.
      var ok = propBool(p, 'available') === true;
      var tier = propNum(p, 'tier');
      setAvail(AVAIL_POLLEN, ok && tier !== null);
      var msg = {};
      msg[messageKeys.POLLEN_OK] = (ok && tier !== null) ? 1 : 0;
      if (tier !== null) msg[messageKeys.POLLEN_TIER] = Math.round(tier);
      sendMsg(msg, 'Pollen: available=' + ok + ' tier=' + tier);
    },
    onError: onSourceError('Pollen', AVAIL_POLLEN)
  });
}

// ─── music/track (built-in, Android only) ────────────────────────────────────
function subscribeMusic() {
  subscribe({
    category: 'music',
    item: 'track',
    properties: ['title', 'artist', 'playing'],
    onData: function (data) {
      var inst = data && data.instances && data.instances[0];
      var p = (inst && inst.properties) || {};
      var title  = propText(p, 'title');
      var artist = propText(p, 'artist');
      var playing = propBool(p, 'playing');
      setAvail(AVAIL_MUSIC, true);
      var msg = {};
      msg[messageKeys.MUSIC_TITLE]   = title  || '';
      msg[messageKeys.MUSIC_ARTIST]  = artist || '';
      msg[messageKeys.MUSIC_PLAYING] = (playing === false) ? 0 : (title ? 1 : 0);
      sendMsg(msg, 'Music: ' + (title || '(nothing)') + ' / ' + (artist || ''));
    },
    onError: onSourceError('Music', AVAIL_MUSIC)
  });
}

// ─── calendar/event (built-in) ───────────────────────────────────────────────
function subscribeCalendar() {
  subscribe({
    category: 'calendar',
    item: 'event',
    properties: ['name', 'starts_at', 'ends_at', 'all_day'],
    limit: 1,          // instances come soonest-first, so one is the next event
    onData: function (data) {
      var inst = data && data.instances && data.instances[0];
      setAvail(AVAIL_CAL, true);
      var msg = {};
      if (!inst) {
        msg[messageKeys.CAL_TIMES] = '';
        msg[messageKeys.CAL_TITLE] = '';
        sendMsg(msg, 'Calendar: nothing upcoming');
        return;
      }
      var p = inst.properties || {};
      var title = propText(p, 'name') || '';
      var times;
      if (propBool(p, 'all_day') === true) {
        times = 'All day';
      } else {
        // starts_at/ends_at both offer shortText already formatted as a clock
        // time by the plugin, which saves guessing at the user's 12/24h choice.
        var a = propText(p, 'starts_at');
        var b = propText(p, 'ends_at');
        times = a ? (b ? a + '-' + b : a) : '';
      }
      msg[messageKeys.CAL_TIMES] = times;
      msg[messageKeys.CAL_TITLE] = title;
      sendMsg(msg, 'Calendar: ' + times + ' ' + title);
    },
    onError: onSourceError('Calendar', AVAIL_CAL)
  });
}

// ─── What is actually installed ──────────────────────────────────────────────
// enumeratePlugins() tells us up front, so the settings page can drop tiles the
// user could never fill. The subscriptions below still carry their own error
// handling: a plugin can be disabled between this call and the data arriving.
function detectPlugins() {
  var found = 0;
  availKnown = false;
  try {
    var list = Pebble.enumeratePlugins() || [];
    availKnown = true;
    for (var i = 0; i < list.length; i++) {
      var srcs = list[i].sources || [];
      for (var j = 0; j < srcs.length; j++) {
        var cat = srcs[j].category, items = srcs[j].items || [];
        if (cat === 'weather'  && items.indexOf('location') >= 0) found |= AVAIL_WEATHER;
        if (cat === 'air'      && items.indexOf('quality')  >= 0) found |= AVAIL_AIR;
        if (cat === 'pollen'   && items.indexOf('forecast') >= 0) found |= AVAIL_POLLEN;
        if (cat === 'music'    && items.indexOf('track')    >= 0) found |= AVAIL_MUSIC;
        if (cat === 'calendar' && items.indexOf('event')    >= 0) found |= AVAIL_CAL;
      }
    }
  } catch (e) {
    // Legacy builds get nothing back and every request fails; treat that as
    // "no plugins" rather than crashing the launch.
    console.log('enumeratePlugins unavailable: ' + e);
  }

  if (availKnown) {
    avail = found;
    try { localStorage.setItem(AVAIL_KEY, String(avail)); } catch (e) {}
  } else {
    // The call itself failed, which is not the same as "nothing installed".
    // Fall back to whatever a previous successful run recorded rather than
    // telling the watch and the settings page that every source vanished --
    // a stale answer beats a confidently wrong one. It stays 0 on a runtime
    // that has never managed the call, which is the right answer there.
    try { avail = parseInt(localStorage.getItem(AVAIL_KEY), 10) || 0; }
    catch (e) { avail = 0; }
  }

  var m = {}; m[messageKeys.TILE_AVAIL] = avail;
  sendMsg(m, 'Plugins available: 0b' + avail.toString(2) +
             (availKnown ? '' : ' (from cache -- enumeratePlugins failed)'));
  return avail;
}

function subscribeAll() {
  subscribeWeather();
  subscribeAir();
  subscribePollen();
  subscribeMusic();
  subscribeCalendar();
}


// ─── Pebble event listeners ───────────────────────────────────────────────────
Pebble.addEventListener('showConfiguration', function() {
  // Hand the settings page what the phone found installed, so it can drop
  // tiles the user could never fill. clay.meta is serialised into the page by
  // generateUrl() at the moment it is called, and userData is the field Clay
  // reserves for exactly this -- it cannot go through localStorage, because
  // the config page is a webview on its own origin and shares nothing with
  // this sandbox.
  clay.meta.userData = { avail: avail, known: availKnown };
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('ready', function() {
  console.log('PebbleKit JS ready');

  // Weather, air quality, pollen, music and calendar are all pushed by plugins
  // now, so there is no launch-time fetch to throttle and no interval to run:
  // each source refreshes on its own schedule for as long as we're subscribed.
  detectPlugins();
  subscribeAll();

  // The week table is still ours to fetch, and still worth skipping: the watch
  // persists it (PERSIST_WEEK_TABLE) and restores it in init(), so it already
  // has the labels before the phone says a word. Only a genuinely newer CSV
  // matters -- plus webviewclosed, which refetches unconditionally whenever the
  // settings change.
  if (fetchedRecently(STAMP_WEEK_CSV, WEEK_CSV_INTERVAL_MS)) {
    console.log('Week CSV: last fetch still fresh, skipping (watch has it persisted)');
  } else {
    refreshWeekTable();
  }
  setInterval(refreshWeekTable, WEEK_CSV_INTERVAL_MS);

  initPhoneBattery();
});

Pebble.addEventListener('appmessage', function(e) {
  console.log('Message from watch: ' + JSON.stringify(e.payload));
});

// Settings page closed — Clay's own auto-handling is off, so we read the
// response ourselves, convert accent hex -> RGB, and send everything the
// watch actually needs in one AppMessage.
Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) {
    return; // user cancelled without saving
  }

  var settings  = clay.getSettings(e.response); // keyed by numeric messageKey
  var hex       = settings[messageKeys.accent_color] || '#5500FF';
  var theme     = settings[messageKeys.theme_select];       // 'dark' or 'light'
  var dateOrder = settings[messageKeys.date_order_select];  // 'DMY' or 'MDY'
  var rgb       = hexToRGB(hex);

  // Clay select values are strings; the watch wants numeric ContentIds.
  // parseInt with a fallback keeps a missing/malformed value from being
  // sent as NaN.
  function intSetting(key, dflt) {
    var v = parseInt(settings[key], 10);
    return isNaN(v) ? dflt : v;
  }
  var tileA     = intSetting(messageKeys.tile_a_select, 0);
  var tileB     = intSetting(messageKeys.tile_b_select, 1);
  var tileC     = intSetting(messageKeys.tile_c_select, 2);
  var tileD     = intSetting(messageKeys.tile_d_select, 12);
  var wide      = intSetting(messageKeys.wide_slot_select, 0);   // 0 weather, 1 music, 2 calendar
  var useCsv    = !!settings[messageKeys.week_use_csv];
  var weekRefDn = dateToDayNumber(settings[messageKeys.week_ref_date]);
  var bft       = !!settings[messageKeys.wind_bft_toggle];

  var msg = {};
  msg[messageKeys.ACCENT_R] = rgb.r;
  msg[messageKeys.ACCENT_G] = rgb.g;
  msg[messageKeys.ACCENT_B] = rgb.b;
  msg[messageKeys.THEME]      = (theme === 'light') ? 1 : 0;
  msg[messageKeys.DATE_ORDER] = (dateOrder === 'MDY') ? 1 : 0;
  msg[messageKeys.TILE_A]     = tileA;
  msg[messageKeys.TILE_B]     = tileB;
  msg[messageKeys.TILE_C]     = tileC;
  msg[messageKeys.TILE_D]     = tileD;
  msg[messageKeys.WIDE_SLOT]  = wide;
  msg[messageKeys.WIND_BFT]   = bft ? 1 : 0;
  // TEMP_UNIT is no longer a setting: it rides in with the weather figures,
  // because only the provider knows which unit the user picked in the app.
  // Only one offset source is live at a time. Sending WEEK_SRC lets the watch
  // fall back to the date calculation the moment the toggle goes off, without
  // having to clear the stored table.
  msg[messageKeys.WEEK_SRC] = useCsv ? 1 : 0;
  if (weekRefDn >= 0) msg[messageKeys.WEEK_REF_DN] = weekRefDn;

  Pebble.sendAppMessage(msg, function() {
    console.log('Settings sent: accent=' + hex + ' theme=' + theme +
                ' dateOrder=' + dateOrder +
                ' tiles=' + tileA + '/' + tileB + '/' + tileC + '/' + tileD +
                ' wide=' + wide + ' bft=' + bft +
                ' weekRefDn=' + weekRefDn);
  }, function(err) {
    console.log('Settings send failed: ' + JSON.stringify(err));
  });

  // The Beaufort toggle changes how an unchanged wind speed is expressed, and
  // the weather source would not push again for up to half an hour, so restate
  // what we already hold. Nothing else needs a nudge: their data did not change
  // just because the settings page closed.
  resendWeather();
  refreshWeekTable();   // picks up a changed URL, or a freshly enabled CSV
});