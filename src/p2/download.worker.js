import { validateP2Manifest } from './manifest.js';
import { downloadP2Artifact } from './download-core.js';

// Worker-only: OPFS synchronous access handles are not available on the main UI thread.
let active = null;

function send(message) { self.postMessage(message); }

async function handleDownload(request) {
  const { id, manifest } = request;
  if (active) { send({ id, type: 'error', message: 'Another P2 download is active.' }); return; }
  const controller = new AbortController();
  active = { id, controller };
  let accessHandle;
  try {
    validateP2Manifest(manifest);
    if (!self.isSecureContext || !navigator.storage?.getDirectory) {
      throw new Error('P2 downloads require a secure browser with OPFS.');
    }
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle('soylet-p2-v1', { create: true });
    const revision = await folder.getDirectoryHandle(manifest.artifactRevision, { create: true });
    const file = await revision.getFileHandle(manifest.artifact.filename, { create: true });
    if (typeof file.createSyncAccessHandle !== 'function') {
      throw new Error('Browser does not support worker OPFS synchronous access.');
    }
    accessHandle = await file.createSyncAccessHandle();
    const access = {
      size() { return accessHandle.getSize(); },
      read(offset, length) {
        const bytes = new Uint8Array(length);
        const count = accessHandle.read(bytes, { at: offset });
        return bytes.subarray(0, count);
      },
      write(offset, bytes) {
        const written = accessHandle.write(bytes, { at: offset });
        if (written !== bytes.byteLength) throw new Error('OPFS short write.');
      },
      truncate(length) { accessHandle.truncate(length); },
      flush() { accessHandle.flush(); }
    };
    const result = await downloadP2Artifact(manifest, access, {
      signal: controller.signal,
      onProgress: progress => send({ id, type: 'progress', ...progress })
    });
    send({ id, type: 'complete', ...result });
  } catch (error) {
    send({ id, type: 'error', message: error?.message || 'P2 download failed.', aborted: error?.name === 'AbortError' });
  } finally {
    try { accessHandle?.close(); } catch {}
    active = null;
  }
}

self.addEventListener('message', event => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || !Number.isSafeInteger(msg.id)) return;
  if (msg.type === 'cancel' && active?.id === msg.id) {
    active.controller.abort();
    return;
  }
  if (msg.type === 'download') { void handleDownload(msg); }
});
