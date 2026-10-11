import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const destination = join('public', 'runtime');
mkdirSync(destination, { recursive: true });
const ortFolder = join('node_modules', 'onnxruntime-web', 'dist');
const ortFiles = readdirSync(ortFolder).filter(name => /^ort-wasm.*\.(?:wasm|mjs)$/.test(name));
if (!ortFiles.some(name => name.endsWith('.wasm'))) throw new Error('ONNX Runtime Web WASM files not found');
for (const name of ortFiles) copyFileSync(join(ortFolder, name), join(destination, name));
const phonemeFolder = join('node_modules', '@diffusionstudio', 'piper-wasm', 'build');
for (const name of ['piper_phonemize.wasm', 'piper_phonemize.data']) {
  const source = join(phonemeFolder, name);
  if (!existsSync(source)) throw new Error('Missing Piper runtime asset: ' + source);
  copyFileSync(source, join(destination, name));
}
console.log('Local ONNX and Piper phonemizer assets ready.');