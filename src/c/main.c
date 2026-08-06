#include <pebble.h>

// ─── Screen & tile geometry ─────────────────────────────────────────────────
// Pebble Time 2 / Emery: 200 x 228 px
#define SCREEN_W        200
#define SCREEN_H        228
#define TILE_GAP        4
#define TILE_SQ         64          // square tile side
#define TILE_DBL        132         // double tile width (64+64+4)

// Row top-left origins (gap=4, padding=4 on each side)
#define ROW1_Y          4
#define ROW2_Y          (ROW1_Y + TILE_SQ + TILE_GAP)   // 72
#define ROW3_Y          (ROW2_Y + TILE_SQ + TILE_GAP)   // 140

#define COL1_X          4
#define COL2_X          (COL1_X + TILE_SQ + TILE_GAP)   // 72
#define COL3_X          (COL2_X + TILE_SQ + TILE_GAP)   // 140

// Arrow position (lower-right of screen, below row 3)
#define ARROW_X         176
#define ARROW_Y         210
#define ARROW_SIZE      14

// ─── AppMessage keys ─────────────────────────────────────────────────────────
#define KEY_ACCENT_R    0   // accent colour R 0–255
#define KEY_ACCENT_G    1
#define KEY_ACCENT_B    2
#define KEY_AQI         3
#define KEY_WEATHER_CODE 4  // WMO code → icon index (0–12)
#define KEY_TEMP_HIGH   5   // °C integer
#define KEY_TEMP_LOW    6
// Steps and sleep are read natively from Pebble HealthService — no longer
// come over AppMessage. Battery is also read natively from the watch.

// ─── Persistent storage keys ─────────────────────────────────────────────────
#define PERSIST_ACCENT_R   100
#define PERSIST_ACCENT_G   101
#define PERSIST_ACCENT_B   102

// ─── Flip animation ──────────────────────────────────────────────────────────
#define FLIP_DURATION_MS   350   // half-flip (fold down)
#define FLIP_TILES         2
#define FLIP_DELAY_MS      1000  // second tile starts 1 s after first

// ─── HealthService ────────────────────────────────────────────────────────────
// How far back to look for the most recent completed sleep session.
// 2 days covers "went to bed before midnight, woke up this afternoon" cases.
#define SLEEP_LOOKBACK_SECONDS (2 * SECONDS_PER_DAY)

// ─── Globals ─────────────────────────────────────────────────────────────────
static Window *s_window;
static Layer  *s_canvas_layer;

// Accent colour (default: Windows Phone Amber)
static GColor  s_accent;

// Data (weather/AQI arrive via AppMessage from the phone)
static int  s_aqi       = 0;
static int  s_wmo_icon  = 0;   // maps to icon string index
static int  s_temp_high = 0;
static int  s_temp_low  = 0;

// Data (steps/sleep read natively from Pebble HealthService — no phone needed)
static int  s_steps     = 0;
static int  s_sleep_h   = 0;
static int  s_sleep_m   = 0;
static bool s_health_available = false;  // false if user hasn't enabled Pebble Health

// Flip state: which tile is currently mid-flip (0–6, -1 = none)
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

// ─── Weather icon strings (WMO code groups → index) ──────────────────────────
// Index matches what JS sends in KEY_WEATHER_CODE after mapping
static const char *WEATHER_ICONS[] = {
  "a",  // 0: clear / sunny              (sun)
  "b",  // 1: mainly clear               (sun + few cloud)
  "c",  // 2: partly cloudy              (sun + cloud)
  "d",  // 3: overcast                   (cloud)
  "e",  // 4: fog                        (fog)
  "f",  // 5: drizzle                    (drizzle)
  "g",  // 6: rain                       (rain)
  "h",  // 7: heavy rain                 (heavy rain)
  "i",  // 8: freezing rain / sleet      (sleet)
  "j",  // 9: snow                       (snow)
  "k",  // 10: heavy snow                (blizzard)
  "l",  // 11: thunderstorm              (thunder)
  "m",  // 12: thunderstorm + hail       (thunder + hail)
};
// NOTE: replace these placeholder chars with the actual glyph codepoints
// from your baked-in custom font (see resources section in package.json).
// The font should contain MDI weather glyphs mapped to ASCII a–m for simplicity.

// ─── Helper: map WMO code to icon index ──────────────────────────────────────
// (also done on JS side; C side uses the pre-mapped index directly)

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

// ─── HealthService: steps ─────────────────────────────────────────────────────
static void update_steps_data(void) {
  time_t start = time_start_of_today();
  time_t end   = time(NULL);

  HealthServiceAccessibilityMask mask =
    health_service_metric_accessible(HealthMetricStepCount, start, end);

  if (mask & HealthServiceAccessibilityMaskAvailable) {
    s_steps = (int)health_service_sum_today(HealthMetricStepCount);
    s_health_available = true;
  } else {
    // No data yet today, or Health not enabled — leave last known value
    s_health_available = (mask != HealthServiceAccessibilityMaskNotSupported);
  }
}

// ─── HealthService: last sleep session ────────────────────────────────────────
// Finds the most recently completed sleep activity (walking backwards from
// now) and reports its duration. This reflects the actual "went to bed,
// woke up" session rather than a same-day running total, so a nap earlier
// today won't overwrite last night's session while you're awake.
static time_t s_found_sleep_start = 0;
static time_t s_found_sleep_end   = 0;

static bool sleep_session_iterator_cb(HealthActivity activity, time_t time_start,
                                       time_t time_end, void *context) {
  if (activity & HealthActivitySleep) {
    s_found_sleep_start = time_start;
    s_found_sleep_end   = time_end;
    return false; // stop — we only want the most recent session
  }
  return true; // keep looking further back
}

static void update_sleep_data(void) {
  time_t now         = time(NULL);
  time_t lookback     = now - SLEEP_LOOKBACK_SECONDS;

  HealthServiceAccessibilityMask mask =
    health_service_metric_accessible(HealthMetricSleepSeconds, lookback, now);

  if (!(mask & HealthServiceAccessibilityMaskAvailable)) {
    return; // no sleep data available yet
  }

  s_found_sleep_start = 0;
  s_found_sleep_end   = 0;

  health_service_activities_iterate(
    HealthActivitySleep, lookback, now,
    HealthIterationDirectionPast,
    sleep_session_iterator_cb, NULL);

  if (s_found_sleep_end != 0) {
    int duration_s = (int)(s_found_sleep_end - s_found_sleep_start);
    s_sleep_h = duration_s / SECONDS_PER_HOUR;
    s_sleep_m = (duration_s % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE;
  }
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────
static GFont s_font_time;     // large thin font for time digits
static GFont s_font_med;      // medium bold for values
static GFont s_font_sm;       // small for labels / sub-values
static GFont s_font_weather;  // weather icon font (MDI subset)

static void draw_tile_content(GContext *ctx, TileId id, GRect r) {
  GColor white = GColorWhite;
  graphics_context_set_text_color(ctx, white);

  // Shared padding
  int px = 5, py = 4;
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
      // Centre vertically
      GRect tr = GRect(inner.origin.x, inner.origin.y + 4,
                       inner.size.w, inner.size.h);
      graphics_draw_text(ctx, buf, s_font_time, tr,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_DATE: {
      time_t now = time(NULL);
      struct tm *t = localtime(&now);
      // Day of week
      static const char *DAYS[] = {"SUN","MON","TUE","WED","THU","FRI","SAT"};
      GRect day_r = GRect(inner.origin.x, inner.origin.y + 6,
                          inner.size.w, 26);
      graphics_draw_text(ctx, DAYS[t->tm_wday], s_font_med, day_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      // DD/MM
      snprintf(buf, sizeof(buf), "%02d/%02d", t->tm_mday, t->tm_mon + 1);
      GRect dm_r = GRect(inner.origin.x, inner.origin.y + 30,
                         inner.size.w, 24);
      graphics_draw_text(ctx, buf, s_font_med, dm_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_AQI: {
      // Label top
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 14);
      graphics_draw_text(ctx, "AQI", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      // Value bottom
      snprintf(buf, sizeof(buf), "%d", s_aqi);
      GRect val_r = GRect(inner.origin.x, inner.origin.y + 30,
                          inner.size.w, 28);
      graphics_draw_text(ctx, buf, s_font_med, val_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_WEATHER: {
      // Icon on the left half
      int icon_idx = s_wmo_icon < 13 ? s_wmo_icon : 0;
      GRect icon_r = GRect(inner.origin.x, inner.origin.y + 4,
                           38, 40);
      graphics_draw_text(ctx, WEATHER_ICONS[icon_idx], s_font_weather, icon_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      // Temps on the right half
      int tx = inner.origin.x + 42;
      snprintf(buf, sizeof(buf), "%d\u00B0C", s_temp_high);
      GRect hi_r = GRect(tx, inner.origin.y + 6, inner.size.w - 42, 26);
      graphics_draw_text(ctx, buf, s_font_med, hi_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      snprintf(buf, sizeof(buf), "%d\u00B0C", s_temp_low);
      GRect lo_r = GRect(tx, inner.origin.y + 32, inner.size.w - 42, 22);
      graphics_context_set_text_color(ctx, GColorFromRGBA(255, 255, 255, 180));
      graphics_draw_text(ctx, buf, s_font_sm, lo_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      graphics_context_set_text_color(ctx, white);
      // Label bottom-right
      GRect wlbl_r = GRect(tx, inner.origin.y + 50, inner.size.w - 42, 12);
      graphics_context_set_text_color(ctx, GColorFromRGBA(255, 255, 255, 150));
      graphics_draw_text(ctx, "WEATHER", s_font_sm, wlbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      graphics_context_set_text_color(ctx, white);
      break;
    }

    case TILE_STEPS: {
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 14);
      graphics_draw_text(ctx, "STEPS", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      snprintf(buf, sizeof(buf), "%d", s_steps);
      GRect val_r = GRect(inner.origin.x, inner.origin.y + 30,
                          inner.size.w, 26);
      graphics_draw_text(ctx, buf, s_font_med, val_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_SLEEP: {
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 14);
      graphics_draw_text(ctx, "SLEEP", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      GRect val_r = GRect(inner.origin.x, inner.origin.y + 28,
                          inner.size.w, 26);
      if (s_sleep_h == 0 && s_sleep_m == 0) {
        graphics_draw_text(ctx, "--", s_font_med, val_r,
                           GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      } else {
        snprintf(buf, sizeof(buf), "%dh%02dm", s_sleep_h, s_sleep_m);
        graphics_draw_text(ctx, buf, s_font_med, val_r,
                           GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      }
      break;
    }

    case TILE_BATTERY: {
      BatteryChargeState bat = battery_state_service_peek();
      int pct = bat.charge_percent;
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, 14);
      graphics_draw_text(ctx, "BATT", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      // Horizontal bar
      int bar_y = inner.origin.y + 18;
      int bar_h = 7;
      int bar_w = inner.size.w;
      GRect bar_bg = GRect(inner.origin.x, bar_y, bar_w, bar_h);
      graphics_context_set_fill_color(ctx, GColorFromRGBA(255,255,255,60));
      graphics_fill_rect(ctx, bar_bg, 2, GCornersAll);
      int fill_w = (bar_w * pct) / 100;
      GRect bar_fg = GRect(inner.origin.x, bar_y, fill_w, bar_h);
      graphics_context_set_fill_color(ctx, GColorWhite);
      graphics_fill_rect(ctx, bar_fg, 2, GCornersAll);
      // Percentage text
      snprintf(buf, sizeof(buf), "%d%%", pct);
      GRect pct_r = GRect(inner.origin.x, bar_y + 12, inner.size.w, 24);
      graphics_draw_text(ctx, buf, s_font_med, pct_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    default: break;
  }
}

// ─── Canvas draw callback ────────────────────────────────────────────────────
static void canvas_update_proc(Layer *layer, GContext *ctx) {
  // Black background
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, layer_get_bounds(layer), 0, GCornerNone);

  for (int id = 0; id < TILE_COUNT; id++) {
    GRect r = tile_rect((TileId)id);

    if (s_tile_flipping[id]) {
      // During flip: draw a scaled (squished) version of the tile
      // We simulate the fold by reducing height from centre
      // phase 1: fold down (height 64→0), phase 2: fold up (height 0→64)
      int phase = s_flip_phase[id];
      int scale = (phase == 1)
        ? (TILE_SQ - (int)(TILE_SQ * (1 - 0.5f)))   // simplified: just draw squished
        : TILE_SQ;
      (void)scale; // used conceptually; actual squish via clip rect below

      // Squish: clip to a reduced-height rect centred on the tile
      // For a convincing flip, offset top to centre and clip
      // (Pebble doesn't have true 3D, so we simulate with clip + fill)
      int squish = (phase == 1) ? TILE_SQ / 4 : 3 * TILE_SQ / 4;
      GRect squished = GRect(r.origin.x,
                             r.origin.y + (TILE_SQ - squish) / 2,
                             r.size.w,
                             squish);
      graphics_context_set_fill_color(ctx, s_accent);
      graphics_fill_rect(ctx, squished, 2, GCornersAll);
      // Don't draw text during flip (looks messy squished)
    } else {
      // Normal: filled accent tile + content
      graphics_context_set_fill_color(ctx, s_accent);
      graphics_fill_rect(ctx, r, 2, GCornersAll);
      draw_tile_content(ctx, (TileId)id, r);
    }
  }

  // Navigation arrow (lower-right, below tiles)
  // Simple right-pointing white triangle
  GPoint p1 = GPoint(ARROW_X,              ARROW_Y);
  GPoint p2 = GPoint(ARROW_X + ARROW_SIZE, ARROW_Y + ARROW_SIZE / 2);
  GPoint p3 = GPoint(ARROW_X,              ARROW_Y + ARROW_SIZE);
  GPathInfo arrow_info = {
    .num_points = 3,
    .points = (GPoint[]){p1, p2, p3}
  };
  GPath *arrow_path = gpath_create(&arrow_info);
  graphics_context_set_fill_color(ctx, GColorWhite);
  gpath_draw_filled(ctx, arrow_path);
  gpath_destroy(arrow_path);
}

// ─── Flip animation timers ────────────────────────────────────────────────────
// Phase flow: start_flip → (350ms) → flip_phase1_callback → (350ms) → flip_end_callback
// Phase 1 = tile folding down (squish), Phase 2 = tile folding back up

static void flip_end_callback(void *context) {
  TileId id = (TileId)(int)context;
  s_tile_flipping[id] = false;
  s_flip_phase[id] = 0;
  s_flip_timer[id] = NULL;
  layer_mark_dirty(s_canvas_layer);
}

static void flip_phase1_callback(void *context) {
  TileId id = (TileId)(int)context;
  s_flip_phase[id] = 2;  // fold back up
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
  // Pick 2 random different tiles
  TileId first  = (TileId)(rand() % TILE_COUNT);
  TileId second;
  do {
    second = (TileId)(rand() % TILE_COUNT);
  } while (second == first);

  start_flip(first);
  s_flip_delay_timer = app_timer_register(FLIP_DELAY_MS, second_flip_callback, (void*)(int)second);
}

// ─── App focus handler (backlight wakeup) ────────────────────────────────────
static void app_focus_handler(bool in_focus) {
  if (in_focus) {
    update_steps_data();
    update_sleep_data();
    trigger_wakeup_flips();
  }
}

// ─── Tick handler (update time every minute) ──────────────────────────────────
static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  layer_mark_dirty(s_canvas_layer);
}

// ─── AppMessage handlers ──────────────────────────────────────────────────────
static void inbox_received_handler(DictionaryIterator *iter, void *context) {
  Tuple *t;

  // Accent colour
  bool accent_changed = false;
  uint8_t r = GColorGetR(s_accent) << 6;
  uint8_t g = GColorGetG(s_accent) << 6;
  uint8_t b = GColorGetB(s_accent) << 6;

  if ((t = dict_find(iter, KEY_ACCENT_R))) { r = t->value->int32; accent_changed = true; }
  if ((t = dict_find(iter, KEY_ACCENT_G))) { g = t->value->int32; accent_changed = true; }
  if ((t = dict_find(iter, KEY_ACCENT_B))) { b = t->value->int32; accent_changed = true; }

  if (accent_changed) {
    s_accent = GColorFromRGB(r, g, b);
    persist_write_int(PERSIST_ACCENT_R, r);
    persist_write_int(PERSIST_ACCENT_G, g);
    persist_write_int(PERSIST_ACCENT_B, b);
  }

  if ((t = dict_find(iter, KEY_AQI)))          s_aqi        = t->value->int32;
  if ((t = dict_find(iter, KEY_WEATHER_CODE)))  s_wmo_icon   = t->value->int32;
  if ((t = dict_find(iter, KEY_TEMP_HIGH)))     s_temp_high  = t->value->int32;
  if ((t = dict_find(iter, KEY_TEMP_LOW)))      s_temp_low   = t->value->int32;

  layer_mark_dirty(s_canvas_layer);
}

// ─── HealthService event handler ─────────────────────────────────────────────
// Fires when the watch's own step/sleep tracking updates, so the tiles stay
// current without waiting for the next minute tick.
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

  // Load fonts
  s_font_time    = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TIME_52));
  s_font_med     = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_BOLD_18));
  s_font_sm      = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_REGULAR_12));
  s_font_weather = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_WEATHER_36));

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
}

// ─── Init / deinit ────────────────────────────────────────────────────────────
static void init(void) {
  srand(time(NULL));

  // Load persisted accent colour (default: Amber #F0A30A)
  if (persist_exists(PERSIST_ACCENT_R)) {
    uint8_t r = persist_read_int(PERSIST_ACCENT_R);
    uint8_t g = persist_read_int(PERSIST_ACCENT_G);
    uint8_t b = persist_read_int(PERSIST_ACCENT_B);
    s_accent = GColorFromRGB(r, g, b);
  } else {
    s_accent = GColorFromRGB(240, 163, 10); // Amber
  }

  memset(s_tile_flipping, false, sizeof(s_tile_flipping));
  memset(s_flip_phase,    0,     sizeof(s_flip_phase));
  memset(s_flip_timer,    0,     sizeof(s_flip_timer));

  // AppMessage
  app_message_register_inbox_received(inbox_received_handler);
  app_message_open(256, 64);

  // Tick
  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);

  // Focus (backlight wakeup → flip)
  app_focus_service_subscribe(app_focus_handler);

  // HealthService: subscribe for live updates, then read once immediately
  // so the tiles aren't blank until the first event fires.
  health_service_events_subscribe(health_handler, NULL);
  update_steps_data();
  update_sleep_data();

  // Window
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
  app_focus_service_unsubscribe();
  health_service_events_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
