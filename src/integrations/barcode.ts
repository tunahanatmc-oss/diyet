/** Barcode decoding: native BarcodeDetector when available (Chrome/Edge/WebView2), else zxing-wasm (MIT) bundled locally. */
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

let configured = false;
async function zxing() {
  const m = await import('zxing-wasm/reader');
  if (!configured) { m.setZXingModuleOverrides({ locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? wasmUrl : prefix + p) }); configured = true; }
  return m;
}
const FORMATS = ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'] as const;

export function hasNativeDetector(): boolean { return typeof (globalThis as any).BarcodeDetector === 'function'; }

export async function decodeImageFile(file: Blob): Promise<string | null> {
  if (hasNativeDetector()) {
    try {
      const det = new (globalThis as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const bmp = await createImageBitmap(file); const r = await det.detect(bmp);
      if (r[0]?.rawValue) return r[0].rawValue;
    } catch { /* fall through */ }
  }
  const m = await zxing();
  const res = await m.readBarcodesFromImageFile(file, { formats: FORMATS as any, tryHarder: true, maxNumberOfSymbols: 1 } as any);
  return res[0]?.text || null;
}

export async function decodeVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<string | null> {
  if (!video.videoWidth) return null;
  if (hasNativeDetector()) {
    const det = new (globalThis as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const r = await det.detect(video); return r[0]?.rawValue ?? null;
  }
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(video, 0, 0);
  const m = await zxing();
  const res = await m.readBarcodesFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), { formats: FORMATS as any, maxNumberOfSymbols: 1 } as any);
  return res[0]?.text || null;
}
