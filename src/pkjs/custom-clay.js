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
  var METROICONS_B64 = "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ADIAAQAAAAAAAQALAGMAAQAAAAAAAgAHAH8AAQAAAAAAAwAnANcAAQAAAAAABAALARcAAQAAAAAABQAPAUMAAQAAAAAABgAKAWkAAwABBAkAAAAwAAAAAwABBAkAAQAWAEsAAwABBAkAAgAOAG8AAwABBAkAAwBOAIcAAwABBAkABAAWAP8AAwABBAkABQAeASMAAwABBAkABgAUAVMAQwBvAHAAeQByAGkAZwBoAHQAIAAoAGMAKQAgADIAMAAyADYALAAgAHIAbwBvAHQAAENvcHlyaWdodCAoYykgMjAyNiwgcm9vdAAATQBlAHQAcgBvACAASQBjAG8AbgBzAABNZXRybyBJY29ucwAAUgBlAGcAdQBsAGEAcgAAUmVndWxhcgAARgBvAG4AdABGAG8AcgBnAGUAIAAyAC4AMAAgADoAIABNAGUAdAByAG8AIABJAGMAbwBuAHMAIAA6ACAAMQAxAC0AOQAtADIAMAAyADYAAEZvbnRGb3JnZSAyLjAgOiBNZXRybyBJY29ucyA6IDExLTktMjAyNgAATQBlAHQAcgBvACAASQBjAG8AbgBzAABNZXRybyBJY29ucwAAVgBlAHIAcwBpAG8AbgAgADAAMAAxAC4AMAAwADAAAFZlcnNpb24gMDAxLjAwMAAATQBlAHQAcgBvAEkAYwBvAG4AcwAATWV0cm9JY29ucwAAAAACAAAAAAAA/7UAMgAAAAEAAAAAAAAAAAAAAAAAAAAAACgAAAABAAIBAgEDAQQBBQEGAQcBCAEJAQoBCwEMAQ0BDgEPARABEQESARMBFAEVARYBFwEYARkBGgEbARwBHQEeAR8BIAEhASIBIwEkASUBJgR3YWxrCWJlZC1jbG9jawphaXItZmlsdGVyBXdhdGNoBXBob25lC2hlYXJ0LXB1bHNlC2ZpcmUtY2lyY2xlDHN1bi13aXJlbGVzcwh3aW5kc29jawpuYXZpZ2F0aW9uCHVtYnJlbGxhCGNhbGVuZGFyBnNjaG9vbBphcnJvdy1yaWdodC1jaXJjbGUtb3V0bGluZQhtb29uLW5ldxRtb29uLXdheGluZy1jcmVzY2VudBJtb29uLWZpcnN0LXF1YXJ0ZXITbW9vbi13YXhpbmctZ2liYm91cwltb29uLWZ1bGwTbW9vbi13YW5pbmctZ2liYm91cxFtb29uLWxhc3QtcXVhcnRlchRtb29uLXdhbmluZy1jcmVzY2VudA13ZWF0aGVyLXN1bm55DHdlYXRoZXItaGF6eRV3ZWF0aGVyLXBhcnRseS1jbG91ZHkOd2VhdGhlci1jbG91ZHkLd2VhdGhlci1mb2cUd2VhdGhlci1wYXJ0bHktcmFpbnkNd2VhdGhlci1yYWlueQ93ZWF0aGVyLXBvdXJpbmcTd2VhdGhlci1zbm93eS1yYWlueQ13ZWF0aGVyLXNub3d5E3dlYXRoZXItc25vd3ktaGVhdnkRd2VhdGhlci1saWdodG5pbmcMd2VhdGhlci1oYWlsDXdlYXRoZXItbmlnaHQbd2VhdGhlci1uaWdodC1wYXJ0bHktY2xvdWR5AAAAAAAAAf//AAIAAAABAAAAAOIuwukAAAAA5slX6gAAAADmyVfq";

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
    { t:"SUNSET",   dual:true,  l1i:"@", l1v:"07:14", l2i:"?", l2v:"20:03" }
  ];

  var previewHtml =
    '<style>' +
    '@font-face { font-family:"MetroIcons"; src:url(data:font/ttf;base64,' + METROICONS_B64 + ') format("truetype"); }' +
    '.mtprev-configurable { outline:1px solid #e51400; outline-offset:-1px; }' +
    '.mtprev-t2row { display:flex; align-items:center; justify-content:space-between; margin-top:2px; }' +
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
    '.mtprev-val { font-family:"Segoe UI",Arial,sans-serif; font-size:18px; font-weight:700; line-height:1; }' +
    '#mtprev-t-wthr .mtprev-face { flex-direction:row; align-items:center; justify-content:space-around; padding:6px 10px; }' +
    '.mtprev-wthr-icon { font-family:"MetroIcons"; font-size:32px; line-height:1; }' +
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
      { key:'tile_c_select', sfx:'c', dflt:2 }
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