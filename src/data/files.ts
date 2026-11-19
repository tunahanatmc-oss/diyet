/** File helpers: download (browser/iPhone/WebView2), weekly automatic backup to a chosen folder (File System Access API where supported). */
import { kvGet, kvSet } from './persist';

export function download(name: string, data: Uint8Array | string, mime = 'application/octet-stream') {
  const blob = new Blob([data as BlobPart], { type: mime });
  const nav: any = navigator;
  const file = typeof File !== 'undefined' ? new File([blob], name, { type: mime }) : null;
  if (/iPhone|iPad/.test(navigator.userAgent) && file && nav.canShare?.({ files: [file] })) { nav.share({ files: [file], title: name }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const canPickFolder = () => typeof (window as any).showDirectoryPicker === 'function';
export async function pickBackupFolder(): Promise<string | null> {
  const h = await (window as any).showDirectoryPicker({ id: 'diyet-backup', mode: 'readwrite' });
  await kvSet('backupDir', h); return h.name;
}
export async function backupFolderName(): Promise<string | null> { const h: any = await kvGet('backupDir'); return h?.name ?? null; }

/** Write a backup file into the chosen folder and keep the newest 8 auto backups (spec 7.3). Needs permission (user gesture on first use per session). */
export async function writeToBackupFolder(name: string, bytes: Uint8Array, interactive: boolean): Promise<boolean> {
  const h: any = await kvGet('backupDir'); if (!h) return false;
  let perm = await h.queryPermission?.({ mode: 'readwrite' });
  if (perm !== 'granted' && interactive) perm = await h.requestPermission?.({ mode: 'readwrite' });
  if (perm !== 'granted') return false;
  const fh = await h.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(bytes); await w.close();
  const files: string[] = []; for await (const [n] of h.entries()) if (/^diyet-otomatik-.*\.diyetbackup$/.test(n)) files.push(n);
  files.sort(); while (files.length > 8) await h.removeEntry(files.shift());
  return true;
}
