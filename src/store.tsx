import React, { createContext, useContext } from 'react';
import type { Services } from './data/services';

export type Route = 'today' | 'log' | 'foods' | 'recipes' | 'plan' | 'progress' | 'assistant' | 'settings' | 'more';
export interface AppCtx {
  sv: Services;
  version: number;
  changed: (msg?: string) => void;     // persist + re-render (+ optional toast)
  go: (r: Route, param?: any) => void;
  route: Route;
  param: any;
  toast: (m: string) => void;
  replaceDb: (bytes: Uint8Array | null) => Promise<void>;
}
export const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);
