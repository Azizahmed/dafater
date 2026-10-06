import {
  type AudioChunk,
  AudioChunker,
  encodeWav,
  resample,
  rootMeanSquare,
  TRANSCRIPTION_SAMPLE_RATE,
} from './audio';

/**
 * `microphone-and-tab` also captures the audio of a browser tab or screen
 * (an online meeting): the user picks it in the browser's share dialog.
 */
export type RecordingSource = 'microphone' | 'microphone-and-tab';

export type RecordedChunk = Omit<AudioChunk, 'samples'> & {
  /** 16 kHz mono WAV */
  wav: Blob;
};

export type RecorderInterruption = 'device-lost' | 'share-ended';

export type MeetingRecorderOptions = {
  source: RecordingSource;
  /** recording time of earlier sessions, so timestamps continue */
  offsetMs: number;
  onChunk: (chunk: RecordedChunk) => void;
  onInterrupted: (reason: RecorderInterruption) => void;
};

const WAVEFORM_LENGTH = 64;

export function canCaptureTabAudio() {
  return (
    !BUILD_CONFIG.isElectron &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
}

export function canRecordAudio() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof AudioContext !== 'undefined'
  );
}

/**
 * Captures the microphone (and optionally tab audio) with Web Audio and emits
 * standalone 16 kHz WAV chunks cut at pauses, ready for speech-to-text.
 */
export class MeetingRecorder {
  private context: AudioContext | null = null;
  private readonly streams: MediaStream[] = [];
  private processor: ScriptProcessorNode | null = null;
  private chunker: AudioChunker | null = null;
  private paused = false;
  private stopped = false;

  /** Recent input levels (0–1) for the waveform, newest last. */
  readonly levels: number[] = Array.from({ length: WAVEFORM_LENGTH }, () => 0);

  constructor(private readonly options: MeetingRecorderOptions) {}

  /** Position in the meeting recording, ms. */
  get positionMs() {
    return this.chunker?.positionMs ?? this.options.offsetMs;
  }

  async start() {
    // created before awaiting permission, while the click still counts as a
    // user gesture (autoplay policy)
    const context = new AudioContext();
    this.context = context;
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      this.streams.push(microphone);
      if (this.options.source === 'microphone-and-tab') {
        // Chromium only shares audio together with video
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        this.streams.push(display);
        display.getVideoTracks().forEach(track => (track.enabled = false));
        if (!display.getAudioTracks().length) {
          throw new DOMException('No tab audio was shared', 'NoTabAudio');
        }
      }
    } catch (error) {
      await this.release();
      throw error;
    }
    if (this.stopped) {
      await this.release();
      return;
    }

    await context.resume();
    this.chunker = new AudioChunker({
      sampleRate: context.sampleRate,
      offsetMs: this.options.offsetMs,
    });
    const mixer = context.createGain();
    this.streams.forEach((stream, index) => {
      if (!stream.getAudioTracks().length) return;
      context.createMediaStreamSource(stream).connect(mixer);
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (this.stopped) return;
          this.options.onInterrupted(
            index === 0 ? 'device-lost' : 'share-ended'
          );
        });
      }
    });
    // ScriptProcessor: deprecated but available everywhere (Electron, all
    // browsers) and needs no separate worklet module.
    const processor = context.createScriptProcessor(4096, 1, 1);
    this.processor = processor;
    processor.onaudioprocess = event => {
      if (this.paused || this.stopped || !this.chunker) return;
      const input = event.inputBuffer.getChannelData(0);
      this.pushLevel(rootMeanSquare(input));
      for (const chunk of this.chunker.push(input)) this.emit(chunk);
    };
    // a processor only runs while connected to the destination; keep it silent
    const silence = context.createGain();
    silence.gain.value = 0;
    mixer.connect(processor);
    processor.connect(silence);
    silence.connect(context.destination);
  }

  get isPaused() {
    return this.paused;
  }

  pause() {
    if (this.paused || this.stopped) return;
    this.paused = true;
    this.flush();
    this.levels.fill(0);
    this.context?.suspend().catch(console.error);
  }

  async resume() {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    await this.context?.resume();
  }

  /** Emits the last chunk and releases the devices. */
  async stop() {
    if (this.stopped) return;
    if (!this.paused) this.flush();
    this.stopped = true;
    this.paused = true;
    await this.release();
  }

  private flush() {
    const chunk = this.chunker?.flush();
    if (chunk) this.emit(chunk);
  }

  private emit(chunk: AudioChunk) {
    const sampleRate = this.context?.sampleRate ?? TRANSCRIPTION_SAMPLE_RATE;
    const { samples, ...timing } = chunk;
    const wav = new Blob(
      [encodeWav(resample(samples, sampleRate), TRANSCRIPTION_SAMPLE_RATE)],
      { type: 'audio/wav' }
    );
    this.options.onChunk({ ...timing, wav });
  }

  private pushLevel(rms: number) {
    // perceptual scale: quiet speech is ~0.02–0.05 RMS
    const level = Math.min(1, Math.sqrt(rms) * 2.4);
    this.levels.push(level);
    this.levels.splice(0, this.levels.length - WAVEFORM_LENGTH);
  }

  private async release() {
    this.processor?.disconnect();
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor = null;
    for (const stream of this.streams) {
      stream.getTracks().forEach(track => track.stop());
    }
    this.streams.length = 0;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') {
      await context.close().catch(console.error);
    }
  }
}

/**
 * Decodes an audio file and cuts it like a live recording, for transcribing
 * a meeting that was recorded elsewhere.
 */
export async function chunkAudioFile(
  file: Blob,
  offsetMs: number,
  /** awaited before the next chunk is cut, to bound memory */
  onChunk: (chunk: RecordedChunk) => Promise<void>,
  signal?: AbortSignal
) {
  // decoding at 16 kHz keeps memory low for long recordings
  const context = new OfflineAudioContext(1, 1, TRANSCRIPTION_SAMPLE_RATE);
  const audio = await context.decodeAudioData(await file.arrayBuffer());
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
    audio.getChannelData(i)
  );
  const chunker = new AudioChunker({
    sampleRate: audio.sampleRate,
    offsetMs,
  });
  const emit = async (chunk: AudioChunk) => {
    const { samples, ...timing } = chunk;
    await onChunk({
      ...timing,
      wav: new Blob(
        [
          encodeWav(
            resample(samples, audio.sampleRate),
            TRANSCRIPTION_SAMPLE_RATE
          ),
        ],
        { type: 'audio/wav' }
      ),
    });
  };
  const blockSize = audio.sampleRate; // 1 s
  for (let start = 0; start < audio.length; start += blockSize) {
    const end = Math.min(audio.length, start + blockSize);
    const block = new Float32Array(end - start);
    for (const channel of channels) {
      for (let i = start; i < end; i++) {
        block[i - start] += channel[i] / channels.length;
      }
    }
    for (const chunk of chunker.push(block)) {
      signal?.throwIfAborted();
      await emit(chunk);
    }
  }
  const last = chunker.flush();
  if (last) await emit(last);
  return (audio.length * 1000) / audio.sampleRate;
}
