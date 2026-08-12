#include <pebble.h>

// ─── Screen & tile geometry ─────────────────────────────────────────────────
// Pebble Time 2 / Emery: 200 x 228 px. No outer padding — tiles run edge to
// edge with a 4px gap between them, per exact division:
//   Row 1: 132 (time) + 4 (gap) + 64 (date)             = 200
//   Row 2: 64 (aqi)   + 4 (gap) + 132 (weather)          = 200
//   Row 3: 64 (steps) + 4 (gap) + 64 (sleep) + 4 (gap) + 64 (battery) = 200
#define SCREEN_W        200
#define SCREEN_H        228
#define TILE_GAP        4
#define TILE_SQ         64          // square tile side
#define TILE_DBL        132         // double tile width (64+64+4)

#define ROW1_Y          0
#define ROW2_Y          (ROW1_Y + TILE_SQ + TILE_GAP)   // 68
#define ROW3_Y          (ROW2_Y + TILE_SQ + TILE_GAP)   // 136
#define ROWS_BOTTOM     (ROW3_Y + TILE_SQ)               // 200

#define COL1_X          0
#define COL2_X          (COL1_X + TILE_SQ + TILE_GAP)   // 68
#define COL3_X          (COL2_X + TILE_SQ + TILE_GAP)   // 136

// Nav arrow: hand-drawn (circle + chevron), sized to fit the leftover
// band below the tile grid (SCREEN_H - ROWS_BOTTOM = 28px tall).
// Nav arrow icon size — matches the ARROW_RIGHT / ARROW_RIGHT_DARK asset.
#define ARROW_ICON_SIZE 28
#define ARROW_CENTER_X  (SCREEN_W - 4 - ARROW_ICON_SIZE / 2)   // 172
#define ARROW_CENTER_Y  (ROWS_BOTTOM + (SCREEN_H - ROWS_BOTTOM) / 2)

// Tile icon sizes
#define TILE_ICON_SIZE     25   // steps / sleep / aqi

// ─── AppMessage keys ──────────────────────────────────────────────────────────
// IMPORTANT: package.json's array-style "messageKeys" get their actual
// numeric IDs allocated by the build tool at compile time - they are NOT
// guaranteed to be sequential from 0 in declaration order. The build system
// injects the real values as MESSAGE_KEY_<Name> macros (via the
// auto-generated message_keys.auto.h), so we alias to those directly rather
// than hardcoding numbers that might not match what's actually allocated.
#define KEY_ACCENT_R     MESSAGE_KEY_ACCENT_R
#define KEY_ACCENT_G     MESSAGE_KEY_ACCENT_G
#define KEY_ACCENT_B     MESSAGE_KEY_ACCENT_B
#define KEY_AQI          MESSAGE_KEY_AQI
#define KEY_WEATHER_CODE MESSAGE_KEY_WEATHER_CODE
#define KEY_TEMP_HIGH    MESSAGE_KEY_TEMP_HIGH
#define KEY_TEMP_LOW     MESSAGE_KEY_TEMP_LOW
#define KEY_TEMP_CURRENT MESSAGE_KEY_TEMP_CURRENT
#define KEY_THEME        MESSAGE_KEY_THEME
#define KEY_TEMP_UNIT    MESSAGE_KEY_TEMP_UNIT  // 0 = Celsius, 1 = Fahrenheit
#define KEY_DATE_ORDER   MESSAGE_KEY_DATE_ORDER // 0 = DD/MM, 1 = MM/DD
#define KEY_LOCATION      MESSAGE_KEY_LOCATION   // city name, string
#define KEY_PHONE_BATTERY MESSAGE_KEY_PHONE_BATTERY   // 0-100, or absent until phone sends one
#define KEY_PHONE_CHARGING MESSAGE_KEY_PHONE_CHARGING // 0/1
// Steps, sleep, and battery are read natively on-watch (HealthService /
// battery_state_service) — they never come over AppMessage.

// ─── Persistent storage keys ─────────────────────────────────────────────────
#define PERSIST_ACCENT_R   100
#define PERSIST_ACCENT_G   101
#define PERSIST_ACCENT_B   102
#define PERSIST_THEME      103
#define PERSIST_TEMP_UNIT  104
#define PERSIST_DATE_ORDER 105

// ─── Flip animation ──────────────────────────────────────────────────────────
#define FLIP_DURATION_MS   350   // half-flip (fold down)
#define FLIP_DELAY_MS      1000  // second tile starts 1 s after first

// ─── Wake detection ───────────────────────────────────────────────────────────
// There's no direct "backlight just turned on" event in the public SDK, and
// a watchface can't use TouchService (so double-tap-on-screen can't be
// subscribed to directly either — see project README). light_is_on() is a
// poll function, so we poll it on a short repeating timer and trigger on the
// false->true edge. This catches every cause of the backlight coming on —
// wrist flick, screen tap/double-tap, button press — uniformly, since we're
// watching the actual outcome rather than one specific gesture.
#define LIGHT_POLL_MS  250

// ─── Globals ─────────────────────────────────────────────────────────────────
static Window *s_window;
static Layer  *s_canvas_layer;

// Accent colour (default: Windows Phone Amber)
// s_accent is what's actually used for drawing (quantized to Pebble's 2-bit
// per channel colour space by GColorFromRGB). We separately track the raw
// 0-255 components so a partial AppMessage (missing one of R/G/B) can fall
// back to the last known full-precision value instead of a lossy re-read
// of the quantized GColor.
static GColor  s_accent;
static uint8_t s_accent_r = 240, s_accent_g = 163, s_accent_b = 10; // Amber default

// Theme: false = dark (black bg, white text/icons), true = light (white bg,
// black text/icons). Pebble's color hardware only has 4 discrete levels per
// channel (0/85/170/255), so white text on a bright accent tile can read
// poorly — the light theme exists as an escape hatch for bright accents.
static bool s_theme_light = false;
static bool s_temp_unit_fahrenheit = false; // false = Celsius (default)
static bool s_date_order_mdy = false; // false = DD/MM (default), true = MM/DD

// Data (weather/AQI arrive via AppMessage from the phone)
static int  s_aqi       = 0;
static int  s_wmo_icon  = 0;   // maps to icon string index
static int  s_temp_high = 0;
static int  s_temp_low  = 0;
static int  s_temp_current = 0;
static char s_location[32] = "";
static int  s_phone_battery = -1; // -1 = not received from phone yet
static bool s_phone_charging = false;

// Data (steps/sleep read natively from Pebble HealthService — no phone needed)
static int  s_steps     = 0;
static int  s_sleep_h   = 0;
static int  s_sleep_m   = 0;

// Flip state
typedef enum {
  TILE_TIME = 0,
  TILE_DATE,
  TILE_AQI,
  TILE_WEATHER,
  TILE_STEPS,
  TILE_SLEEP,
  TILE_BATTERY,
  TILE_COUNT
} TileId;

static bool   s_tile_flipping[TILE_COUNT];
static int    s_flip_phase[TILE_COUNT];   // 0=normal, 1=fold-down, 2=fold-up
static AppTimer *s_flip_timer[TILE_COUNT];
static AppTimer *s_flip_delay_timer;
static AppTimer *s_light_poll_timer;
static bool s_light_was_on = false;

// ─── Weather icon strings (WMO code groups → index) ──────────────────────────
// Index matches what JS sends in KEY_WEATHER_CODE after mapping
static const char *WEATHER_ICONS[] = {
  "a",  // 0: clear / sunny
  "b",  // 1: mainly clear
  "c",  // 2: partly cloudy
  "d",  // 3: overcast
  "e",  // 4: fog
  "f",  // 5: drizzle
  "g",  // 6: rain
  "h",  // 7: heavy rain
  "i",  // 8: freezing rain / sleet
  "j",  // 9: snow
  "k",  // 10: heavy snow
  "l",  // 11: thunderstorm
  "m",  // 12: thunderstorm + hail
};

// ─── Date tile localization ──────────────────────────────────────────────────
// i18n_get_system_locale() reads the WATCH's own locale setting directly —
// no phone round-trip needed. Only Western-charset languages are
// supported, and only with unaccented abbreviations (e.g. Spanish "MIE"
// not "MIÉ") — our baked fonts only include plain ASCII A-Z, and adding
// accented glyphs would mean re-baking every font resource. Anything
// outside this list (or an accented form we deliberately don't use)
// falls back to English.
typedef struct {
  const char *lang_prefix;         // matched against the start of the locale string
  const char *weekdays[7];         // indexed by tm_wday: Sun..Sat
} LocaleWeekdays;

static const LocaleWeekdays WEEKDAY_TABLE[] = {
  { "en", { "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT" } },
  { "fr", { "DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM" } },
  { "de", { "SO",  "MO",  "DI",  "MI",  "DO",  "FR",  "SA"  } },
  { "es", { "DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB" } },
  { "it", { "DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB" } },
  { "nl", { "ZO",  "MA",  "DI",  "WO",  "DO",  "VR",  "ZA"  } },
  { "pt", { "DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB" } },
};
#define WEEKDAY_TABLE_COUNT (sizeof(WEEKDAY_TABLE) / sizeof(WEEKDAY_TABLE[0]))

// Returns the weekday label array to use, based on the watch's own
// locale. Date order (DD/MM vs MM/DD) is NOT inferred from locale here —
// that was tried initially using US-English detection, but the Pebble
// app's language picker only offers one generic "English" option with no
// region distinction, so it reports an en_US-style locale even for
// non-US English speakers. Date order is a separate, explicit user
// setting instead (KEY_DATE_ORDER) — see draw_tile_content's TILE_DATE
// case.
static const char *const *locale_weekdays(void) {
  const char *locale = i18n_get_system_locale(); // e.g. "en_US", "nl_NL"

  for (size_t i = 0; i < WEEKDAY_TABLE_COUNT; i++) {
    size_t prefix_len = strlen(WEEKDAY_TABLE[i].lang_prefix);
    if (strncmp(locale, WEEKDAY_TABLE[i].lang_prefix, prefix_len) == 0) {
      return WEEKDAY_TABLE[i].weekdays;
    }
  }
  return WEEKDAY_TABLE[0].weekdays; // fallback: English
}

// ─── Tile rects ──────────────────────────────────────────────────────────────
static GRect tile_rect(TileId id) {
  switch (id) {
    case TILE_TIME:    return GRect(COL1_X, ROW1_Y, TILE_DBL, TILE_SQ);
    case TILE_DATE:    return GRect(COL3_X, ROW1_Y, TILE_SQ,  TILE_SQ);
    case TILE_AQI:     return GRect(COL1_X, ROW2_Y, TILE_SQ,  TILE_SQ);
    case TILE_WEATHER: return GRect(COL2_X, ROW2_Y, TILE_DBL, TILE_SQ);
    case TILE_STEPS:   return GRect(COL1_X, ROW3_Y, TILE_SQ,  TILE_SQ);
    case TILE_SLEEP:   return GRect(COL2_X, ROW3_Y, TILE_SQ,  TILE_SQ);
    case TILE_BATTERY: return GRect(COL3_X, ROW3_Y, TILE_SQ,  TILE_SQ);
    default:           return GRect(0, 0, 0, 0);
  }
}

// ─── HealthService: steps (same-day total) ────────────────────────────────────
static void update_steps_data(void) {
  time_t start = time_start_of_today();
  time_t end   = time(NULL);

  HealthServiceAccessibilityMask mask =
    health_service_metric_accessible(HealthMetricStepCount, start, end);

  if (mask & HealthServiceAccessibilityMaskAvailable) {
    s_steps = (int)health_service_sum_today(HealthMetricStepCount);
  }
}

// ─── HealthService: sleep (same-day total) ────────────────────────────────────
// Matches how the built-in Pebble Health app (and most third-party
// watchfaces) report sleep: a running total for today that resets at
// midnight, rather than only the most recently completed session. A
// same-day total also naturally combines a nap with the main sleep block.
static void update_sleep_data(void) {
  time_t start = time_start_of_today();
  time_t end   = time(NULL);

  HealthServiceAccessibilityMask mask =
    health_service_metric_accessible(HealthMetricSleepSeconds, start, end);

  if (mask & HealthServiceAccessibilityMaskAvailable) {
    int total_s = (int)health_service_sum_today(HealthMetricSleepSeconds);
    s_sleep_h = total_s / SECONDS_PER_HOUR;
    s_sleep_m = (total_s % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE;
  }
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────
static GFont s_font_time;     // large thin font for time digits
static GFont s_font_med;      // medium bold for values
static GFont s_font_sm;       // small for labels / sub-values
static GFont s_font_weather;  // weather icon font (MDI subset)
static GFont s_font_icons_mini; // battery tile watch/phone icons (MDI subset)

// Two variants of each tile icon: white (dark theme) and black (light
// theme). Pebble's color compositing has no software color-invert for
// color displays (GCompOpAssignInverted is monochrome-only), so recoloring
// at draw time isn't possible — we keep both baked assets and just pick
// the right one per theme.
static GBitmap *s_icon_steps,   *s_icon_steps_dark;
static GBitmap *s_icon_sleep,   *s_icon_sleep_dark;
static GBitmap *s_icon_aqi,     *s_icon_aqi_dark;
static GBitmap *s_icon_arrow,   *s_icon_arrow_dark;

static GColor theme_fg(void)  { return s_theme_light ? GColorBlack : GColorWhite; }
static GColor theme_bg(void)  { return s_theme_light ? GColorWhite : GColorBlack; }

// Weather data always arrives from the phone in Celsius (that's what
// Open-Meteo returns and what index.js sends) — conversion to the
// person's preferred display unit happens here at draw time, so a unit
// change doesn't require re-fetching or re-sending anything.
static int display_temp(int celsius) {
  if (s_temp_unit_fahrenheit) {
    return (celsius * 9) / 5 + 32;
  }
  return celsius;
}

static char temp_unit_char(void) {
  return s_temp_unit_fahrenheit ? 'F' : 'C';
}

static void draw_tile_content(GContext *ctx, TileId id, GRect r) {
  GColor fg = theme_fg();
  graphics_context_set_text_color(ctx, fg);

  int px = 4, py = 3;
  GRect inner = GRect(r.origin.x + px, r.origin.y + py,
                      r.size.w - px*2, r.size.h - py*2);

  char buf[32];

  switch (id) {
    case TILE_TIME: {
      time_t now = time(NULL);
      struct tm *t = localtime(&now);
      bool is_24h = clock_is_24h_style();
      if (is_24h) {
        snprintf(buf, sizeof(buf), "%02d:%02d", t->tm_hour, t->tm_min);
      } else {
        snprintf(buf, sizeof(buf), "%d:%02d", t->tm_hour % 12 == 0 ? 12 : t->tm_hour % 12, t->tm_min);
      }
      // -16 overshot all the way to the top-aligned, so splitting the
      // difference back toward centre. +2px horizontal nudge added too.
      // Confirmed against the actual repo: settled at -5 after a further
      // manual nudge beyond the -8 this comment used to say.
      const int TIME_Y_OFFSET = -5;
      const int TIME_X_OFFSET = 2;
      GRect tr = GRect(inner.origin.x + TIME_X_OFFSET, inner.origin.y + TIME_Y_OFFSET, inner.size.w, inner.size.h);
      graphics_draw_text(ctx, buf, s_font_time, tr,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      // AM/PM, top-right, same style/position as the other tiles' titles —
      // only shown in 12h mode. A slight overlap with the big time digits
      // is an accepted trade-off rather than a bug to fix.
      if (!is_24h) {
        GRect ampm_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 12);
        graphics_draw_text(ctx, t->tm_hour < 12 ? "AM" : "PM", s_font_sm, ampm_r,
                           GTextOverflowModeWordWrap, GTextAlignmentRight, NULL);
      }
      break;
    }

    case TILE_DATE: {
      time_t now = time(NULL);
      struct tm *t = localtime(&now);
      const char *const *days = locale_weekdays();
      GRect day_r = GRect(inner.origin.x, inner.origin.y + 6, inner.size.w, 26);
      graphics_draw_text(ctx, days[t->tm_wday], s_font_med, day_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      if (s_date_order_mdy) {
        snprintf(buf, sizeof(buf), "%02d/%02d", t->tm_mon + 1, t->tm_mday);
      } else {
        snprintf(buf, sizeof(buf), "%02d/%02d", t->tm_mday, t->tm_mon + 1);
      }
      GRect dm_r = GRect(inner.origin.x, inner.origin.y + 30, inner.size.w, 24);
      graphics_draw_text(ctx, buf, s_font_med, dm_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_AQI: {
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 12);
      graphics_draw_text(ctx, "AQI", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      GRect icon_r = GRect(inner.origin.x + (inner.size.w - TILE_ICON_SIZE) / 2,
                           inner.origin.y + 13, TILE_ICON_SIZE, TILE_ICON_SIZE);
      graphics_context_set_compositing_mode(ctx, GCompOpSet);
      graphics_draw_bitmap_in_rect(ctx, s_theme_light ? s_icon_aqi_dark : s_icon_aqi, icon_r);
      snprintf(buf, sizeof(buf), "%d", s_aqi);
      GRect val_r = GRect(inner.origin.x, inner.origin.y + 40, inner.size.w, inner.size.h - 40);
      graphics_draw_text(ctx, buf, s_font_med, val_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_WEATHER: {
      // Location name, top-left, same style/position as the other tiles'
      // titles (AQI / STEPS / SLEEP / BATT).
      GRect loc_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 12);
      graphics_draw_text(ctx, s_location, s_font_sm, loc_r,
                         GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);

      // Small left margin shifts icon+text as a group toward the tile's
      // centre, since the icon glyph's own left-side bearing made the
      // whole block look off-centre hugging the left edge before.
      int left_margin = 6;
      int top = inner.origin.y + 14; // pushed down to make room for the label above
      GRect icon_r = GRect(inner.origin.x + left_margin, top - 3, 36, 38);
      graphics_draw_text(ctx, WEATHER_ICONS[s_wmo_icon < 13 ? s_wmo_icon : 0], s_font_weather, icon_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      int tx = inner.origin.x + left_margin + 40;
      int tw = inner.size.w - left_margin - 40;

      // Top line (bold): current temperature
      // +4 shift to line up with the icon (which sits at top-3).
      snprintf(buf, sizeof(buf), "%d\u00B0%c", display_temp(s_temp_current), temp_unit_char());
      GRect cur_r = GRect(tx, top + 4, tw, 22);
      graphics_draw_text(ctx, buf, s_font_med, cur_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      // Second line: today's high/low, full-strength colour (no more
      // dimming — it was hurting readability rather than helping hierarchy).
      // TrailingEllipsis rather than WordWrap here: this line is close to
      // the available width, and word-wrap on an overflow would bleed a
      // stray character below the tile the same way the sleep tile's "m"
      // did — ellipsis truncates safely in place instead.
      snprintf(buf, sizeof(buf), "H %d\u00B0%c L %d\u00B0%c",
              display_temp(s_temp_high), temp_unit_char(),
              display_temp(s_temp_low), temp_unit_char());
      GRect hl_r = GRect(tx, top + 26, tw, inner.size.h - (top + 26 - inner.origin.y));
      graphics_draw_text(ctx, buf, s_font_sm, hl_r,
                         GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_STEPS: {
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 12);
      graphics_draw_text(ctx, "STEPS", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      GRect icon_r = GRect(inner.origin.x + (inner.size.w - TILE_ICON_SIZE) / 2,
                           inner.origin.y + 13, TILE_ICON_SIZE, TILE_ICON_SIZE);
      graphics_context_set_compositing_mode(ctx, GCompOpSet);
      graphics_draw_bitmap_in_rect(ctx, s_theme_light ? s_icon_steps_dark : s_icon_steps, icon_r);
      snprintf(buf, sizeof(buf), "%d", s_steps);
      GRect val_r = GRect(inner.origin.x, inner.origin.y + 40, inner.size.w, inner.size.h - 40);
      graphics_draw_text(ctx, buf, s_font_med, val_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_SLEEP: {
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 12);
      graphics_draw_text(ctx, "SLEEP", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      GRect icon_r = GRect(inner.origin.x + (inner.size.w - TILE_ICON_SIZE) / 2,
                           inner.origin.y + 13, TILE_ICON_SIZE, TILE_ICON_SIZE);
      graphics_context_set_compositing_mode(ctx, GCompOpSet);
      graphics_draw_bitmap_in_rect(ctx, s_theme_light ? s_icon_sleep_dark : s_icon_sleep, icon_r);
      // val_r borrows back the 4px right-padding (px) that's reserved
      // everywhere else — the tile's accent fill already extends that
      // far, so text using it doesn't actually look like it's leaving
      // the tile. That's what makes room for "7h23m" to fit again.
      GRect val_r = GRect(inner.origin.x, inner.origin.y + 40, inner.size.w + px, inner.size.h - 40);
      if (s_sleep_h == 0 && s_sleep_m == 0) {
        graphics_draw_text(ctx, "--", s_font_med, val_r,
                           GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      } else {
        // TrailingEllipsis kept as a safety net rather than reverting to
        // plain WordWrap — if this is ever still a pixel or two too wide
        // on some font/rendering edge case, it truncates cleanly in place
        // instead of repeating the original bleed-outside-the-tile bug.
        snprintf(buf, sizeof(buf), "%dh%02dm", s_sleep_h, s_sleep_m);
        graphics_draw_text(ctx, buf, s_font_med, val_r,
                           GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
      }
      break;
    }

    case TILE_BATTERY: {
      BatteryChargeState bat = battery_state_service_peek();
      int watch_pct = bat.charge_percent;
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 12);
      graphics_draw_text(ctx, "BATT", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      // Two compact gauges below the title: watch on top, phone below.
      // Text reverts to the small title font (s_font_sm) rather than the
      // bigger value font — that's what actually makes room for two full
      // rows in a 64px tile — and bars are thinner (5px vs the old
      // single-gauge 7px) for the same reason.
      int text_h = 10;
      int bar_h  = 5;
      int bar_w  = inner.size.w;

      // Text-to-bar gap pushed to 4px — 2px wasn't visibly different from
      // the original 1px (same font-metric issue as the time tile: the
      // text's own box has more baked-in headroom than its visible ink,
      // so a small numeric change doesn't always read as a visible one).
      // This uses the full remaining slack, landing the bottom bar flush
      // with the tile's inner edge rather than leaving more unused margin.
      int watch_text_y = inner.origin.y + 18;
      int watch_bar_y  = watch_text_y + text_h + 4;
      int phone_text_y = watch_bar_y + bar_h + 2;
      int phone_bar_y  = phone_text_y + text_h + 4;

      GColor track_col = s_theme_light ? GColorFromRGB(200,200,200) : GColorFromRGB(90, 90, 90);

      // Icon glyphs sit at the left of each label row, percentage text
      // starts right after. icon_col_w reserves the space for the glyph
      // plus a small gap before the text.
      int icon_col_w = 14;

      // Watch gauge
      GRect w_icon_r = GRect(inner.origin.x, watch_text_y - 1, icon_col_w, text_h + 2);
      graphics_draw_text(ctx, "n", s_font_icons_mini, w_icon_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      snprintf(buf, sizeof(buf), "%d%%", watch_pct);
      GRect w_txt_r = GRect(inner.origin.x + icon_col_w, watch_text_y, inner.size.w - icon_col_w, text_h);
      graphics_draw_text(ctx, buf, s_font_sm, w_txt_r,
                         GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
      GRect w_bar_bg = GRect(inner.origin.x, watch_bar_y, bar_w, bar_h);
      graphics_context_set_fill_color(ctx, track_col);
      graphics_fill_rect(ctx, w_bar_bg, 2, GCornersAll);
      GRect w_bar_fg = GRect(inner.origin.x, watch_bar_y, (bar_w * watch_pct) / 100, bar_h);
      graphics_context_set_fill_color(ctx, fg);
      graphics_fill_rect(ctx, w_bar_fg, 2, GCornersAll);

      // Phone gauge — s_phone_battery is -1 until the phone has actually
      // sent a value at least once (e.g. right after a fresh install).
      // While charging, the text swaps to "CHRG" instead of the rising
      // percentage — the bar still tracks the real charge level either
      // way, so you can see both "is it plugged in" and "how full is it"
      // at a glance.
      GRect p_icon_r = GRect(inner.origin.x, phone_text_y - 1, icon_col_w, text_h + 2);
      graphics_draw_text(ctx, "o", s_font_icons_mini, p_icon_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      GRect p_txt_r = GRect(inner.origin.x + icon_col_w, phone_text_y, inner.size.w - icon_col_w, text_h);
      if (s_phone_battery < 0) {
        graphics_draw_text(ctx, "--", s_font_sm, p_txt_r,
                           GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
      } else if (s_phone_charging) {
        graphics_draw_text(ctx, "CHRG", s_font_sm, p_txt_r,
                           GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
      } else {
        snprintf(buf, sizeof(buf), "%d%%", s_phone_battery);
        graphics_draw_text(ctx, buf, s_font_sm, p_txt_r,
                           GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
      }
      GRect p_bar_bg = GRect(inner.origin.x, phone_bar_y, bar_w, bar_h);
      graphics_context_set_fill_color(ctx, track_col);
      graphics_fill_rect(ctx, p_bar_bg, 2, GCornersAll);
      if (s_phone_battery >= 0) {
        GRect p_bar_fg = GRect(inner.origin.x, phone_bar_y, (bar_w * s_phone_battery) / 100, bar_h);
        graphics_context_set_fill_color(ctx, fg);
        graphics_fill_rect(ctx, p_bar_fg, 2, GCornersAll);
      }
      break;
    }

    default: break;
  }
}

// ─── Canvas draw callback ────────────────────────────────────────────────────
static void canvas_update_proc(Layer *layer, GContext *ctx) {
  graphics_context_set_fill_color(ctx, theme_bg());
  graphics_fill_rect(ctx, layer_get_bounds(layer), 0, GCornerNone);

  for (int id = 0; id < TILE_COUNT; id++) {
    GRect r = tile_rect((TileId)id);

    if (s_tile_flipping[id]) {
      int phase = s_flip_phase[id];
      int squish = (phase == 1) ? TILE_SQ / 4 : 3 * TILE_SQ / 4;
      GRect squished = GRect(r.origin.x,
                             r.origin.y + (TILE_SQ - squish) / 2,
                             r.size.w,
                             squish);
      graphics_context_set_fill_color(ctx, s_accent);
      graphics_fill_rect(ctx, squished, 2, GCornersAll);
    } else {
      graphics_context_set_fill_color(ctx, s_accent);
      graphics_fill_rect(ctx, r, 2, GCornersAll);
      draw_tile_content(ctx, (TileId)id, r);
    }
  }

  // Nav arrow: bitmap, same light/dark pair pattern as the tile icons.
  GRect arrow_r = GRect(ARROW_CENTER_X - ARROW_ICON_SIZE / 2,
                        ARROW_CENTER_Y - ARROW_ICON_SIZE / 2,
                        ARROW_ICON_SIZE, ARROW_ICON_SIZE);
  graphics_context_set_compositing_mode(ctx, GCompOpSet);
  graphics_draw_bitmap_in_rect(ctx, s_theme_light ? s_icon_arrow_dark : s_icon_arrow, arrow_r);
}

// ─── Flip animation timers ────────────────────────────────────────────────────
static void flip_end_callback(void *context) {
  TileId id = (TileId)(int)context;
  s_tile_flipping[id] = false;
  s_flip_phase[id] = 0;
  s_flip_timer[id] = NULL;
  layer_mark_dirty(s_canvas_layer);
}

static void flip_phase1_callback(void *context) {
  TileId id = (TileId)(int)context;
  s_flip_phase[id] = 2;
  layer_mark_dirty(s_canvas_layer);
  s_flip_timer[id] = app_timer_register(FLIP_DURATION_MS, flip_end_callback, context);
}

static void start_flip(TileId id) {
  if (s_tile_flipping[id]) return;
  s_tile_flipping[id] = true;
  s_flip_phase[id] = 1;
  layer_mark_dirty(s_canvas_layer);
  s_flip_timer[id] = app_timer_register(FLIP_DURATION_MS, flip_phase1_callback, (void*)(int)id);
}

static void second_flip_callback(void *context) {
  TileId id = (TileId)(int)context;
  start_flip(id);
  s_flip_delay_timer = NULL;
}

static void trigger_wakeup_flips(void) {
  TileId first  = (TileId)(rand() % TILE_COUNT);
  TileId second;
  do {
    second = (TileId)(rand() % TILE_COUNT);
  } while (second == first);

  start_flip(first);
  s_flip_delay_timer = app_timer_register(FLIP_DELAY_MS, second_flip_callback, (void*)(int)second);
}

// ─── Wake detection: poll light_is_on() for a rising edge ───────────────────
static void light_poll_callback(void *context) {
  bool now_on = light_is_on();
  if (now_on && !s_light_was_on) {
    update_steps_data();
    update_sleep_data();
    trigger_wakeup_flips();
  }
  s_light_was_on = now_on;
  s_light_poll_timer = app_timer_register(LIGHT_POLL_MS, light_poll_callback, NULL);
}

// ─── Wake detection: wrist-flick tap ─────────────────────────────────────────
// Kept as a second, independent trigger alongside the light_is_on() poll:
// the poll only fires for people who have backlight-on-motion enabled.
// Anyone who's turned that setting off (Watch Settings → Display → Backlight
// Motion) would otherwise never see the flip animation from a wrist flick at
// all, even though the accelerometer itself still reports the gesture fine.
// start_flip() already no-ops on a tile that's mid-flip, so if both this and
// the light poll happen to fire close together the worst case is a few extra
// (harmless) tile flips, not a crash or double-animation glitch.
static void accel_tap_handler(AccelAxisType axis, int32_t direction) {
  update_steps_data();
  update_sleep_data();
  trigger_wakeup_flips();
}

// ─── Tick handler (update time every minute) ──────────────────────────────────
static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  layer_mark_dirty(s_canvas_layer);
}

// ─── AppMessage handlers ──────────────────────────────────────────────────────
static void inbox_received_handler(DictionaryIterator *iter, void *context) {
  Tuple *t;

  bool accent_changed = false;
  uint8_t r = s_accent_r, g = s_accent_g, b = s_accent_b;

  if ((t = dict_find(iter, KEY_ACCENT_R))) { r = t->value->int32; accent_changed = true; }
  if ((t = dict_find(iter, KEY_ACCENT_G))) { g = t->value->int32; accent_changed = true; }
  if ((t = dict_find(iter, KEY_ACCENT_B))) { b = t->value->int32; accent_changed = true; }

  if (accent_changed) {
    s_accent_r = r; s_accent_g = g; s_accent_b = b;
    s_accent = GColorFromRGB(r, g, b);
    persist_write_int(PERSIST_ACCENT_R, r);
    persist_write_int(PERSIST_ACCENT_G, g);
    persist_write_int(PERSIST_ACCENT_B, b);
  }

  if ((t = dict_find(iter, KEY_THEME))) {
    s_theme_light = (t->value->int32 == 1);
    persist_write_int(PERSIST_THEME, t->value->int32);
  }

  if ((t = dict_find(iter, KEY_TEMP_UNIT))) {
    s_temp_unit_fahrenheit = (t->value->int32 == 1);
    persist_write_int(PERSIST_TEMP_UNIT, t->value->int32);
  }

  if ((t = dict_find(iter, KEY_DATE_ORDER))) {
    s_date_order_mdy = (t->value->int32 == 1);
    persist_write_int(PERSIST_DATE_ORDER, t->value->int32);
  }

  if ((t = dict_find(iter, KEY_AQI)))          s_aqi        = t->value->int32;
  if ((t = dict_find(iter, KEY_WEATHER_CODE))) s_wmo_icon   = t->value->int32;
  if ((t = dict_find(iter, KEY_TEMP_HIGH)))    s_temp_high  = t->value->int32;
  if ((t = dict_find(iter, KEY_TEMP_LOW)))     s_temp_low   = t->value->int32;
  if ((t = dict_find(iter, KEY_TEMP_CURRENT))) s_temp_current = t->value->int32;

  if ((t = dict_find(iter, KEY_LOCATION))) {
    strncpy(s_location, t->value->cstring, sizeof(s_location) - 1);
    s_location[sizeof(s_location) - 1] = '\0';
  }

  if ((t = dict_find(iter, KEY_PHONE_BATTERY))) {
    s_phone_battery = t->value->int32;
  }

  if ((t = dict_find(iter, KEY_PHONE_CHARGING))) {
    s_phone_charging = (t->value->int32 == 1);
  }

  layer_mark_dirty(s_canvas_layer);
}

// ─── HealthService event handler ─────────────────────────────────────────────
static void health_handler(HealthEventType event, void *context) {
  switch (event) {
    case HealthEventMovementUpdate:
      update_steps_data();
      break;
    case HealthEventSleepUpdate:
      update_sleep_data();
      break;
    case HealthEventSignificantUpdate:
      update_steps_data();
      update_sleep_data();
      break;
    default:
      break;
  }
  layer_mark_dirty(s_canvas_layer);
}

// ─── Window lifecycle ─────────────────────────────────────────────────────────
static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_font_time    = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TIME_52));
  s_font_med     = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_BOLD_18));
  s_font_sm      = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_REGULAR_12));
  s_font_weather = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_WEATHER_36));
  s_font_icons_mini = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_MINI_12));

  s_icon_steps        = gbitmap_create_with_resource(RESOURCE_ID_STEPS);
  s_icon_steps_dark   = gbitmap_create_with_resource(RESOURCE_ID_STEPS_DARK);
  s_icon_sleep        = gbitmap_create_with_resource(RESOURCE_ID_SLEEP);
  s_icon_sleep_dark   = gbitmap_create_with_resource(RESOURCE_ID_SLEEP_DARK);
  s_icon_aqi          = gbitmap_create_with_resource(RESOURCE_ID_AQI);
  s_icon_aqi_dark     = gbitmap_create_with_resource(RESOURCE_ID_AQI_DARK);
  s_icon_arrow        = gbitmap_create_with_resource(RESOURCE_ID_ARROW_RIGHT);
  s_icon_arrow_dark   = gbitmap_create_with_resource(RESOURCE_ID_ARROW_RIGHT_DARK);

  s_canvas_layer = layer_create(bounds);
  layer_set_update_proc(s_canvas_layer, canvas_update_proc);
  layer_add_child(root, s_canvas_layer);
}

static void window_unload(Window *window) {
  layer_destroy(s_canvas_layer);
  fonts_unload_custom_font(s_font_time);
  fonts_unload_custom_font(s_font_med);
  fonts_unload_custom_font(s_font_sm);
  fonts_unload_custom_font(s_font_weather);
  fonts_unload_custom_font(s_font_icons_mini);

  gbitmap_destroy(s_icon_steps);
  gbitmap_destroy(s_icon_steps_dark);
  gbitmap_destroy(s_icon_sleep);
  gbitmap_destroy(s_icon_sleep_dark);
  gbitmap_destroy(s_icon_aqi);
  gbitmap_destroy(s_icon_aqi_dark);
  gbitmap_destroy(s_icon_arrow);
  gbitmap_destroy(s_icon_arrow_dark);
}

// ─── Init / deinit ────────────────────────────────────────────────────────────
static void init(void) {
  srand(time(NULL));

  if (persist_exists(PERSIST_ACCENT_R)) {
    s_accent_r = persist_read_int(PERSIST_ACCENT_R);
    s_accent_g = persist_read_int(PERSIST_ACCENT_G);
    s_accent_b = persist_read_int(PERSIST_ACCENT_B);
  }
  s_accent = GColorFromRGB(s_accent_r, s_accent_g, s_accent_b);

  if (persist_exists(PERSIST_THEME)) {
    s_theme_light = (persist_read_int(PERSIST_THEME) == 1);
  }

  if (persist_exists(PERSIST_TEMP_UNIT)) {
    s_temp_unit_fahrenheit = (persist_read_int(PERSIST_TEMP_UNIT) == 1);
  }

  if (persist_exists(PERSIST_DATE_ORDER)) {
    s_date_order_mdy = (persist_read_int(PERSIST_DATE_ORDER) == 1);
  }

  memset(s_tile_flipping, false, sizeof(s_tile_flipping));
  memset(s_flip_phase,    0,     sizeof(s_flip_phase));
  memset(s_flip_timer,    0,     sizeof(s_flip_timer));

  app_message_register_inbox_received(inbox_received_handler);
  app_message_open(512, 64);

  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);

  s_light_was_on = light_is_on();
  s_light_poll_timer = app_timer_register(LIGHT_POLL_MS, light_poll_callback, NULL);
  accel_tap_service_subscribe(accel_tap_handler);

  health_service_events_subscribe(health_handler, NULL);
  update_steps_data();
  update_sleep_data();

  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers){
    .load   = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);
}

static void deinit(void) {
  tick_timer_service_unsubscribe();
  health_service_events_unsubscribe();
  accel_tap_service_unsubscribe();
  if (s_light_poll_timer) {
    app_timer_cancel(s_light_poll_timer);
  }
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}