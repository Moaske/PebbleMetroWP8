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