/**
 * Optional AI assistant (Gemini, the user's own Google AI Studio key). The model never produces numbers shown as fact:
 * it calls engine/database tools; tool outputs are displayed separately ("Hesaplayan: motor").
 */
import type { Services } from '../data/services';
import { todayIso } from '../data/services';
import * as repo from '../data/repo';
import { cookedToRaw, rawToCooked, round } from '../engine';

export interface ToolCallLog { name: string; args: any; result: any }
export interface DraftLog { food_id: number; name: string; grams: number; meal: string; per100: any; grams_value_type: string }
export interface AssistantReply { text: string; tools: ToolCallLog[]; drafts: DraftLog[]; hiddenNumbers: number }

const TOOLS = [{
  functionDeclarations: [
    { name: 'search_foods', description: 'Besin veritabanında ara (Türkçe veya İngilizce). id, ad, hazırlık durumu döner.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
    { name: 'get_food', description: 'Bir besinin 100 g değerleri ve porsiyonları.', parameters: { type: 'OBJECT', properties: { id: { type: 'NUMBER' } }, required: ['id'] } },
    { name: 'resolve_amount', description: 'Miktar+birimi grama çevir. unit: "g" veya ölçü adı (su bardağı, çay bardağı, yemek kaşığı, tatlı kaşığı, çay kaşığı).', parameters: { type: 'OBJECT', properties: { food_id: { type: 'NUMBER' }, amount: { type: 'NUMBER' }, unit: { type: 'STRING' } }, required: ['food_id', 'amount', 'unit'] } },
    { name: 'nutrients_for', description: 'Belirli gram için besin değerleri.', parameters: { type: 'OBJECT', properties: { food_id: { type: 'NUMBER' }, grams: { type: 'NUMBER' } }, required: ['food_id', 'grams'] } },
    { name: 'cook_convert', description: 'Çiğ<->pişmiş dönüşümü. Kullanıcının kendi tartılmış verimini kullanır; yoksa cooked_g verilmeli.', parameters: { type: 'OBJECT', properties: { raw_food_id: { type: 'NUMBER' }, raw_g: { type: 'NUMBER' }, cooked_g: { type: 'NUMBER' }, cooked_eaten_g: { type: 'NUMBER' } }, required: ['raw_food_id'] } },
    { name: 'day_summary', description: 'Bir günün toplamları (date YYYY-MM-DD, boşsa bugün).', parameters: { type: 'OBJECT', properties: { date: { type: 'STRING' } } } },
    { name: 'remaining_targets', description: 'Bugün kalan kalori/makro.', parameters: { type: 'OBJECT', properties: { date: { type: 'STRING' } } } },
    { name: 'get_trend', description: 'Trend kilo ve haftalık değişim.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'draft_log_entry', description: 'Kullanıcının onaylayacağı bir kayıt taslağı oluştur (kaydetmez).', parameters: { type: 'OBJECT', properties: { food_id: { type: 'NUMBER' }, grams: { type: 'NUMBER' }, meal: { type: 'STRING', enum: ['breakfast', 'lunch', 'dinner', 'snack'] } }, required: ['food_id', 'grams', 'meal'] } },
  ],
}];

const SYSTEM = `Sen Diyet uygulamasının yardımcısısın. Türkçe, kısa ve net yanıt ver.
KURAL: Hiçbir sayıyı kendin hesaplama veya uydurma. Her sayı bir araç (tool) çıktısından gelmeli; aracın verdiği değeri ve değer türünü (ölçülmüş/kaynaklı/tahmini/eksik) aynen aktar.
Besin değerini bilmiyorsan search_foods ve get_food kullan. Kayıt önerirken draft_log_entry ile taslak oluştur; kullanıcı onaylar.
Fotoğraf verilirse olası yiyecekleri ve kabaca porsiyonları say, her biri için search_foods çağır ve taslak oluştur; emin olmadığını söyle.
Tıbbi teşhis koyma.`;

function k(v: number | null | undefined, d = 1) { return v == null ? null : round(v, d); }

export function runTool(sv: Services, name: string, a: any): any {
  switch (name) {
    case 'search_foods': return sv.search(String(a.query ?? ''), 8).map(f => ({ id: f.id, name: f.name, name_en: f.name_en, prep: f.prep, source: f.sourceLabel }));
    case 'get_food': { const f = sv.food(+a.id); if (!f) return { error: 'bulunamadı' }; return { id: f.id, name: f.name, source: f.sourceLabel, per100g: Object.fromEntries(sv.ref.coreCodes().map(c => [c, { value: k(f.per100[c]?.value), type: f.per100[c]?.type ?? 'missing' }])), portions: f.portions.slice(0, 5) }; }
    case 'resolve_amount': {
      const f = sv.food(+a.food_id); if (!f) return { error: 'bulunamadı' };
      const unit = String(a.unit).toLocaleLowerCase('tr');
      let code = 'g';
      if (unit !== 'g' && unit !== 'gram') { const m = repo.measures(sv.db).find(x => x.name_tr.toLocaleLowerCase('tr') === unit || x.code === unit); if (!m) return { error: 'ölçü bilinmiyor' }; code = 'm:' + m.id; }
      try { const r = sv.resolveAmount(f, +a.amount, code); return { grams: k(r.value), value_type: r.value_type, sources: r.sources }; } catch (e: any) { return { error: e.code ?? 'HATA', message: e.message }; }
    }
    case 'nutrients_for': { const f = sv.food(+a.food_id); if (!f) return { error: 'bulunamadı' }; const n = sv.nutrientsFor(f, +a.grams); return Object.fromEntries(sv.ref.coreCodes().map(c => [c, { value: k(n[c]?.value), type: n[c]?.type }])); }
    case 'cook_convert': {
      const ys = repo.measuredYields(sv.db, +a.raw_food_id);
      let y: number | null = null; let src = '';
      if (a.raw_g && a.cooked_g) { y = +a.cooked_g / +a.raw_g; src = 'verilen ağırlıklar (ölçülmüş)'; }
      else if (ys.length) { y = ys[0].y; src = `sizin ${ys[0].created_at.slice(0, 10)} tarihli tartımınız (ölçülmüş)`; }
      if (!y) return { error: 'NO_YIELD', message: 'Bu besin için tartılmış pişirme verimi yok. Bir kez pişirip tartın (Kayıt > Pişir).' };
      const out: any = { yield_ratio: k(y, 3), source: src };
      if (a.raw_g) out.cooked_g = k(rawToCooked(+a.raw_g, y));
      if (a.cooked_eaten_g) out.raw_equivalent_g = k(cookedToRaw(+a.cooked_eaten_g, y));
      return out;
    }
    case 'day_summary': { const s = sv.daySummary(a.date || todayIso()); return { date: s.date, entries: s.entries.length, totals: Object.fromEntries(sv.ref.coreCodes().map(c => [c, { value: k(s.total[c].value ?? s.total[c].known), incomplete: s.total[c].incomplete }])), target_kcal: k(s.target?.kcal ?? null, 0) }; }
    case 'remaining_targets': { const r = sv.remaining(a.date || todayIso()); return r ? { kcal: k(r.kcal, 0), protein_g: k(r.protein_g), fat_g: k(r.fat_g), carb_g: k(r.carb_g), incomplete: r.incomplete } : { error: 'hedef yok' }; }
    case 'get_trend': { const t = sv.trendSummary(todayIso()); return { trend_kg: k(t.trend, 2), weekly_change_kg: k(t.weekly, 2) }; }
    case 'draft_log_entry': { const f = sv.food(+a.food_id); if (!f) return { error: 'bulunamadı' }; return { draft: true, food_id: f.id, name: f.name, grams: +a.grams, meal: a.meal, note: 'Kullanıcı onayı bekleniyor' }; }
  }
  return { error: 'bilinmeyen araç' };
}

/** Hide numbers in model text that do not appear in any tool output (guard, spec 6). */
export function guardNumbers(text: string, tools: ToolCallLog[]): { text: string; hidden: number } {
  const blob = JSON.stringify(tools.map(t => [t.args, t.result]));
  const known = new Set((blob.match(/\d+(?:[.,]\d+)?/g) ?? []).map(s => s.replace(',', '.')));
  let hidden = 0;
  const out = text.replace(/\d+(?:[.,]\d+)?/g, m => {
    const n = m.replace(',', '.');
    if (known.has(n) || known.has(String(Math.round(+n))) || +n <= 10 || /^(19|20)\d\d$/.test(n)) return m;
    hidden++; return '[?]';
  });
  return { text: out, hidden };
}

export async function askGemini(sv: Services, key: string, model: string, history: { role: 'user' | 'model'; text: string }[], userText: string, image?: { mime: string; b64: string }): Promise<AssistantReply> {
  const contents: any[] = history.map(h => ({ role: h.role, parts: [{ text: h.text }] }));
  const parts: any[] = [{ text: userText }]; if (image) parts.push({ inlineData: { mimeType: image.mime, data: image.b64 } });
  contents.push({ role: 'user', parts });
  const tools: ToolCallLog[] = []; const drafts: DraftLog[] = [];
  for (let step = 0; step < 6; step++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, tools: TOOLS, generationConfig: { temperature: 0.2 } }),
    });
    if (r.status === 429) throw new Error('Gemini kullanım sınırına ulaşıldı. Biraz sonra deneyin veya elle hesaplayın.');
    if (!r.ok) throw new Error('Gemini hatası: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    const cand = j.candidates?.[0]?.content; if (!cand) throw new Error('Gemini boş yanıt döndü.');
    contents.push(cand);
    const calls = (cand.parts ?? []).filter((p: any) => p.functionCall);
    if (!calls.length) {
      const text = (cand.parts ?? []).map((p: any) => p.text ?? '').join('');
      const g = guardNumbers(text, tools);
      return { text: g.text, tools, drafts, hiddenNumbers: g.hidden };
    }
    const responses = calls.map((c: any) => {
      const result = runTool(sv, c.functionCall.name, c.functionCall.args ?? {});
      tools.push({ name: c.functionCall.name, args: c.functionCall.args, result });
      if (c.functionCall.name === 'draft_log_entry' && result.draft) {
        const f = sv.food(result.food_id)!; drafts.push({ food_id: f.id, name: f.name, grams: result.grams, meal: result.meal, per100: f.per100, grams_value_type: 'estimated' });
      }
      return { functionResponse: { name: c.functionCall.name, response: { result } } };
    });
    contents.push({ role: 'user', parts: responses });
  }
  return { text: 'Yanıt tamamlanamadı (çok fazla araç çağrısı).', tools, drafts, hiddenNumbers: 0 };
}
