#!/usr/bin/env node
/**
 * Builds app/public/data/reference.json from USDA FoodData Central CSV downloads
 * (Foundation Foods + SR Legacy; public domain / CC0).
 *
 * Usage:
 *   node scripts/build-reference.mjs <sr_legacy_csv_dir> <foundation_csv_dir>
 * Download from https://fdc.nal.usda.gov/download-datasets (CSV versions), unzip, pass the folders.
 *
 * Rules: no value is invented. A nutrient row absent in USDA => null ("missing"), never 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [srDir, fdDir] = process.argv.slice(2);
if (!srDir || !fdDir) { console.error('usage: build-reference.mjs <srDir> <foundationDir>'); process.exit(1); }
const OUT = path.join(here, '..', 'public', 'data', 'reference.json');

function parseLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
async function readCsv(file, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let header = null; let buf = '';
  for await (const line of rl) {
    buf = buf ? buf + '\n' + line : line;
    if ((buf.match(/"/g) || []).length % 2 === 1) continue; // embedded newline
    const cells = parseLine(buf); buf = '';
    if (!header) { header = cells; continue; }
    const r = {}; header.forEach((h, i) => (r[h] = cells[i])); onRow(r);
  }
}

// nutrient code -> USDA nutrient ids in priority order
const NUTRIENTS = [
  ['energy_kcal', 'Enerji', 'Energy', 'kcal', [1008, 2048, 2047], 1],
  ['protein_g', 'Protein', 'Protein', 'g', [1003], 1],
  ['fat_g', 'Yağ', 'Fat', 'g', [1004], 1],
  ['carb_g', 'Karbonhidrat', 'Carbohydrate', 'g', [1005, 1050], 1],
  ['fiber_g', 'Lif', 'Fibre', 'g', [1079], 1],
  ['sugar_g', 'Şeker', 'Sugars', 'g', [2000, 1063], 1],
  ['satfat_g', 'Doymuş yağ', 'Saturated fat', 'g', [1258], 1],
  ['sodium_mg', 'Sodyum', 'Sodium', 'mg', [1093], 1],
  ['water_g', 'Su', 'Water', 'g', [1051], 0],
  ['cholesterol_mg', 'Kolesterol', 'Cholesterol', 'mg', [1253], 0],
  ['calcium_mg', 'Kalsiyum', 'Calcium', 'mg', [1087], 0],
  ['iron_mg', 'Demir', 'Iron', 'mg', [1089], 0],
  ['magnesium_mg', 'Magnezyum', 'Magnesium', 'mg', [1090], 0],
  ['potassium_mg', 'Potasyum', 'Potassium', 'mg', [1092], 0],
  ['zinc_mg', 'Çinko', 'Zinc', 'mg', [1095], 0],
  ['vitc_mg', 'C vitamini', 'Vitamin C', 'mg', [1162], 0],
  ['vita_ug', 'A vitamini (RAE)', 'Vitamin A (RAE)', 'µg', [1106], 0],
  ['vitd_ug', 'D vitamini', 'Vitamin D', 'µg', [1114], 0],
  ['vitb12_ug', 'B12 vitamini', 'Vitamin B12', 'µg', [1178], 0],
  ['folate_ug', 'Folat (DFE)', 'Folate (DFE)', 'µg', [1190], 0],
];
const idToIdx = new Map();
NUTRIENTS.forEach((n, i) => n[4].forEach((id, pr) => idToIdx.set(id, [i, pr])));

const MEASURED_DERIV = new Set(['A', 'AI', 'AR', 'AS', 'DA', 'PAK', 'JA', 'RKA', 'RPA', 'MA']);
const derivCode = new Map();
await readCsv(path.join(srDir, 'food_nutrient_derivation.csv'), r => derivCode.set(r.id, r.code));

const foods = new Map(); // fdc_id -> food
const cats = new Map();
await readCsv(path.join(srDir, 'food_category.csv'), r => cats.set(r.id, r.description));
await readCsv(path.join(srDir, 'food.csv'), r => {
  foods.set(r.fdc_id, { id: +r.fdc_id, src: 'S', desc: r.description, cat: +r.food_category_id || null, v: {}, o: [] });
});
const fdIds = new Set();
await readCsv(path.join(fdDir, 'foundation_food.csv'), r => fdIds.add(r.fdc_id));
await readCsv(path.join(fdDir, 'food.csv'), r => {
  if (r.data_type !== 'foundation_food' || !fdIds.has(r.fdc_id)) return;
  foods.set(r.fdc_id, { id: +r.fdc_id, src: 'F', desc: r.description, cat: +r.food_category_id || null, v: {}, o: [] });
});

async function loadNutrients(dir) {
  await readCsv(path.join(dir, 'food_nutrient.csv'), r => {
    const f = foods.get(r.fdc_id); if (!f) return;
    const m = idToIdx.get(+r.nutrient_id); if (!m) return;
    if (r.amount === '' || r.amount == null) return;
    const [idx, pr] = m; const prev = f.v[idx];
    if (prev && prev.pr <= pr) return;
    const code = derivCode.get(r.derivation_id);
    let t = f.src === 'F' ? 'm' : (code && MEASURED_DERIV.has(code) ? 'm' : 's');
    if (idx === 0 && +r.nutrient_id !== 1008) t = 's'; // energy calculated by Atwater in the source
    f.v[idx] = { a: +(+r.amount).toPrecision(4), t, pr };
  });
}
await loadNutrients(srDir);
await loadNutrients(fdDir);

// portions
const units = new Map();
await readCsv(path.join(srDir, 'measure_unit.csv'), r => units.set(r.id, r.name));
const UNIT_MAP = [[/^(cups?|cup,)/, 'cup'], [/^(tbsp|tablespoons?)/, 'tbsp'], [/^(tsp|teaspoons?)/, 'tsp'], [/^fl oz/, 'floz'], [/^(slices?)/, 'slice'], [/^(pieces?|each|unit|item)/, 'piece'], [/^serving/, 'serving'], [/^(large|medium|small|extra large|jumbo)/, 'piece'], [/^oz/, 'oz']];
function normUnit(s) { s = (s || '').toLowerCase().trim(); for (const [re, u] of UNIT_MAP) if (re.test(s)) return u; return 'other'; }
async function loadPortions(dir) {
  await readCsv(path.join(dir, 'food_portion.csv'), r => {
    const f = foods.get(r.fdc_id); if (!f) return;
    const g = +r.gram_weight; if (!(g > 0)) return;
    const unitName = r.measure_unit_id === '9999' ? '' : (units.get(r.measure_unit_id) || '');
    const label = [unitName, r.portion_description, r.modifier].filter(Boolean).join(' ').trim() || 'portion';
    const unit = normUnit(unitName || r.modifier || r.portion_description);
    if (unit === 'oz') return; // weight unit, not a household portion
    f.o.push([label.slice(0, 80), +r.amount || 1, unit, +g.toPrecision(4)]);
  });
}
await loadPortions(srDir);
await loadPortions(fdDir);

// prep state
function prepState(desc) {
  const d = desc.toLowerCase();
  if (/drained solids/.test(d)) return 'drained';
  if (/canned/.test(d)) return 'canned';
  if (/pan-fried/.test(d)) return 'pan_fried';
  if (/\bfried\b/.test(d)) return 'fried';
  if (/\bboiled\b/.test(d)) return 'boiled';
  if (/\bsteamed\b/.test(d)) return 'steamed';
  if (/\bgrilled\b|\bbroiled\b/.test(d)) return 'grilled';
  if (/\broasted\b/.test(d)) return 'roasted';
  if (/\bbaked\b/.test(d)) return 'baked';
  if (/\bstewed\b|\bbraised\b|\bsimmered\b/.test(d)) return 'stewed';
  if (/microwaved/.test(d)) return 'microwaved';
  if (/\bcooked\b/.test(d)) return 'cooked_unspecified';
  if (/\braw\b/.test(d)) return 'raw';
  if (/\bdry\b|\bdried\b|uncooked/.test(d)) return 'dry';
  return 'prepared';
}
const PREP_TOKENS = /^(raw|cooked|boiled|steamed|baked|roasted|grilled|broiled|fried|pan-fried|stewed|braised|simmered|microwaved|canned|drained solids|with salt|without salt|dry|uncooked|cooked, boiled|dry heat|moist heat|unprepared|prepared)$/i;
function baseKey(desc) { return desc.split(/,\s*/).filter(t => !PREP_TOKENS.test(t.trim())).join(', ').toLowerCase(); }

// Turkish aliases
const aliasLines = fs.readFileSync(path.join(here, 'tr-aliases.txt'), 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
const byDesc = new Map(); for (const f of foods.values()) byDesc.set(f.desc.toLowerCase(), f);
const unresolved = []; let aliasCount = 0;
for (const line of aliasLines) {
  const [trPart, q] = line.split('|').map(s => s.trim());
  const names = trPart.split(';').map(s => s.trim()).filter(Boolean);
  let f = null;
  if (q.startsWith('!')) f = byDesc.get(q.slice(1).toLowerCase());
  else if (/^\d+$/.test(q)) f = foods.get(q);
  else {
    const toks = q.toLowerCase().split(';').map(s => s.trim());
    const c = [...foods.values()].filter(x => toks.every(t => x.desc.toLowerCase().includes(t)));
    c.sort((a, b) => (a.src === b.src ? 0 : a.src === 'S' ? -1 : 1) || a.desc.length - b.desc.length);
    f = c[0];
  }
  if (!f) { unresolved.push(line); continue; }
  f.tr = f.tr || []; for (const n of names) if (!f.tr.includes(n)) { f.tr.push(n); aliasCount++; }
}

const baseIdx = new Map(); const bases = []; let clampedCarb = 0;
const out = [];
for (const f of foods.values()) {
  const k = baseKey(f.desc); if (!baseIdx.has(k)) { baseIdx.set(k, bases.length); bases.push(k); }
  const v = NUTRIENTS.map((_, i) => (f.v[i] ? f.v[i].a : null));
  // USDA 'carbohydrate by difference' can be slightly negative from rounding; the true value is ~0.
  if (v[3] != null && v[3] < 0) { v[3] = 0; clampedCarb++; f.note = 'Karbonhidrat (farktan hesap) kaynakta negatif çıkmış; 0 olarak alındı.'; }
  const q = NUTRIENTS.map((_, i) => (f.v[i] ? f.v[i].t : '-')).join('');
  const o = { i: f.id, b: baseIdx.get(k), p: prepState(f.desc), e: f.desc, s: f.src, g: f.cat, v, q };
  if (f.tr) o.t = f.tr;
  if (f.note) o.n = f.note;
  if (f.o.length) o.o = f.o.slice(0, 12);
  out.push(o);
}
// checks (spec 7.5)
let noEnergy = 0, neg = 0, macroOver = 0, cupRows = 0, tbspRows = 0;
for (const f of out) {
  if (f.v[0] == null) noEnergy++;
  if (f.v.some(x => x != null && x < 0)) neg++;
  const m = (f.v[1] || 0) + (f.v[2] || 0) + (f.v[3] || 0); if (m > 105) macroOver++;
  for (const p of f.o || []) { if (p[2] === 'cup') cupRows++; if (p[2] === 'tbsp') tbspRows++; }
}
const meta = {
  version: 'reference-' + new Date().toISOString().slice(0, 7).replace('-', '.'),
  built: new Date().toISOString(),
  sources: [
    { code: 'usda_sr_legacy', name: 'USDA FoodData Central – SR Legacy (April 2018)', licence: 'Public domain (CC0 1.0)', url: 'https://fdc.nal.usda.gov/' },
    { code: 'usda_foundation', name: 'USDA FoodData Central – Foundation Foods (' + path.basename(fdDir).match(/\d{4}-\d{2}-\d{2}/)?.[0] + ')', licence: 'Public domain (CC0 1.0)', url: 'https://fdc.nal.usda.gov/' },
  ],
  credit: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov',
  checks: { foods: out.length, noEnergy, negativeValues: neg, macroSumOver105: macroOver, cupPortionRows: cupRows, tbspPortionRows: tbspRows, turkishAliases: aliasCount, negativeCarbClampedToZero: clampedCarb, unresolvedAliases: unresolved.length },
};
const nutrients = NUTRIENTS.map(([code, tr, en, unit, ids, core]) => ({ code, name_tr: tr, name_en: en, unit, usda: ids[0], core }));
const groups = [...cats.entries()].map(([id, d]) => ({ id: +id, name_en: d }));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ meta, nutrients, groups, foods: out }));
console.log(JSON.stringify(meta.checks, null, 1));
if (unresolved.length) console.log('UNRESOLVED:\n' + unresolved.join('\n'));
if (process.env.SHOW_ALIASES) for (const f of out) if (f.t) console.log(f.t[0], '=>', f.e);
