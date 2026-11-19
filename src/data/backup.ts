import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { DB, Row } from './db';
import { q, openDb, userVersion } from './db';
import { BACKUP_TABLES, SCHEMA_VERSION } from './schema';

export const APP_VERSION = '0.1.0';

async function sha256(data: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function dumpTables(db: DB): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const t of BACKUP_TABLES) out[t] = q(db, `SELECT * FROM ${t}`);
  return out;
}

/** .diyetbackup = ZIP(manifest.json, personal.json) - spec 4.4. */
export async function exportBackup(db: DB, referenceVersion: string): Promise<{ bytes: Uint8Array; checksum: string; filename: string }> {
  const personal = strToU8(JSON.stringify({ tables: dumpTables(db) }));
  const manifest = {
    app: 'diyet-app', app_version: APP_VERSION, schema_version: userVersion(db), reference_version: referenceVersion,
    created_at: new Date().toISOString(), parts: { 'personal.json': await sha256(personal) },
  };
  const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)), 'personal.json': personal }, { level: 6 });
  const stamp = manifest.created_at.slice(0, 16).replace(/[:T]/g, '-');
  return { bytes, checksum: await sha256(bytes), filename: `diyet-yedek-${stamp}.diyetbackup` };
}

export class RestoreError extends Error {}

/**
 * Restore into a NEW database (temp); the caller swaps only on success, so current data stays untouched on failure (spec 7.3).
 */
export async function restoreBackup(bytes: Uint8Array, locate?: (f: string) => string): Promise<DB> {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new RestoreError('Dosya bir Diyet yedeği değil veya bozuk.'); }
  if (!files['manifest.json'] || !files['personal.json']) throw new RestoreError('Yedek dosyasında gerekli parçalar yok.');
  let manifest: any;
  try { manifest = JSON.parse(strFromU8(files['manifest.json'])); } catch { throw new RestoreError('Yedek bilgisi (manifest) okunamadı.'); }
  if (manifest.app !== 'diyet-app') throw new RestoreError('Bu dosya Diyet uygulamasına ait değil.');
  if (manifest.schema_version > SCHEMA_VERSION) throw new RestoreError(`Bu yedek daha yeni bir uygulama sürümüyle alınmış (şema ${manifest.schema_version}). Önce uygulamayı güncelleyin.`);
  const sum = await sha256(files['personal.json']);
  if (sum !== manifest.parts?.['personal.json']) throw new RestoreError('Yedek dosyası bozulmuş (sağlama toplamı tutmuyor).');
  const data = JSON.parse(strFromU8(files['personal.json'])).tables as Record<string, Row[]>;
  const db = await openDb(null, locate); // fresh DB at current schema (older backups: columns missing in old schema get defaults)
  try {
    db.run('PRAGMA foreign_keys = OFF');
    db.run('BEGIN');
    db.run('DELETE FROM user_measure'); // seeded rows replaced by backup's
    for (const t of BACKUP_TABLES) {
      const rows = data[t] ?? [];
      if (!rows.length) continue;
      const cols = new Set(q<{ name: string }>(db, `PRAGMA table_info(${t})`).map(c => c.name));
      for (const r of rows) {
        const keys = Object.keys(r).filter(k => cols.has(k));
        db.run(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(k => r[k]));
      }
    }
    db.run('COMMIT');
    db.run('PRAGMA foreign_keys = ON');
    const bad = q(db, 'PRAGMA foreign_key_check');
    if (bad.length) throw new RestoreError('Yedekteki ilişkiler tutarsız.');
  } catch (e) {
    try { db.run('ROLLBACK'); } catch { /* already committed */ }
    db.close();
    throw e instanceof RestoreError ? e : new RestoreError('Yedek geri yüklenemedi: ' + (e as Error).message);
  }
  return db;
}

/** Row count + checksum per table (used by the round-trip test and the restore summary). */
export async function tableChecksums(db: DB): Promise<Record<string, { rows: number; sha: string }>> {
  const out: Record<string, { rows: number; sha: string }> = {};
  for (const [t, rows] of Object.entries(dumpTables(db))) out[t] = { rows: rows.length, sha: await sha256(strToU8(JSON.stringify(rows))) };
  return out;
}

// ---------- CSV (UTF-8 with BOM so Excel shows Turkish letters) ----------
function csv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[;"\n,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '\uFEFF' + rows.map(r => r.map(esc).join(';')).join('\r\n');
}
export function logsCsv(db: DB): string {
  const rows = q<Row>(db, 'SELECT * FROM log_entry ORDER BY datetime');
  const head = ['tarih_saat', 'öğün', 'besin', 'miktar', 'birim', 'gram', 'gram_türü', 'kcal', 'protein_g', 'yağ_g', 'karb_g', 'lif_g'];
  const body = rows.map(r => {
    const s = JSON.parse(r.snapshot_json); const g = r.grams;
    const v = (c: string) => { const x = s.per100?.[c]?.value; return x == null ? '' : (Math.round(x * g) / 100).toFixed(1); };
    return [r.datetime, r.meal, s.name, r.entered_amount, r.entered_unit, Math.round(g * 10) / 10, r.grams_value_type, v('energy_kcal'), v('protein_g'), v('fat_g'), v('carb_g'), v('fiber_g')];
  });
  return csv([head, ...body]);
}
export function weightsCsv(db: DB): string {
  return csv([['tarih_saat', 'tür', 'değer', 'not'], ...q<Row>(db, 'SELECT * FROM body_metric ORDER BY datetime').map(r => [r.datetime, r.type, r.value, r.note])]);
}
export function recipesCsv(db: DB): string {
  return csv([['tarif', 'porsiyon', 'yöntem', 'pişmiş_ağırlık_g', 'malzeme_food_id', 'miktar', 'birim', 'gram'],
    ...q<Row>(db, 'SELECT r.name, r.servings, r.method, r.cooked_weight_g, i.food_id, i.amount, i.unit, i.grams FROM recipe r LEFT JOIN recipe_ingredient i ON i.recipe_id=r.id ORDER BY r.name, i.sort_order')
      .map(r => [r.name, r.servings, r.method, r.cooked_weight_g, r.food_id, r.amount, r.unit, r.grams])]);
}
