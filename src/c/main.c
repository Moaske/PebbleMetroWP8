#include <pebble.h>

// ─── Screen & tile geometry ─────────────────────────────────────────────────
// Two platforms: Emery (Pebble Time 2, 200x228) and Basalt (Pebble Time /
// Time Steel, 144x168). Both are full-colour (2-bit/channel, 64 colours) —
// Basalt is purely a resolution difference, not a colour-depth one.
//
//   Row 1: 95 (time) + 3 (gap) + 46 (date)                            = 144
//   Row 2: 46 (slot) + 3 (gap) + 95 (weather)                          = 144
//   Row 3: 46 (slot) + 3 + 46 (slot) + 3 + 46 (battery)                = 144
#if defined(PBL_PLATFORM_EMERY)
  #define SCREEN_W        200
  #define SCREEN_H        228
  #define TILE_GAP        4
  #define TILE_SQ         64
  #define TILE_DBL        132
  #define TILE_ICON_SIZE  28
  #define ARROW_ICON_SIZE 24
  #define TILE_PAD_X      4
  #define TILE_PAD_Y      3

  #define TIME_Y_OFFSET   (-5)
  #define TIME_X_OFFSET   2
  #define LABEL_H         12
  #define ICON_Y_OFFSET   9
  #define VALUE_Y_OFFSET  40
  // Template 2 (two stacked value lines).
  // T2_LINE2_Y deliberately equals VALUE_Y_OFFSET so the bottom line sits at
  // exactly the same height as template 1's value line -- same font, so they
  // must line up across tiles.
  // T2_LINE1_Y is one icon-height above it: zero vertical gap between the two
  // icon rows, which the glyphs' own internal padding already separates.
  #define T2_ICON_SIZE    18
  #define T2_LINE2_Y      VALUE_Y_OFFSET
  #define T2_LINE1_Y      (T2_LINE2_Y - T2_ICON_SIZE)
  #define T2_LINE_H       (T2_ICON_SIZE + 4)
  #define T2_LABEL_W      21   // FONT_ICONS_18 glyph (18px measured) + gap
  // Icon and text share a row box, and Pebble draws both from the box top.
  // The 18pt icon's ink therefore hangs ~4px below the 14pt text's (roughly
  // the point-size difference), so the icon is lifted rather than the text
  // pushed down -- the text line is already where it should be, level with
  // template 1's value.
  #define T2_ICON_Y_NUDGE (-4)

  #define WEATHER_LEFT_MARGIN    6
  #define WEATHER_TOP_OFFSET     14
  #define WEATHER_ICON_Y_SUB     3
  #define WEATHER_ICON_W         36
  #define WEATHER_ICON_H         38
  #define WEATHER_TX_OFFSET      40
  #define WEATHER_CUR_Y_OFFSET   4
  #define WEATHER_CUR_H          22
  #define WEATHER_HL_Y_OFFSET    26

  #define DATE_DAY_Y_OFFSET   6
  #define DATE_DAY_H          26
  #define DATE_DM_Y_OFFSET    30
  #define DATE_DM_H           24

  #define BATT_TEXT_Y_OFFSET  18
  #define BATT_TEXT_H         10
  #define BATT_BAR_H          3
  #define BATT_GAP_TEXT_BAR   4
  #define BATT_GAP_BAR_TEXT   2
  #define BATT_ICON_COL_W     14

#elif defined(PBL_PLATFORM_BASALT)
  #define SCREEN_W        144
  #define SCREEN_H        168
  #define TILE_GAP        3
  #define TILE_SQ         46
  #define TILE_DBL        95
  #define TILE_ICON_SIZE  20
  #define ARROW_ICON_SIZE 17
  #define TILE_PAD_X      3
  #define TILE_PAD_Y      2

  #define TIME_Y_OFFSET   (-4)
  #define TIME_X_OFFSET   1
  #define LABEL_H         9
  #define ICON_Y_OFFSET   7
  #define VALUE_Y_OFFSET  29
  #define T2_ICON_SIZE    13
  #define T2_LINE2_Y      VALUE_Y_OFFSET
  #define T2_LINE1_Y      (T2_LINE2_Y - T2_ICON_SIZE)
  #define T2_LINE_H       (T2_ICON_SIZE + 4)
  #define T2_LABEL_W      16   // FONT_ICONS_13 glyph (13px measured) + gap
  #define T2_ICON_Y_NUDGE (-3)   // 13pt icon vs 10pt text

  #define WEATHER_LEFT_MARGIN    4
  #define WEATHER_TOP_OFFSET     10
  #define WEATHER_ICON_Y_SUB     2
  #define WEATHER_ICON_W         26
  #define WEATHER_ICON_H         27
  #define WEATHER_TX_OFFSET      29
  #define WEATHER_CUR_Y_OFFSET   3
  #define WEATHER_CUR_H          16
  #define WEATHER_HL_Y_OFFSET    19

  #define DATE_DAY_Y_OFFSET   4
  #define DATE_DAY_H          19
  #define DATE_DM_Y_OFFSET    22
  #define DATE_DM_H           17

  #define BATT_TEXT_Y_OFFSET  13
  #define BATT_TEXT_H         7
  #define BATT_BAR_H          2
  #define BATT_GAP_TEXT_BAR   3
  #define BATT_GAP_BAR_TEXT   1
  #define BATT_ICON_COL_W     10
#endif

#define ROW1_Y          0
#define ROW2_Y          (ROW1_Y + TILE_SQ + TILE_GAP)
#define ROW3_Y          (ROW2_Y + TILE_SQ + TILE_GAP)
#define ROWS_BOTTOM     (ROW3_Y + TILE_SQ)

#define COL1_X          0
#define COL2_X          (COL1_X + TILE_SQ + TILE_GAP)
#define COL3_X          (COL2_X + TILE_SQ + TILE_GAP)

#define ARROW_CENTER_X  (SCREEN_W - 4 - ARROW_ICON_SIZE / 2)
#define ARROW_CENTER_Y  (ROWS_BOTTOM + (SCREEN_H - ROWS_BOTTOM) / 2)

// ─── AppMessage keys ──────────────────────────────────────────────────────────
// package.json's array-style "messageKeys" get their numeric IDs allocated by
// the build tool -- NOT sequential from 0 in declaration order. The build
// injects the real values as MESSAGE_KEY_<Name>, so alias those rather than
// hardcoding numbers that may not match.
#define KEY_ACCENT_R     MESSAGE_KEY_ACCENT_R
#define KEY_ACCENT_G     MESSAGE_KEY_ACCENT_G
#define KEY_ACCENT_B     MESSAGE_KEY_ACCENT_B
#define KEY_AQI          MESSAGE_KEY_AQI
#define KEY_WEATHER_CODE MESSAGE_KEY_WEATHER_CODE
#define KEY_TEMP_HIGH    MESSAGE_KEY_TEMP_HIGH
#define KEY_TEMP_LOW     MESSAGE_KEY_TEMP_LOW
#define KEY_TEMP_CURRENT MESSAGE_KEY_TEMP_CURRENT
#define KEY_SUNRISE_MIN  MESSAGE_KEY_SUNRISE_MIN
#define KEY_SUNSET_MIN   MESSAGE_KEY_SUNSET_MIN
#define KEY_UV_INDEX     MESSAGE_KEY_UV_INDEX
#define KEY_WIND_SPEED   MESSAGE_KEY_WIND_SPEED
#define KEY_WIND_DIR     MESSAGE_KEY_WIND_DIR
#define KEY_PRECIP_PROB  MESSAGE_KEY_PRECIP_PROB
#define KEY_TILE_A       MESSAGE_KEY_TILE_A
#define KEY_TILE_B       MESSAGE_KEY_TILE_B
#define KEY_TILE_C       MESSAGE_KEY_TILE_C
#define KEY_WEEK_START   MESSAGE_KEY_WEEK_START   // 0 = Sunday, 1 = Monday
#define KEY_WEEK_REF_DN  MESSAGE_KEY_WEEK_REF_DN  // offset-week start, days since 1970-01-01
#define KEY_THEME        MESSAGE_KEY_THEME
#define KEY_TEMP_UNIT    MESSAGE_KEY_TEMP_UNIT
#define KEY_DATE_ORDER   MESSAGE_KEY_DATE_ORDER
#define KEY_LOCATION     MESSAGE_KEY_LOCATION
#define KEY_PHONE_BATTERY  MESSAGE_KEY_PHONE_BATTERY
#define KEY_PHONE_CHARGING MESSAGE_KEY_PHONE_CHARGING

// ─── Persistent storage keys ─────────────────────────────────────────────────
#define PERSIST_ACCENT_R   100
#define PERSIST_ACCENT_G   101
#define PERSIST_ACCENT_B   102
#define PERSIST_THEME      103
#define PERSIST_TEMP_UNIT  104
#define PERSIST_DATE_ORDER 105
#define PERSIST_AQI          106
#define PERSIST_WMO_ICON     107
#define PERSIST_TEMP_HIGH    108
#define PERSIST_TEMP_LOW     109
#define PERSIST_TEMP_CURRENT 110
#define PERSIST_LOCATION     111
#define PERSIST_SUNRISE_MIN  112
#define PERSIST_SUNSET_MIN   113
#define PERSIST_UV_INDEX     114
#define PERSIST_WIND_SPEED   115
#define PERSIST_WIND_DIR     116
#define PERSIST_PRECIP_PROB  117
#define PERSIST_TILE_A       118
#define PERSIST_TILE_B       119
#define PERSIST_TILE_C       120
#define PERSIST_WEEK_START   121
#define PERSIST_WEEK_REF_DN  122
#define PERSIST_HRM_LAST     123

#define FLIP_DURATION_MS   200
#define FLIP_DELAY_MS      1000
#define LIGHT_POLL_MS      250

// ─── Globals ─────────────────────────────────────────────────────────────────
static Window *s_window;
static Layer  *s_canvas_layer;

static GColor  s_accent;
static uint8_t s_accent_r = 240, s_accent_g = 163, s_accent_b = 10; // WP Amber

static bool s_theme_light = false;
static bool s_temp_unit_fahrenheit = false;
static bool s_date_order_mdy = false;

static int  s_aqi          = 0;
static int  s_wmo_icon     = 0;
static int  s_temp_high    = 0;
static int  s_temp_low     = 0;
static int  s_temp_current = 0;
static int  s_sunrise_min  = -1;   // minutes since local midnight, -1 = unknown
static int  s_sunset_min   = -1;
static int  s_uv_index_x10 = -1;   // UV * 10, keeps one decimal without floats
static int  s_wind_speed   = -1;   // km/h
static int  s_wind_dir     = -1;   // degrees
static int  s_precip_prob  = -1;   // % chance, coming hour
static int  s_week_start   = 1;    // 0 = Sunday, 1 = Monday (ISO default)
static long s_week_ref_dn  = -1;   // offset-week start date, -1 = not configured
// The system samples heart rate only every few minutes, so a peek very often
// returns 0 simply because no fresh reading exists -- that is normal, not an
// error. Cache the last good value (persisted) so the tile keeps showing the
// most recent real measurement instead of blinking to "--" between samples.
static int  s_hrm_last     = -1;
static char s_location[32] = "";
static int  s_phone_battery = -1;
static bool s_phone_charging = false;

static int  s_steps   = 0;
static int  s_sleep_h = 0;
static int  s_sleep_m = 0;

typedef enum {
  TILE_TIME = 0, TILE_DATE, TILE_AQI, TILE_WEATHER,
  TILE_STEPS, TILE_SLEEP, TILE_BATTERY, TILE_COUNT
} TileId;

static bool      s_tile_flipping[TILE_COUNT];
static int       s_flip_phase[TILE_COUNT];
static AppTimer *s_flip_timer[TILE_COUNT];
static AppTimer *s_flip_delay_timer;
static AppTimer *s_light_poll_timer;
static bool      s_light_was_on = false;

// ─── Weather icons ───────────────────────────────────────────────────────────
static const char *WEATHER_ICONS[] = {
  "a","b","c","d","e","f","g","h","i","j","k","l","m",
};
#define WEATHER_ICON_NIGHT_CLEAR         "n"
#define WEATHER_ICON_NIGHT_PARTLY_CLOUDY "o"

static bool is_night_now(void) {
  if (s_sunrise_min < 0 || s_sunset_min < 0) return false;
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  int now_min = t->tm_hour * 60 + t->tm_min;
  if (s_sunrise_min < s_sunset_min) {
    return (now_min < s_sunrise_min) || (now_min >= s_sunset_min);
  }
  // Degenerate ordering (polar latitudes): treat the gap as night.
  return (now_min >= s_sunset_min) && (now_min < s_sunrise_min);
}

static const char *weather_icon_for(int idx) {
  if (idx < 0 || idx >= (int)(sizeof(WEATHER_ICONS)/sizeof(WEATHER_ICONS[0]))) idx = 0;
  if (is_night_now()) {
    if (idx == 0) return WEATHER_ICON_NIGHT_CLEAR;
    if (idx == 1) return WEATHER_ICON_NIGHT_PARTLY_CLOUDY;
  }
  return WEATHER_ICONS[idx];
}

// ─── Icon glyphs (MetroIcons.ttf) ────────────────────────────────────────────
// One MDI font replaces every icon bitmap. Colour is free (glyphs follow
// graphics_context_set_text_color, so no _DARK asset pairs) and sizing is
// free (a font resource bakes at whatever size its name declares, whereas
// graphics_draw_bitmap_in_rect clips rather than scales).
#define ICON_STEPS      "0"
#define ICON_SLEEP      "1"
#define ICON_AQI        "2"
#define ICON_WATCH      "3"
#define ICON_PHONE      "4"
#define ICON_HEART      "5"
#define ICON_CALORIES   "6"
#define ICON_UV         "7"
#define ICON_WIND       "8"
#define ICON_WIND_DIR   "9"
#define ICON_PRECIP     ":"   // umbrella open  - rain expected
#define ICON_PRECIP_DRY ">"   // umbrella closed - no rain expected
#define ICON_SUNSET     "?"
#define ICON_SUNRISE    "@"
#define ICON_WEEK_ISO   ";"
#define ICON_WEEK_EDU   "<"
#define ICON_ARROW      "="

static const char *MOON_ICONS[] = { "A","B","C","D","E","F","G","H" };

// ─── Date tile localization ──────────────────────────────────────────────────
typedef struct {
  const char *lang_prefix;
  const char *weekdays[7];
} LocaleWeekdays;

static const LocaleWeekdays WEEKDAY_TABLE[] = {
  { "en", { "SUN","MON","TUE","WED","THU","FRI","SAT" } },
  { "fr", { "DIM","LUN","MAR","MER","JEU","VEN","SAM" } },
  { "de", { "SO","MO","DI","MI","DO","FR","SA" } },
  { "es", { "DOM","LUN","MAR","MIE","JUE","VIE","SAB" } },
  { "it", { "DOM","LUN","MAR","MER","GIO","VEN","SAB" } },
  { "nl", { "ZO","MA","DI","WO","DO","VR","ZA" } },
  { "pt", { "DOM","SEG","TER","QUA","QUI","SEX","SAB" } },
};
#define WEEKDAY_TABLE_COUNT (sizeof(WEEKDAY_TABLE)/sizeof(WEEKDAY_TABLE[0]))

static const char *const *locale_weekdays(void) {
  const char *locale = i18n_get_system_locale();
  for (size_t i = 0; i < WEEKDAY_TABLE_COUNT; i++) {
    size_t n = strlen(WEEKDAY_TABLE[i].lang_prefix);
    if (strncmp(locale, WEEKDAY_TABLE[i].lang_prefix, n) == 0) {
      return WEEKDAY_TABLE[i].weekdays;
    }
  }
  return WEEKDAY_TABLE[0].weekdays;
}

// ─── Configurable tile content ───────────────────────────────────────────────
typedef enum {
  CONTENT_AQI = 0,
  CONTENT_STEPS,
  CONTENT_SLEEP,
  CONTENT_MOONPHASE,
  CONTENT_RAIN,
  CONTENT_HRM,
  CONTENT_CALORIES,
  CONTENT_WEEKNR,
  CONTENT_SUNSET,
  CONTENT_COUNT
} ContentId;

static ContentId s_slot[3] = { CONTENT_AQI, CONTENT_STEPS, CONTENT_SLEEP };

// ─── Moon phase ──────────────────────────────────────────────────────────────
// Computed on-watch. Open-Meteo's `daily=moon_phase` only appears in a
// user-filed GitHub issue, not their official parameter docs, so relying on
// it would build on an unverified field. The phase is deterministic anyway,
// changes once a day, and a local calculation keeps working offline.
// Reference new moon 2000-01-06 18:14 UTC; synodic month 29.530588853 d.
// Integer maths throughout: (elapsed * 8) peaks near 2.0e7, inside int32.
#define MOON_REF_EPOCH   947182440L
#define MOON_SYNODIC_SEC 2551443L

static int moon_phase_index(void) {
  long e = (long)time(NULL) - MOON_REF_EPOCH;
  e %= MOON_SYNODIC_SEC;
  if (e < 0) e += MOON_SYNODIC_SEC;
  return (int)(((e * 8) + (MOON_SYNODIC_SEC / 2)) / MOON_SYNODIC_SEC) % 8;
}

static const char *MOON_NAMES[] = {
  "New Moon","Waxing Cres","First Qtr","Waxing Gib",
  "Full Moon","Waning Gib","Last Qtr","Waning Cres",
};

// ─── UV classification (WHO bands) ───────────────────────────────────────────
static const char *uv_classification(int uv_x10) {
  int uv = uv_x10 / 10;
  if (uv <= 2)  return "Low";
  if (uv <= 5)  return "Moderate";
  if (uv <= 7)  return "High";
  if (uv <= 10) return "Very High";
  return "Extreme";
}

// ─── Week numbers ────────────────────────────────────────────────────────────
// days_from_civil: days since 1970-01-01 for a proleptic-Gregorian y/m/d.
// Pure integer arithmetic -- avoids depending on mktime(), whose behaviour on
// Pebble's cut-down libc is not something worth betting on.
static long days_from_civil(int y, int m, int d) {
  y -= (m <= 2);
  long era = (y >= 0 ? y : y - 399) / 400;
  long yoe = y - era * 400;                                   // 0..399
  long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;  // 0..365
  long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;           // 0..146096
  return era * 146097 + doe - 719468;
}

static bool is_leap(int y) { return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0; }
static int  days_in_year(int y) { return is_leap(y) ? 366 : 365; }

// ISO-8601 week number, generalised so the week can start on Sunday too.
// Strict ISO always starts Monday; s_week_start lets the user pick Sunday,
// in which case this is "ISO rules, Sunday-based" rather than literal ISO.
static int week_number(const struct tm *t, int wstart) {
  int year    = t->tm_year + 1900;
  int ordinal = t->tm_yday + 1;                       // 1-based day of year
  int wd      = ((t->tm_wday - wstart) + 7) % 7 + 1;  // 1..7, start day == 1
  int week    = (ordinal - wd + 10) / 7;

  if (week < 1) {
    // Falls in the final week of the previous year.
    week = (ordinal + days_in_year(year - 1) - wd + 10) / 7;
  } else if (week > 52) {
    // Only a real week 53 if enough of it lands in this year.
    if ((days_in_year(year) - ordinal) < (4 - wd)) week = 1;
  }
  return week;
}

// Weekday of a day-number. 1970-01-01 was a Thursday (tm_wday == 4).
static int weekday_of_daynum(long dn) {
  int wd = (int)((dn + 4) % 7);
  return wd < 0 ? wd + 7 : wd;
}

// Offset week: 0 for the week containing the configured start date, counting
// up and wrapping after 52 (so 0..52 inclusive = 53 distinct values).
// Returns -1 when no start date has been configured yet.
static int offset_week_number(const struct tm *t, int wstart, long ref_dn) {
  if (ref_dn < 0) return -1;

  long today_dn    = days_from_civil(t->tm_year + 1900, t->tm_mon + 1, t->tm_mday);
  int  today_wd    = ((t->tm_wday - wstart) + 7) % 7;
  long today_start = today_dn - today_wd;

  int  ref_wd      = ((weekday_of_daynum(ref_dn) - wstart) + 7) % 7;
  long ref_start   = ref_dn - ref_wd;

  long weeks = (today_start - ref_start) / 7;
  weeks %= 53;
  if (weeks < 0) weeks += 53;
  return (int)weeks;
}

// ─── Sunrise/sunset formatting ───────────────────────────────────────────────
static void format_hhmm(int minutes, char *buf, size_t sz) {
  if (minutes < 0) { snprintf(buf, sz, "--:--"); return; }
  int h = minutes / 60, m = minutes % 60;
  if (clock_is_24h_style()) {
    snprintf(buf, sz, "%02d:%02d", h, m);
  } else {
    int h12 = h % 12; if (h12 == 0) h12 = 12;
    snprintf(buf, sz, "%d:%02d", h12, m);
  }
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

// ─── HealthService ───────────────────────────────────────────────────────────
static void update_steps_data(void) {
  time_t start = time_start_of_today(), end = time(NULL);
  if (health_service_metric_accessible(HealthMetricStepCount, start, end)
        & HealthServiceAccessibilityMaskAvailable) {
    s_steps = (int)health_service_sum_today(HealthMetricStepCount);
  }
}

// Same-day running total that resets at midnight, matching how the built-in
// Pebble Health app reports sleep (and naturally folding in a nap).
static void update_sleep_data(void) {
  time_t start = time_start_of_today(), end = time(NULL);
  if (health_service_metric_accessible(HealthMetricSleepSeconds, start, end)
        & HealthServiceAccessibilityMaskAvailable) {
    int total = (int)health_service_sum_today(HealthMetricSleepSeconds);
    s_sleep_h = total / SECONDS_PER_HOUR;
    s_sleep_m = (total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE;
  }
}

// Peek the most recent heart rate the system already recorded. This never
// powers up the sensor for a fresh reading. A 0 result just means no sample
// has landed recently, so the cached last-good value is kept rather than
// overwritten -- that is what stops the tile flickering to "--".
static void update_hrm_data(void) {
#if defined(PBL_PLATFORM_EMERY)
  time_t now = time(NULL);
  if (health_service_metric_accessible(HealthMetricHeartRateBPM, now, now)
        & HealthServiceAccessibilityMaskAvailable) {
    HealthValue bpm = health_service_peek_current_value(HealthMetricHeartRateBPM);
    if (bpm > 0) {
      s_hrm_last = (int)bpm;
      persist_write_int(PERSIST_HRM_LAST, s_hrm_last);
    }
  }
#endif
}

// ─── Fonts ───────────────────────────────────────────────────────────────────
static GFont s_font_time;
static GFont s_font_med;
static GFont s_font_sm;
static GFont s_font_sb;          // semibold, unified tile value font
static GFont s_font_weather;     // MetroIcons, weather-tile size
static GFont s_font_icon_tile;   // MetroIcons, tile-centre size
static GFont s_font_icon_arrow;  // MetroIcons, nav-arrow size
static GFont s_font_icons_mini;  // MetroIcons, battery-row size
static GFont s_font_icon_t2;     // MetroIcons, template-2 row size

static GColor theme_fg(void) { return s_theme_light ? GColorBlack : GColorWhite; }
static GColor theme_bg(void) { return s_theme_light ? GColorWhite : GColorBlack; }

// Weather always arrives in Celsius; conversion happens at draw time so a
// unit change needs no refetch.
static int display_temp(int c) {
  return s_temp_unit_fahrenheit ? (c * 9) / 5 + 32 : c;
}
static char temp_unit_char(void) { return s_temp_unit_fahrenheit ? 'F' : 'C'; }

// Open-Meteo's documented european_aqi bands.
static const char *aqi_classification(int aqi) {
  if (aqi < 20)  return "Good";
  if (aqi < 40)  return "Fair";
  if (aqi < 60)  return "Moderate";
  if (aqi < 80)  return "Poor";
  if (aqi < 100) return "Very Poor";
  return "Xtr Poor";
}

// ─── Content resolver ────────────────────────────────────────────────────────
// One spec covers both templates. `dual` selects which renderer runs; buf1/
// buf2 back any formatted value so nothing points at a dead stack temporary.
typedef struct {
  const char *title;
  bool        dual;
  const char *icon;       // template 1
  const char *value;
  const char *l1_icon;    // template 2
  const char *l1_value;
  const char *l2_icon;
  const char *l2_value;
  char        buf1[24];
  char        buf2[24];
} TileSpec;

static void tile_spec_for(ContentId id, TileSpec *s) {
  s->dual = false;
  s->icon = ""; s->value = "--";
  s->l1_icon = ""; s->l1_value = ""; s->l2_icon = ""; s->l2_value = "";

  switch (id) {
    case CONTENT_AQI:
      s->title = "AQI";
      s->icon  = ICON_AQI;
      s->value = aqi_classification(s_aqi);
      break;

    case CONTENT_STEPS:
      s->title = "STEPS";
      s->icon  = ICON_STEPS;
      snprintf(s->buf1, sizeof(s->buf1), "%d", s_steps);
      s->value = s->buf1;
      break;

    case CONTENT_SLEEP:
      s->title = "SLEEP";
      s->icon  = ICON_SLEEP;
      if (s_sleep_h == 0 && s_sleep_m == 0) {
        s->value = "--";
      } else {
        // Drop the trailing "m" on double-digit hours so the string stays
        // the 5-character width that is proven to fit.
        if (s_sleep_h >= 10) snprintf(s->buf1, sizeof(s->buf1), "%dh %02d",  s_sleep_h, s_sleep_m);
        else                 snprintf(s->buf1, sizeof(s->buf1), "%dh %02dm", s_sleep_h, s_sleep_m);
        s->value = s->buf1;
      }
      break;

    case CONTENT_MOONPHASE: {
      int p = moon_phase_index();
      s->title = "MOON";
      s->icon  = MOON_ICONS[p];
      s->value = MOON_NAMES[p];
      break;
    }

    case CONTENT_RAIN:
      s->title = "RAIN";
      s->icon  = (s_precip_prob > 0) ? ICON_PRECIP : ICON_PRECIP_DRY;
      if (s_precip_prob < 0) {
        s->value = "1hr: --";
      } else {
        snprintf(s->buf1, sizeof(s->buf1), "1hr: %d%%", s_precip_prob);
        s->value = s->buf1;
      }
      break;

    case CONTENT_HRM:
      s->title = "HRM";
      s->icon  = ICON_HEART;
#if defined(PBL_PLATFORM_EMERY)
      if (s_hrm_last > 0) {
        snprintf(s->buf1, sizeof(s->buf1), "%d bpm", s_hrm_last);
        s->value = s->buf1;
      } else {
        s->value = "-- bpm";
      }
#else
      s->value = "n/a";   // Basalt has no optical heart rate sensor
#endif
      break;

    case CONTENT_CALORIES: {
      time_t start = time_start_of_today(), end = time(NULL);
      int total = 0;
      s->title = "TODAY";
      s->icon  = ICON_CALORIES;
      if (health_service_metric_accessible(HealthMetricActiveKCalories, start, end)
            & HealthServiceAccessibilityMaskAvailable) {
        total += (int)health_service_sum_today(HealthMetricActiveKCalories);
      }
      if (health_service_metric_accessible(HealthMetricRestingKCalories, start, end)
            & HealthServiceAccessibilityMaskAvailable) {
        total += (int)health_service_sum_today(HealthMetricRestingKCalories);
      }
      if (total > 0) {
        snprintf(s->buf1, sizeof(s->buf1), "%d cal", total);
        s->value = s->buf1;
      } else {
        s->value = "-- cal";
      }
      break;
    }

    case CONTENT_WEEKNR: {
      time_t now = time(NULL);
      struct tm *t = localtime(&now);
      int iso = week_number(t, s_week_start);
      int off = offset_week_number(t, s_week_start, s_week_ref_dn);

      s->title    = "WEEKNR";
      s->dual     = true;
      s->l1_icon  = ICON_WEEK_ISO;
      s->l2_icon  = ICON_WEEK_EDU;
      // Always two digits, so week 5 reads "05".
      snprintf(s->buf1, sizeof(s->buf1), "%02d", iso);
      s->l1_value = s->buf1;
      if (off < 0) {
        s->l2_value = "--";   // no start date configured yet
      } else {
        snprintf(s->buf2, sizeof(s->buf2), "%02d", off);
        s->l2_value = s->buf2;
      }
      break;
    }

    case CONTENT_SUNSET:
      s->title    = "SUNSET";
      s->dual     = true;
      s->l1_icon  = ICON_SUNRISE;
      s->l2_icon  = ICON_SUNSET;
      format_hhmm(s_sunrise_min, s->buf1, sizeof(s->buf1));
      format_hhmm(s_sunset_min,  s->buf2, sizeof(s->buf2));
      s->l1_value = s->buf1;
      s->l2_value = s->buf2;
      break;

    default:
      s->title = "";
      break;
  }
}

// ─── Template 1: title / centred icon / value ────────────────────────────────
static void draw_template_single(GContext *ctx, GRect inner, int px, const TileSpec *s) {
  GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, LABEL_H);
  graphics_draw_text(ctx, s->title, s_font_sm, lbl_r,
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);

  GRect icon_r = GRect(inner.origin.x, inner.origin.y + ICON_Y_OFFSET,
                       inner.size.w, TILE_ICON_SIZE + 4);
  graphics_draw_text(ctx, s->icon, s_font_icon_tile, icon_r,
                     GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);

  // Borrows back the right padding the tile fill already covers.
  GRect val_r = GRect(inner.origin.x, inner.origin.y + VALUE_Y_OFFSET,
                      inner.size.w + px, inner.size.h - VALUE_Y_OFFSET);
  graphics_draw_text(ctx, s->value, s_font_sb, val_r,
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
}

// ─── Template 2: title / two right-aligned value lines ───────────────────────
// Values use s_font_sb rather than s_font_med: measured, a "WK:"-style text
// label plus a 3-character value needs 66px of the 60px available on Emery at
// s_font_med (47px of 43px on Basalt), whereas at s_font_sb it fits in 49px
// (35px). The label column is an icon glyph at the mini size.
static void draw_template_dual(GContext *ctx, GRect inner, int px, const TileSpec *s) {
  GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, LABEL_H);
  graphics_draw_text(ctx, s->title, s_font_sm, lbl_r,
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);

  const int   ys[2]     = { T2_LINE1_Y, T2_LINE2_Y };
  const char *icons[2]  = { s->l1_icon,  s->l2_icon  };
  const char *values[2] = { s->l1_value, s->l2_value };

  for (int i = 0; i < 2; i++) {
    // T2_ICON_Y_NUDGE lifts the icon so its bottom sits on the text's
    // bottom, rather than hanging below it.
    GRect lab_r = GRect(inner.origin.x, inner.origin.y + ys[i] + T2_ICON_Y_NUDGE,
                        T2_LABEL_W, T2_LINE_H);
    graphics_draw_text(ctx, icons[i], s_font_icon_t2, lab_r,
                       GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);

    GRect val_r = GRect(inner.origin.x + T2_LABEL_W, inner.origin.y + ys[i],
                        inner.size.w + px - T2_LABEL_W, T2_LINE_H);
    graphics_draw_text(ctx, values[i], s_font_sb, val_r,
                       GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
  }
}

static void draw_tile_content(GContext *ctx, TileId id, GRect r) {
  GColor fg = theme_fg();
  graphics_context_set_text_color(ctx, fg);

  int px = TILE_PAD_X, py = TILE_PAD_Y;
  GRect inner = GRect(r.origin.x + px, r.origin.y + py,
                      r.size.w - px*2, r.size.h - py*2);
  char buf[32];

  switch (id) {
    case TILE_TIME: {
      time_t now = time(NULL);
      struct tm *t = localtime(&now);
      bool is_24h = clock_is_24h_style();
      if (is_24h) snprintf(buf, sizeof(buf), "%02d:%02d", t->tm_hour, t->tm_min);
      else        snprintf(buf, sizeof(buf), "%d:%02d",
                           t->tm_hour % 12 == 0 ? 12 : t->tm_hour % 12, t->tm_min);
      GRect tr = GRect(inner.origin.x + TIME_X_OFFSET, inner.origin.y + TIME_Y_OFFSET,
                       inner.size.w, inner.size.h);
      graphics_draw_text(ctx, buf, s_font_time, tr,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      // AM/PM top-right, 12h mode only. Slight overlap with the big digits
      // is an accepted trade-off.
      if (!is_24h) {
        GRect ampm_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, LABEL_H);
        graphics_draw_text(ctx, t->tm_hour < 12 ? "AM" : "PM", s_font_sm, ampm_r,
                           GTextOverflowModeWordWrap, GTextAlignmentRight, NULL);
      }
      break;
    }

    case TILE_DATE: {
      time_t now = time(NULL);
      struct tm *t = localtime(&now);
      const char *const *days = locale_weekdays();
      GRect day_r = GRect(inner.origin.x, inner.origin.y + DATE_DAY_Y_OFFSET,
                          inner.size.w, DATE_DAY_H);
      graphics_draw_text(ctx, days[t->tm_wday], s_font_med, day_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      if (s_date_order_mdy) snprintf(buf, sizeof(buf), "%02d/%02d", t->tm_mon + 1, t->tm_mday);
      else                  snprintf(buf, sizeof(buf), "%02d/%02d", t->tm_mday, t->tm_mon + 1);
      GRect dm_r = GRect(inner.origin.x, inner.origin.y + DATE_DM_Y_OFFSET,
                         inner.size.w, DATE_DM_H);
      graphics_draw_text(ctx, buf, s_font_med, dm_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      break;
    }

    // The three configurable slots.
    case TILE_AQI:
    case TILE_STEPS:
    case TILE_SLEEP: {
      int slot = (id == TILE_AQI) ? 0 : (id == TILE_STEPS) ? 1 : 2;
      TileSpec spec;
      tile_spec_for(s_slot[slot], &spec);
      if (spec.dual) draw_template_dual(ctx, inner, px, &spec);
      else           draw_template_single(ctx, inner, px, &spec);
      break;
    }

    case TILE_WEATHER: {
      GRect loc_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, LABEL_H);
      graphics_draw_text(ctx, s_location, s_font_sm, loc_r,
                         GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);

      int left_margin = WEATHER_LEFT_MARGIN;
      int top = inner.origin.y + WEATHER_TOP_OFFSET;
      GRect icon_r = GRect(inner.origin.x + left_margin, top - WEATHER_ICON_Y_SUB,
                           WEATHER_ICON_W, WEATHER_ICON_H);
      graphics_draw_text(ctx, weather_icon_for(s_wmo_icon), s_font_weather, icon_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      int tx = inner.origin.x + left_margin + WEATHER_TX_OFFSET;
      int tw = inner.size.w - left_margin - WEATHER_TX_OFFSET;

      snprintf(buf, sizeof(buf), "%d\u00B0%c", display_temp(s_temp_current), temp_unit_char());
      GRect cur_r = GRect(tx, top + WEATHER_CUR_Y_OFFSET, tw, WEATHER_CUR_H);
      graphics_draw_text(ctx, buf, s_font_med, cur_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      snprintf(buf, sizeof(buf), "H %d\u00B0%c L %d\u00B0%c",
               display_temp(s_temp_high), temp_unit_char(),
               display_temp(s_temp_low),  temp_unit_char());
      GRect hl_r = GRect(tx, top + WEATHER_HL_Y_OFFSET, tw,
                         inner.size.h - (top + WEATHER_HL_Y_OFFSET - inner.origin.y));
      graphics_draw_text(ctx, buf, s_font_sm, hl_r,
                         GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
      break;
    }

    case TILE_BATTERY: {
      BatteryChargeState bat = battery_state_service_peek();
      int watch_pct = bat.charge_percent;
      GRect lbl_r = GRect(inner.origin.x, inner.origin.y, inner.size.w, LABEL_H);
      graphics_draw_text(ctx, "BATT", s_font_sm, lbl_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

      int text_h = BATT_TEXT_H, bar_h = BATT_BAR_H, bar_w = inner.size.w;
      int watch_text_y = inner.origin.y + BATT_TEXT_Y_OFFSET;
      int watch_bar_y  = watch_text_y + text_h + BATT_GAP_TEXT_BAR;
      int phone_text_y = watch_bar_y + bar_h + BATT_GAP_BAR_TEXT;
      int phone_bar_y  = phone_text_y + text_h + BATT_GAP_TEXT_BAR;
      GColor track_col = s_theme_light ? GColorFromRGB(200,200,200) : GColorFromRGB(90,90,90);
      int icon_col_w = BATT_ICON_COL_W;

      GRect w_icon_r = GRect(inner.origin.x, watch_text_y - 1, icon_col_w, text_h + 2);
      graphics_draw_text(ctx, ICON_WATCH, s_font_icons_mini, w_icon_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      snprintf(buf, sizeof(buf), "%d%%", watch_pct);
      GRect w_txt_r = GRect(inner.origin.x + icon_col_w, watch_text_y,
                            inner.size.w - icon_col_w, text_h);
      graphics_draw_text(ctx, buf, s_font_sm, w_txt_r,
                         GTextOverflowModeTrailingEllipsis, GTextAlignmentRight, NULL);
      graphics_context_set_fill_color(ctx, track_col);
      graphics_fill_rect(ctx, GRect(inner.origin.x, watch_bar_y, bar_w, bar_h), 2, GCornersAll);
      graphics_context_set_fill_color(ctx, fg);
      graphics_fill_rect(ctx, GRect(inner.origin.x, watch_bar_y,
                                    (bar_w * watch_pct) / 100, bar_h), 2, GCornersAll);

      // Phone side: "--" until the phone has ever reported, "CHRG" while
      // plugged in. The bar tracks real charge either way.
      GRect p_icon_r = GRect(inner.origin.x, phone_text_y - 1, icon_col_w, text_h + 2);
      graphics_draw_text(ctx, ICON_PHONE, s_font_icons_mini, p_icon_r,
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
      GRect p_txt_r = GRect(inner.origin.x + icon_col_w, phone_text_y,
                            inner.size.w - icon_col_w, text_h);
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
      graphics_context_set_fill_color(ctx, track_col);
      graphics_fill_rect(ctx, GRect(inner.origin.x, phone_bar_y, bar_w, bar_h), 2, GCornersAll);
      if (s_phone_battery >= 0) {
        graphics_context_set_fill_color(ctx, fg);
        graphics_fill_rect(ctx, GRect(inner.origin.x, phone_bar_y,
                                      (bar_w * s_phone_battery) / 100, bar_h), 2, GCornersAll);
      }
      break;
    }

    default: break;
  }
}

// ─── Canvas ──────────────────────────────────────────────────────────────────
static void canvas_update_proc(Layer *layer, GContext *ctx) {
  graphics_context_set_fill_color(ctx, theme_bg());
  graphics_fill_rect(ctx, layer_get_bounds(layer), 0, GCornerNone);

  for (int id = 0; id < TILE_COUNT; id++) {
    GRect r = tile_rect((TileId)id);
    if (s_tile_flipping[id]) {
      int squish = (s_flip_phase[id] == 1) ? TILE_SQ / 4 : 3 * TILE_SQ / 4;
      GRect squished = GRect(r.origin.x, r.origin.y + (TILE_SQ - squish) / 2,
                             r.size.w, squish);
      graphics_context_set_fill_color(ctx, s_accent);
      graphics_fill_rect(ctx, squished, 2, GCornersAll);
    } else {
      graphics_context_set_fill_color(ctx, s_accent);
      graphics_fill_rect(ctx, r, 2, GCornersAll);
      draw_tile_content(ctx, (TileId)id, r);
    }
  }

  graphics_context_set_text_color(ctx, theme_fg());
  GRect arrow_r = GRect(ARROW_CENTER_X - ARROW_ICON_SIZE,
                        ARROW_CENTER_Y - ARROW_ICON_SIZE / 2 - 2,
                        ARROW_ICON_SIZE * 2, ARROW_ICON_SIZE + 6);
  graphics_draw_text(ctx, ICON_ARROW, s_font_icon_arrow, arrow_r,
                     GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}

// ─── Flip animation ──────────────────────────────────────────────────────────
// intptr_t, not int, for the void* round-trip: same size on Pebble's 32-bit
// ARM targets but not guaranteed portable C, which is what tripped Basalt's
// "cast to smaller integer type" warning.
static void flip_end_callback(void *context) {
  TileId id = (TileId)(intptr_t)context;
  s_tile_flipping[id] = false;
  s_flip_phase[id] = 0;
  s_flip_timer[id] = NULL;
  layer_mark_dirty(s_canvas_layer);
}

static void flip_phase1_callback(void *context) {
  TileId id = (TileId)(intptr_t)context;
  s_flip_phase[id] = 2;
  layer_mark_dirty(s_canvas_layer);
  s_flip_timer[id] = app_timer_register(FLIP_DURATION_MS, flip_end_callback, context);
}

static void start_flip(TileId id) {
  if (s_tile_flipping[id]) return;
  s_tile_flipping[id] = true;
  s_flip_phase[id] = 1;
  layer_mark_dirty(s_canvas_layer);
  s_flip_timer[id] = app_timer_register(FLIP_DURATION_MS, flip_phase1_callback,
                                        (void*)(intptr_t)id);
}

static void second_flip_callback(void *context) {
  start_flip((TileId)(intptr_t)context);
  s_flip_delay_timer = NULL;
}

static void trigger_wakeup_flips(void) {
  TileId first = (TileId)(rand() % TILE_COUNT), second;
  do { second = (TileId)(rand() % TILE_COUNT); } while (second == first);
  start_flip(first);
  s_flip_delay_timer = app_timer_register(FLIP_DELAY_MS, second_flip_callback,
                                          (void*)(intptr_t)second);
}

// ─── Wake detection ──────────────────────────────────────────────────────────
// No "backlight turned on" event exists in the public SDK and watchfaces
// can't use TouchService, so poll light_is_on() and trigger on the rising
// edge -- that catches wrist flick, tap and button press uniformly.
static void light_poll_callback(void *context) {
  bool now_on = light_is_on();
  if (now_on && !s_light_was_on) {
    update_steps_data();
    update_sleep_data();
    update_hrm_data();
    trigger_wakeup_flips();
  }
  s_light_was_on = now_on;
  s_light_poll_timer = app_timer_register(LIGHT_POLL_MS, light_poll_callback, NULL);
}

// Second, independent trigger: the light poll only fires for people who have
// backlight-on-motion enabled. With that off the accelerometer still reports
// the flick fine. start_flip() no-ops on a tile already mid-flip, so an
// overlap between the two is harmless.
static void accel_tap_handler(AccelAxisType axis, int32_t direction) {
  update_steps_data();
  update_sleep_data();
  update_hrm_data();
  trigger_wakeup_flips();
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  layer_mark_dirty(s_canvas_layer);
}

// ─── AppMessage ──────────────────────────────────────────────────────────────
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
  if ((t = dict_find(iter, KEY_WEEK_START))) {
    s_week_start = (t->value->int32 == 0) ? 0 : 1;
    persist_write_int(PERSIST_WEEK_START, s_week_start);
  }
  if ((t = dict_find(iter, KEY_WEEK_REF_DN))) {
    s_week_ref_dn = (long)t->value->int32;
    persist_write_int(PERSIST_WEEK_REF_DN, (int32_t)s_week_ref_dn);
  }

  if ((t = dict_find(iter, KEY_AQI)))          { s_aqi = t->value->int32;          persist_write_int(PERSIST_AQI, s_aqi); }
  if ((t = dict_find(iter, KEY_WEATHER_CODE))) { s_wmo_icon = t->value->int32;     persist_write_int(PERSIST_WMO_ICON, s_wmo_icon); }
  if ((t = dict_find(iter, KEY_TEMP_HIGH)))    { s_temp_high = t->value->int32;    persist_write_int(PERSIST_TEMP_HIGH, s_temp_high); }
  if ((t = dict_find(iter, KEY_TEMP_LOW)))     { s_temp_low = t->value->int32;     persist_write_int(PERSIST_TEMP_LOW, s_temp_low); }
  if ((t = dict_find(iter, KEY_TEMP_CURRENT))) { s_temp_current = t->value->int32; persist_write_int(PERSIST_TEMP_CURRENT, s_temp_current); }
  if ((t = dict_find(iter, KEY_SUNRISE_MIN)))  { s_sunrise_min = t->value->int32;  persist_write_int(PERSIST_SUNRISE_MIN, s_sunrise_min); }
  if ((t = dict_find(iter, KEY_SUNSET_MIN)))   { s_sunset_min = t->value->int32;   persist_write_int(PERSIST_SUNSET_MIN, s_sunset_min); }
  if ((t = dict_find(iter, KEY_UV_INDEX)))     { s_uv_index_x10 = t->value->int32; persist_write_int(PERSIST_UV_INDEX, s_uv_index_x10); }
  if ((t = dict_find(iter, KEY_WIND_SPEED)))   { s_wind_speed = t->value->int32;   persist_write_int(PERSIST_WIND_SPEED, s_wind_speed); }
  if ((t = dict_find(iter, KEY_WIND_DIR)))     { s_wind_dir = t->value->int32;     persist_write_int(PERSIST_WIND_DIR, s_wind_dir); }
  if ((t = dict_find(iter, KEY_PRECIP_PROB)))  { s_precip_prob = t->value->int32;  persist_write_int(PERSIST_PRECIP_PROB, s_precip_prob); }

  // Slot assignments, range-checked so a stale setting can't index past the
  // content table.
  {
    const uint32_t slot_keys[3]    = { KEY_TILE_A, KEY_TILE_B, KEY_TILE_C };
    const uint32_t persist_keys[3] = { PERSIST_TILE_A, PERSIST_TILE_B, PERSIST_TILE_C };
    for (int i = 0; i < 3; i++) {
      if ((t = dict_find(iter, slot_keys[i]))) {
        int v = t->value->int32;
        if (v >= 0 && v < CONTENT_COUNT) {
          s_slot[i] = (ContentId)v;
          persist_write_int(persist_keys[i], v);
        }
      }
    }
  }

  if ((t = dict_find(iter, KEY_LOCATION))) {
    strncpy(s_location, t->value->cstring, sizeof(s_location) - 1);
    s_location[sizeof(s_location) - 1] = '\0';
    persist_write_string(PERSIST_LOCATION, s_location);
  }
  if ((t = dict_find(iter, KEY_PHONE_BATTERY)))  s_phone_battery = t->value->int32;
  if ((t = dict_find(iter, KEY_PHONE_CHARGING))) s_phone_charging = (t->value->int32 == 1);

  layer_mark_dirty(s_canvas_layer);
}

static void health_handler(HealthEventType event, void *context) {
  switch (event) {
    case HealthEventMovementUpdate:  update_steps_data(); break;
    case HealthEventSleepUpdate:     update_sleep_data(); break;
    case HealthEventHeartRateUpdate: update_hrm_data();   break;
    case HealthEventSignificantUpdate:
      update_steps_data();
      update_sleep_data();
      update_hrm_data();
      break;
    default: break;
  }
  layer_mark_dirty(s_canvas_layer);
}

// ─── Window lifecycle ────────────────────────────────────────────────────────
static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

#if defined(PBL_PLATFORM_EMERY)
  s_font_time       = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TIME_52));
  s_font_med        = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_BOLD_18));
  s_font_sm         = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_REGULAR_12));
  s_font_sb         = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_SEGOEUISB_14));
  s_font_weather    = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_36));
  s_font_icon_tile  = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_28));
  s_font_icon_arrow = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_24));
  s_font_icons_mini = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_12));
  s_font_icon_t2    = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_18));
#elif defined(PBL_PLATFORM_BASALT)
  s_font_time       = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TIME_38));
  s_font_med        = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_BOLD_13));
  s_font_sm         = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_REGULAR_9));
  s_font_sb         = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_SEGOEUISB_10));
  s_font_weather    = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_26));
  s_font_icon_tile  = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_20));
  s_font_icon_arrow = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_17));
  s_font_icons_mini = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_10));
  s_font_icon_t2    = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_ICONS_13));
#endif

  s_canvas_layer = layer_create(bounds);
  layer_set_update_proc(s_canvas_layer, canvas_update_proc);
  layer_add_child(root, s_canvas_layer);
}

static void window_unload(Window *window) {
  layer_destroy(s_canvas_layer);
  fonts_unload_custom_font(s_font_time);
  fonts_unload_custom_font(s_font_med);
  fonts_unload_custom_font(s_font_sm);
  fonts_unload_custom_font(s_font_sb);
  fonts_unload_custom_font(s_font_weather);
  fonts_unload_custom_font(s_font_icon_tile);
  fonts_unload_custom_font(s_font_icon_arrow);
  fonts_unload_custom_font(s_font_icons_mini);
  fonts_unload_custom_font(s_font_icon_t2);
}

// ─── Init / deinit ───────────────────────────────────────────────────────────
static void init(void) {
  srand(time(NULL));

  if (persist_exists(PERSIST_ACCENT_R)) {
    s_accent_r = persist_read_int(PERSIST_ACCENT_R);
    s_accent_g = persist_read_int(PERSIST_ACCENT_G);
    s_accent_b = persist_read_int(PERSIST_ACCENT_B);
  }
  s_accent = GColorFromRGB(s_accent_r, s_accent_g, s_accent_b);

  if (persist_exists(PERSIST_THEME))      s_theme_light = (persist_read_int(PERSIST_THEME) == 1);
  if (persist_exists(PERSIST_TEMP_UNIT))  s_temp_unit_fahrenheit = (persist_read_int(PERSIST_TEMP_UNIT) == 1);
  if (persist_exists(PERSIST_DATE_ORDER)) s_date_order_mdy = (persist_read_int(PERSIST_DATE_ORDER) == 1);
  if (persist_exists(PERSIST_WEEK_START)) s_week_start = (persist_read_int(PERSIST_WEEK_START) == 0) ? 0 : 1;
  if (persist_exists(PERSIST_WEEK_REF_DN)) s_week_ref_dn = (long)persist_read_int(PERSIST_WEEK_REF_DN);
  if (persist_exists(PERSIST_HRM_LAST))   s_hrm_last = persist_read_int(PERSIST_HRM_LAST);

  // Cached weather/location so the first draw after a restart shows the last
  // known values instead of blanks while the fresh fetch is still in flight.
  if (persist_exists(PERSIST_AQI))          s_aqi          = persist_read_int(PERSIST_AQI);
  if (persist_exists(PERSIST_WMO_ICON))     s_wmo_icon     = persist_read_int(PERSIST_WMO_ICON);
  if (persist_exists(PERSIST_TEMP_HIGH))    s_temp_high    = persist_read_int(PERSIST_TEMP_HIGH);
  if (persist_exists(PERSIST_TEMP_LOW))     s_temp_low     = persist_read_int(PERSIST_TEMP_LOW);
  if (persist_exists(PERSIST_TEMP_CURRENT)) s_temp_current = persist_read_int(PERSIST_TEMP_CURRENT);
  if (persist_exists(PERSIST_SUNRISE_MIN))  s_sunrise_min  = persist_read_int(PERSIST_SUNRISE_MIN);
  if (persist_exists(PERSIST_SUNSET_MIN))   s_sunset_min   = persist_read_int(PERSIST_SUNSET_MIN);
  if (persist_exists(PERSIST_UV_INDEX))     s_uv_index_x10 = persist_read_int(PERSIST_UV_INDEX);
  if (persist_exists(PERSIST_WIND_SPEED))   s_wind_speed   = persist_read_int(PERSIST_WIND_SPEED);
  if (persist_exists(PERSIST_WIND_DIR))     s_wind_dir     = persist_read_int(PERSIST_WIND_DIR);
  if (persist_exists(PERSIST_PRECIP_PROB))  s_precip_prob  = persist_read_int(PERSIST_PRECIP_PROB);
  if (persist_exists(PERSIST_LOCATION))     persist_read_string(PERSIST_LOCATION, s_location, sizeof(s_location));
  {
    const uint32_t pk[3] = { PERSIST_TILE_A, PERSIST_TILE_B, PERSIST_TILE_C };
    for (int i = 0; i < 3; i++) {
      if (persist_exists(pk[i])) {
        int v = persist_read_int(pk[i]);
        if (v >= 0 && v < CONTENT_COUNT) s_slot[i] = (ContentId)v;
      }
    }
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
  update_hrm_data();

  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers){
    .load = window_load, .unload = window_unload,
  });
  window_stack_push(s_window, true);
}

static void deinit(void) {
  tick_timer_service_unsubscribe();
  health_service_events_unsubscribe();
  accel_tap_service_unsubscribe();
  if (s_light_poll_timer) app_timer_cancel(s_light_poll_timer);
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}