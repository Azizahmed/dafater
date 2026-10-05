import { SeniorToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { t } from '@blocksuite/global/i18n';
import { html } from 'lit';

export const templateSeniorTool = SeniorToolExtension(
  'template',
  ({ block }) => {
    return {
      name: t('Template'),
      content: html`<edgeless-template-button .edgeless=${block}>
      </edgeless-template-button>`,
    };
  }
);
