import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { ParagraphBlockModel } from '@blocksuite/affine-model';
import { t } from '@blocksuite/global/i18n';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';
import { z } from 'zod';

import { effects } from './effects';
import { ParagraphMarkdownExtension } from './markdown.js';
import { ParagraphBlockConfigExtension } from './paragraph-block-config.js';
import {
  ParagraphKeymapExtension,
  ParagraphTextKeymapExtension,
} from './paragraph-keymap.js';

const getDefaultPlaceholder = (model: ParagraphBlockModel) => {
  switch (model.props.type) {
    case 'text':
      return t("Type '/' for commands");
    case 'h1':
      return t('Heading 1');
    case 'h2':
      return t('Heading 2');
    case 'h3':
      return t('Heading 3');
    case 'h4':
      return t('Heading 4');
    case 'h5':
      return t('Heading 5');
    case 'h6':
      return t('Heading 6');
    default:
      return '';
  }
};

const optionsSchema = z.object({
  getPlaceholder: z.optional(
    z.function().args(z.instanceof(ParagraphBlockModel)).returns(z.string())
  ),
});

export class ParagraphViewExtension extends ViewExtensionProvider<
  z.infer<typeof optionsSchema>
> {
  override name = 'affine-paragraph-block';

  override schema = optionsSchema;

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(
    context: ViewExtensionContext,
    options?: z.infer<typeof optionsSchema>
  ) {
    super.setup(context, options);
    const getPlaceholder = options?.getPlaceholder ?? getDefaultPlaceholder;

    context.register([
      FlavourExtension('affine:paragraph'),
      BlockViewExtension('affine:paragraph', literal`affine-paragraph`),
      ParagraphTextKeymapExtension,
      ParagraphKeymapExtension,
      ParagraphBlockConfigExtension({
        getPlaceholder,
      }),
      ParagraphMarkdownExtension,
    ]);
  }
}
