import type { PrepState } from './types';
/** Accent-insensitive, Turkish-aware normalisation (spec 4.2: i/ı/İ/I all map to "i"). */
export function normalize(s: string): string {
  return s
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

export interface Searchable { key: string; tr: string; en: string; boost?: number }

/** Score a candidate: all query tokens must appear; prefix/word-start and Turkish-name matches rank higher. */
export function score(query: string, c: Searchable): number {
  const q = normalize(query); if (!q) return 0;
  const toks = q.split(' ');
  let s = 0;
  for (const t of toks) {
    const i = c.key.indexOf(t);
    if (i < 0) return 0;
    s += 1;
    if (i === 0 || c.key[i - 1] === ' ') s += 2;
    if (c.tr && c.tr.includes(t)) s += 3;
    if (c.tr && c.tr.startsWith(t)) s += 3;
  }
  if (c.tr && c.tr === q) s += 10;
  s -= c.key.length / 200;
  return s + (c.boost ?? 0);
}

// ---------- Turkish query understanding (multi-word, preparation words, TR -> EN food words) ----------

/** Turkish preparation words -> prep states (from the USDA description) + the English words USDA uses. Keys are normalize()d. */
export const TR_PREP: Record<string, { states: PrepState[]; en: string[] }> = {
  haslanmis: { states: ['boiled', 'stewed', 'cooked_unspecified'], en: ['boiled', 'stewed', 'simmered', 'hard boiled'] },
  haslama: { states: ['boiled', 'stewed', 'cooked_unspecified'], en: ['boiled', 'stewed', 'simmered'] },
  izgara: { states: ['grilled'], en: ['grilled', 'broiled', 'dry heat'] },
  firin: { states: ['baked', 'roasted'], en: ['roasted', 'baked', 'dry heat'] },
  firinda: { states: ['baked', 'roasted'], en: ['roasted', 'baked', 'dry heat'] },
  kizarmis: { states: ['fried', 'pan_fried'], en: ['fried'] },
  kizartma: { states: ['fried', 'pan_fried'], en: ['fried'] },
  kizartilmis: { states: ['fried', 'pan_fried'], en: ['fried'] },
  tavada: { states: ['pan_fried', 'fried'], en: ['pan fried', 'fried'] },
  sahanda: { states: ['fried', 'pan_fried'], en: ['fried'] },
  cig: { states: ['raw'], en: ['raw'] },
  buharda: { states: ['steamed'], en: ['steamed'] },
  kavrulmus: { states: ['roasted'], en: ['roasted', 'toasted'] },
  pismis: { states: ['boiled', 'stewed', 'cooked_unspecified', 'baked', 'roasted', 'grilled', 'fried', 'pan_fried', 'steamed', 'microwaved'], en: ['cooked'] },
  konserve: { states: ['canned', 'drained'], en: ['canned'] },
  kuru: { states: ['dry'], en: ['dry', 'dried'] },
  kurutulmus: { states: ['dry'], en: ['dried'] },
};

/** Common Turkish food words -> English words/phrases found in USDA descriptions (each phrase: all its words must match). */
export const TR_EN: Record<string, string[]> = {
  tavuk: ['chicken'], pilic: ['chicken'], gogus: ['breast'], gogsu: ['breast'], gogusu: ['breast'], but: ['thigh', 'drumstick', 'leg'], butu: ['thigh', 'drumstick', 'leg'],
  baget: ['drumstick'], kanat: ['wing'], kanadi: ['wing'], ciger: ['liver'], cigeri: ['liver'], taslik: ['gizzard'], derili: ['skin'], derisiz: ['meat only', 'skinless'],
  kemiksiz: ['boneless'], kiyma: ['beef ground', 'ground'], kofte: ['beef ground'], dana: ['beef', 'veal'], sigir: ['beef'], et: ['beef', 'meat'], kuzu: ['lamb'],
  koyun: ['lamb', 'mutton'], hindi: ['turkey'], bonfile: ['tenderloin'], antrikot: ['rib eye', 'rib'], pirzola: ['chop'], biftek: ['steak'], kusbasi: ['stew meat', 'cubed'],
  balik: ['fish'], somon: ['salmon'], ton: ['tuna'], hamsi: ['anchovy'], levrek: ['sea bass', 'bass'], sardalya: ['sardine'], uskumru: ['mackerel'], alabalik: ['trout'],
  karides: ['shrimp'], midye: ['mussel'], kalamar: ['squid'], ahtapot: ['octopus'],
  pirinc: ['rice'], pilav: ['rice'], pilavi: ['rice'], bulgur: ['bulgur'], makarna: ['pasta', 'spaghetti', 'macaroni'], spagetti: ['spaghetti'], sehriye: ['noodles', 'vermicelli'],
  eriste: ['noodles egg'], kuskus: ['couscous'], kinoa: ['quinoa'], yulaf: ['oats', 'oat', 'non dairy'], arpa: ['barley'], un: ['flour'], bugday: ['wheat'], tam: ['whole'], misir: ['corn'],
  mercimek: ['lentils', 'lentil'], nohut: ['chickpeas', 'garbanzo'], fasulye: ['beans'], barbunya: ['cranberry beans', 'beans'], bakla: ['broad beans', 'fava'], bezelye: ['peas'], soya: ['soy', 'soybeans', 'non dairy'],
  patates: ['potato', 'potatoes'], domates: ['tomato', 'tomatoes'], salatalik: ['cucumber'], hiyar: ['cucumber'], sogan: ['onion', 'onions'], sarimsak: ['garlic'], biber: ['pepper', 'peppers'],
  patlican: ['eggplant'], kabak: ['squash', 'zucchini'], havuc: ['carrot', 'carrots'], ispanak: ['spinach'], lahana: ['cabbage'], karnabahar: ['cauliflower'], brokoli: ['broccoli'],
  marul: ['lettuce'], roka: ['arugula'], maydanoz: ['parsley'], dereotu: ['dill'], nane: ['spearmint', 'peppermint'], mantar: ['mushroom', 'mushrooms'], pancar: ['beets'], turp: ['radish', 'radishes'],
  kereviz: ['celery', 'celeriac'], enginar: ['artichoke'], bamya: ['okra'], pirasa: ['leeks'], semizotu: ['purslane'], taze: ['fresh'],
  elma: ['apple', 'apples'], armut: ['pear', 'pears'], muz: ['banana', 'bananas'], portakal: ['orange', 'oranges'], mandalina: ['tangerine', 'tangerines', 'mandarin'], limon: ['lemon'],
  greyfurt: ['grapefruit'], uzum: ['grapes', 'raisins'], cilek: ['strawberries'], kiraz: ['cherries sweet', 'cherries'], visne: ['cherries sour'], seftali: ['peach', 'peaches'], kayisi: ['apricot', 'apricots'],
  karpuz: ['watermelon'], kavun: ['melon', 'cantaloupe', 'honeydew'], incir: ['figs', 'fig'], nar: ['pomegranate', 'pomegranates'], erik: ['plums', 'plum'], avokado: ['avocado', 'avocados'],
  kivi: ['kiwifruit', 'kiwi'], ananas: ['pineapple'], hurma: ['dates'], ayva: ['quince'], dut: ['mulberries'], bogurtlen: ['blackberries'], ahududu: ['raspberries'], yaban: ['wild'],
  ceviz: ['walnuts'], findik: ['hazelnuts', 'filberts'], badem: ['almonds', 'non dairy'], fistik: ['peanuts', 'pistachio'], yerfistigi: ['peanuts'], kaju: ['cashew'], cekirdek: ['seeds'], susam: ['sesame'],
  yogurt: ['yogurt'], sut: ['milk'], peynir: ['cheese'], kasar: ['cheese cheddar', 'cheese'], lor: ['cheese cottage', 'ricotta'], krema: ['cream'], tereyagi: ['butter'], tereyag: ['butter'],
  yag: ['oil', 'fat'], zeytinyagi: ['oil olive'], aycicek: ['sunflower'], zeytin: ['olives'], yumurta: ['egg', 'eggs'], ekmek: ['bread'], simit: ['bagel', 'bread'], lavas: ['tortilla', 'bread'],
  corba: ['soup'], corbasi: ['soup'], seker: ['sugar', 'sugars'], bal: ['honey'], recel: ['jam', 'jams'], pekmez: ['molasses'], tahin: ['tahini', 'sesame butter'], humus: ['hummus'],
  cikolata: ['chocolate'], kakao: ['cocoa'], kahve: ['coffee'], cay: ['tea'], su: ['water'], meyve: ['fruit'], suyu: ['juice'], ayran: ['yogurt', 'buttermilk'], kefir: ['kefir'],
  salam: ['salami'], sucuk: ['sausage'], sosis: ['frankfurter', 'sausage'], jambon: ['ham'], pastirma: ['beef cured', 'pastrami'], tuz: ['salt'], ketcap: ['catsup'], mayonez: ['mayonnaise'],
  hardal: ['mustard'], sirke: ['vinegar'], gevrek: ['cereal'], patlamis: ['popcorn'], cips: ['chips'], kurabiye: ['cookies'], kek: ['cake'], biskuvi: ['cookies', 'crackers'], dondurma: ['ice cream'],
  buzlu: ['iced', 'frozen'], soguk: ['iced'], kapucino: ['cappuccino'], kapucinno: ['cappuccino'], moka: ['mocha'], frappe: ['frozen coffee drink'],
  frappuccino: ['frozen coffee drink'], filtre: ['brewed'], turk: ['turkish'], kahvesi: ['coffee'], sutlu: ['latte', 'milk', 'pre lightened'],
  sekerli: ['sweetened', 'pre sweetened'], surup: ['flavored'], suruplu: ['flavored'], aromali: ['flavored'], kafeinsiz: ['decaffeinated'], bitkisel: ['non dairy'],
  yagsiz: ['fat free', 'lean', 'nonfat'], yarim: ['reduced fat', 'lowfat'], esmer: ['brown'], beyaz: ['white'], kirmizi: ['red'], yesil: ['green'], sari: ['yellow'], siyah: ['black'],
};

const SUFFIXES = ['lari', 'leri', 'lar', 'ler', 'si', 'su', 'yi', 'yu', 'ni', 'nu', 'da', 'de', 'ta', 'te', 'li', 'lu', 'i', 'u'];

/** Dictionary lookup tolerant to a few Turkish suffixes (göğsü, çorbası, pilavı...). */
function lookup<T>(dict: Record<string, T>, t: string): T | undefined {
  if (dict[t]) return dict[t];
  for (const s of SUFFIXES) if (t.length - s.length >= 3 && t.endsWith(s) && dict[t.slice(0, -s.length)]) return dict[t.slice(0, -s.length)];
  return undefined;
}

export interface QueryTerm { raw: string; prep?: { states: PrepState[]; en: string[] }; en: string[] }
/** Split a Turkish/English query into terms: each a raw token, its English alternatives, and a prep meaning if it is a prep word. */
export function parseQuery(query: string): QueryTerm[] {
  return normalize(query).split(' ').filter(Boolean).map(raw => ({ raw, prep: lookup(TR_PREP, raw), en: lookup(TR_EN, raw) ?? [] }));
}
export function queryHasPrep(query: string): boolean { return parseQuery(query).some(t => !!t.prep); }

const OBSCURE = /(^| )(feet|giblets|heart|liver|gizzard|kidneys?|tongue|brain|neck|backs?|capons|patty|patties|nuggets|babyfood|mechanically|separable|added solution|chicken skin|skin only|frozen|fast foods?|restaurant)( |$)/;

export interface SearchDoc { tr: string; en: string; prep: PrepState; exact: string[]; boost: number }
const hasWord = (text: string, w: string) => (' ' + text).includes(' ' + w);
const phraseIn = (text: string, phrase: string) => phrase.split(' ').every(w => hasWord(text, w));

/**
 * Score one food for a parsed query. Returns { score, matched } where matched = number of terms matched.
 * Ranking: exact Turkish name > all terms matched > partial. A prep term matches the food's prep state or its English prep words.
 */
export function scoreDoc(terms: QueryTerm[], d: SearchDoc, qNorm: string): { score: number; matched: number } {
  let s = 0, matched = 0;
  const trWords = d.tr.split(' ');
  for (const t of terms) {
    let m = 0;
    if (t.prep) {
      if (t.prep.states.includes(d.prep)) m = d.prep === 'cooked_unspecified' && t.prep.states.length < 5 ? 2 : 4; else if (t.prep.en.some(w => phraseIn(d.en, w))) m = 3;
      if (!m && hasWord(d.tr, t.raw)) m = 3;
    } else {
      if (trWords.some(w => w === t.raw)) m = 6;
      else if (trWords.some(w => w.startsWith(t.raw))) m = 5;
      else if (t.raw.length >= 4 && trWords.some(w => w.length >= 4 && t.raw.startsWith(w))) m = 4; // inflected: corbasi ~ corba
      else if (t.en.some(p => phraseIn(d.en, p))) m = 4;
      else if (hasWord(d.en, t.raw)) m = 3;
      else if (t.raw.length >= 3 && (d.en.includes(t.raw) || d.tr.includes(t.raw))) m = 1;
    }
    if (m) { matched++; s += m; }
  }
  if (!matched) return { score: 0, matched: 0 };
  if (d.exact.includes(qNorm)) s += 30;
  else if (d.exact.some(x => x.startsWith(qNorm))) s += 6;
  if (matched === terms.length) s += 20;
  // the first English word is the food itself ("Chicken, ..."); prefer foods whose head noun was asked for
  const head = d.en.split(' ')[0];
  if (terms.some(t => !t.prep && (t.raw === head || t.en.some(p => p.split(' ')[0] === head || p.split(' ')[0] + 's' === head)))) s += 3;
  // by-products and processed forms rank below the plain food unless the query asked for them
  const odd = d.en.match(OBSCURE);
  if (odd && !terms.some(t => t.en.some(p => odd[0].includes(p)) || odd[0].includes(t.raw))) s -= 4;
  s += d.boost - d.en.length / 60;
  return { score: s, matched };
}

/** Drinks USDA does not have under that name: search the honest nearest and say so (no invented values). Keys are normalize()d. */
export const SEARCH_FALLBACK: Record<string, { q: string; note: string }> = {
  americano: { q: 'espresso', note: 'USDA FNDDS’te “americano” kaydı yok. Americano = espresso + sıcak su (su 0 kcal): espresso’yu shot sayısıyla kaydedin.' },
  'flat white': { q: 'latte', note: 'USDA FNDDS’te “flat white” kaydı yok. En yakın: latte (flat white’ta süt daha az, değerler biraz düşük olur).' },
  'mercimek corbasi': { q: 'lentil soup', note: 'USDA’da Türk usulü mercimek çorbası yok. En yakın: ABD konserve mercimek çorbaları (içerik farklı). Tarif olarak kendiniz oluşturabilirsiniz.' },
};
