// ─── MetroTime companion JS ──────────────────────────────────────────────────
// Fetches: Open-Meteo (weather + AQI), Pebble Health (steps/sleep via timeline)
// Sends accent colour from settings via localStorage

var Clay = require('pebble-clay');
var clayConfig = require('./config.json');
var clay = new Clay(clayConfig);

// ─── AppMessage keys (must match main.c) ─────────────────────────────────────
// Steps and sleep have no phone-side keys — the watch reads them natively
// via HealthService. Battery is also read natively on-watch.
var KEY = {
  ACCENT_R:     0,
  ACCENT_G:     1,
  ACCENT_B:     2,
  AQI:          3,
  WEATHER_CODE: 4,
  TEMP_HIGH:    5,
  TEMP_LOW:     6
};

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
    r: parseInt(hex.substring(0,2), 16),
    g: parseInt(hex.substring(2,4), 16),
    b: parseInt(hex.substring(4,6), 16)
  };
}

// ─── Send accent colour to watch ──────────────────────────────────────────────
function sendAccent() {
  var settings = clay.getSettings();
  var hexColor = settings.accent_color || '#F0A30A';
  var rgb = hexToRGB(hexColor);
  var msg = {};
  msg[KEY.ACCENT_R] = rgb.r;
  msg[KEY.ACCENT_G] = rgb.g;
  msg[KEY.ACCENT_B] = rgb.b;
  Pebble.sendAppMessage(msg, function() {
    console.log('Accent sent: ' + hexColor);
  }, function(e) {
    console.log('Accent send failed: ' + JSON.stringify(e));
  });
}

// ─── Fetch weather + AQI from Open-Meteo ─────────────────────────────────────
function fetchWeatherAndAQI(lat, lon) {
  // Weather
  var weatherUrl = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + lat + '&longitude=' + lon +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&current=weather_code' +
    '&timezone=auto' +
    '&forecast_days=1';

  var xhr = new XMLHttpRequest();
  xhr.open('GET', weatherUrl, true);
  xhr.onload = function() {
    if (xhr.readyState === 4 && xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        var wmo      = data.daily.weather_code[0];
        var tempHigh = Math.round(data.daily.temperature_2m_max[0]);
        var tempLow  = Math.round(data.daily.temperature_2m_min[0]);
        var iconIdx  = wmoToIconIndex(wmo);

        var msg = {};
        msg[KEY.WEATHER_CODE] = iconIdx;
        msg[KEY.TEMP_HIGH]    = tempHigh;
        msg[KEY.TEMP_LOW]     = tempLow;

        Pebble.sendAppMessage(msg, function() {
          console.log('Weather sent: wmo=' + wmo + ' H=' + tempHigh + ' L=' + tempLow);
        }, function(e) {
          console.log('Weather send failed: ' + JSON.stringify(e));
        });
      } catch(e) {
        console.log('Weather parse error: ' + e);
      }
    }
  };
  xhr.send();

  // AQI (Open-Meteo Air Quality)
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
        var aqi  = Math.round(data.current.european_aqi);
        var msg  = {};
        msg[KEY.AQI] = aqi;
        Pebble.sendAppMessage(msg, function() {
          console.log('AQI sent: ' + aqi);
        }, function(e) {
          console.log('AQI send failed: ' + JSON.stringify(e));
        });
      } catch(e) {
        console.log('AQI parse error: ' + e);
      }
    }
  };
  xhr2.send();
}

// ─── Main fetch orchestrator ──────────────────────────────────────────────────
// Note: steps and sleep are NOT fetched here — the watch reads them directly
// from its own Pebble Health data via HealthService (see main.c). The phone
// only needs to supply accent colour, weather, and AQI (things the watch has
// no other way to obtain on its own).
function fetchAll() {
  // Send accent first (instant)
  sendAccent();

  // Then get location for weather/AQI
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lon = pos.coords.longitude;
      console.log('Location: ' + lat + ', ' + lon);
      fetchWeatherAndAQI(lat, lon);
    },
    function(err) {
      console.log('Geolocation error: ' + err.message);
    },
    { timeout: 15000, maximumAge: 300000 }
  );
}

// ─── Pebble event listeners ───────────────────────────────────────────────────
Pebble.addEventListener('ready', function() {
  console.log('PebbleKit JS ready');
  fetchAll();
});

Pebble.addEventListener('appmessage', function(e) {
  console.log('Message from watch: ' + JSON.stringify(e.payload));
});

// Clay fires this when settings are saved
Pebble.addEventListener('webviewclosed', function(e) {
  if (e && e.response) {
    clay.handleResponse(e.response);
    fetchAll(); // re-send with new accent + refetch data
  }
});
