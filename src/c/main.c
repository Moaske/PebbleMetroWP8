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
#define ARROW_DIAMETER  20
#define ARROW_CENTER_X  (SCREEN_W - 4 - ARROW_DIAMETER / 2)   // 176
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
#define KEY_LOCATION      MESSAGE_KEY_LOCATION   // city name, string
// Steps, sleep, and battery are read natively on-watch (HealthService /
// battery_state_service) — they never come over AppMessage.

// ─── Persistent storage keys ─────────────────────────────────────────────────
#define PERSIST_ACCENT_R   100
#define PERSIST_ACCENT_G   101
#define PERSIST_ACCENT_B   102
#define PERSIST_THEME      103

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

// Data (weather/AQI arrive via AppMessage from the phone)
static int  s_aqi       = 0;
static int  s_wmo_icon  = 0;   // maps to icon string index
static int  s_temp_high = 0;
static int  s_temp_low  = 0;
static int  s_temp_current = 0;
static char s_location[32] = "";

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

// Two variants of each tile icon: white (dark theme) and black (light
// theme). Pebble's color compositing has no software color-invert for
// color displays (GCompOpAssignInverted is monochrome-only), so recoloring
// at draw time isn't possible — we keep both baked assets and just pick
// the right one per theme.
static GBitmap *s_icon_steps,   *s_icon_steps_dark;
static GBitmap *s_icon_sleep,   *s_icon_sleep_dark;
static GBitmap *s_icon_aqi,     *s_icon_aqi_dark;

static GColor theme_fg(void)  { return s_theme_light ? GColorBlack : GColorWhite; }
static GColor theme_bg(void)  { return s_theme_light ? GColorWhite : GColorBlack; }

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
      if (clock_is_24h_style()) {
        snprintf(buf, sizeof(buf), "%02d:%02d", t->tm_hour, t->tm_min);
      } else {
        snprintf(buf, sizeof(buf), "%d:%02d", t->tm_hour % 12 == 0 ? 12 : t->tm_hour % 12, t->tm_min);
      }
      // -16 overshot all the way to the top-aligned, so splitting the
      // difference back toward centre. +2px horizontal nudge added too.
      const int TIME_Y_OFFSET = -6;
      const int TIME_X_OFFSET = 2;
      GRect tr = GRect(inner.origin.x + TIME_X_OFFSET, inner.origin.y + TIME_Y_OFFSET, inner.size.w, inner.size.h);
      graphics_draw_text(ctx, buf, s_font_time, tr,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_DATE: {
      time_t now = time(NULL);
      struct tm *t = localtime(&now);
      static const char *DAYS[] = {"SUN","MON","TUE","WED","THU","FRI","SAT"};
      GRect day_r = GRect(inner.origin.x, inner.origin.y + 6, inner.size.w, 26);
      graphics_draw_text(ctx, DAYS[t->tm_wday], s_font_med, day_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      snprintf(buf, sizeof(buf), "%02d/%02d", t->tm_mday, t->tm_mon + 1);
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
      GRect icon_r = GRect(inner.origin.x + left_margin, top, 36, 38);
      graphics_draw_text(ctx, WEATHER_ICONS[s_wmo_icon < 13 ? s_wmo_icon : 0], s_font_weather, icon_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      int tx = inner.origin.x + left_margin + 40;
      int tw = inner.size.w - left_margin - 40;

      // Top line (bold): current temperature
      snprintf(buf, sizeof(buf), "%d\u00B0C", s_temp_current);
      GRect cur_r = GRect(tx, top, tw, 22);
      graphics_draw_text(ctx, buf, s_font_med, cur_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      // Second line: today's high/low, full-strength colour (no more
      // dimming — it was hurting readability rather than helping hierarchy).
      // TrailingEllipsis rather than WordWrap here: this line is close to
      // the available width, and word-wrap on an overflow would bleed a
      // stray character below the tile the same way the sleep tile's "m"
      // did — ellipsis truncates safely in place instead.
      snprintf(buf, sizeof(buf), "H %d\u00B0C L %d\u00B0C", s_temp_high, s_temp_low);
      GRect hl_r = GRect(tx, top + 22, tw, 20);
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
      GRect val_r = GRect(inner.origin.x, inner.origin.y + 40, inner.size.w, inner.size.h - 40);
      if (s_sleep_h == 0 && s_sleep_m == 0) {
        graphics_draw_text(ctx, "--", s_font_med, val_r,
                           GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      } else {
        // No trailing "m" — at this font size/tile width, "7h23m" was
        // wide enough to wrap the "m" onto its own line, which (since
        // Pebble doesn't clip text drawing to the given rect) rendered
        // as a stray character bleeding below the tile. "7h23" fits
        // cleanly and is unambiguous without it.
        snprintf(buf, sizeof(buf), "%dh%02d", s_sleep_h, s_sleep_m);
        graphics_draw_text(ctx, buf, s_font_med, val_r,
                           GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      }
      break;
    }

    case TILE_BATTERY: {
      BatteryChargeState bat = battery_state_service_peek();
      int pct = bat.charge_percent;
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 12);
      graphics_draw_text(ctx, "BATT", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      // AQI/STEPS/SLEEP all put their 25x25 icon at y+13 (ending y+38) and
      // their value text starting at y+40. Battery has no icon, but the
      // bar sits centred in that same y+13..y+38 band, and the percentage
      // starts at the same y+40 as the other tiles' values — so the whole
      // bottom row reads as one aligned grid rather than battery's text
      // sitting at a different height than its neighbours.
      int bar_y = inner.origin.y + 13 + (TILE_ICON_SIZE - 7) / 2; // vertically centred in the icon band
      int bar_h = 7;
      int bar_w = inner.size.w;
      GRect bar_bg = GRect(inner.origin.x, bar_y, bar_w, bar_h);
      graphics_context_set_fill_color(ctx, s_theme_light ? GColorFromRGB(200,200,200) : GColorFromRGB(90, 90, 90));
      graphics_fill_rect(ctx, bar_bg, 2, GCornersAll);
      int fill_w = (bar_w * pct) / 100;
      GRect bar_fg = GRect(inner.origin.x, bar_y, fill_w, bar_h);
      graphics_context_set_fill_color(ctx, fg);
      graphics_fill_rect(ctx, bar_fg, 2, GCornersAll);

      snprintf(buf, sizeof(buf), "%d%%", pct);
      GRect pct_r = GRect(inner.origin.x, inner.origin.y + 40, inner.size.w, inner.size.h - 40);
      graphics_draw_text(ctx, buf, s_font_med, pct_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
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

  // Nav arrow: hand-drawn so it always matches the theme colour without
  // needing a second bitmap asset — a filled circle in the foreground
  // colour with a background-coloured chevron cut into it.
  graphics_context_set_fill_color(ctx, theme_fg());
  graphics_fill_circle(ctx, GPoint(ARROW_CENTER_X, ARROW_CENTER_Y), ARROW_DIAMETER / 2);

  int cx = ARROW_CENTER_X, cy = ARROW_CENTER_Y;
  int radius = ARROW_DIAMETER / 2;
  // Chevron half-height nearly spans the circle's radius, leaving just a
  // couple of px of margin so the tip doesn't touch the outline exactly.
  int ch = radius - 2;
  int cw = ch - 1;
  GPoint p1 = GPoint(cx - cw / 2, cy - ch);
  GPoint p2 = GPoint(cx + cw / 2, cy);
  GPoint p3 = GPoint(cx - cw / 2, cy + ch);
  GPathInfo chevron_info = { .num_points = 3, .points = (GPoint[]){p1, p2, p3} };
  GPath *chevron = gpath_create(&chevron_info);
  graphics_context_set_fill_color(ctx, theme_bg());
  gpath_draw_filled(ctx, chevron);
  gpath_destroy(chevron);
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

  if ((t = dict_find(iter, KEY_AQI)))          s_aqi        = t->value->int32;
  if ((t = dict_find(iter, KEY_WEATHER_CODE))) s_wmo_icon   = t->value->int32;
  if ((t = dict_find(iter, KEY_TEMP_HIGH)))    s_temp_high  = t->value->int32;
  if ((t = dict_find(iter, KEY_TEMP_LOW)))     s_temp_low   = t->value->int32;
  if ((t = dict_find(iter, KEY_TEMP_CURRENT))) s_temp_current = t->value->int32;

  if ((t = dict_find(iter, KEY_LOCATION))) {
    strncpy(s_location, t->value->cstring, sizeof(s_location) - 1);
    s_location[sizeof(s_location) - 1] = '\0';
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

  s_icon_steps        = gbitmap_create_with_resource(RESOURCE_ID_STEPS);
  s_icon_steps_dark   = gbitmap_create_with_resource(RESOURCE_ID_STEPS_DARK);
  s_icon_sleep        = gbitmap_create_with_resource(RESOURCE_ID_SLEEP);
  s_icon_sleep_dark   = gbitmap_create_with_resource(RESOURCE_ID_SLEEP_DARK);
  s_icon_aqi          = gbitmap_create_with_resource(RESOURCE_ID_AQI);
  s_icon_aqi_dark     = gbitmap_create_with_resource(RESOURCE_ID_AQI_DARK);

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

  gbitmap_destroy(s_icon_steps);
  gbitmap_destroy(s_icon_steps_dark);
  gbitmap_destroy(s_icon_sleep);
  gbitmap_destroy(s_icon_sleep_dark);
  gbitmap_destroy(s_icon_aqi);
  gbitmap_destroy(s_icon_aqi_dark);
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