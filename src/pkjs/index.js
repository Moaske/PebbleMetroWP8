// ─── MetroTime companion JS ──────────────────────────────────────────────────
// Fetches: Open-Meteo (weather + AQI). Steps/sleep/battery are native on-watch
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

// ─── WMO weather code → icon index mapping ────────────────────────────────────
// Indices match WEATHER_ICONS[] in main.c
function wmoToIconIndex(code) {
  if (code === 0)                   return 0;  // clear sky
  if (code === 1)                   return 1;  // mainly clear
  if (code === 2)                   return 2;  // partly cloudy
  if (code === 3)                   return 3;  // overcast
  if (code >= 45 && code <= 48)     return 4;  // fog
  if (code >= 51 && code <= 57)     return 5;  // drizzle
  if (code >= 61 && code <= 65)     return 6;  // rain
  if (code >= 80 && code <= 82)     return 7;  // heavy rain / showers
  if (code >= 66 && code <= 67)     return 8;  // freezing rain
  if (code >= 71 && code <= 75)     return 9;  // snow
  if (code === 77 || code === 85 || code === 86) return 10; // heavy snow
  if (code >= 95 && code <= 96)     return 11; // thunderstorm
  if (code >= 97 && code <= 99)     return 12; // thunderstorm + hail
  return 2; // default: partly cloudy
}

// ─── "2026-09-11T07:14" -> minutes since local midnight ──────────────────────
// Parsed by string, not via Date(): the timestamp Open-Meteo returns is
// already in the location's local time (timezone=auto), and feeding it to
// Date() would have it re-interpreted against the PHONE's timezone, which
// silently breaks whenever the two differ.
function isoLocalToMinutes(iso) {
  if (!iso) return -1;
  var t = iso.split('T')[1];
  if (!t) return -1;
  var parts = t.split(':');
  var h = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
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

// ─── "2026-09-11T07:14" -> minutes since local midnight ──────────────────────
// Parsed by string, NOT via Date(): with timezone=auto the stamp is already
// in the location's local time, and Date() would re-interpret it against the
// phone's timezone -- silently wrong whenever the two differ.
function isoLocalToMinutes(iso) {
  if (!iso) return -1;
  var t = iso.split('T')[1];
  if (!t) return -1;
  var p = t.split(':');
  var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
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

// ─── Precipitation probability for the COMING hour ───────────────────────────
// Finds the first hourly entry strictly later than now rather than assuming
// index == hour, which breaks the moment the array does not start at midnight.
function nextHourPrecipProbability(data) {
  try {
    if (!data.hourly || !data.hourly.time || !data.hourly.precipitation_probability) return -1;
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var times = data.hourly.time, probs = data.hourly.precipitation_probability;
    for (var i = 0; i < times.length; i++) {
      if (isoLocalToMinutes(times[i]) > nowMin) {
        var p = probs[i];
        return (p == null) ? -1 : Math.round(p);
      }
    }
    return -1;
  } catch (e) {
    console.log('Precip parse error: ' + e);
    return -1;
  }
}

// ─── Fetch weather + AQI from Open-Meteo ─────────────────────────────────────
function fetchWeatherAndAQI(lat, lon) {
  var weatherUrl = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + lat + '&longitude=' + lon +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
    '&current=weather_code,temperature_2m,uv_index,wind_speed_10m,wind_direction_10m' +
    '&hourly=precipitation_probability' +
    '&timezone=auto' +
    '&forecast_days=1';

  var xhr = new XMLHttpRequest();
  xhr.open('GET', weatherUrl, true);
  xhr.onload = function() {
    if (xhr.readyState === 4 && xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        // The icon must reflect what's happening RIGHT NOW, so it needs
        // data.current.weather_code — NOT data.daily.weather_code[0].
        // The daily field is Open-Meteo's own "representative" summary
        // judgment for the whole day (which can easily be dominated by
        // cloud/rain forecast for later even while it's sunny right now),
        // which is exactly why a genuinely sunny moment could render as a
        // cloud: the request already asked for current=weather_code (it
        // has to, for temperature_2m), the field was right there in the
        // response, it just was never being read for the icon.
        var wmoCurrent = data.current.weather_code;
        var wmoDaily   = data.daily.weather_code[0];
        var tempHigh   = Math.round(data.daily.temperature_2m_max[0]);
        var tempLow    = Math.round(data.daily.temperature_2m_min[0]);
        var tempCurrent = Math.round(data.current.temperature_2m);
        var iconIdx    = wmoToIconIndex(wmoCurrent);

        // Day/night icon choice is made ON THE WATCH, not here: weather only
        // refreshes every 30 min, so baking it in would leave the icon wrong
        // for up to half an hour after sunset.
        var sunriseMin = isoLocalToMinutes(data.daily.sunrise[0]);
        var sunsetMin  = isoLocalToMinutes(data.daily.sunset[0]);
        // UV sent as index*10 to keep one decimal using plain integers.
        var uvX10      = (data.current.uv_index != null) ? Math.round(data.current.uv_index * 10) : -1;
        var windSpeed  = (data.current.wind_speed_10m != null) ? Math.round(data.current.wind_speed_10m) : -1;
        var windDir    = (data.current.wind_direction_10m != null) ? Math.round(data.current.wind_direction_10m) : -1;
        var precipProb = nextHourPrecipProbability(data);

        // Sunrise/sunset come back as local ISO strings ("2026-09-11T07:14").
        // Send them as minutes-since-midnight so the watch can compare them
        // against its own local clock with plain integer maths.
        //
        // The day/night decision is deliberately made ON THE WATCH, not
        // here: weather only refreshes every 30 minutes, so if this side
        // baked "it's night" into the icon index, the icon would stay wrong
        // for up to half an hour after the sun actually set. Sending the
        // times instead lets the watch flip the icon at the right moment.
        var sunriseMin = isoLocalToMinutes(data.daily.sunrise[0]);
        var sunsetMin  = isoLocalToMinutes(data.daily.sunset[0]);

        var msg = {};
        msg[messageKeys.WEATHER_CODE] = iconIdx;
        msg[messageKeys.TEMP_HIGH]    = tempHigh;
        msg[messageKeys.TEMP_LOW]     = tempLow;
        msg[messageKeys.TEMP_CURRENT] = tempCurrent;
        if (sunriseMin >= 0) msg[messageKeys.SUNRISE_MIN] = sunriseMin;
        if (sunsetMin  >= 0) msg[messageKeys.SUNSET_MIN]  = sunsetMin;
        if (uvX10      >= 0) msg[messageKeys.UV_INDEX]    = uvX10;
        if (windSpeed  >= 0) msg[messageKeys.WIND_SPEED]  = windSpeed;
        if (windDir    >= 0) msg[messageKeys.WIND_DIR]    = windDir;
        if (precipProb >= 0) msg[messageKeys.PRECIP_PROB] = precipProb;
        if (sunriseMin >= 0) msg[messageKeys.SUNRISE_MIN] = sunriseMin;
        if (sunsetMin  >= 0) msg[messageKeys.SUNSET_MIN]  = sunsetMin;

        Pebble.sendAppMessage(msg, function() {
          console.log('Weather sent: wmoCurrent=' + wmoCurrent + ' wmoDaily=' + wmoDaily +
                      ' icon=' + iconIdx + ' cur=' + tempCurrent + ' H=' + tempHigh + ' L=' + tempLow +
                      ' sunrise=' + sunriseMin + ' sunset=' + sunsetMin);
        }, function(e) {
          console.log('Weather send failed: ' + JSON.stringify(e));
        });
      } catch (e) {
        console.log('Weather parse error: ' + e);
      }
    }
  };
  xhr.send();

  var aqiUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality' +
    '?latitude=' + lat + '&longitude=' + lon +
    '&current=european_aqi' +
    '&timezone=auto';

  var xhr2 = new XMLHttpRequest();
  xhr2.open('GET', aqiUrl, true);
  xhr2.onload = function() {
    if (xhr2.readyState === 4 && xhr2.status === 200) {
      try {
        var data = JSON.parse(xhr2.responseText);
        var aqi = Math.round(data.current.european_aqi);
        var msg = {};
        msg[messageKeys.AQI] = aqi;
        Pebble.sendAppMessage(msg, function() {
          console.log('AQI sent: ' + aqi);
        }, function(e) {
          console.log('AQI send failed: ' + JSON.stringify(e));
        });
      } catch (e) {
        console.log('AQI parse error: ' + e);
      }
    }
  };
  xhr2.send();
}

// ─── Reverse geocode location name (BigDataCloud — same as PebbleWindsock) ───
function fetchLocationName(lat, lon) {
  var url = 'https://api.bigdatacloud.net/data/reverse-geocode-client' +
    '?latitude=' + lat + '&longitude=' + lon +
    '&localityLanguage=en';

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (xhr.readyState === 4 && xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        var name = data.locality || data.city || data.principalSubdivision || '';
        if (!name) return;

        var msg = {};
        msg[messageKeys.LOCATION] = name;
        Pebble.sendAppMessage(msg, function() {
          console.log('Location sent: ' + name);
        }, function(e) {
          console.log('Location send failed: ' + JSON.stringify(e));
        });
      } catch (e) {
        console.log('Location parse error: ' + e);
      }
    }
  };
  xhr.send();
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

// ─── Location + weather/AQI refresh ──────────────────────────────────────────
function refreshWeather() {
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      fetchWeatherAndAQI(pos.coords.latitude, pos.coords.longitude);
      fetchLocationName(pos.coords.latitude, pos.coords.longitude);
    },
    function(err) {
      console.log('Geolocation error: ' + err.message);
    },
    { timeout: 15000, maximumAge: 300000 }
  );
}

// ─── Pebble event listeners ───────────────────────────────────────────────────
Pebble.addEventListener('showConfiguration', function() {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('ready', function() {
  console.log('PebbleKit JS ready');
  // No accent send here — the watch already persists its own last-known
  // accent/theme in Pebble persistent storage, so nothing to resend on a
  // normal launch. Only weather/AQI need fetching from the phone.
  refreshWeather();
  setInterval(refreshWeather, REFRESH_INTERVAL_MS);
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
  var hex       = settings[messageKeys.accent_color] || '#F0A30A';
  var theme     = settings[messageKeys.theme_select];       // 'dark' or 'light'
  var tempUnit  = settings[messageKeys.temp_unit_select];   // 'C' or 'F'
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
  var weekStart = intSetting(messageKeys.week_start_select, 1);
  var weekRefDn = dateToDayNumber(settings[messageKeys.week_ref_date]);
  var windUnit  = settings[messageKeys.wind_unit_select];   // 'kmh' or 'mph'

  var msg = {};
  msg[messageKeys.ACCENT_R] = rgb.r;
  msg[messageKeys.ACCENT_G] = rgb.g;
  msg[messageKeys.ACCENT_B] = rgb.b;
  msg[messageKeys.THEME]      = (theme === 'light') ? 1 : 0;
  msg[messageKeys.TEMP_UNIT]  = (tempUnit === 'F') ? 1 : 0;
  msg[messageKeys.DATE_ORDER] = (dateOrder === 'MDY') ? 1 : 0;
  msg[messageKeys.TILE_A]     = tileA;
  msg[messageKeys.TILE_B]     = tileB;
  msg[messageKeys.TILE_C]     = tileC;
  msg[messageKeys.WEEK_START] = (weekStart === 0) ? 0 : 1;
  msg[messageKeys.WIND_UNIT]  = (windUnit === 'mph') ? 1 : 0;
  if (weekRefDn >= 0) msg[messageKeys.WEEK_REF_DN] = weekRefDn;

  Pebble.sendAppMessage(msg, function() {
    console.log('Settings sent: accent=' + hex + ' theme=' + theme +
                ' tempUnit=' + tempUnit + ' dateOrder=' + dateOrder +
                ' tiles=' + tileA + '/' + tileB + '/' + tileC +
                ' weekStart=' + weekStart + ' weekRefDn=' + weekRefDn +
                ' windUnit=' + windUnit);
  }, function(err) {
    console.log('Settings send failed: ' + JSON.stringify(err));
  });

  refreshWeather();
});