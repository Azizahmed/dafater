import { describe, expect, test } from 'vitest';

import {
  AudioChunker,
  encodeWav,
  resample,
  rootMeanSquare,
  VoiceActivityTracker,
} from '../recorder/audio';

const RATE = 16_000;

/**
 * `ms` of speech-like sound (a 200 Hz tone in 200 ms "syllables" with short
 * dips between them) or of near silence.
 */
function signal(ms: number, kind: 'speech' | 'silence') {
  const samples = new Float32Array(Math.round((RATE * ms) / 1000));
  for (let i = 0; i < samples.length; i++) {
    const inSyllable = i % (RATE / 4) < RATE / 5;
    const amplitude = kind === 'speech' ? (inSyllable ? 0.3 : 0.002) : 0.001;
    samples[i] = amplitude * Math.sin((2 * Math.PI * 200 * i) / RATE);
  }
  return samples;
}

function feed(chunker: AudioChunker, parts: Float32Array[]) {
  const chunks = [];
  for (const part of parts) {
    // like the audio callback: blocks of 4096 samples
    for (let offset = 0; offset < part.length; offset += 4096) {
      chunks.push(...chunker.push(part.subarray(offset, offset + 4096)));
    }
  }
  return chunks;
}

describe('resample', () => {
  test('48 kHz → 16 kHz keeps a third of the samples and averages them', () => {
    const input = new Float32Array([0, 0.3, 0.6, 1, 1, 1]);
    const output = resample(input, 48_000, 16_000);
    expect(output).toHaveLength(2);
    expect(output[0]).toBeCloseTo(0.3);
    expect(output[1]).toBeCloseTo(1);
  });

  test('44.1 kHz input keeps the duration', () => {
    const input = new Float32Array(44_100).fill(0.5);
    const output = resample(input, 44_100);
    expect(output).toHaveLength(16_000);
    expect(output.every(value => Math.abs(value - 0.5) < 1e-6)).toBe(true);
  });

  test('same rate copies', () => {
    const input = new Float32Array([0.1, 0.2]);
    const output = resample(input, RATE);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });
});

describe('encodeWav', () => {
  test('writes a mono 16-bit PCM header and clamps samples', () => {
    const buffer = encodeWav(new Float32Array([0, 1, -1, 2]), RATE);
    const view = new DataView(buffer);
    const text = (offset: number) =>
      String.fromCharCode(...new Uint8Array(buffer.slice(offset, offset + 4)));
    expect(buffer.byteLength).toBe(44 + 8);
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(text(36)).toBe('data');
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
    expect(view.getInt16(50, true)).toBe(0x7fff); // 2 is clamped to 1
  });
});

describe('VoiceActivityTracker', () => {
  test('separates speech from background noise', () => {
    const vad = new VoiceActivityTracker();
    const quiet = rootMeanSquare(signal(20, 'silence'));
    const loud = rootMeanSquare(signal(20, 'speech'));
    for (let i = 0; i < 50; i++) vad.frame(quiet);
    expect(vad.frame(quiet)).toBe(false);
    expect(vad.frame(loud)).toBe(true);
  });

  test('a constantly loud room does not count as speech forever', () => {
    const vad = new VoiceActivityTracker();
    // a hum that never changes becomes the noise floor
    expect(vad.frame(0.05)).toBe(false);
    for (let i = 0; i < 20; i++) vad.frame(0.05);
    expect(vad.frame(0.05)).toBe(false);
    expect(vad.frame(0.3)).toBe(true);
  });
});

describe('AudioChunker', () => {
  test('cuts at the first short pause after the target length', () => {
    const chunker = new AudioChunker({ sampleRate: RATE });
    const chunks = feed(chunker, [
      signal(500, 'silence'),
      signal(12_500, 'speech'),
      signal(600, 'silence'),
      signal(3_000, 'speech'),
    ]);
    expect(chunks).toHaveLength(1);
    const [chunk] = chunks;
    expect(chunk.startMs).toBe(0);
    // speech + the 400 ms pause that ended it
    expect(chunk.endMs).toBeGreaterThanOrEqual(13_000);
    expect(chunk.endMs).toBeLessThan(13_600);
    // syllables are 80% of the speech
    expect(chunk.voicedMs).toBeGreaterThan(9_500);
    expect(chunk.samples.length).toBe((chunk.endMs / 1000) * RATE);

    const rest = chunker.flush();
    expect(rest?.startMs).toBe(chunk.endMs);
    expect(rest?.endMs).toBeCloseTo(16_600, -1);
  });

  test('a long pause ends a shorter chunk', () => {
    const chunker = new AudioChunker({ sampleRate: RATE });
    const chunks = feed(chunker, [
      signal(5_000, 'speech'),
      signal(2_000, 'silence'),
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].endMs).toBeGreaterThanOrEqual(6_400);
    expect(chunks[0].endMs).toBeLessThan(7_000);
  });

  test('never exceeds the maximum length, even without pauses', () => {
    const chunker = new AudioChunker({ sampleRate: RATE });
    const chunks = feed(chunker, [signal(60_000, 'speech')]);
    expect(chunks.length).toBe(2);
    for (const chunk of chunks) {
      expect(chunk.endMs - chunk.startMs).toBeLessThanOrEqual(25_000);
    }
  });

  test('silence produces chunks without speech', () => {
    const chunker = new AudioChunker({ sampleRate: RATE });
    const chunks = feed(chunker, [signal(30_000, 'silence')]);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.voicedMs).toBe(0);
      expect(chunk.endMs - chunk.startMs).toBeLessThanOrEqual(25_000);
    }
  });

  test('continues the timeline of an earlier recording', () => {
    const chunker = new AudioChunker({ sampleRate: RATE, offsetMs: 60_000 });
    feed(chunker, [signal(1_000, 'speech')]);
    expect(chunker.positionMs).toBeCloseTo(61_000, -1);
    const chunk = chunker.flush();
    expect(chunk?.startMs).toBe(60_000);
    expect(chunk?.endMs).toBeCloseTo(61_000, -1);
    expect(chunker.flush()).toBeNull();
  });
});
