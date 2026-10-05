import { ArabaseEditorViewExtension } from '@arabase/blocksuite';
import { ViewExtensionManager } from '@blocksuite/affine/ext-loader';
import { getInternalViewExtensions } from '@blocksuite/affine/extensions/view';
import { BlockViewIdentifier } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { literal } from 'lit/static-html.js';

// Arabase gives each rendered block (AI answers) its direction from its content.
const manager = new ViewExtensionManager([
  ...getInternalViewExtensions(),
  ArabaseEditorViewExtension,
]);
const customPageEditorBlockSpecs: ExtensionType[] = [
  ...manager.get('page'),
  {
    setup: di => {
      di.override(
        BlockViewIdentifier('affine:page'),
        () => literal`affine-page-root`
      );
    },
  },
];

export const getCustomPageEditorBlockSpecs = () => {
  return customPageEditorBlockSpecs;
};
