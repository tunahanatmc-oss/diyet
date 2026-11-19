/** Downscale a picked photo to a JPEG data URL (stored locally in personal.sqlite → meal_photo, included in backups). */
export async function fileToThumb(file: File, max = 640, quality = 0.8): Promise<{ dataUrl: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Fotoğraf okunamadı')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return { dataUrl: c.toDataURL('image/jpeg', quality), width: w, height: h };
  } finally { URL.revokeObjectURL(url); }
}
