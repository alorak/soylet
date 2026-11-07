/**
 * P2 browser runtime admission. Nothing in the production model catalogue imports this module.
 * A compatibility-tested VoxCPM2 GGUF + actual WASM binary are prerequisites to enabling it.
 */
export const P2_BROWSER_VOXCPM_ENABLED = false;

const SHA256 = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.gguf$/;
const MIN_CHUNK = 64 * 1024;
const MAX_CHUNK = 8 * 1024 * 1024;
const MAX_MODEL_BYTES = 8 * 1024 ** 3;

export function validateP2Manifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('P2 manifest is missing.');
  }
  if (manifest.schema !== 1 || manifest.model !== 'Trendyol/Trendyol-TTS' ||
      manifest.architecture !== 'voxcpm2') {
    throw new Error('P2 requires the Trendyol VoxCPM2 model (schema 1).');
  }
  if (!REVISION.test(manifest.sourceRevision || '') ||
      !REVISION.test(manifest.artifactRevision || '')) {
    throw new Error('P2 source and GGUF revisions must be pinned to 40-hex commits.');
  }
  const artifact = manifest.artifact;
  if (!artifact || !SAFE_NAME.test(artifact.filename || '')) {
    throw new Error('P2 requires a safe .gguf filename.');
  }
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 || artifact.bytes > MAX_MODEL_BYTES) {
    throw new Error('P2 GGUF size must be a positive safe integer at most 8 GiB.');
  }
  if (!Number.isSafeInteger(artifact.chunkBytes) ||
      artifact.chunkBytes < MIN_CHUNK || artifact.chunkBytes > MAX_CHUNK ||
      (artifact.chunkBytes & (artifact.chunkBytes - 1)) !== 0) {
    throw new Error('P2 chunk size must be a power of two from 64 KiB to 8 MiB.');
  }
  const expected = Math.ceil(artifact.bytes / artifact.chunkBytes);
  if (!Array.isArray(artifact.sha256Chunks) || artifact.sha256Chunks.length !== expected ||
      !artifact.sha256Chunks.every(hash => typeof hash === 'string' && SHA256.test(hash))) {
    throw new Error('P2 requires exactly one SHA-256 hash per chunk.');
  }
  let url;
  try { url = new URL(artifact.url); }
  catch { throw new Error('P2 artifact URL is invalid.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co' ||
      url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith('/') || !url.pathname.endsWith('/' + artifact.filename) ||
      !url.pathname.includes('/resolve/' + manifest.artifactRevision + '/')) {
    throw new Error('P2 model downloads must use a pinned Hugging Face HTTPS GGUF URL.');
  }
  return manifest;
}

export function detectP2Capabilities(env = globalThis) {
  const nav = env.navigator;
  const capabilities = {
    secureContext: env.isSecureContext === true,
    opfs: typeof nav?.storage?.getDirectory === 'function',
    worker: typeof env.Worker === 'function',
    wasm: typeof env.WebAssembly === 'object',
    crossOriginIsolated: env.crossOriginIsolated === true,
    sharedArrayBuffer: typeof env.SharedArrayBuffer === 'function'
  };
  const reasons = [];
  if (!capabilities.secureContext) reasons.push('HTTPS veya localhost gerekiyor.');
  if (!capabilities.opfs) reasons.push('OPFS destekleyen modern bir tarayıcı gerekiyor.');
  if (!capabilities.worker || !capabilities.wasm) reasons.push('Worker ve WebAssembly gerekiyor.');
  if (!capabilities.crossOriginIsolated || !capabilities.sharedArrayBuffer) {
    reasons.push('Çok iş parçacıklı VoxCPM WASM için COOP/COEP ile cross-origin isolation gerekiyor.');
  }
  return { capabilities, compatible: reasons.length === 0, reasons };
}

export function p2ReleaseGate(manifest, environment, enabled = P2_BROWSER_VOXCPM_ENABLED) {
  // Disabled means no downloads, UI entry, or runtime attempts in the public app.
  if (!enabled) return { ready: false, reason: 'P2 VoxCPM2 browser engine is not yet verified.' };
  try { validateP2Manifest(manifest); }
  catch (error) { return { ready: false, reason: error.message }; }
  const check = detectP2Capabilities(environment);
  if (!check.compatible) return { ready: false, reason: check.reasons.join(' ') };
  if (manifest.validation?.modelParity !== 'passed' ||
      manifest.validation?.browserSmoke !== 'passed' ||
      manifest.validation?.turkishQuality !== 'passed' ||
      manifest.validation?.licenseReview !== 'passed') {
    return { ready: false, reason: 'VoxCPM2 compatibility, Turkish quality and licensing checks are incomplete.' };
  }
  return { ready: true, reason: '' };
}
