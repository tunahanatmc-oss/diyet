import React, { useState } from 'react';
import { useApp } from '../store';
import type { FoodView } from '../data/reference';
import { FoodPicker } from '../ui/food';
import { LogSheet, RecipeLogSheet } from '../ui/LogSheet';
import { BarcodeAdd } from './Foods';
import { I } from '../ui/icons';
import { MEAL_TR } from '../data/services';

export function Log() {
  const { param } = useApp();
  const [sel, setSel] = useState<{ f: FoodView; a?: number; u?: string; askPrep?: boolean; askMilk?: boolean } | null>(null);
  const [rec, setRec] = useState<number | null>(null);
  const [scan, setScan] = useState(!!param?.scan);
  return (
    <div>
      <div className="ph" style={{ marginBottom: 20 }}>
        <div><span className="badge-live"><i className="dot" />Hızlı Ekle</span><h1>Ne yedin?</h1><div className="sub">{param?.meal ? MEAL_TR[param.meal as keyof typeof MEAL_TR] + ' için ekle' : 'Ara, son kayıtlarından veya favorilerinden seç.'}{param?.date ? ' · ' + param.date : ''}</div></div>
        <button className="btn" onClick={() => setScan(true)}><I.barcode width={18} /> Barkod Tara</button>
      </div>
      <div className="card"><FoodPicker autoFocus onPick={(f, a, u, o) => setSel({ f, a, u, askPrep: o?.askPrep, askMilk: o?.askMilk })} onPickRecipe={setRec} /></div>
      {sel && <LogSheet food={sel.f} amount={sel.a} unit={sel.u} askPrep={sel.askPrep} askMilk={sel.askMilk} meal={param?.meal} date={param?.date} onClose={() => setSel(null)} />}
      {rec && <RecipeLogSheet recipeId={rec} meal={param?.meal} date={param?.date} onClose={() => setRec(null)} />}
      {scan && <BarcodeAdd onClose={() => setScan(false)} onFood={f => { setScan(false); setSel({ f }); }} />}
    </div>
  );
}
