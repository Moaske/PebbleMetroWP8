// ─── Clay custom function: live watchface preview on the settings page ──────
// Clay copies this function's source via .toString() and injects it into
// the generated config page's own script context (a plain webview, not our
// pkjs sandbox) — so it CANNOT use require() or reference anything outside
// its own body. Everything the preview needs (HTML, CSS, and the small
// amount of update logic) has to be self-contained here.
//
// All custom class names are prefixed "mtprev-" specifically to avoid
// collisions with Clay's own page styles, since generic names like ".tile"
// or ".row" are exactly the kind of thing a page framework would also use.
module.exports = function(minified) {
  var clayConfig = this;

  var previewHtml =
    '<style>' +
    '.mtprev-wrap { display:flex; flex-direction:column; align-items:center; padding:14px 0 18px; }' +
    '.mtprev-shell { --acc:#f0a30a; background:#1c1c1c; border-radius:18px; border:2.5px solid #3a3a3a; padding:11px; position:relative; width:222px; box-shadow:0 6px 24px rgba(0,0,0,0.4); }' +
    '.mtprev-btn { position:absolute; background:#444; border-radius:0 3px 3px 0; }' +
    '.mtprev-btn-r1 { right:-6px; top:24px; width:5px; height:18px; }' +
    '.mtprev-btn-r2 { right:-6px; top:48px; width:5px; height:18px; }' +
    '.mtprev-btn-r3 { right:-6px; top:72px; width:5px; height:14px; }' +
    '.mtprev-btn-l  { left:-6px;  top:42px; width:5px; height:24px; border-radius:3px 0 0 3px; }' +
    '.mtprev-screen { width:200px; height:228px; background:#000; border-radius:4px; overflow:hidden; position:relative; transition:background 0.15s; }' +
    '.mtprev-shell.mtprev-light .mtprev-screen { background:#fff; }' +
    '.mtprev-grid { position:absolute; top:0; left:0; width:200px; height:200px; display:flex; flex-direction:column; gap:4px; padding:4px; }' +
    '.mtprev-row { display:flex; flex-direction:row; gap:4px; height:64px; flex-shrink:0; }' +
    '.mtprev-tile-wrap { flex-shrink:0; height:64px; }' +
    '.mtprev-tile-wrap.sq  { width:64px; }' +
    '.mtprev-tile-wrap.dbl { width:132px; }' +
    '.mtprev-tile { width:100%; height:100%; background:var(--acc); border-radius:2px; overflow:hidden; }' +
    '.mtprev-face { width:100%; height:100%; display:flex; flex-direction:column; padding:6px 7px 5px; color:#fff; transition:color 0.15s; }' +
    '.mtprev-shell.mtprev-light .mtprev-face { color:#000; }' +
    '#mtprev-t-time .mtprev-face { justify-content:center; }' +
    '.mtprev-time-num { font-family:"Segoe UI",Arial,sans-serif; font-size:44px; font-weight:100; letter-spacing:-2px; line-height:1; }' +
    '#mtprev-t-date .mtprev-face { justify-content:center; gap:2px; }' +
    '.mtprev-date-dow { font-family:"Segoe UI",Arial,sans-serif; font-size:16px; font-weight:300; line-height:1; }' +
    '.mtprev-date-dmy { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:600; opacity:0.9; line-height:1; }' +
    '#mtprev-t-aqi .mtprev-face { justify-content:space-between; }' +
    '.mtprev-lbl { font-family:"Segoe UI",Arial,sans-serif; font-size:7px; font-weight:700; opacity:0.6; text-transform:uppercase; letter-spacing:0.5px; }' +
    '.mtprev-val { font-family:"Segoe UI",Arial,sans-serif; font-size:18px; font-weight:700; line-height:1; }' +
    '#mtprev-t-wthr .mtprev-face { flex-direction:row; align-items:center; justify-content:space-around; padding:6px 10px; }' +
    '.mtprev-wthr-icon { font-size:32px; line-height:1; }' +
    '.mtprev-wthr-temps { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }' +
    '.mtprev-wthr-high { font-family:"Segoe UI",Arial,sans-serif; font-size:20px; font-weight:300; line-height:1; }' +
    '.mtprev-wthr-low { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:300; opacity:0.75; line-height:1; }' +
    '#mtprev-t-step .mtprev-face, #mtprev-t-sleep .mtprev-face { justify-content:space-between; }' +
    '.mtprev-step-val { font-family:"Segoe UI",Arial,sans-serif; font-size:16px; font-weight:700; line-height:1; }' +
    '.mtprev-sleep-val { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:700; line-height:1; }' +
    '#mtprev-t-batt .mtprev-face { justify-content:space-between; }' +
    '.mtprev-batt-row { display:flex; align-items:center; margin-top:4px; }' +
    '.mtprev-batt-bar-h { flex:1; height:7px; background:rgba(255,255,255,0.25); border-radius:2px; overflow:hidden; }' +
    '.mtprev-shell.mtprev-light .mtprev-batt-bar-h { background:rgba(0,0,0,0.15); }' +
    '.mtprev-batt-fill-h { height:100%; background:rgba(255,255,255,0.85); border-radius:2px; }' +
    '.mtprev-shell.mtprev-light .mtprev-batt-fill-h { background:rgba(0,0,0,0.85); }' +
    '.mtprev-batt-pct { font-family:"Segoe UI",Arial,sans-serif; font-size:11px; font-weight:700; white-space:nowrap; }' +
    '.mtprev-icon { font-size:18px; opacity:0.85; line-height:1; }' +
    '.mtprev-icon-sm { font-size:15px; opacity:0.85; line-height:1; }' +
    '.mtprev-nav-arrow { position:absolute; bottom:7px; right:9px; width:14px; height:14px; }' +
    '.mtprev-nav-arrow svg polygon { fill:#fff; }' +
    '.mtprev-shell.mtprev-light .mtprev-nav-arrow svg polygon { fill:#000; }' +
    '.mtprev-caption { font-family:"Segoe UI",Arial,sans-serif; font-size:11px; color:#888; margin-top:8px; }' +
    '</style>' +
    '<div class="mtprev-wrap">' +
      '<div class="mtprev-shell" id="mtprev-shell">' +
        '<div class="mtprev-btn mtprev-btn-r1"></div>' +
        '<div class="mtprev-btn mtprev-btn-r2"></div>' +
        '<div class="mtprev-btn mtprev-btn-r3"></div>' +
        '<div class="mtprev-btn mtprev-btn-l"></div>' +
        '<div class="mtprev-screen">' +
          '<div class="mtprev-grid">' +
            '<div class="mtprev-row">' +
              '<div class="mtprev-tile-wrap dbl" id="mtprev-t-time"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div class="mtprev-time-num" id="mtprev-disp-time">19:24</div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap sq" id="mtprev-t-date"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div class="mtprev-date-dow" id="mtprev-disp-day">WED</div>' +
                '<div class="mtprev-date-dmy" id="mtprev-disp-date">12/08</div>' +
              '</div></div></div>' +
            '</div>' +
            '<div class="mtprev-row">' +
              '<div class="mtprev-tile-wrap sq" id="mtprev-t-aqi"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div class="mtprev-lbl">AQI</div>' +
                '<span class="mdi mtprev-icon mdi-air-filter"></span>' +
                '<div class="mtprev-val">58</div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap dbl" id="mtprev-t-wthr"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<span class="mdi mtprev-wthr-icon mdi-weather-partly-cloudy"></span>' +
                '<div class="mtprev-wthr-temps">' +
                  '<div class="mtprev-wthr-high">21°C</div>' +
                  '<div class="mtprev-wthr-low">H 21°C L 14°C</div>' +
                '</div>' +
              '</div></div></div>' +
            '</div>' +
            '<div class="mtprev-row">' +
              '<div class="mtprev-tile-wrap sq" id="mtprev-t-step"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div class="mtprev-lbl">STEPS</div>' +
                '<span class="mdi mtprev-icon mdi-walk"></span>' +
                '<div class="mtprev-step-val">5362</div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap sq" id="mtprev-t-sleep"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div class="mtprev-lbl">SLEEP</div>' +
                '<span class="mdi mtprev-icon mdi-sleep"></span>' +
                '<div class="mtprev-sleep-val">7h23</div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap sq" id="mtprev-t-batt"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div class="mtprev-lbl">BATT</div>' +
                '<div class="mtprev-batt-row">' +
                  '<div class="mtprev-batt-bar-h"><div class="mtprev-batt-fill-h" style="width:80%"></div></div>' +
                '</div>' +
                '<div class="mtprev-batt-pct">80%</div>' +
              '</div></div></div>' +
            '</div>' +
          '</div>' +
          '<div class="mtprev-nav-arrow">' +
            '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">' +
              '<polygon points="0,8 10,8 10,0 20,10 10,20 10,12 0,12"/>' +
            '</svg>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="mtprev-caption">Live preview</div>' +
    '</div>';

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    // MDI icon font — fetched at runtime by the webview's own browser, not
    // a build-time dependency, so this is fine to reference by URL here.
    if (!document.getElementById('mtprev-mdi-link')) {
      var link = document.createElement('link');
      link.id = 'mtprev-mdi-link';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css';
      document.head.appendChild(link);
    }

    // Insert the preview at the very top of the page, above every config
    // section, so it's visible immediately without scrolling while the
    // person changes settings below it.
    var container = document.createElement('div');
    container.innerHTML = previewHtml;
    document.body.insertBefore(container, document.body.firstChild);

    function applyPreviewState() {
      var shell = document.getElementById('mtprev-shell');
      if (!shell) return;

      var accentItem = clayConfig.getItemByMessageKey('accent_color');
      var themeItem  = clayConfig.getItemByMessageKey('theme_select');

      if (accentItem) {
        shell.style.setProperty('--acc', accentItem.get());
      }
      if (themeItem) {
        if (themeItem.get() === 'light') {
          shell.classList.add('mtprev-light');
        } else {
          shell.classList.remove('mtprev-light');
        }
      }
    }

    var accentItem = clayConfig.getItemByMessageKey('accent_color');
    var themeItem  = clayConfig.getItemByMessageKey('theme_select');
    if (accentItem) accentItem.on('change', applyPreviewState);
    if (themeItem)  themeItem.on('change', applyPreviewState);
    applyPreviewState();

    // Keep the clock ticking so the preview doesn't look frozen/dead.
    function tick() {
      var now = new Date();
      var timeEl = document.getElementById('mtprev-disp-time');
      var dayEl  = document.getElementById('mtprev-disp-day');
      var dateEl = document.getElementById('mtprev-disp-date');
      if (timeEl) {
        timeEl.textContent =
          now.getHours().toString().padStart(2, '0') + ':' +
          now.getMinutes().toString().padStart(2, '0');
      }
      if (dayEl) {
        var DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        dayEl.textContent = DAYS[now.getDay()];
      }
      if (dateEl) {
        var dd = now.getDate().toString().padStart(2, '0');
        var mo = (now.getMonth() + 1).toString().padStart(2, '0');
        dateEl.textContent = dd + '/' + mo;
      }
    }
    tick();
    setInterval(tick, 15000);
  });
};
