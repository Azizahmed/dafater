/**
 * Pure audio helpers for meeting transcription: resampling to 16 kHz mono,
 * WAV (PCM 16-bit) encoding, a voice activity tracker and the chunker that
 * cuts the live stream at pauses. No DOM / Web Audio here, so it is unit
 * tested directly.
 */

/** What speech-to-text APIs (Whisper and friends) expect. */
export const TRANSCRIPTION_SAMPLE_RATE = 16_000;

/**
 * Box-filter resampler: every output sample is the mean of the input samples
 * it covers, which also low-passes when downsampling (48 kHz → 16 kHz).
 */
export function resample(
  input: Float32Array,
  inputRate: number,
  outputRate = TRANSCRIPTION_SAMPLE_RATE
): Float32Array {
  if (inputRate === outputRate) return input.slice();
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    if (ratio > 1) {
      const start = Math.floor(i * ratio);
      const end = Math.min(
        input.length,
        Math.max(start + 1, Math.floor((i + 1) * ratio))
      );
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      output[i] = sum / (end - start);
    } else {
      // upsampling: linear interpolation
      const position = i * ratio;
      const left = Math.floor(position);
      const right = Math.min(input.length - 1, left + 1);
      const weight = position - left;
      output[i] = input[left] * (1 - weight) + input[right] * weight;
    }
  }
  return output;
}

export function concatSamples(parts: Float32Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      44 + i * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true
    );
  }
  return buffer;
}

export function rootMeanSquare(
  samples: Float32Array,
  start = 0,
  end = samples.length
) {
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}

/**
 * Energy-based voice activity: a frame is speech when it is clearly louder
 * than the (slowly adapting) background noise.
 */
export class VoiceActivityTracker {
  private noiseFloor: number | null = null;

  constructor(
    private readonly options = {
      /** never treat quieter frames as speech */
      minLevel: 0.012,
      /** speech must be this many times louder than the noise floor */
      ratio: 3,
    }
  ) {}

  /** Returns whether the frame (by its RMS level) is speech. */
  frame(level: number) {
    if (this.noiseFloor === null) {
      this.noiseFloor = level;
    } else if (level < this.noiseFloor) {
      // follow quiet moments quickly…
      this.noiseFloor = this.noiseFloor * 0.6 + level * 0.4;
    } else {
      // …and loud ones slowly, so speech doesn't raise the floor
      this.noiseFloor = this.noiseFloor * 0.999 + level * 0.001;
    }
    return (
      level >= this.options.minLevel &&
      level >= this.noiseFloor * this.options.ratio
    );
  }
}

export type AudioChunk = {
  /** Samples at the chunker's input rate. */
  samples: Float32Array;
  /** Position in the recording, ms. */
  startMs: number;
  endMs: number;
  /** How much of the chunk is speech, ms. */
  voicedMs: number;
};

export type AudioChunkerOptions = {
  sampleRate: number;
  /** recording time already covered by earlier recordings, ms */
  offsetMs?: number;
  frameMs?: number;
  /** cut at the first short pause after this length */
  targetMs?: number;
  /** pause that ends a chunk once it reaches `targetMs` */
  shortPauseMs?: number;
  /** a long pause ends a chunk once it reaches `minMs` */
  minMs?: number;
  longPauseMs?: number;
  /** always cut here, even mid-sentence */
  maxMs?: number;
};

/**
 * Cuts a live stream into chunks of a few seconds, preferably at pauses so
 * words are not split. Chunks without speech are still emitted (with
 * `voicedMs` ~0) so the caller can keep time and skip them.
 */
export class AudioChunker {
  private readonly frameSize: number;
  private readonly options: Required<AudioChunkerOptions>;
  private readonly vad = new VoiceActivityTracker();
  private parts: Float32Array[] = [];
  private partial: Float32Array = new Float32Array(0);
  private frames = 0;
  private voicedFrames = 0;
  private trailingSilentFrames = 0;
  private chunkStartMs: number;

  constructor(options: AudioChunkerOptions) {
    this.options = {
      offsetMs: 0,
      frameMs: 20,
      targetMs: 12_000,
      shortPauseMs: 400,
      minMs: 4_000,
      longPauseMs: 1_500,
      maxMs: 25_000,
      ...options,
    };
    this.frameSize = Math.max(
      1,
      Math.round((this.options.sampleRate * this.options.frameMs) / 1000)
    );
    this.chunkStartMs = this.options.offsetMs;
  }

  /** Level (RMS) of the most recent frame, for meters. */
  lastLevel = 0;

  get positionMs() {
    return (
      this.chunkStartMs +
      ((this.frames * this.frameSize + this.partial.length) * 1000) /
        this.options.sampleRate
    );
  }

  push(input: Float32Array): AudioChunk[] {
    const chunks: AudioChunk[] = [];
    const data = this.partial.length
      ? concatSamples([this.partial, input])
      : input;
    let offset = 0;
    while (data.length - offset >= this.frameSize) {
      const frame = data.subarray(offset, offset + this.frameSize);
      offset += this.frameSize;
      this.parts.push(frame.slice());
      this.frames++;
      const level = rootMeanSquare(frame);
      this.lastLevel = level;
      if (this.vad.frame(level)) {
        this.voicedFrames++;
        this.trailingSilentFrames = 0;
      } else {
        this.trailingSilentFrames++;
      }
      const chunk = this.shouldCut() ? this.cut() : null;
      if (chunk) chunks.push(chunk);
    }
    this.partial = data.slice(offset);
    return chunks;
  }

  /** Ends the current chunk (pause / stop). */
  flush(): AudioChunk | null {
    if (this.partial.length) {
      this.parts.push(this.partial);
      this.partial = new Float32Array(0);
    }
    return this.parts.length ? this.cut() : null;
  }

  private ms(frames: number) {
    return frames * this.options.frameMs;
  }

  private shouldCut() {
    const length = this.ms(this.frames);
    const pause = this.ms(this.trailingSilentFrames);
    const voiced = this.ms(this.voicedFrames);
    if (length >= this.options.maxMs) return true;
    if (length >= this.options.targetMs && pause >= this.options.shortPauseMs)
      return true;
    return (
      length >= this.options.minMs &&
      pause >= this.options.longPauseMs &&
      voiced >= 500
    );
  }

  private cut(): AudioChunk {
    const samples = concatSamples(this.parts);
    const durationMs = (samples.length * 1000) / this.options.sampleRate;
    const chunk: AudioChunk = {
      samples,
      startMs: this.chunkStartMs,
      endMs: this.chunkStartMs + durationMs,
      voicedMs: this.ms(this.voicedFrames),
    };
    this.chunkStartMs = chunk.endMs;
    this.parts = [];
    this.frames = 0;
    this.voicedFrames = 0;
    this.trailingSilentFrames = 0;
    return chunk;
  }
}

/** Below this much speech a chunk is not sent (speech-to-text models tend to
 * invent text for silence). */
export const MIN_VOICED_MS = 300;
