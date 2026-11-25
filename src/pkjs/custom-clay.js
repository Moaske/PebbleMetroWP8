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
  var METROICONS_B64 = "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SWNvbnMAAAAAAgAAAAAAAP+1ADIAAAABAAAAAAAAAAAAAAAAAAAAAABBAAAAAQACAQIBAwEEAQUBBgEHAQgBCQEKAQsBDAENAQ4BDwEQAREBEgETARQBFQEWARcBGAEZARoBGwEcAR0BHgEfASABIQEiASMBJAElASYBJwEoASkBKgErASwBLQEuAS8BMAExATIBMwE0ATUBNgE3ATgBOQE6ATsBPAE9AT4BPwR3YWxrCWJlZC1jbG9jawphaXItZmlsdGVyBXdhdGNoBXBob25lC2hlYXJ0LXB1bHNlC2ZpcmUtY2lyY2xlDHN1bi13aXJlbGVzcwh3aW5kc29jawpuYXZpZ2F0aW9uCHVtYnJlbGxhCGNhbGVuZGFyBnNjaG9vbBphcnJvdy1yaWdodC1jaXJjbGUtb3V0bGluZQ91bWJyZWxsYS1jbG9zZWQTd2VhdGhlci1zdW5zZXQtZG93bhF3ZWF0aGVyLXN1bnNldC11cAhtb29uLW5ldxRtb29uLXdheGluZy1jcmVzY2VudBJtb29uLWZpcnN0LXF1YXJ0ZXITbW9vbi13YXhpbmctZ2liYm91cwltb29uLWZ1bGwTbW9vbi13YW5pbmctZ2liYm91cxFtb29uLWxhc3QtcXVhcnRlchRtb29uLXdhbmluZy1jcmVzY2VudAduYXYwMDAwB25hdjAyMjUHbmF2MDQ1MAduYXYwNjc1B25hdjA5MDAHbmF2MTEyNQduYXYxMzUwB25hdjE1NzUHbmF2MTgwMAduYXYyMDI1B25hdjIyNTAHbmF2MjQ3NQduYXYyNzAwB25hdjI5MjUHbmF2MzE1MAduYXYzMzc1E3dlYXRoZXItc3VubnktYWxlcnQWYWxlcnQtb2N0YWdyYW0tb3V0bGluZQ13ZWF0aGVyLXN1bm55DHdlYXRoZXItaGF6eRV3ZWF0aGVyLXBhcnRseS1jbG91ZHkOd2VhdGhlci1jbG91ZHkLd2VhdGhlci1mb2cUd2VhdGhlci1wYXJ0bHktcmFpbnkNd2VhdGhlci1yYWlueQ93ZWF0aGVyLXBvdXJpbmcTd2VhdGhlci1zbm93eS1yYWlueQ13ZWF0aGVyLXNub3d5E3dlYXRoZXItc25vd3ktaGVhdnkRd2VhdGhlci1saWdodG5pbmcMd2VhdGhlci1oYWlsDXdlYXRoZXItbmlnaHQbd2VhdGhlci1uaWdodC1wYXJ0bHktY2xvdWR5BHNtb2cKaGFuZC1oZWFydA1mbG93ZXItcG9sbGVuBW11c2ljAAAAAf//AAIAAAABAAAAAOIuwukAAAAA5ss6UgAAAADm1BOsAAEAAAAMAAAAFgAAAAIAAQA+AD4AAQAEAAAAAgAAAAA=";

  // Mirrors ContentId in main.c. The index here IS the value the Clay select
  // sends to the watch, so the order is load-bearing.
  var TILE_CONTENT = [
    { t:"AQI",      dual:false, icon:"2", v:"Moderate" },
    { t:"STEPS",    dual:false, icon:"0", v:"5362" },
    { t:"SLEEP",    dual:false, icon:"1", v:"7h 23m" },
    { t:"MOON",     dual:false, icon:"D", v:"Waxing Gib" },
    { t:"RAIN",     dual:false, icon:":", v:"1hr: 20%" },
    { t:"AVG HR",   dual:false, icon:"5", v:"74 bpm" },
    { t:"CALORIES", dual:false, icon:"6", v:"1847 cal" },
    { t:"WEEKNR",   dual:true,  l1i:";", l1v:"37", l2i:"<", l2v:"05" },
    { t:"SUNSET",   dual:true,  l1i:"@", l1v:"07:14", l2i:"?", l2v:"20:03" },
    { t:"WIND",     dual:false, icon:"U", v:"12 km/h" },
    { t:"UV",       dual:false, icon:"7", v:"3 : Moderate" },
    { t:"UV/SMOG",  dual:true,  l1i:"7", l1v:"3", l2i:"p", l2v:"68" },
    { t:"BATT",     dual:true,  l1i:"3", l1v:"96%", l2i:"4", l2v:"73%" },
    { t:"RHR",      dual:false, icon:"q", v:"58 bpm" },
    { t:"HRM",      dual:true,  l1i:"5", l1v:"74", l2i:"q", l2v:"58" },
    // 15: the title is the place name, not a fixed label, so the sample uses
    // one long enough to show that it ellipsises.
    { t:"Amsterdam", dual:false, icon:"d", v:"18° (16°)", raw:true },
    { t:"POLLEN",   dual:false, icon:"r", v:"V high" }
  ];

  // Which plugin source each tile needs, by ContentId. A tile whose source is
  // not installed can never show anything, so it is dropped from the pickers
  // rather than offered and then left on "--" -- same reasoning as the
  // heart-rate options on Basalt. Anything absent from this map always works:
  // steps, sleep, calories and heart rate come from the watch, and moon phase,
  // week numbers and battery are computed or read locally.
  var AVAIL_WEATHER = 1, AVAIL_AIR = 2, AVAIL_POLLEN = 4,
      AVAIL_MUSIC = 8, AVAIL_CAL = 16;
  var TILE_NEEDS = {
    '0':  AVAIL_AIR,       // Air quality
    '4':  AVAIL_WEATHER,   // Rain
    '8':  AVAIL_WEATHER,   // Sunrise/sunset
    '9':  AVAIL_WEATHER,   // Wind
    '10': AVAIL_WEATHER,   // UV index
    '11': AVAIL_AIR,       // UV / Smog -- half the tile is ozone
    '15': AVAIL_WEATHER,   // Weather
    '16': AVAIL_POLLEN     // Pollen
  };
  var WIDE_NEEDS = { '0': AVAIL_WEATHER, '1': AVAIL_MUSIC, '2': AVAIL_CAL };

  var previewHtml =
    '<style>' +
    '@font-face { font-family:"MetroIcons"; src:url(data:font/ttf;base64,' + METROICONS_B64 + ') format("truetype"); }' +
    '.mtprev-configurable { outline:1px solid #e51400; outline-offset:-1px; }' +
    '.mtprev-t2row { display:flex; align-items:center; justify-content:flex-start; gap:5px; margin-top:2px; }' +
    '.mtprev-t2icon { font-family:"MetroIcons"; font-size:13px; opacity:0.9; }' +
    '.mtprev-t2val { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:600; }' +
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
    // width is calc()'d rather than 100% because these boxes are content-box:
    // a plain width:100% plus the 7px side padding makes the face 14px WIDER
    // than its tile, which pushes the value's clipping boundary 7px past the
    // tile edge. The ellipsis then never fires for a value that overflows by
    // less than that, and .mtprev-tile's overflow:hidden chops it mid-glyph
    // instead. Height is deliberately left at 100% so the vertical spacing
    // stays exactly as tuned.
    // Right padding is 2px, not 7px, to mirror the watch: draw_template_single
    // gives the value `inner.size.w + px - T1_VAL_RIGHT_INSET`, i.e. it borrows
    // back the tile's right padding and stops 2px short of the edge. Keeping
    // 7px here would ellipsise values that fit perfectly well on the watch.
    // The 7px LEFT padding is untouched, so nothing shifts position.
    '.mtprev-face { width:calc(100% - 9px); height:100%; display:flex; flex-direction:column; padding:6px 2px 5px 7px; color:#fff; transition:color 0.15s; }' +
    '.mtprev-shell.mtprev-light .mtprev-face { color:#000; }' +
    '#mtprev-t-time .mtprev-face { justify-content:center; }' +
    '.mtprev-time-num { font-family:"Segoe UI",Arial,sans-serif; font-size:44px; font-weight:100; letter-spacing:-2px; line-height:1; }' +
    '#mtprev-t-date .mtprev-face { justify-content:center; gap:2px; }' +
    '.mtprev-date-dow { font-family:"Segoe UI",Arial,sans-serif; font-size:16px; font-weight:300; line-height:1; }' +
    '.mtprev-date-dmy { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:600; opacity:0.9; line-height:1; }' +
    '#mtprev-t-slot-a .mtprev-face { justify-content:space-between; }' +
    // The watch draws every one of these with GTextOverflowModeTrailingEllipsis
    // in a fixed-height box, so a value too wide for the tile is cut off with
    // an ellipsis -- it never wraps to a second line, because there is no
    // second line to wrap to. .mtprev-clip reproduces that; without it the
    // browser helpfully wraps instead, which is the one way the preview can
    // disagree with the watch about what a tile looks like.
    '.mtprev-clip { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }' +
    '.mtprev-lbl { font-family:"Segoe UI",Arial,sans-serif; font-size:7px; font-weight:700; opacity:0.6; text-transform:uppercase; letter-spacing:0.5px; }' +
    '.mtprev-val { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:600; line-height:1; }' +
    // Overrides the side padding, so it must restate width to match -- see
    // the .mtprev-face note above.
    // The wide tile draws one of three things now, so its face is rendered by
    // JS like the four slots are. Only the weather variant wants the row
    // layout and the symmetrical padding; music and calendar are ordinary
    // column faces, so the override is scoped to a modifier class rather than
    // to the tile id.
    '#mtprev-t-wthr .mtprev-face.mtprev-wide-wthr { flex-direction:row; align-items:center; justify-content:space-around; padding:6px 10px; width:calc(100% - 20px); }' +
    // NOTE: no justify-content here. .mtprev-face is 75px tall inside a 64px
    // tile (height:100% plus 11px of content-box padding), which the square
    // tiles get away with because their label and rows live inside ONE
    // injected child -- space-between has a single item to place, so it goes
    // to the top and everything stacks naturally. The wide faces put their
    // rows directly on .mtprev-face, so space-between would spread them over
    // the full 75px and push the last line out of the tile. They stack from
    // the top instead, at the Y positions main.c actually uses.
    '.mtprev-wthr-icon { font-family:"MetroIcons"; font-size:32px; line-height:1; }' +
    '.mtprev-wthr-temps { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }' +
    '.mtprev-wthr-high { font-family:"Segoe UI",Arial,sans-serif; font-size:20px; font-weight:300; line-height:1; }' +
    // The apparent temperature follows the current one in the smaller value
    // font, matching draw_wide_weather().
    '.mtprev-wthr-feels { font-family:"Segoe UI",Arial,sans-serif; font-size:13px; font-weight:400; opacity:0.85; }' +
    '.mtprev-wthr-low { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:300; opacity:0.75; line-height:1; }' +
    // Music and calendar put their icon in the TITLE row; the label keeps
    // .mtprev-lbl so it matches every other tile heading.
    //
    // The face has 53px of content (64px tile less 6px top and 5px bottom
    // padding), and every row here is given an explicit height that adds up to
    // it. Left to the content's own height the icon -- much taller than the
    // 7px label beside it -- pushed the last line past the tile, where
    // .mtprev-tile's overflow:hidden cut it in half.
    // The icon column is a fixed 18px plus a 5px gap, so the title text starts
    // at 23px -- T2_LABEL_W on Emery. The calendar's times and description
    // line up with that text rather than with the tile edge, which is what
    // keeps them clear of the icon hanging down out of the title row.
    '.mtprev-widetitle { display:flex; align-items:center; gap:5px; height:11px; }' +
    '.mtprev-widetitle .mtprev-t2icon { font-size:11px; line-height:1; width:18px; flex:0 0 18px; }' +
    // The face's content starts 6px down in a 64px tile, so the 58px that
    // remains visible maps 1:1 onto Emery's 58px inner height -- which means
    // every offset below is literally the constant from main.c.
    // CAL_TIMES_Y 14, so 14 - 11 = 3.
    '.mtprev-cal-times { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:600; line-height:1; margin-top:3px; margin-left:23px; }' +
    // CAL_DESC_Y 32, so 32 - (14 + 14) = 4. Two lines at CAL_DESC_LH 13 end
    // at 58, exactly as on the watch. Clamped to two lines then ellipsis --
    // what wrap_break() plus a trailing-ellipsis second line produces.
    '.mtprev-cal-desc { font-family:"Segoe UI",Arial,sans-serif; font-size:10px; font-weight:400; line-height:13px;' +
      ' margin-top:4px; margin-left:23px; height:26px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }' +
    // Music: the two lines sit on template 2's own Y positions, which is what
    // makes them line up with a dual square tile beside them.
    '.mtprev-music-l1, .mtprev-music-l2 { font-family:"Segoe UI",Arial,sans-serif;' +
      ' font-size:14px; font-weight:600; line-height:1; }' +
    '.mtprev-music-l1 { margin-top:11px; }' +   // T2_LINE1_Y 22 - title row 11
    '.mtprev-music-l2 { margin-top:4px; }' +    // T2_LINE2_Y 40 - (22 + 14)
    // The small weather tile's title is a place name, so it is the one tile
    // heading that must NOT be upper-cased.
    '.mtprev-lbl.mtprev-lbl-raw { text-transform:none; }' +
    '#mtprev-t-slot-b .mtprev-face, #mtprev-t-slot-c .mtprev-face { justify-content:space-between; }' +
    '#mtprev-t-slot-d .mtprev-face { justify-content:space-between; }' +
    // Template 1 centres its icon across the WHOLE tile on the watch:
    // draw_template_single() centres it in `inner`, and `inner` is the tile
    // inset by TILE_PAD_X on both sides, so its centre is the tile's centre.
    //
    // Two things were stopping that here. The span's parent is the injected
    // #mtprev-face-* div, not .mtprev-face itself, so it is an ordinary inline
    // box rather than a flex item -- it shrink-wraps to the glyph, and
    // text-align has nothing left to centre. And .mtprev-face's padding is
    // deliberately lopsided (7px left, 2px right) so the value line can borrow
    // the right-hand padding back, which would offset a centred icon by 2.5px.
    // display:block fixes the first; the negative margins undo the second by
    // spanning the padding, and must stay in step with it.
    '.mtprev-icon { font-family:"MetroIcons"; font-size:20px; opacity:0.9; line-height:1;' +
      ' display:block; margin:0 -2px 0 -7px; text-align:center; }' +
    '.mtprev-nav-arrow { position:absolute; bottom:7px; right:9px; width:14px; height:14px; }' +
    '.mtprev-nav-arrow svg polygon { fill:#fff; }' +
    '.mtprev-shell.mtprev-light .mtprev-nav-arrow svg polygon { fill:#000; }' +
    '.mtprev-caption { font-family:"Segoe UI",Arial,sans-serif; font-size:11px; color:#888; margin-top:8px; }' +
    // Collapsible sections. The chevron is a ::after on Clay's own heading
    // component rather than an injected element, so the heading's markup is
    // left exactly as Clay built it.
    '.mtsec-head { cursor:pointer; -webkit-user-select:none; user-select:none; }' +
    '.mtsec-head::after { content:"\\25BE"; position:absolute; right:14px; top:50%;' +
      ' margin-top:-2px; font-size:13px; opacity:0.45; -webkit-transition:-webkit-transform 0.15s;' +
      ' transition:transform 0.15s; }' +
    '.mtsec-head.mtsec-closed::after { -webkit-transform:rotate(-90deg); transform:rotate(-90deg); }' +
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
              '<div class="mtprev-tile-wrap sq mtprev-configurable" id="mtprev-t-slot-a"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div id="mtprev-face-a"></div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap dbl mtprev-configurable" id="mtprev-t-wthr"><div class="mtprev-tile">' +
                '<div class="mtprev-face mtprev-wide-wthr" id="mtprev-face-wide"></div>' +
              '</div></div>' +
            '</div>' +
            '<div class="mtprev-row">' +
              '<div class="mtprev-tile-wrap sq mtprev-configurable" id="mtprev-t-slot-b"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div id="mtprev-face-b"></div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap sq mtprev-configurable" id="mtprev-t-slot-c"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<div id="mtprev-face-c"></div>' +
              '</div></div></div>' +
              '<div class="mtprev-tile-wrap sq mtprev-configurable" id="mtprev-t-slot-d"><div class="mtprev-tile"><div class="mtprev-face">' +
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

    // ─── Collapsible sections ──────────────────────────────────────────────
    // Clay has no collapsible section and no way to add one from config.json:
    // clay-config.js renders `type:"section"` as a bare <div class="section">
    // and recurses into its items -- the section is never a ClayItem, so it
    // has no id, no attributes and nothing to hook. Doing it here keeps
    // config.json portable and costs the watch nothing.
    //
    // The Save button and the health note sit at the TOP level of config.json,
    // outside every section, so collapsing can never hide them.
    var SECTIONS_OPEN = ['Live Tile picker', 'Wide tile'];   // headings left expanded

    Array.prototype.forEach.call(document.querySelectorAll('.section'), function(sec) {
      var head = sec.querySelector('.component-heading');
      // Only a section whose heading comes first can be collapsed from it.
      if (!head || head !== sec.firstElementChild) return;

      // Everything after the heading becomes the collapsible body. Moving the
      // nodes rather than hiding them one by one means Clay's own
      // ".component ~ .component" spacing rules stay intact inside.
      var body = document.createElement('div');
      while (head.nextSibling) body.appendChild(head.nextSibling);
      sec.appendChild(body);

      var open = SECTIONS_OPEN.indexOf((head.textContent || '').trim()) !== -1;
      head.className += ' mtsec-head';

      function apply() {
        body.style.display = open ? '' : 'none';
        head.className = head.className.replace(/\s*mtsec-closed/g, '') +
                         (open ? '' : ' mtsec-closed');
      }
      head.onclick = function() { open = !open; apply(); };
      apply();
    });

    // ─── Week number source: show only the input that applies ──────────────
    // config.json can't express "show this item when that toggle is on", so
    // the date picker and the CSV URL are both declared and one is hidden
    // here. Hiding rather than disabling keeps whichever value you typed, so
    // flipping back and forth doesn't lose the other one.
    (function() {
      var srcItem  = clayConfig.getItemByMessageKey('week_use_csv');
      var dateItem = clayConfig.getItemByMessageKey('week_ref_date');
      var urlItem  = clayConfig.getItemByMessageKey('week_csv_url');
      if (!srcItem || !dateItem || !urlItem) return;

      function el(item) {
        // Clay items expose $element as a minified wrapper on some versions
        // and a bare node on others.
        var e = item.$element;
        return (e && e[0]) ? e[0] : e;
      }
      function applySource() {
        var useCsv = !!srcItem.get();
        var d = el(dateItem), u = el(urlItem);
        if (d) d.style.display = useCsv ? 'none' : '';
        if (u) u.style.display = useCsv ? '' : 'none';
      }
      srcItem.on('change', applySource);
      applySource();
    })();

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

    // ─── Carry a pre-Pebble-64 accent across ──────────────────────────────────
    // Before this version the options were true Windows Phone hexes, which the
    // watch rounded down to its own 64-colour grid: #7E3878 arrived as #550055,
    // #825A2C as #AA5500. None of those old strings match an option any more, so
    // a <select> left alone would quietly drop back to the default and the user
    // would lose their colour the first time they opened settings.
    //
    // Applying the watch's own rounding (GColorFromRGBA truncates each channel
    // with >> 6) to the saved value lands it exactly on one of the new options,
    // because the new options ARE the grid. So the picker comes up showing the
    // colour the watch has been displaying all along.
    //
    // item.get() is no help here -- the select has already fallen back -- so the
    // raw value is read from Clay's own localStorage copy, the same place
    // index.js reads it from.
    function migrateAccent() {
      if (!accentItem) return;
      var raw;
      try {
        var st = JSON.parse(localStorage.getItem('clay-settings')) || {};
        raw = st[accentItem.messageKey] || st.accent_color;
      } catch (e) { return; }
      if (typeof raw !== 'string' || !/^#?[0-9a-f]{6}$/i.test(raw)) return;
      var have = '#' + raw.replace('#', '').toUpperCase();

      // The list is read off the element rather than repeated here, so it cannot
      // drift out of step with config.json.
      var el = accentItem.$element;
      var sel = el && (el[0] ? el[0].querySelector('select') : el.querySelector('select'));
      if (!sel) return;
      var opts = [];
      for (var o = 0; o < sel.options.length; o++) {
        var ov = sel.options[o].value;
        if (/^#[0-9a-f]{6}$/i.test(ov)) opts.push(ov.toUpperCase());
      }
      if (opts.indexOf(have) !== -1) return;   // offered as-is, nothing to do

      // Two separate reasons a saved value may not be offered, and both land here.
      //
      // It may be off-grid: before the Pebble-64 palette the options were true
      // Windows Phone hexes, which the watch rounded down with >> 6 per channel
      // (#7E3878 arrived as #550055). Applying that same rounding recovers the
      // colour the watch was actually showing.
      //
      // Or it may be exact but dropped: this release removes Cobalt #0055FF --
      // which was the default -- and Violet #AA00FF. Rounding does nothing for
      // those, so the nearest offered colour is the answer.
      //
      // Either way a <select> set to a value it has no option for renders as
      // nothing and silently resets the user to the default, so always land on
      // something real.
      var q = '#';
      for (var i = 1; i < 7; i += 2) {
        q += ('0' + (0x55 * (parseInt(have.substr(i, 2), 16) >> 6)).toString(16))
               .slice(-2).toUpperCase();
      }
      if (opts.indexOf(q) !== -1) { try { accentItem.set(q); } catch (e) {} return; }

      // Nearest offered. Plain RGB distance ties too often to be useful here --
      // Violet is equidistant from Indigo and Purple, Cobalt from Indigo and
      // Navy -- and breaks those ties by list order, which throws the hue away.
      // This is the "redmean" weighting, scaled by 256 to stay in integers; it
      // keeps Violet on Purple and Cobalt on Navy.
      function chan(hex, i) { return parseInt(hex.substr(i, 2), 16); }
      var best = null, bestD = Infinity;
      for (var k = 0; k < opts.length; k++) {
        var dR = chan(opts[k], 1) - chan(q, 1);
        var dG = chan(opts[k], 3) - chan(q, 3);
        var dB = chan(opts[k], 5) - chan(q, 5);
        var rbar = (chan(opts[k], 1) + chan(q, 1)) >> 1;
        var d = (512 + rbar) * dR * dR + 1024 * dG * dG + (767 - rbar) * dB * dB;
        if (d < bestD) { bestD = d; best = opts[k]; }
      }
      if (best) { try { accentItem.set(best); } catch (e) {} }
    }
    migrateAccent();

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
    // Every content type that needs the optical sensor: average, resting, and
    // the combined current/resting tile. Must stay in step with ContentId.
    var HRM_VALUES = ['5', '13', '14'];

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

    // ─── Wind sample follows the Beaufort toggle ────────────────────────────
    // There is no wind-unit setting any more: the figure arrives from the
    // weather source already in whatever unit the Pebble app is set to, so the
    // page cannot know which one that is and the sample stays in km/h. The
    // Beaufort toggle is the one thing it CAN reproduce, and it converts from
    // m/s exactly as msToBeaufort() in index.js does -- which is why 12 km/h
    // reads as force 2 here and not the force 3 the old km/h table gave.
    var WIND_SAMPLE_KMH = 12;

    function windSample() {
      var it = clayConfig.getItemByMessageKey('wind_bft_toggle');
      if (it && it.get()) {
        var ms = WIND_SAMPLE_KMH / 3.6;
        var bounds = [0.5, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
        for (var b = 0; b < bounds.length; b++) {
          if (ms < bounds[b]) return b + ' bft';
        }
        return '12 bft';
      }
      return WIND_SAMPLE_KMH + ' km/h';
    }

    // ─── What the phone found installed ────────────────────────────────────
    // index.js puts the bitmask on clay.meta.userData just before it generates
    // this page's URL. It cannot come through localStorage: this page is a
    // webview on its own origin and shares nothing with the pkjs sandbox.
    //
    // `known` is false when enumeratePlugins() could not be consulted at all
    // (an older phone app, say). Hiding everything on that basis would be
    // worse than hiding nothing, so nothing is hidden.
    var userData  = (clayConfig.meta && clayConfig.meta.userData) || {};
    var avail     = parseInt(userData.avail, 10);
    var availKnown = userData.known === true && !isNaN(avail);
    if (isNaN(avail)) avail = 0;

    function haveSource(bit) { return !availKnown || (avail & bit) !== 0; }

    // ─── "Install the OpenMeteo plugin" prompt ──────────────────────────────
    // The link must go through Pebble.openUrl rather than being left as a
    // plain anchor. A bare <a> either navigates this webview away from the
    // settings page -- losing anything unsaved -- or is stopped by the page's
    // own url filter, which only allows the config host. openUrl recognises an
    // appstore link and opens the plugin's store page inside the Pebble app,
    // with no browser and no "wants to open..." prompt; anything else it would
    // hand to the browser after asking. The https form is used rather than
    // pebble://appstore/<id> because that scheme defaults to the REBBLE feed,
    // and this plugin is on Pebble's.
    (function wirePluginLink() {
      var a = document.getElementById('mt-om-link');
      if (!a) return;
      var url = a.getAttribute('href');

      // Already installed: the prompt is just noise, so drop the whole
      // paragraph. Only when we actually know -- see availKnown.
      if (availKnown && (avail & AVAIL_AIR)) {
        var box = a;
        while (box && box.className.indexOf('component') < 0) box = box.parentNode;
        if (box) box.style.display = 'none';
        return;
      }

      a.addEventListener('click', function(e) {
        e.preventDefault();
        if (window.Pebble && typeof Pebble.openUrl === 'function') {
          try {
            var r = Pebble.openUrl(url);
            // It answers with a promise; a rejection means the host declined,
            // and there is nothing useful to do about it but log.
            if (r && typeof r.catch === 'function') {
              r.catch(function(err) { console.log('openUrl failed: ' + err); });
            }
            return;
          } catch (err) { /* fall through to the old path */ }
        }
        // Older app versions have no bridge; a new tab at least keeps the
        // settings page intact.
        try { window.open(url, '_blank'); } catch (err2) {}
      });
    })();

    // Drop options from a <select>, then make sure Clay agrees about what is
    // left selected.
    //
    // Removing the selected <option> makes the browser fall back to the first
    // remaining one on its own, so the VALUE is already right. What is not is
    // the label Clay shows beside the control: the select component refreshes
    // that only on a 'change' event, and calling item.set() would not raise
    // one, because its manipulator returns early when the value it is handed
    // already matches. Without the explicit trigger the control goes on
    // displaying the name of an option that no longer exists.
    function pruneSelect(item, shouldDrop) {
      if (!item || !item.$element) return;
      var root = item.$element[0] ? item.$element[0] : item.$element;
      var sel = root && root.querySelector ? root.querySelector('select') : null;
      if (!sel) return;

      var before = sel.value;
      var removed = false;
      for (var i = sel.options.length - 1; i >= 0; i--) {
        if (shouldDrop(sel.options[i].value)) { sel.remove(i); removed = true; }
      }
      if (!removed || !sel.options.length) return;
      if (sel.value !== before) {
        try { item.trigger('change'); } catch (e) {}
      }
    }

    // Found by label rather than by index: TILE_CONTENT is indexed by ContentId
    // and only ever appended to, but an index hard-coded here would still be a
    // second place to remember on the next append.
    function refreshWindSample() {
      for (var i = 0; i < TILE_CONTENT.length; i++) {
        if (TILE_CONTENT[i].t === 'WIND') { TILE_CONTENT[i].v = windSample(); return; }
      }
    }

    // The feels-like toggle drives the small weather tile's value and the
    // bracket on the wide one, so both have to be redrawn when it changes.
    function showFeels() {
      var it = clayConfig.getItemByMessageKey('feels_like_toggle');
      return it ? !!it.get() : true;
    }
    function refreshFeelsSample() {
      for (var i = 0; i < TILE_CONTENT.length; i++) {
        if (TILE_CONTENT[i].raw) {       // the small weather tile
          TILE_CONTENT[i].v = showFeels() ? '18° (16°)' : '18°C';
          return;
        }
      }
    }

    function renderFace(el, c) {
      if (!el) return;
      if (c.dual) {
        el.innerHTML =
          '<div class="mtprev-lbl mtprev-clip">' + esc(c.t) + '</div>' +
          '<div class="mtprev-t2row"><span class="mtprev-t2icon">' + esc(c.l1i) +
            '</span><span class="mtprev-t2val mtprev-clip">' + esc(c.l1v) + '</span></div>' +
          '<div class="mtprev-t2row"><span class="mtprev-t2icon">' + esc(c.l2i) +
            '</span><span class="mtprev-t2val mtprev-clip">' + esc(c.l2v) + '</span></div>';
      } else {
        el.innerHTML =
          '<div class="mtprev-lbl mtprev-clip' + (c.raw ? ' mtprev-lbl-raw' : '') + '">' +
            esc(c.t) + '</div>' +
          '<span class="mtprev-icon">' + esc(c.icon) + '</span>' +
          '<div class="mtprev-val mtprev-clip">' + esc(c.v) + '</div>';
      }
    }

    function applyTileSlot(slot) {
      refreshWindSample();
      refreshFeelsSample();
      var item = clayConfig.getItemByMessageKey(slot.key);
      var idx = item ? parseInt(item.get(), 10) : slot.dflt;
      if (isNaN(idx) || idx < 0 || idx >= TILE_CONTENT.length) idx = slot.dflt;
      renderFace(document.getElementById('mtprev-face-' + slot.sfx), TILE_CONTENT[idx]);
    }

    TILE_SLOTS.forEach(function(slot) {
      var item = clayConfig.getItemByMessageKey(slot.key);

      pruneSelect(item, function(value) {
        // No optical sensor on Basalt, and no tile for a source the phone
        // could not find.
        if (platform === 'basalt' && HRM_VALUES.indexOf(value) !== -1) return true;
        var need = TILE_NEEDS[value];
        return need !== undefined && !haveSource(need);
      });

      if (item) item.on('change', function() { applyTileSlot(slot); });
      applyTileSlot(slot);
    });

    // ─── The wide tile ──────────────────────────────────────────────────────
    function renderWide(which) {
      var el = document.getElementById('mtprev-face-wide');
      if (!el) return;
      el.className = 'mtprev-face mtprev-wide-' +
                     (which === 1 ? 'music' : which === 2 ? 'cal' : 'wthr');
      if (which === 1) {
        el.innerHTML =
          '<div class="mtprev-widetitle"><span class="mtprev-t2icon">s</span>' +
            '<span class="mtprev-lbl">Now playing</span></div>' +
          '<div class="mtprev-music-l1 mtprev-clip">Paranoid Android</div>' +
          '<div class="mtprev-music-l2 mtprev-clip">Radiohead</div>';
      } else if (which === 2) {
        el.innerHTML =
          '<div class="mtprev-widetitle"><span class="mtprev-t2icon">;</span>' +
            '<span class="mtprev-lbl">Next event</span></div>' +
          '<div class="mtprev-cal-times mtprev-clip">14:00-15:30</div>' +
          '<div class="mtprev-cal-desc">Quarterly review with the whole team</div>';
      } else {
        el.innerHTML =
          '<span class="mtprev-wthr-icon">c</span>' +
          '<div class="mtprev-wthr-temps">' +
            '<div class="mtprev-wthr-high">21°C' +
              (showFeels() ? '<span class="mtprev-wthr-feels"> (19°)</span>' : '') +
            '</div>' +
            '<div class="mtprev-wthr-low mtprev-clip">H 21°C L 14°C</div>' +
          '</div>';
      }
    }

    var wideItem = clayConfig.getItemByMessageKey('wide_slot_select');
    pruneSelect(wideItem, function(value) {
      var need = WIDE_NEEDS[value];
      return need !== undefined && !haveSource(need);
    });
    function applyWide() {
      var v = wideItem ? parseInt(wideItem.get(), 10) : 0;
      renderWide(isNaN(v) ? 0 : v);
    }
    if (wideItem) wideItem.on('change', applyWide);
    applyWide();

    // Toggling Beaufort rewrites the sample, so every slot has to be redrawn --
    // the wind tile may be sitting in any of the four, or in none.
    var windBftItem = clayConfig.getItemByMessageKey('wind_bft_toggle');
    if (windBftItem) {
      windBftItem.on('change', function() {
        TILE_SLOTS.forEach(function(slot) { applyTileSlot(slot); });
      });
    }

    // Feels-like reaches two tiles: the small weather one in any of the four
    // slots, and the bracket on the wide weather tile.
    var feelsItem = clayConfig.getItemByMessageKey('feels_like_toggle');
    if (feelsItem) {
      feelsItem.on('change', function() {
        TILE_SLOTS.forEach(function(slot) { applyTileSlot(slot); });
        applyWide();
      });
    }

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