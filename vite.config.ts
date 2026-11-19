import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// After build, write the service-worker precache list (all emitted files) into dist/sw.js.
function swManifest() {
  return {
    name: 'sw-manifest',
    apply: 'build' as const,
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist');
      const files: string[] = [];
      const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push('./' + path.relative(dist, p).split(path.sep).join('/')); } };
      walk(dist);
      const list = files.filter(f => f !== './sw.js' && !f.startsWith('./screenshots'));
      const version = Date.now().toString(36);
      const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8').replace('__PRECACHE__', JSON.stringify(['./', ...list])).replace('__VERSION__', version);
      fs.writeFileSync(path.join(dist, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), swManifest()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
  optimizeDeps: { exclude: ['zxing-wasm'] },
  server: { port: 5173 },
});
