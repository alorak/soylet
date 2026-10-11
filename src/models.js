// Models are fetched only when requested. No text or generated audio leaves the browser.
export const DEFAULT_MODEL_ID = 'piper-fettah';
const PIPER_BASE = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';
const SUPERTONIC_BASE = 'https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46';
const piper = (voice) => ({
  id: `piper-${voice}`,
  title: `Piper · ${voice === 'dfki' ? 'DFKI' : voice === 'fahrettin' ? 'Fahrettin' : 'Fettah'}`,
  summary: 'Türkçe · Hafif ve hızlı · Tek ses',
  size: '~63 MB',
  engine: 'piper',
  voiceId: `tr_TR-${voice}-medium`,
  files: [
    { name: `tr_TR-${voice}-medium.onnx`, url: `${PIPER_BASE}/tr/tr_TR/${voice}/medium/tr_TR-${voice}-medium.onnx` },
    { name: `tr_TR-${voice}-medium.onnx.json`, url: `${PIPER_BASE}/tr/tr_TR/${voice}/medium/tr_TR-${voice}-medium.onnx.json` }
  ]
});
export const VOICE_STYLES = ['F1','F2','F3','F4','F5','M1','M2','M3','M4','M5'];
export const MODELS = [
  piper('fettah'),
  piper('fahrettin'),
  piper('dfki'),
  {
    id: 'supertonic-3', title: 'Supertonic 3', engine: 'supertonic',
    summary: 'Türkçe · 10 ses karakteri · Büyük model',
    size: '~400 MB',
    files: [
      ...['duration_predictor.onnx','text_encoder.onnx','vector_estimator.onnx','vocoder.onnx','tts.json','unicode_indexer.json'].map(name => ({
        name, url: `${SUPERTONIC_BASE}/onnx/${name}`
      })),
      ...VOICE_STYLES.map(style => ({ name: `${style}.json`, url: `${SUPERTONIC_BASE}/voice_styles/${style}.json` }))
    ]
  }
];
export const getModel = id => MODELS.find(model => model.id === id);
export function storageSupported() {
  return typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function' &&
    globalThis.isSecureContext;
}
async function getDir(model) {
  if (!storageSupported()) throw new Error('Model depolamak için HTTPS veya localhost ve güncel bir tarayıcı gerekli.');
  const root = await navigator.storage.getDirectory();
  if (model.engine === 'piper') return root.getDirectoryHandle('piper', { create: true });
  const folder = await root.getDirectoryHandle('soylet', { create: true });
  return folder.getDirectoryHandle(model.id, { create: true });
}
export async function getModelFile(model, name) {
  const directory = await getDir(model);
  const handle = await directory.getFileHandle(name);
  const file = await handle.getFile();
  if (!file.size) throw new Error(`Eksik model dosyası: ${name}`);
  return file;
}
async function filePresent(model, name) {
  try { await getModelFile(model, name); return true; } catch { return false; }
}
export async function isInstalled(model) {
  if (!storageSupported()) return false;
  const statuses = await Promise.all(model.files.map(({ name }) => filePresent(model, name)));
  return statuses.every(Boolean);
}
export async function installedModelIds() {
  const ids = await Promise.all(MODELS.map(async model => await isInstalled(model) ? model.id : null));
  return ids.filter(Boolean);
}
export async function removeModel(model) {
  const dir = await getDir(model);
  for (const { name } of model.files) {
    try { await dir.removeEntry(name); } catch (error) {
      if (error?.name !== 'NotFoundError') throw error;
    }
  }
}
async function downloadFile(dir, entry, index, count, report, signal) {
  const { name, url } = entry;
  const current = await dir.getFileHandle(name, { create: true });
  const existing = await current.getFile();
  if (existing.size > 0) {
    report?.({ filename: name, percent: Math.round((index + 1) / count * 100) });
    return;
  }

  let writer;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`${name}: indirme başarısız (HTTP ${response.status}).`);
    if (response.headers.get('content-type')?.includes('text/html')) throw new Error(`${name}: model yerine HTML döndü.`);
    const expected = Number(response.headers.get('content-length') || 0);
    writer = await current.createWritable();
    let loaded = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signal?.aborted) throw new DOMException('İndirme iptal edildi', 'AbortError');
        await writer.write(value);
        loaded += value.byteLength;
        report?.({ filename: name, percent: Math.round(((index + (expected ? loaded / expected : 0)) / count) * 100) });
      }
    } else {
      const buffer = await response.arrayBuffer();
      loaded = buffer.byteLength;
      await writer.write(buffer);
    }
    if (expected && expected !== loaded) throw new Error(`${name}: eksik indirme (${loaded}/${expected}).`);
    if (!loaded || (name.endsWith('.onnx') && loaded < 1024 * 1024)) throw new Error(`${name}: geçersiz veya boş dosya.`);
    await writer.close();
    writer = null;
    if (name.endsWith('.json')) {
      try { JSON.parse(await (await current.getFile()).text()); }
      catch { throw new Error(`${name}: geçersiz JSON dosyası.`); }
    }
    report?.({ filename: name, percent: Math.round((index + 1) / count * 100) });
  } catch (error) {
    try { await writer?.abort(); } catch { }
    try { await dir.removeEntry(name); } catch { }
    throw error;
  }
}
export async function downloadModel(model, report, signal) {
  const directory = await getDir(model);
  for (let i = 0; i < model.files.length; i++) {
    if (signal?.aborted) throw new DOMException('İndirme iptal edildi', 'AbortError');
    await downloadFile(directory, model.files[i], i, model.files.length, report, signal);
  }
  if (!await isInstalled(model)) throw new Error('İndirilen dosyalar doğrulanamadı.');
}