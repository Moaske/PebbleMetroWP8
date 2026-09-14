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

  // ─── Settings page text translations ───────────────────────────────────────
  // Only two "text" blocks and the Save button carry translatable copy —
  // everything else on this page (labels, option names) comes from Clay's
  // own config.json values, which aren't localized here.
  //
  // Unlike the watch-side weekday labels, there's no ASCII-only constraint
  // here: this settings page is a full webview with normal web font/Unicode
  // support, so proper accented characters are used throughout. That
  // restriction only ever applied to text baked into a Pebble font resource.
  var CONFIG_I18N = {
    en: {
      dateOrderHelp: 'The weekday name still follows your watch\'s language setting — this only controls the day/month order below it. Useful since the Pebble app\'s language picker doesn\'t distinguish English regions (e.g. UK vs US), so "English" alone doesn\'t tell us which date order you actually use.',
      healthHelp: 'Steps and sleep are read directly from Pebble Health on your watch — no setup needed here. Just make sure Pebble Health is enabled in the Pebble app (Apps/Timeline tab).',
      save: 'Save'
    },
    fr: {
      dateOrderHelp: 'Le nom du jour suit toujours le réglage de langue de votre montre — ceci contrôle uniquement l\'ordre jour/mois ci-dessous. Utile car le sélecteur de langue de l\'application Pebble ne distingue pas les régions anglophones (ex. Royaume-Uni vs États-Unis), donc « Anglais » seul ne nous indique pas quel ordre de date vous utilisez réellement.',
      healthHelp: 'Les pas et le sommeil sont lus directement depuis Pebble Health sur votre montre — aucune configuration n\'est nécessaire ici. Assurez-vous simplement que Pebble Health est activé dans l\'application Pebble (onglet Apps/Timeline).',
      save: 'Enregistrer'
    },
    de: {
      dateOrderHelp: 'Der Wochentagsname folgt weiterhin der Spracheinstellung deiner Uhr — dies steuert nur die Tag/Monat-Reihenfolge unten. Nützlich, da die Sprachauswahl der Pebble-App nicht zwischen englischsprachigen Regionen unterscheidet (z. B. UK vs. USA), sodass „Englisch" allein uns nicht sagt, welches Datumsformat du tatsächlich verwendest.',
      healthHelp: 'Schritte und Schlaf werden direkt von Pebble Health auf deiner Uhr gelesen — hier ist keine Einrichtung nötig. Stelle nur sicher, dass Pebble Health in der Pebble-App aktiviert ist (Registerkarte Apps/Timeline).',
      save: 'Speichern'
    },
    es: {
      dateOrderHelp: 'El nombre del día de la semana sigue el idioma configurado en tu reloj — esto solo controla el orden día/mes de abajo. Es útil porque el selector de idioma de la app Pebble no distingue regiones de habla inglesa (p. ej. Reino Unido vs. EE. UU.), así que «Inglés» por sí solo no nos indica qué formato de fecha usas realmente.',
      healthHelp: 'Los pasos y el sueño se leen directamente desde Pebble Health en tu reloj — no es necesario configurar nada aquí. Solo asegúrate de que Pebble Health esté activado en la app Pebble (pestaña Apps/Timeline).',
      save: 'Guardar'
    },
    it: {
      dateOrderHelp: 'Il nome del giorno della settimana segue sempre l\'impostazione della lingua del tuo orologio — questo controlla solo l\'ordine giorno/mese qui sotto. Utile perché il selettore di lingua dell\'app Pebble non distingue le regioni anglofone (es. Regno Unito vs Stati Uniti), quindi «Inglese» da solo non ci dice quale formato data usi realmente.',
      healthHelp: 'Passi e sonno vengono letti direttamente da Pebble Health sul tuo orologio — nessuna configurazione necessaria qui. Assicurati solo che Pebble Health sia attivato nell\'app Pebble (scheda App/Timeline).',
      save: 'Salva'
    },
    nl: {
      dateOrderHelp: 'De naam van de weekdag volgt nog steeds de taalinstelling van je horloge — dit bepaalt alleen de dag/maand-volgorde hieronder. Handig omdat de taalkeuze in de Pebble-app geen onderscheid maakt tussen Engelstalige regio\'s (bijv. VK vs VS), waardoor "Engels" alleen niet aangeeft welke datumnotatie je daadwerkelijk gebruikt.',
      healthHelp: 'Stappen en slaap worden rechtstreeks van Pebble Health op je horloge gelezen — hier is geen instelling voor nodig. Zorg er alleen voor dat Pebble Health is ingeschakeld in de Pebble-app (tabblad Apps/Tijdlijn).',
      save: 'Opslaan'
    },
    pt: {
      dateOrderHelp: 'O nome do dia da semana continua a seguir a definição de idioma do seu relógio — isto controla apenas a ordem dia/mês abaixo. Útil porque o seletor de idioma da app Pebble não distingue regiões de língua inglesa (ex. Reino Unido vs. EUA), pelo que "Inglês" sozinho não nos diz qual formato de data realmente usa.',
      healthHelp: 'Os passos e o sono são lidos diretamente do Pebble Health no seu relógio — não é necessária qualquer configuração aqui. Certifique-se apenas de que o Pebble Health está ativado na app Pebble (separador Apps/Timeline).',
      save: 'Guardar'
    }
  };

  // The watchface's OWN icon font, embedded so the preview renders the exact
  // glyphs the watch does -- no CDN dependency, no drift from the baked
  // resource.
  var METROICONS_B64 = "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AABSAGUAZwB1AGwAYQByAABSZWd1bGFyAABGAG8AbgB0AEYAbwByAGcAZQAgADIALgAwACAAOgAgAE0AZQB0AHIAbwAgAEkAYwBvAG4AcwAgADoAIAAxADIALQA5AC0AMgAwADIANgAARm9udEZvcmdlIDIuMCA6IE1ldHJvIEljb25zIDogMTItOS0yMDI2AABNAGUAdAByAG8AIABJAGMAbwBuAHMAAE1ldHJvIEljb25zAABWAGUAcgBzAGkAbwBuACAAMAAwADEALgAwADAAMAAAVmVyc2lvbiAwMDEuMDAwAABNAGUAdAByAG8ASQBjAG8AbgBzAABNZXRyb0ljb25zAAAAAAIAAAAAAAD/tQAyAAAAAQAAAAAAAAAAAAAAAAAAAAAAPgAAAAEAAgECAQMBBAEFAQYBBwEIAQkBCgELAQwBDQEOAQ8BEAERARIBEwEUARUBFgEXARgBGQEaARsBHAEdAR4BHwEgASEBIgEjASQBJQEmAScBKAEpASoBKwEsAS0BLgEvATABMQEyATMBNAE1ATYBNwE4ATkBOgE7ATwEd2FsawliZWQtY2xvY2sKYWlyLWZpbHRlcgV3YXRjaAVwaG9uZQtoZWFydC1wdWxzZQtmaXJlLWNpcmNsZQxzdW4td2lyZWxlc3MId2luZHNvY2sKbmF2aWdhdGlvbgh1bWJyZWxsYQhjYWxlbmRhcgZzY2hvb2waYXJyb3ctcmlnaHQtY2lyY2xlLW91dGxpbmUPdW1icmVsbGEtY2xvc2VkE3dlYXRoZXItc3Vuc2V0LWRvd24Rd2VhdGhlci1zdW5zZXQtdXAIbW9vbi1uZXcUbW9vbi13YXhpbmctY3Jlc2NlbnQSbW9vbi1maXJzdC1xdWFydGVyE21vb24td2F4aW5nLWdpYmJvdXMJbW9vbi1mdWxsE21vb24td2FuaW5nLWdpYmJvdXMRbW9vbi1sYXN0LXF1YXJ0ZXIUbW9vbi13YW5pbmctY3Jlc2NlbnQHbmF2MDAwMAduYXYwMjI1B25hdjA0NTAHbmF2MDY3NQduYXYwOTAwB25hdjExMjUHbmF2MTM1MAduYXYxNTc1B25hdjE4MDAHbmF2MjAyNQduYXYyMjUwB25hdjI0NzUHbmF2MjcwMAduYXYyOTI1B25hdjMxNTAHbmF2MzM3NRN3ZWF0aGVyLXN1bm55LWFsZXJ0FmFsZXJ0LW9jdGFncmFtLW91dGxpbmUNd2VhdGhlci1zdW5ueQx3ZWF0aGVyLWhhenkVd2VhdGhlci1wYXJ0bHktY2xvdWR5DndlYXRoZXItY2xvdWR5C3dlYXRoZXItZm9nFHdlYXRoZXItcGFydGx5LXJhaW55DXdlYXRoZXItcmFpbnkPd2VhdGhlci1wb3VyaW5nE3dlYXRoZXItc25vd3ktcmFpbnkNd2VhdGhlci1zbm93eRN3ZWF0aGVyLXNub3d5LWhlYXZ5EXdlYXRoZXItbGlnaHRuaW5nDHdlYXRoZXItaGFpbA13ZWF0aGVyLW5pZ2h0G3dlYXRoZXItbmlnaHQtcGFydGx5LWNsb3VkeQRzbW9nAAAAAAH//wACAAAAAQAAAADiLsLpAAAAAObLOlIAAAAA5ss6Ug==";

  // Mirrors ContentId in main.c. The index here IS the value the Clay select
  // sends to the watch, so the order is load-bearing.
  var TILE_CONTENT = [
    { t:"AQI",      dual:false, icon:"2", v:"Moderate" },
    { t:"STEPS",    dual:false, icon:"0", v:"5362" },
    { t:"SLEEP",    dual:false, icon:"1", v:"7h 23m" },
    { t:"MOON",     dual:false, icon:"D", v:"Waxing Gib" },
    { t:"RAIN",     dual:false, icon:":", v:"1hr: 20%" },
    { t:"HRM",      dual:false, icon:"5", v:"62 bpm" },
    { t:"CALORIES", dual:false, icon:"6", v:"1847 cal" },
    { t:"WEEKNR",   dual:true,  l1i:";", l1v:"37", l2i:"<", l2v:"05" },
    { t:"SUNSET",   dual:true,  l1i:"@", l1v:"07:14", l2i:"?", l2v:"20:03" },
    { t:"WIND",     dual:false, icon:"U", v:"12 km/h" },
    { t:"UV",       dual:false, icon:"7", v:"3 : Moderate" },
    { t:"UV/SMOG",  dual:true,  l1i:"7", l1v:"3", l2i:"p", l2v:"68" },
    { t:"BATT",     dual:true,  l1i:"3", l1v:"96%", l2i:"4", l2v:"73%" }
  ];

  var previewHtml =
    '<style>' +
    '@font-face { font-family:"MetroIcons"; src:url(data:font/ttf;base64,' + METROICONS_B64 + ') format("truetype"); }' +
    '.mtprev-configurable { outline:1px solid #e51400; outline-offset:-1px; }' +
    '.mtprev-t2row { display:flex; align-items:center; justify-content:flex-start; gap:5px; margin-top:2px; }' +
    '.mtprev-t2icon { font-family:"MetroIcons"; font-size:13px; opacity:0.9; }' +
    '.mtprev-t2val { font-family:"Segoe UI",Arial,sans-serif; font-size:15px; font-weight:600; }' +
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
    '.mtprev-val { font-family:"Segoe UI",Arial,sans-serif; font-size:15px; font-weight:600; line-height:1; }' +
    '#mtprev-t-wthr .mtprev-face { flex-direction:row; align-items:center; justify-content:space-around; padding:6px 10px; }' +
    '.mtprev-wthr-icon { font-family:"MetroIcons"; font-size:32px; line-height:1; }' +
    '.mtprev-wthr-temps { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }' +
    '.mtprev-wthr-high { font-family:"Segoe UI",Arial,sans-serif; font-size:20px; font-weight:300; line-height:1; }' +
    '.mtprev-wthr-low { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:300; opacity:0.75; line-height:1; }' +
    '#mtprev-t-step .mtprev-face, #mtprev-t-sleep .mtprev-face { justify-content:space-between; }' +
    '.mtprev-step-val { font-family:"Segoe UI",Arial,sans-serif; font-size:16px; font-weight:700; line-height:1; }' +
    '.mtprev-sleep-val { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:700; line-height:1; }' +
    '#mtprev-t-batt .mtprev-face { justify-content:space-between; }' +
    '.mtprev-icon { font-family:"MetroIcons"; font-size:20px; opacity:0.9; line-height:1; }' +
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
              '<div class="mtprev-tile-wrap sq mtprev-configurable" id="mtprev-t-aqi"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div id="mtprev-face-a"></div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap dbl" id="mtprev-t-wthr"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<span class="mtprev-wthr-icon">c</span>' +
                '<div class="mtprev-wthr-temps">' +
                  '<div class="mtprev-wthr-high">21°C</div>' +
                  '<div class="mtprev-wthr-low">H 21°C L 14°C</div>' +
                '</div>' +
              '</div></div></div>' +
            '</div>' +
            '<div class="mtprev-row">' +
              '<div class="mtprev-tile-wrap sq mtprev-configurable" id="mtprev-t-step"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div id="mtprev-face-b"></div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap sq mtprev-configurable" id="mtprev-t-sleep"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div id="mtprev-face-c"></div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap sq mtprev-configurable" id="mtprev-t-batt"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div id="mtprev-face-d"></div>' +
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

    // ─── Hide heart rate on watches without the sensor ─────────────────────
    // Clay exposes the connected watch through clayConfig.meta. Basalt
    // (Pebble Time / Time Steel) has no optical HR sensor at all, so the
    // option is removed from the dropdowns rather than offered and then
    // showing "n/a" forever. Guarded: meta may be absent on older phone-app
    // versions, in which case the option simply stays listed.
    var watchInfo = clayConfig.meta && clayConfig.meta.activeWatchInfo;
    var platform  = watchInfo ? watchInfo.platform : null;
    var HRM_VALUE = '5';

    // ─── Configurable tiles: mirror the selectors into the preview ─────────
    // Sample values only -- the settings page has no access to live sensor
    // or weather data.
    var TILE_SLOTS = [
      { key:'tile_a_select', sfx:'a', dflt:0 },
      { key:'tile_b_select', sfx:'b', dflt:1 },
      { key:'tile_c_select', sfx:'c', dflt:2 },
      { key:'tile_d_select', sfx:'d', dflt:12 }
    ];

    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function renderFace(el, c) {
      if (!el) return;
      if (c.dual) {
        el.innerHTML =
          '<div class="mtprev-lbl">' + esc(c.t) + '</div>' +
          '<div class="mtprev-t2row"><span class="mtprev-t2icon">' + esc(c.l1i) +
            '</span><span class="mtprev-t2val">' + esc(c.l1v) + '</span></div>' +
          '<div class="mtprev-t2row"><span class="mtprev-t2icon">' + esc(c.l2i) +
            '</span><span class="mtprev-t2val">' + esc(c.l2v) + '</span></div>';
      } else {
        el.innerHTML =
          '<div class="mtprev-lbl">' + esc(c.t) + '</div>' +
          '<span class="mtprev-icon">' + esc(c.icon) + '</span>' +
          '<div class="mtprev-val">' + esc(c.v) + '</div>';
      }
    }

    function applyTileSlot(slot) {
      var item = clayConfig.getItemByMessageKey(slot.key);
      var idx = item ? parseInt(item.get(), 10) : slot.dflt;
      if (isNaN(idx) || idx < 0 || idx >= TILE_CONTENT.length) idx = slot.dflt;
      renderFace(document.getElementById('mtprev-face-' + slot.sfx), TILE_CONTENT[idx]);
    }

    TILE_SLOTS.forEach(function(slot) {
      var item = clayConfig.getItemByMessageKey(slot.key);

      if (item && platform === 'basalt' && item.$element) {
        var sel = item.$element[0] ? item.$element[0].querySelector('select')
                                   : item.$element.querySelector('select');
        if (sel) {
          for (var i = sel.options.length - 1; i >= 0; i--) {
            if (sel.options[i].value === HRM_VALUE) sel.remove(i);
          }
        }
      }

      if (item) item.on('change', function() { applyTileSlot(slot); });
      applyTileSlot(slot);
    });

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

    // ─── Translate the settings page text ────────────────────────────────────
    // Clay's config.json has no built-in per-item localization, so this
    // finds the two known English "text" blocks (and the Save button) by
    // their exact source content and swaps in a translated string if the
    // phone's language has one. navigator.language is the standard web API
    // for this — confirmed as the documented approach for phone language
    // detection in PebbleKit JS contexts. Falls back to leaving the
    // English default text in place for any unsupported language, since
    // that's already what's rendered before this runs.
    var phoneLang = ((navigator.language || 'en').split(/[-_]/)[0] || 'en').toLowerCase();
    var strings = CONFIG_I18N[phoneLang] || CONFIG_I18N.en;

    function replaceTextNode(oldText, newText) {
      if (!newText || oldText === newText) return;
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      var node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim() === oldText.trim()) {
          node.textContent = newText;
          return;
        }
      }
    }

    function setButtonLabel(oldLabel, newLabel) {
      if (!newLabel || oldLabel === newLabel) return;
      var candidates = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        var current = (el.tagName === 'INPUT') ? el.value : el.textContent;
        if (current && current.trim() === oldLabel) {
          if (el.tagName === 'INPUT') {
            el.value = newLabel;
          } else {
            el.textContent = newLabel;
          }
          return;
        }
      }
    }

    if (phoneLang !== 'en') {
      replaceTextNode(CONFIG_I18N.en.dateOrderHelp, strings.dateOrderHelp);
      replaceTextNode(CONFIG_I18N.en.healthHelp, strings.healthHelp);
      setButtonLabel(CONFIG_I18N.en.save, strings.save);
    }
  });
};