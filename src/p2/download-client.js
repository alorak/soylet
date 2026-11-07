/**
 * P2 experimental-only downloader. Not imported by the production application.
 * Does not expose a Turkish-TTS model until a verified WASM runtime is available.
 */
import { validateP2Manifest, p2ReleaseGate } from './manifest.js';

export function createP2Download(manifest, {
  onProgress = () => {}, workerFactory = () => new Worker(new URL('./download.worker.js', import.meta.url), { type: 'module' })
} = {}) {
  validateP2Manifest(manifest);
  const gate = p2ReleaseGate(manifest, globalThis);
  if (!gate.ready) throw new Error(gate.reason);

  const worker = workerFactory();
  const id = 1;
  let finished = false;
  let finish;
  const promise = new Promise((resolve, reject) => {
    finish = (result, error) => {
      if (finished) return;
      finished = true;
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    worker.onmessage = event => {
      const message = event.data;
      if (!message || message.id !== id) return;
      if (message.type === 'progress') onProgress(message);
      if (message.type === 'complete') finish(message);
      if (message.type === 'error') finish(null, new Error(message.message));
    };
    worker.onerror = () => finish(null, new Error('P2 worker failed.'));
    worker.postMessage({ id, type: 'download', manifest });
  });
  return {
    promise,
    cancel() {
      if (finished) return;
      worker.postMessage({ id, type: 'cancel' });
    }
  };
}
