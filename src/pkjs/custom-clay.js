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
  var METROICONS_B64 = "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dWFydGVyFG1vb24td2FuaW5nLWNyZXNjZW50B25hdjAwMDAHbmF2MDIyNQduYXYwNDUwB25hdjA2NzUHbmF2MDkwMAduYXYxMTI1B25hdjEzNTAHbmF2MTU3NQduYXYxODAwB25hdjIwMjUHbmF2MjI1MAduYXYyNDc1B25hdjI3MDAHbmF2MjkyNQduYXYzMTUwB25hdjMzNzUTd2VhdGhlci1zdW5ueS1hbGVydBZhbGVydC1vY3RhZ3JhbS1vdXRsaW5lDXdlYXRoZXItc3VubnkMd2VhdGhlci1oYXp5FXdlYXRoZXItcGFydGx5LWNsb3VkeQ53ZWF0aGVyLWNsb3VkeQt3ZWF0aGVyLWZvZxR3ZWF0aGVyLXBhcnRseS1yYWlueQ13ZWF0aGVyLXJhaW55D3dlYXRoZXItcG91cmluZxN3ZWF0aGVyLXNub3d5LXJhaW55DXdlYXRoZXItc25vd3kTd2VhdGhlci1zbm93eS1oZWF2eRF3ZWF0aGVyLWxpZ2h0bmluZwx3ZWF0aGVyLWhhaWwNd2VhdGhlci1uaWdodBt3ZWF0aGVyLW5pZ2h0LXBhcnRseS1jbG91ZHkEc21vZwpoYW5kLWhlYXJ0AAAAAf//AAIAAQAAAAwAAAAWAAAAAgABAD4APgABAAQAAAACAAAAAAAAAAEAAAAA4i7C6QAAAADmyzpSAAAAAObUE6w=";

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
    { t:"HRM",      dual:true,  l1i:"5", l1v:"74", l2i:"q", l2v:"58" }
  ];

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
    '#mtprev-t-wthr .mtprev-face { flex-direction:row; align-items:center; justify-content:space-around; padding:6px 10px; width:calc(100% - 20px); }' +
    '.mtprev-wthr-icon { font-family:"MetroIcons"; font-size:32px; line-height:1; }' +
    '.mtprev-wthr-temps { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }' +
    '.mtprev-wthr-high { font-family:"Segoe UI",Arial,sans-serif; font-size:20px; font-weight:300; line-height:1; }' +
    '.mtprev-wthr-low { font-family:"Segoe UI",Arial,sans-serif; font-size:14px; font-weight:300; opacity:0.75; line-height:1; }' +
    '#mtprev-t-slot-b .mtprev-face, #mtprev-t-slot-c .mtprev-face { justify-content:space-between; }' +
    '#mtprev-t-slot-d .mtprev-face { justify-content:space-between; }' +
    '.mtprev-icon { font-family:"MetroIcons"; font-size:20px; opacity:0.9; line-height:1; text-align:center; }' +
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
              '<div class="mtprev-tile-wrap dbl" id="mtprev-t-wthr"><div class="mtprev-tile"><div class="mtprev-face">' +
                '<span class="mtprev-wthr-icon">c</span>' +
                '<div class="mtprev-wthr-temps">' +
                  '<div class="mtprev-wthr-high">21°C</div>' +
                  '<div class="mtprev-wthr-low mtprev-clip">H 21°C L 14°C</div>' +
                '</div>' +
              '</div></div></div>' +
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
    var SECTIONS_OPEN = ['Live Tile picker'];   // headings left expanded

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
          '<div class="mtprev-lbl mtprev-clip">' + esc(c.t) + '</div>' +
          '<span class="mtprev-icon">' + esc(c.icon) + '</span>' +
          '<div class="mtprev-val mtprev-clip">' + esc(c.v) + '</div>';
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
            if (HRM_VALUES.indexOf(sel.options[i].value) !== -1) sel.remove(i);
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