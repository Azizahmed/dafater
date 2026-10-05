import { SeniorToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { t } from '@blocksuite/global/i18n';
import { html } from 'lit';

export const noteSeniorTool = SeniorToolExtension('note', ({ block }) => {
  return {
    name: t('Note'),
    content: html`<edgeless-note-senior-button
      .edgeless=${block}
    ></edgeless-note-senior-button>`,
  };
});
