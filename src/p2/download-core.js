import { validateP2Manifest } from './manifest.js';

/**
 * P2 chunk downloader, independent of the UI. Uses exact HTTP byte ranges and
 * per-chunk SHA-256. Retains verified OPFS segments after interrupted downloads.
 *
 * access: { size():number, read(offset,length):Uint8Array,
 *           write(offset,bytes):void, truncate(bytes):void, flush():void }
 * Access should be an OPFS sync access handle from a dedicated Worker.
 */
function aborted(signal) {
  if (signal?.aborted) throw new DOMException('P2 model download cancelled.', 'AbortError');
}

export async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
  if (!subtle || typeof subtle.digest !== 'function') throw new Error('WebCrypto SHA-256 unavailable.');
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const hash = new Uint8Array(await subtle.digest('SHA-256', data));
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readExactResponse(response, expected, signal) {
  if (!response.body?.getReader) {
    // Existing browser fetch implementations normally provide a streaming body.
    throw new Error('P2 requires a streaming fetch response.');
  }
  const bytes = new Uint8Array(expected);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      aborted(signal);
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.byteLength + offset > expected) {
        throw new Error('Server returned more data than the requested byte range.');
      }
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (offset !== expected) throw new Error('Incomplete HTTP byte range.');
  return bytes;
}

async function fetchRange(url, offset, length, total, { fetchImpl, signal }) {
  const end = offset + length - 1;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET', headers: { Range: `bytes=${offset}-${end}` },
      cache: 'no-store', credentials: 'omit', signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('P2 range request failed. Check network, Hugging Face CORS and permissions.');
  }
  if (response.status !== 206) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error(`P2 requires HTTP 206 Range support (received ${response.status}).`);
  }
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
  if (!range || Number(range[1]) !== offset || Number(range[2]) !== end ||
      Number(range[3]) !== total) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error('P2 server Content-Range does not match the pinned artifact.');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) !== length) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error('P2 server Content-Length mismatch.');
  }
  return readExactResponse(response, length, signal);
}

export async function downloadP2Artifact(manifest, access, {
  fetchImpl = fetch, subtle = globalThis.crypto?.subtle, signal, onProgress
} = {}) {
  validateP2Manifest(manifest);
  for (const method of ['size', 'read', 'write', 'truncate', 'flush']) {
    if (typeof access?.[method] !== 'function') throw new Error(`Missing P2 file access: ${method}`);
  }
  const { artifact } = manifest;
  const initialSize = access.size();
  if (!Number.isSafeInteger(initialSize) || initialSize < 0 || initialSize > artifact.bytes) {
    // A malicious/old model never gets silently reused with this revision.
    throw new Error('Unexpected existing P2 model size. Delete the invalid artifact first.');
  }

  let completed = 0;
  let reused = 0;
  let fetched = 0;
  for (let index = 0; index < artifact.sha256Chunks.length; index++) {
    aborted(signal);
    const start = index * artifact.chunkBytes;
    const size = Math.min(artifact.chunkBytes, artifact.bytes - start);
    const expected = artifact.sha256Chunks[index];

    if (access.size() >= start + size) {
      const stored = access.read(start, size);
      if (stored instanceof Uint8Array && stored.length === size &&
          await sha256Hex(stored, subtle) === expected) {
        completed += size;
        reused += size;
        onProgress?.({ verifiedBytes: completed, totalBytes: artifact.bytes, reusedBytes: reused, fetchedBytes: fetched });
        continue;
      }
    }

    const bytes = await fetchRange(artifact.url, start, size, artifact.bytes, { fetchImpl, signal });
    if (await sha256Hex(bytes, subtle) !== expected) {
      throw new Error(`P2 SHA-256 mismatch for model chunk ${index + 1}.`);
    }
    aborted(signal);
    access.write(start, bytes);
    // Flush so interrupted downloads can reuse previously verified bytes.
    access.flush();
    completed += size;
    fetched += size;
    onProgress?.({ verifiedBytes: completed, totalBytes: artifact.bytes, reusedBytes: reused, fetchedBytes: fetched });
  }
  access.truncate(artifact.bytes);
  access.flush();
  if (access.size() !== artifact.bytes) throw new Error('P2 model size mismatch after download.');
  return { bytes: artifact.bytes, reusedBytes: reused, fetchedBytes: fetched, filename: artifact.filename };
}
