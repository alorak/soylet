import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateP2Manifest, detectP2Capabilities, p2ReleaseGate, P2_BROWSER_VOXCPM_ENABLED } from '../src/p2/manifest.js';
import { downloadP2Artifact } from '../src/p2/download-core.js';
import { MODELS } from '../src/models.js';

const REV_SOURCE = 'a'.repeat(40);
const REV_GGUF = 'b'.repeat(40);
const CHUNK = 65536;
const BODY = new Uint8Array(CHUNK * 2 + 37);
for (let i = 0; i < BODY.length; i++) BODY[i] = (i * 37 + 19) & 255;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function manifest(bytes = BODY) {
  const sha256Chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    sha256Chunks.push(digest(bytes.subarray(i, i + CHUNK)));
  }
  return {
    schema: 1, model: 'Trendyol/Trendyol-TTS', architecture: 'voxcpm2',
    sourceRevision: REV_SOURCE, artifactRevision: REV_GGUF,
    artifact: {
      filename: 'Trendyol-VoxCPM2-Q4_K.gguf',
      url: `https://huggingface.co/example/trendyol-gguf/resolve/${REV_GGUF}/Trendyol-VoxCPM2-Q4_K.gguf`,
      bytes: bytes.length, chunkBytes: CHUNK, sha256Chunks
    },
    validation: {
      modelParity: 'pending', browserSmoke: 'pending',
      turkishQuality: 'pending', licenseReview: 'pending'
    }
  };
}

function memoryAccess() {
  let data = new Uint8Array(0);
  return {
    size() { return data.length; },
    read(start, length) { return data.slice(start, start + length); },
    write(start, bytes) {
      const end = start + bytes.length;
      if (data.length < end) {
        const grown = new Uint8Array(end);
        grown.set(data);
        data = grown;
      }
      data.set(bytes, start);
    },
    truncate(size) {
      const copy = new Uint8Array(size);
      copy.set(data.subarray(0, size));
      data = copy;
    },
    flush() {},
    bytes() { return data.slice(); }
  };
}

function rangeServer(source, calls = [], badStatus = 206) {
  return async (url, options) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
    assert.ok(match, 'Range header is required');
    const start = Number(match[1]), end = Number(match[2]);
    calls.push({ url, start, end, method: options.method, credentials: options.credentials });
    return new Response(source.slice(start, end + 1), {
      status: badStatus,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${source.length}`,
        'Content-Length': String(end - start + 1)
      }
    });
  };
}

test('manifest requires pinned official Turkish VoxCPM2, safe GGUF and exact hashes', () => {
  const m = manifest();
  assert.equal(validateP2Manifest(m), m);
  assert.throws(() => validateP2Manifest({ ...m, model: 'other/model' }), /Trendyol VoxCPM2/);
  assert.throws(() => validateP2Manifest({ ...m, sourceRevision: 'main' }), /40-hex/);
  assert.throws(() => validateP2Manifest({ ...m, artifact: { ...m.artifact, filename: '../evil.gguf' } }), /safe/);
  assert.throws(() => validateP2Manifest({ ...m, artifact: { ...m.artifact, url: 'http://huggingface.co/a' } }), /HTTPS/);
  assert.throws(() => validateP2Manifest({ ...m, artifact: { ...m.artifact, sha256Chunks: [] } }), /SHA-256/);
  assert.throws(() => validateP2Manifest({ ...m, artifact: { ...m.artifact, bytes: 12 * 1024 ** 3 } }), /8 GiB/);
});

test('p2 stays off even in a compatible environment and with all claimed gates passed', () => {
  const environment = {
    isSecureContext: true, crossOriginIsolated: true,
    SharedArrayBuffer, Worker: class {}, WebAssembly,
    navigator: { storage: { getDirectory() {} } }
  };
  assert.equal(detectP2Capabilities(environment).compatible, true);
  assert.equal(P2_BROWSER_VOXCPM_ENABLED, false);
  const m = manifest();
  for (const key of Object.keys(m.validation)) m.validation[key] = 'passed';
  assert.deepEqual(p2ReleaseGate(m, environment).ready, false);
  assert.equal(detectP2Capabilities({}).compatible, false);
});

test('chunk downloader verifies and reuses previously saved chunks', async () => {
  const file = memoryAccess();
  const calls = [];
  const progress = [];
  const options = {
    fetchImpl: rangeServer(BODY, calls),
    subtle: webcrypto.subtle,
    onProgress: p => progress.push(p)
  };
  const first = await downloadP2Artifact(manifest(), file, options);
  assert.equal(first.bytes, BODY.length);
  assert.equal(first.fetchedBytes, BODY.length);
  assert.equal(first.reusedBytes, 0);
  assert.deepEqual(file.bytes(), BODY);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].credentials, 'omit');
  assert.equal(progress.at(-1).verifiedBytes, BODY.length);

  const second = await downloadP2Artifact(manifest(), file, options);
  assert.equal(second.fetchedBytes, 0);
  assert.equal(second.reusedBytes, BODY.length);
  assert.equal(calls.length, 3, 'reused chunks must not trigger any HTTP requests');

  file.write(0, new Uint8Array([255]));
  const repaired = await downloadP2Artifact(manifest(), file, options);
  assert.equal(repaired.fetchedBytes, CHUNK);
  assert.equal(repaired.reusedBytes, BODY.length - CHUNK);
  assert.equal(calls.length, 4);
  assert.deepEqual(file.bytes(), BODY);
});

test('partial download resumes without redownloading verified first chunk', async () => {
  const file = memoryAccess();
  file.write(0, BODY.slice(0, CHUNK));
  const calls = [];
  const result = await downloadP2Artifact(manifest(), file, {
    fetchImpl: rangeServer(BODY, calls), subtle: webcrypto.subtle
  });
  assert.equal(result.reusedBytes, CHUNK);
  assert.equal(calls.length, 2);
  assert.deepEqual(file.bytes(), BODY);
});

test('range errors and wrong digests fail closed before writing', async () => {
  const empty = memoryAccess();
  await assert.rejects(downloadP2Artifact(manifest(), empty, {
    fetchImpl: rangeServer(BODY, [], 200), subtle: webcrypto.subtle
  }), /206/);
  assert.equal(empty.size(), 0);

  const bad = new Uint8Array(BODY.length);
  const other = memoryAccess();
  await assert.rejects(downloadP2Artifact(manifest(), other, {
    fetchImpl: rangeServer(bad), subtle: webcrypto.subtle
  }), /SHA-256 mismatch/);
  assert.equal(other.size(), 0);
});

test('P2 code is isolated from the production model catalogue and TTS engine', () => {
  assert.equal(MODELS.some(m => m.id.includes('voxcpm') || m.engine === 'voxcpm-wasm'), false);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const tts = readFileSync(new URL('../src/tts.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /from ['"]\.\/p2\//);
  assert.doesNotMatch(tts, /from ['"]\.\/p2\//);
  const worker = readFileSync(new URL('../src/p2/download.worker.js', import.meta.url), 'utf8');
  assert.match(worker, /createSyncAccessHandle\(/);
  assert.match(worker, /soylet-p2-v1/);
});

test('manifest generator hashes local GGUF without pretending to validate speech', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'soylet-p2-'));
  try {
    const gguf = join(dir, 'Trendyol-VoxCPM2-Q4_K.gguf');
    const out = join(dir, 'manifest.json');
    const bytes = Buffer.alloc(8192);
    bytes.write('GGUF', 0, 'ascii');
    await writeFile(gguf, bytes);
    const script = new URL('../scripts/p2-build-manifest.mjs', import.meta.url);
    const run = spawnSync(process.execPath, [script.pathname, '--file', gguf,
      '--artifact-repo', 'example/trendyol-gguf',
      '--artifact-revision', REV_GGUF, '--source-revision', REV_SOURCE, '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const built = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(validateP2Manifest(built), built);
    assert.equal(built.validation.modelParity, 'pending');
    assert.equal(built.artifact.sha256Chunks[0], digest(bytes));
    assert.equal(built.artifact.bytes, bytes.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
