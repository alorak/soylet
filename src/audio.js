// Export the same PCM audio for playback, WAV download and MP3 download.
export async function decodeAudio(wavBlob, playbackSpeed = 1) {
  const context = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const audio = await context.decodeAudioData(await wavBlob.arrayBuffer());
    const source = audio.getChannelData(0);
    const speed = Math.max(0.5, Math.min(2, playbackSpeed));
    const count = Math.max(1, Math.round(source.length / speed));
    const samples = new Float32Array(count);
    // Simple rate adjustment. Unlike a pitch-preserving vocoder, this shifts pitch as well.
    for (let i = 0; i < count; i++) {
      const pos = Math.min(source.length - 1, i * speed);
      const left = Math.floor(pos);
      const right = Math.min(source.length - 1, left + 1);
      samples[i] = source[left] * (1 - (pos - left)) + source[right] * (pos - left);
    }
    return { samples, sampleRate: audio.sampleRate, duration: count / audio.sampleRate };
  } finally {
    await context.close();
  }
}
function putString(view, offset, value) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}
export function makeWav({ samples, sampleRate }) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  putString(view, 0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true);
  putString(view, 8, 'WAVE'); putString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); putString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? Math.round(value * 32768) : Math.round(value * 32767), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
export async function makeMp3({ samples, sampleRate }) {
  // LAME supports 22,050 and 44,100 Hz from Piper and Supertonic.
  const lame = await import('@breezystack/lamejs');
  const Mp3Encoder = lame.Mp3Encoder || lame.default?.Mp3Encoder;
  if (!Mp3Encoder) throw new Error('MP3 kodlayıcısı yüklenemedi.');
  const encoder = new Mp3Encoder(1, sampleRate, 128);
  const chunks = [];
  for (let offset = 0; offset < samples.length; offset += 1152) {
    const end = Math.min(offset + 1152, samples.length);
    const pcm = new Int16Array(end - offset);
    for (let i = offset; i < end; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      pcm[i - offset] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    }
    const encoded = encoder.encodeBuffer(pcm);
    if (encoded.length) chunks.push(Uint8Array.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Uint8Array.from(tail));
  return new Blob(chunks, { type: 'audio/mpeg' });
}
export function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}