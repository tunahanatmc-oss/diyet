import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import App from './App';
import './styles.css';
import { applyTheme } from './ui/theme';

applyTheme();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

const isTauri = '__TAURI_INTERNALS__' in window;
if ('serviceWorker' in navigator && import.meta.env.PROD && !isTauri) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
