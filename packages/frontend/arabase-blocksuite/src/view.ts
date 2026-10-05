import type { DirectionStrategy } from '@arabase/core';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import type { ReadonlySignal } from '@preact/signals-core';
import { z } from 'zod';

import { BidiHtmlClipboardExtension } from './clipboard';
import { BlockDirectionExtension } from './direction-watcher';
import { type ArabaseTranslate, defaultTranslate } from './labels';
import { editorDirectionStrategy$ } from './locales';
import { DirectionShortcutWatcher } from './shortcut';
import {
  SlashMenuLocalizerExtension,
  type SlashMenuTranslate,
} from './slash-menu-i18n';
import { installEditorStyles } from './styles';
import { TextDirectionSlashMenuExtension } from './ui';

const optionsSchema = z.object({
  /**
   * Direction strategy for text without an explicit direction (default:
   * follows the UI language, see `editorLocaleModule`).
   */
  strategy: z
    .union([
      z.enum(['rtl-priority', 'first-strong']),
      z.custom<ReadonlySignal<DirectionStrategy>>(
        value => typeof value === 'object' && value !== null && 'value' in value
      ),
    ])
    .optional(),
  translate: z
    .custom<ArabaseTranslate>(value => typeof value === 'function')
    .optional(),
  /** Ctrl + Right/Left Shift sets the direction (default: on). */
  shortcuts: z.boolean().optional(),
  /** Localises BlockSuite's own slash-menu texts (default: English). */
  translateSlashMenu: z
    .custom<SlashMenuTranslate>(value => typeof value === 'function')
    .optional(),
});

export type ArabaseEditorViewOptions = z.infer<typeof optionsSchema>;

/**
 * Single integration point of arabase into a BlockSuite editor. Register it
 * with the host's `ViewExtensionManager` and configure it there.
 */
export class ArabaseEditorViewExtension extends ViewExtensionProvider<ArabaseEditorViewOptions> {
  override name = 'arabase-editor';

  override schema = optionsSchema;

  override effect() {
    super.effect();
    if (typeof document !== 'undefined') installEditorStyles();
  }

  override setup(
    context: ViewExtensionContext,
    options?: ArabaseEditorViewOptions
  ) {
    super.setup(context, options);
    context.register(
      BlockDirectionExtension({
        strategy: options?.strategy ?? editorDirectionStrategy$,
      })
    );
    if (this.isPreview(context.scope)) return;

    context.register(BidiHtmlClipboardExtension);
    context.register(
      TextDirectionSlashMenuExtension(options?.translate ?? defaultTranslate)
    );
    if (options?.shortcuts !== false) {
      context.register(DirectionShortcutWatcher);
    }
    if (options?.translateSlashMenu) {
      context.register(SlashMenuLocalizerExtension(options.translateSlashMenu));
    }
  }
}
