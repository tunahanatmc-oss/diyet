/** personal.sqlite schema (spec 4.3). Each migration runs in a transaction; version in PRAGMA user_version. */
const VT = "CHECK(%s IN ('measured','sourced','estimated','missing'))";
const vt = (c: string) => VT.replace('%s', c);
const MEAL = "CHECK(meal IN ('breakfast','lunch','dinner','snack'))";

export const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK(id = 1), sex TEXT CHECK(sex IN ('male','female')), birth_date TEXT, height_cm REAL,
    activity_level TEXT, goal TEXT CHECK(goal IN ('lose','maintain','gain')), goal_rate_kg_per_week REAL, uses_scale INTEGER DEFAULT 1,
    language TEXT DEFAULT 'tr', protein_per_kg REAL DEFAULT 1.6, fat_fraction REAL DEFAULT 0.3, updated_at TEXT);
  CREATE TABLE target (id INTEGER PRIMARY KEY, valid_from TEXT NOT NULL, kcal REAL NOT NULL, protein_g REAL, fat_g REAL, carb_g REAL, fiber_g REAL,
    method TEXT CHECK(method IN ('mifflin_tdee','adaptive','manual')), inputs_json TEXT);
  CREATE TABLE custom_food (id INTEGER PRIMARY KEY, base_food_id INTEGER, prep_state TEXT NOT NULL DEFAULT 'prepared', name_en TEXT, name_tr TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'user', source_id TEXT, source_year INTEGER, data_quality TEXT, edible_portion_note TEXT,
    origin TEXT CHECK(origin IN ('user','label','turkomp_personal','off','recipe')), barcode TEXT, source_note TEXT,
    created_at TEXT, updated_at TEXT, archived INTEGER DEFAULT 0);
  CREATE TABLE custom_food_nutrient (food_id INTEGER NOT NULL REFERENCES custom_food(id) ON DELETE CASCADE, nutrient_code TEXT NOT NULL,
    amount_per_100g REAL, value_type TEXT NOT NULL ${vt('value_type')}, source_ref TEXT, PRIMARY KEY(food_id, nutrient_code),
    CHECK(amount_per_100g IS NOT NULL OR value_type = 'missing'));
  CREATE TABLE custom_portion (id INTEGER PRIMARY KEY, food_id INTEGER NOT NULL REFERENCES custom_food(id) ON DELETE CASCADE, label_tr TEXT, label_en TEXT,
    amount REAL DEFAULT 1, unit TEXT, gram_weight REAL NOT NULL CHECK(gram_weight > 0), value_type TEXT, source TEXT, source_ref TEXT);
  CREATE TABLE custom_density (id INTEGER PRIMARY KEY, food_id INTEGER NOT NULL REFERENCES custom_food(id) ON DELETE CASCADE, g_per_ml REAL NOT NULL,
    condition TEXT, value_type TEXT, source TEXT, source_ref TEXT);
  CREATE TABLE food_override (id INTEGER PRIMARY KEY, food_id INTEGER NOT NULL, nutrient_code TEXT, field TEXT, value REAL, note TEXT, created_at TEXT);
  CREATE TABLE user_measure (id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name_tr TEXT, name_en TEXT, ml REAL NOT NULL CHECK(ml > 0),
    is_default INTEGER DEFAULT 0, sort_order INTEGER);
  CREATE TABLE measure_calibration (id INTEGER PRIMARY KEY, measure_id INTEGER NOT NULL REFERENCES user_measure(id) ON DELETE CASCADE, food_id INTEGER NOT NULL,
    grams REAL NOT NULL CHECK(grams > 0), level TEXT CHECK(level IN ('level','heaped','packed')), created_at TEXT);
  CREATE TABLE tare (id INTEGER PRIMARY KEY, name TEXT NOT NULL, grams REAL NOT NULL);
  CREATE TABLE recipe (id INTEGER PRIMARY KEY, name TEXT NOT NULL, servings REAL NOT NULL DEFAULT 1, method TEXT, cooked_weight_g REAL,
    cooked_weight_value_type TEXT, notes TEXT, created_at TEXT, updated_at TEXT, archived INTEGER DEFAULT 0);
  CREATE TABLE recipe_ingredient (id INTEGER PRIMARY KEY, recipe_id INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE, food_id INTEGER NOT NULL,
    amount REAL, unit TEXT, grams REAL NOT NULL, grams_value_type TEXT, is_added_fat INTEGER DEFAULT 0, fat_absorption_pct REAL,
    discarded_g REAL, discarded_note TEXT, is_water INTEGER DEFAULT 0, sort_order INTEGER);
  CREATE TABLE cook_session (id INTEGER PRIMARY KEY, raw_food_id INTEGER, raw_g REAL, method TEXT, cooked_g REAL, cooked_value_type TEXT,
    added_fat_food_id INTEGER, added_fat_g REAL, fat_absorption_pct REAL, discarded_g REAL, result_custom_food_id INTEGER, created_at TEXT);
  CREATE TABLE log_entry (id INTEGER PRIMARY KEY, datetime TEXT NOT NULL, meal TEXT ${MEAL}, food_id INTEGER, recipe_id INTEGER REFERENCES recipe(id) ON DELETE RESTRICT,
    cook_session_id INTEGER REFERENCES cook_session(id), entered_amount REAL, entered_unit TEXT, grams REAL NOT NULL, grams_value_type TEXT,
    snapshot_json TEXT NOT NULL, note TEXT, CHECK(food_id IS NOT NULL OR recipe_id IS NOT NULL));
  CREATE INDEX idx_log_datetime ON log_entry(datetime);
  CREATE TABLE favourite (id INTEGER PRIMARY KEY, food_id INTEGER, recipe_id INTEGER, default_amount REAL, default_unit TEXT,
    CHECK(food_id IS NOT NULL OR recipe_id IS NOT NULL));
  CREATE TABLE body_metric (id INTEGER PRIMARY KEY, datetime TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('weight_kg','waist_cm','steps','body_fat_pct')),
    value REAL NOT NULL, note TEXT);
  CREATE INDEX idx_body_type_dt ON body_metric(type, datetime);
  CREATE TABLE water_log (id INTEGER PRIMARY KEY, datetime TEXT NOT NULL, ml REAL NOT NULL);
  CREATE TABLE satiety_log (id INTEGER PRIMARY KEY, log_entry_id INTEGER REFERENCES log_entry(id) ON DELETE SET NULL, meal_datetime TEXT, meal TEXT,
    hunger_before INTEGER CHECK(hunger_before BETWEEN 1 AND 10), fullness_after INTEGER CHECK(fullness_after BETWEEN 1 AND 10),
    minutes_until_hungry INTEGER, energy INTEGER, note TEXT);
  CREATE TABLE meal_plan (id INTEGER PRIMARY KEY, week_start TEXT UNIQUE NOT NULL, name TEXT, created_at TEXT);
  CREATE TABLE meal_plan_item (id INTEGER PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES meal_plan(id) ON DELETE CASCADE, date TEXT NOT NULL,
    meal TEXT ${MEAL}, food_id INTEGER, recipe_id INTEGER, grams REAL NOT NULL, label TEXT, CHECK(food_id IS NOT NULL OR recipe_id IS NOT NULL));
  CREATE TABLE grocery_item (id INTEGER PRIMARY KEY, plan_id INTEGER REFERENCES meal_plan(id) ON DELETE CASCADE, food_id INTEGER, label TEXT NOT NULL,
    grams REAL, checked INTEGER DEFAULT 0, manual INTEGER DEFAULT 0);
  CREATE TABLE pantry_item (id INTEGER PRIMARY KEY, food_id INTEGER, label TEXT NOT NULL, grams REAL, expires_on TEXT, note TEXT);
  CREATE TABLE off_cache (barcode TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at TEXT, licence TEXT);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE backup_log (id INTEGER PRIMARY KEY, datetime TEXT, path TEXT, size_bytes INTEGER, checksum TEXT, kind TEXT CHECK(kind IN ('manual','auto')));
  INSERT INTO user_measure (code, name_tr, name_en, ml, is_default, sort_order) VALUES
    ('su_bardagi','su bardağı','water glass',200,1,1), ('cay_bardagi','çay bardağı','tea glass',100,1,2),
    ('yemek_kasigi','yemek kaşığı','tablespoon',15,1,3), ('tatli_kasigi','tatlı kaşığı','dessert spoon',10,1,4),
    ('cay_kasigi','çay kaşığı','teaspoon',5,1,5);
  `,
  // v2 - meal photos (one per date+meal, downscaled JPEG as data URL; included in backups)
  `
  CREATE TABLE meal_photo (id INTEGER PRIMARY KEY, date TEXT NOT NULL, meal TEXT ${MEAL}, mime TEXT, data_url TEXT NOT NULL, width INTEGER, height INTEGER,
    created_at TEXT, UNIQUE(date, meal));
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;
export const CUSTOM_ID_START = 1_000_000_000;

/** Tables exported in backups, in dependency order (parents first). */
export const BACKUP_TABLES = [
  'profile', 'target', 'custom_food', 'custom_food_nutrient', 'custom_portion', 'custom_density', 'food_override', 'user_measure',
  'measure_calibration', 'tare', 'recipe', 'recipe_ingredient', 'cook_session', 'log_entry', 'favourite', 'body_metric', 'water_log',
  'satiety_log', 'meal_photo', 'meal_plan', 'meal_plan_item', 'grocery_item', 'pantry_item', 'off_cache', 'settings', 'backup_log',
];
