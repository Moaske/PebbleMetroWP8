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

// ─── Hex colour → R,G,B 0–255 ────────────────────────────────────────────────
function hexToRGB(hex) {
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16)
  };
}

// ─── Fetch weather + AQI from Open-Meteo ─────────────────────────────────────
function fetchWeatherAndAQI(lat, lon) {
  var weatherUrl = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + lat + '&longitude=' + lon +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&current=weather_code,temperature_2m' +
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

        var msg = {};
        msg[messageKeys.WEATHER_CODE] = iconIdx;
        msg[messageKeys.TEMP_HIGH]    = tempHigh;
        msg[messageKeys.TEMP_LOW]     = tempLow;
        msg[messageKeys.TEMP_CURRENT] = tempCurrent;

        Pebble.sendAppMessage(msg, function() {
          console.log('Weather sent: wmoCurrent=' + wmoCurrent + ' wmoDaily=' + wmoDaily +
                      ' icon=' + iconIdx + ' cur=' + tempCurrent + ' H=' + tempHigh + ' L=' + tempLow);
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

  var msg = {};
  msg[messageKeys.ACCENT_R] = rgb.r;
  msg[messageKeys.ACCENT_G] = rgb.g;
  msg[messageKeys.ACCENT_B] = rgb.b;
  msg[messageKeys.THEME]      = (theme === 'light') ? 1 : 0;
  msg[messageKeys.TEMP_UNIT]  = (tempUnit === 'F') ? 1 : 0;
  msg[messageKeys.DATE_ORDER] = (dateOrder === 'MDY') ? 1 : 0;

  Pebble.sendAppMessage(msg, function() {
    console.log('Settings sent: accent=' + hex + ' theme=' + theme +
                ' tempUnit=' + tempUnit + ' dateOrder=' + dateOrder);
  }, function(err) {
    console.log('Settings send failed: ' + JSON.stringify(err));
  });

  refreshWeather();
});