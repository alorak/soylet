#!/usr/bin/env node
/**
 * Generate a chunk-verified P2 download manifest from a *locally converted* GGUF.
 * Does not convert VoxCPM2 weights or claim that the runtime can synthesize speech.
 *
 * node scripts/p2-build-manifest.mjs \
 *   --file /path/to/Trendyol-VoxCPM2-Q4_K.gguf \
 *   --artifact-repo org/repo --artifact-revision <40sha> \
 *   --source-revision <40sha> --out ./p2-manifest.json
 */
import { createHash } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const REQUIRED = ['file', 'artifact-repo', 'artifact-revision', 'source-revision', 'out'];
const SHA40 = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9][\w.-]{0,70}\/[A-Za-z0-9][\w.-]{0,90}$/;
const SAFE_GGUF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.gguf$/;
const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_BYTES = 8 * 1024 ** 3;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    if (!name?.startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error('Expected --name value arguments.');
    }
    const key = name.slice(2);
    if (!REQUIRED.includes(key) || key in args) throw new Error(`Unexpected or duplicate option: ${name}`);
    args[key] = argv[i + 1];
  }
  for (const key of REQUIRED) if (!args[key]) throw new Error(`Missing --${key}`);
  if (!REPO.test(args['artifact-repo'])) throw new Error('Invalid Hugging Face artifact repository.');
  if (!SHA40.test(args['artifact-revision']) || !SHA40.test(args['source-revision'])) {
    throw new Error('Both source and artifact commits must be full 40-hex revisions.');
  }
  if (!SAFE_GGUF.test(basename(args.file))) throw new Error('Expected a safe .gguf file name.');
  if (args.file === args.out) throw new Error('Input and output paths must differ.');
  return args;
}

async function buildManifest(args) {
  const fd = await open(args.file, 'r');
  try {
    const stat = await fd.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BYTES) throw new Error('GGUF size is invalid.');
    const signature = Buffer.allocUnsafe(4);
    const header = await fd.read(signature, 0, 4, 0);
    if (header.bytesRead !== 4 || signature.toString('ascii') !== 'GGUF') {
      throw new Error('Input is not a GGUF file. This does not validate VoxCPM2 model semantics.');
    }

    const hashes = [];
    const chunk = Buffer.allocUnsafe(CHUNK_SIZE);
    for (let offset = 0; offset < stat.size; offset += CHUNK_SIZE) {
      const size = Math.min(CHUNK_SIZE, stat.size - offset);
      let readCount = 0;
      while (readCount < size) {
        const result = await fd.read(chunk, readCount, size - readCount, offset + readCount);
        if (!result.bytesRead) throw new Error('Unexpected EOF in GGUF file.');
        readCount += result.bytesRead;
      }
      hashes.push(createHash('sha256').update(chunk.subarray(0, size)).digest('hex'));
    }

    const filename = basename(args.file);
    const url = `https://huggingface.co/${args['artifact-repo']}/resolve/${args['artifact-revision']}/${filename}`;
    return {
      schema: 1,
      model: 'Trendyol/Trendyol-TTS',
      architecture: 'voxcpm2',
      sourceRevision: args['source-revision'],
      artifactRevision: args['artifact-revision'],
      artifact: { filename, url, bytes: stat.size, chunkBytes: CHUNK_SIZE, sha256Chunks: hashes },
      validation: {
        modelParity: 'pending', browserSmoke: 'pending',
        turkishQuality: 'pending', licenseReview: 'pending'
      }
    };
  } finally {
    await fd.close();
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await buildManifest(args);
  await writeFile(args.out, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(`Created ${args.out} with ${manifest.artifact.sha256Chunks.length} chunk digests.\n`);
  process.stdout.write('RELEASE STATUS: PENDING. No Turkish-TTS browser runtime has been validated.\n');
} catch (error) {
  process.stderr.write(`P2 manifest generation failed: ${error.message}\n`);
  process.exitCode = 1;
}
