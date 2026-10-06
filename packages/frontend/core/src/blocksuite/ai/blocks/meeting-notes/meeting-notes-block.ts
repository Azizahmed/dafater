import { I18n } from '@affine/i18n';
import type { ParagraphBlockModel } from '@blocksuite/affine/model';
import { focusTextModel } from '@blocksuite/affine/rich-text';
import {
  BlockComponent,
  BlockViewExtension,
  TextSelection,
} from '@blocksuite/affine/std';
import { type ExtensionType } from '@blocksuite/affine/store';
import { createIdentifier } from '@blocksuite/global/di';
import { effect, signal } from '@preact/signals-core';
import { css, html, nothing, type TemplateResult } from 'lit';
import { literal } from 'lit/static-html.js';

import {
  MeetingNotesBlockFlavour,
  type MeetingNotesBlockModel,
  MeetingNotesSectionFlavour,
  type MeetingNotesSectionModel,
} from './model';
import type { MeetingNotesBlockHandle, MeetingNotesTab } from './types';

/** Renders the React parts of the block (provided by the editor view). */
export interface MeetingNotesRenderer {
  top(handle: MeetingNotesBlockHandle): TemplateResult;
  summaryStatus(handle: MeetingNotesBlockHandle): TemplateResult;
  transcript(handle: MeetingNotesBlockHandle): TemplateResult;
  footer(handle: MeetingNotesBlockHandle): TemplateResult;
}

export const MeetingNotesRendererIdentifier =
  createIdentifier<MeetingNotesRenderer>('MeetingNotesRenderer');

export const MEETING_NOTES_BLOCK = 'affine-meeting-notes';
export const MEETING_NOTES_SECTION_BLOCK = 'affine-meeting-notes-section';

export class MeetingNotesBlockComponent
  extends BlockComponent<MeetingNotesBlockModel>
  implements MeetingNotesBlockHandle
{
  static override styles = css`
    affine-meeting-notes {
      display: block;
      margin: 12px 0;
    }
    .affine-meeting-notes-card {
      border: 1px solid var(--affine-v2-layer-insideBorder-border);
      border-radius: 16px;
      background: var(--affine-v2-layer-background-primary);
      overflow: hidden;
    }
    .affine-meeting-notes-body {
      min-height: 72px;
      padding: 4px 0 0;
    }
    .affine-meeting-notes-body > affine-meeting-notes-section {
      display: block;
      padding: 4px 20px 0;
    }
    .affine-meeting-notes-missing {
      padding: 12px 20px;
      color: var(--affine-v2-text-placeholder);
      cursor: text;
    }
  `;

  readonly tab$ = signal<MeetingNotesTab>('notes');
  readonly shareBarDismissed$ = signal(false);

  private _portals: {
    top: TemplateResult;
    summaryStatus: TemplateResult;
    transcript: TemplateResult;
    footer: TemplateResult;
  } | null = null;

  private get _renderer() {
    return this.std.getOptional(MeetingNotesRendererIdentifier);
  }

  private _portal(part: keyof NonNullable<typeof this._portals>) {
    const renderer = this._renderer;
    if (!renderer) return nothing;
    // created once: re-rendering a portal anchor would remount React
    this._portals ??= {
      top: renderer.top(this),
      summaryStatus: renderer.summaryStatus(this),
      transcript: renderer.transcript(this),
      footer: renderer.footer(this),
    };
    return this._portals[part];
  }

  override connectedCallback() {
    super.connectedCallback();
    this.contentEditable = 'false';
    this.tab$.value = this.model.summarySection?.children.length
      ? 'summary'
      : 'notes';

    // show a new summary as soon as it is written
    let summarizedAt = this.model.props.summarizedAt;
    this.disposables.add(
      effect(() => {
        const value = this.model.props.summarizedAt$.value;
        if (value && value !== summarizedAt) {
          this.tab$.value = 'summary';
          this.shareBarDismissed$.value = false;
        }
        summarizedAt = value;
      })
    );
    // a removed summary/transcript cannot stay the active tab
    this.disposables.add(
      effect(() => {
        const tab = this.tab$.value;
        if (tab === 'summary' && !this.model.summarySection) {
          this.tab$.value = 'notes';
        }
      })
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._portals = null;
  }

  focusNotes() {
    this.tab$.value = 'notes';
    const store = this.store;
    let section = this.model.notesSection;
    if (!section) {
      const id = store.addBlock(
        MeetingNotesSectionFlavour,
        { kind: 'notes' },
        this.model,
        0
      );
      section = store.getModelById(id) as MeetingNotesSectionModel;
    }
    let last = section.lastChild();
    if (!last || !last.text) {
      const id = store.addBlock('affine:paragraph', {}, section);
      last = store.getModelById(id);
    }
    if (!last) return;
    const target = last;
    this.updateComplete
      .then(() => this.std.host.updateComplete)
      .then(() => focusTextModel(this.std, target.id, target.text?.length ?? 0))
      .catch(console.error);
  }

  private readonly _onMissingNotesClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (this.store.readonly) return;
    this.focusNotes();
  };

  private _renderSection(section: MeetingNotesSectionModel | null) {
    if (!section) return nothing;
    return this.renderChildren(this.model, child => child === section);
  }

  override renderBlock() {
    const tab = this.tab$.value;
    const notes = this.model.notesSection;
    const summary = this.model.summarySection;

    let body: unknown = nothing;
    if (tab === 'summary') {
      body = html`<div contenteditable="false">
          ${this._portal('summaryStatus')}
        </div>
        ${this._renderSection(summary)}`;
    } else if (tab === 'transcript') {
      body = html`<div contenteditable="false">
        ${this._portal('transcript')}
      </div>`;
    } else if (notes) {
      body = this._renderSection(notes);
    } else {
      body = html`<div
        class="affine-meeting-notes-missing"
        contenteditable="false"
        @click=${this._onMissingNotesClick}
      >
        ${I18n.t('com.affine.meeting-notes.notes.placeholder')}
      </div>`;
    }

    return html`<div
      class="affine-meeting-notes-card"
      data-testid="meeting-notes-block"
      data-tab=${tab}
    >
      <div contenteditable="false">${this._portal('top')}</div>
      <div class="affine-meeting-notes-body">${body}</div>
      <div contenteditable="false">${this._portal('footer')}</div>
    </div>`;
  }
}

export class MeetingNotesSectionBlockComponent extends BlockComponent<MeetingNotesSectionModel> {
  static override styles = css`
    .affine-meeting-notes-section {
      position: relative;
      padding-bottom: 4px;
    }
    .affine-meeting-notes-hint {
      position: absolute;
      inset-inline: 0;
      top: 0;
      padding: 4px 0;
      line-height: var(--affine-line-height);
      font-size: var(--affine-font-base);
      color: var(--affine-v2-text-placeholder);
      pointer-events: none;
      user-select: none;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.contentEditable = 'true';
  }

  /** The notes are empty and not being typed in: show what they are for. */
  private get _showHint() {
    if (this.model.props.kind$.value !== 'notes' || this.store.readonly) {
      return false;
    }
    const children = this.model.children;
    if (children.length !== 1) return false;
    const only = children[0];
    if (only.flavour !== 'affine:paragraph') return false;
    const paragraph = only as ParagraphBlockModel;
    if (paragraph.props.type$.value !== 'text') return false;
    if ((paragraph.props.text?.length ?? 0) > 0) return false;
    const focused = this.std.selection.value.some(
      selection => selection.is(TextSelection) && selection.blockId === only.id
    );
    return !focused;
  }

  override renderBlock() {
    return html`<div
      class="affine-meeting-notes-section"
      data-kind=${this.model.props.kind$.value}
    >
      ${this.renderChildren(this.model)}
      ${
        this._showHint
          ? html`<div class="affine-meeting-notes-hint" contenteditable="false">
              ${I18n.t('com.affine.meeting-notes.notes.placeholder')}
            </div>`
          : nothing
      }
    </div>`;
  }
}

export const MeetingNotesBlockSpec: ExtensionType[] = [
  BlockViewExtension(MeetingNotesBlockFlavour, literal`affine-meeting-notes`),
  BlockViewExtension(
    MeetingNotesSectionFlavour,
    literal`affine-meeting-notes-section`
  ),
];

export function registerMeetingNotesEffects() {
  if (!customElements.get(MEETING_NOTES_BLOCK)) {
    customElements.define(MEETING_NOTES_BLOCK, MeetingNotesBlockComponent);
  }
  if (!customElements.get(MEETING_NOTES_SECTION_BLOCK)) {
    customElements.define(
      MEETING_NOTES_SECTION_BLOCK,
      MeetingNotesSectionBlockComponent
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-meeting-notes': MeetingNotesBlockComponent;
    'affine-meeting-notes-section': MeetingNotesSectionBlockComponent;
  }
}
