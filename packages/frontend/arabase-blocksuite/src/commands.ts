import type { TextDirection } from '@arabase/core';
import { getSelectedModelsCommand } from '@blocksuite/affine/shared/commands';
import type { BlockStdScope, Command } from '@blocksuite/affine/std';
import type { BlockModel } from '@blocksuite/affine/store';

import { isTextDirection } from './bind-direction';
import {
  CONTENT_DIRECTION_SOURCES,
  TEXT_DIRECTION_FLAVOURS,
} from './direction-watcher';

/** `null` resets the block to automatic (content-based) direction. */
export type TextDirectionChoice = TextDirection | null;

export function supportsTextDirection(model: BlockModel): boolean {
  return (
    TEXT_DIRECTION_FLAVOURS.includes(model.flavour) ||
    model.flavour in CONTENT_DIRECTION_SOURCES
  );
}

/** Text blocks covered by the current text or block selection. */
export function getDirectionTargets(std: BlockStdScope): BlockModel[] {
  const [ok, { selectedModels = [] }] = std.command
    .chain()
    .pipe(getSelectedModelsCommand, { types: ['text', 'block'] })
    .run();
  return ok ? selectedModels.filter(supportsTextDirection) : [];
}

/** The explicit direction shared by all models, `null` = automatic. */
export function getExplicitDirection(
  models: BlockModel[]
): TextDirectionChoice | 'mixed' {
  const values = new Set(
    models.map(model => {
      const value = (model.props as { textDirection?: unknown }).textDirection;
      return isTextDirection(value) ? value : null;
    })
  );
  if (values.size > 1) return 'mixed';
  return values.values().next().value ?? null;
}

/**
 * Sets (or resets to automatic) the writing direction of the selected text
 * blocks. The choice is stored with the content (`textDirection` prop), so it
 * survives reloads, copy/paste and collaboration, and is undoable.
 */
export const setTextDirectionCommand: Command<{
  textDirection: TextDirectionChoice;
  selectedModels?: BlockModel[];
}> = (ctx, next) => {
  const { std, textDirection } = ctx;
  const targets = (ctx.selectedModels ?? getDirectionTargets(std)).filter(
    supportsTextDirection
  );
  if (!targets.length) return;

  std.store.transact(() => {
    for (const model of targets) {
      // The callback form is required to clear the prop: the object form of
      // `updateBlock` ignores `undefined` values.
      std.store.updateBlock(model, () => {
        (model.props as { textDirection?: TextDirection }).textDirection =
          textDirection ?? undefined;
      });
    }
  });
  return next();
};
