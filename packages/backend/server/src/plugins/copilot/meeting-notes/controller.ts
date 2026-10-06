import type { RawBodyRequest } from '@nestjs/common';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  BadRequest,
  CallMetric,
  CopilotFailedToGenerateText,
  CopilotProviderSideError,
} from '../../../base';
import { CurrentUser } from '../../../core/auth';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { Models } from '../../../models';
import { assertCopilotEnabled } from '../availability';
import {
  profileConfig,
  readDafaterProfile,
  resolveTranscriptionTarget,
  type TranscriptionTarget,
} from '../dafater-ai-profile';
import { CapabilityRuntime } from '../runtime/capability-runtime';
import {
  buildMeetingSummaryMessages,
  defaultMeetingTitle,
  MEETING_SUMMARY_ROUTE_ID,
  MeetingSummaryInputError,
  parseMeetingSummaryOutput,
  prepareMeetingInput,
} from './prompt';
import {
  transcribeAudio,
  TRANSCRIPTION_MAX_AUDIO_BYTES,
  TranscriptionUpstreamError,
} from './transcription';

export const TRANSCRIPTION_NOT_CONFIGURED = 'transcription_not_configured';
const TRANSCRIBE_TIMEOUT_MS = 120_000;

export interface MeetingNotesCapabilities {
  summary: boolean;
  transcription: boolean;
}

function payloadTooLarge() {
  const error = new BadRequest(
    `Audio is larger than ${TRANSCRIPTION_MAX_AUDIO_BYTES / 1024 / 1024} MB.`
  );
  error.status = 413;
  return error;
}

/** The raw request body, whichever body parser (if any) handled the route. */
async function readAudioBody(req: RawBodyRequest<Request>): Promise<Buffer> {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > TRANSCRIPTION_MAX_AUDIO_BYTES) {
    throw payloadTooLarge();
  }
  if (!req.readable || req.readableEnded) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > TRANSCRIPTION_MAX_AUDIO_BYTES) throw payloadTooLarge();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Dafater: AI meeting notes. Speech-to-text goes to the administrator's
 * OpenAI-compatible `/audio/transcriptions` endpoint; summaries use the
 * server's text route (served by the same administrator profile). No
 * workspace is needed, so local workspaces work as well.
 */
@Controller('/api/copilot/meeting-notes')
export class MeetingNotesController {
  private readonly logger = new Logger(MeetingNotesController.name);

  constructor(
    private readonly backend: BackendRuntimeProvider,
    private readonly runtime: CapabilityRuntime,
    private readonly models: Models
  ) {}

  private async transcriptionTarget(): Promise<TranscriptionTarget | null> {
    if (!this.backend.copilotEnabled()) return null;
    return resolveTranscriptionTarget(
      profileConfig(await readDafaterProfile(this.models))
    );
  }

  @Get('/capabilities')
  async capabilities(
    @CurrentUser() _user: CurrentUser
  ): Promise<MeetingNotesCapabilities> {
    const summary = this.backend.copilotEnabled();
    let transcription = false;
    if (summary) {
      try {
        transcription = !!(await this.transcriptionTarget());
      } catch (error) {
        this.logger.warn(
          `Failed to read the transcription settings: ${String(error)}`
        );
      }
    }
    return { summary, transcription };
  }

  @Post('/transcribe')
  @HttpCode(200)
  @CallMetric('ai', 'meeting_notes_transcribe')
  async transcribe(
    @CurrentUser() _user: CurrentUser,
    @Req() req: RawBodyRequest<Request>,
    @Query('mimeType') mimeType?: string,
    @Query('language') language?: string,
    @Query('prompt') prompt?: string
  ): Promise<{ text: string }> {
    const target = await this.transcriptionTarget();
    if (!target) throw new BadRequest(TRANSCRIPTION_NOT_CONFIGURED);

    const audio = await readAudioBody(req);
    if (audio.length > TRANSCRIPTION_MAX_AUDIO_BYTES) throw payloadTooLarge();
    if (!audio.length) throw new BadRequest('Audio body is required.');

    try {
      return await transcribeAudio(target, audio, {
        mimeType: mimeType || req.headers['content-type'],
        language,
        prompt,
        timeoutMs: TRANSCRIBE_TIMEOUT_MS,
      });
    } catch (error) {
      if (error instanceof TranscriptionUpstreamError) {
        const failure = new CopilotProviderSideError(
          {
            provider: 'transcription',
            kind: error.errorCode,
            message: error.message,
          },
          `Transcription failed (${error.errorCode}): ${error.message}`
        );
        failure.status = 502;
        throw failure;
      }
      throw error;
    }
  }

  @Post('/summarize')
  @HttpCode(200)
  @CallMetric('ai', 'meeting_notes_summarize')
  async summarize(
    @CurrentUser() user: CurrentUser,
    @Body() body: unknown
  ): Promise<{ title: string; markdown: string }> {
    let meeting: ReturnType<typeof prepareMeetingInput>;
    try {
      meeting = prepareMeetingInput(body);
    } catch (error) {
      if (error instanceof MeetingSummaryInputError) {
        throw new BadRequest(error.message);
      }
      throw error;
    }
    assertCopilotEnabled(this.backend.copilotEnabled());

    const output = await this.runtime.text(
      { modelId: 'route-selected' },
      buildMeetingSummaryMessages(meeting),
      {
        user: user.id,
        builtInRouteId: MEETING_SUMMARY_ROUTE_ID,
        featureKind: 'chat',
      }
    );
    if (!output?.trim()) throw new CopilotFailedToGenerateText();

    return parseMeetingSummaryOutput(
      output,
      meeting.title ||
        defaultMeetingTitle(meeting.outputLanguage ?? meeting.uiLanguage)
    );
  }
}
