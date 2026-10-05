import { EditorChevronDown } from '@blocksuite/affine-components/toolbar';
import { NoteDisplayMode } from '@blocksuite/affine-model';
import { t } from '@blocksuite/global/i18n';
import { ShadowlessElement } from '@blocksuite/std';
import { html } from 'lit';
import { property } from 'lit/decorators.js';

const getDisplayModeLabel = (mode: NoteDisplayMode) => {
  switch (mode) {
    case NoteDisplayMode.DocAndEdgeless:
      return t('Both');
    case NoteDisplayMode.EdgelessOnly:
      return t('Edgeless');
    case NoteDisplayMode.DocOnly:
      return t('Page');
  }
};

export class EdgelessNoteDisplayModeDropdownMenu extends ShadowlessElement {
  get mode() {
    return getDisplayModeLabel(this.displayMode);
  }

  select(detail: NoteDisplayMode) {
    this.dispatchEvent(new CustomEvent('select', { detail }));
  }

  override render() {
    const { displayMode, mode } = this;

    return html`
      <span class="display-mode-button-label">${t('Show in')}</span>
      <editor-menu-button
        .contentPadding=${'8px'}
        .button=${html`
          <editor-icon-button
            aria-label=${t('Mode')}
            .tooltip="${t('Display mode')}"
            .justify="${'space-between'}"
            .labelHeight="${'20px'}"
          >
            <span class="label">${mode}</span>
            ${EditorChevronDown}
          </editor-icon-button>
        `}
      >
        <note-display-mode-panel
          .displayMode=${displayMode}
          .onSelect=${(newMode: NoteDisplayMode) => this.select(newMode)}
        >
        </note-display-mode-panel>
      </editor-menu-button>
    `;
  }

  @property({ attribute: false })
  accessor displayMode!: NoteDisplayMode;
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-note-display-mode-dropdown-menu': EdgelessNoteDisplayModeDropdownMenu;
  }
}
