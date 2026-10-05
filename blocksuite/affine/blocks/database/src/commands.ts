import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import { createDefaultDoc } from '@blocksuite/affine-shared/utils';
import type { BlockStdScope, Command } from '@blocksuite/std';
import type { BlockModel, Store, Workspace } from '@blocksuite/store';

import {
  DatabaseBlockDataSource,
  databaseViewInitTemplate,
} from './data-source';

export const insertDatabaseBlockCommand: Command<
  {
    selectedModels?: BlockModel[];
    viewType: string;
    place?: 'after' | 'before';
    removeEmptyLine?: boolean;
  },
  {
    insertedDatabaseBlockId: string;
  }
> = (ctx, next) => {
  const { selectedModels, viewType, place, removeEmptyLine, std } = ctx;
  if (!selectedModels?.length) return;

  const targetModel =
    place === 'before'
      ? selectedModels[0]
      : selectedModels[selectedModels.length - 1];

  if (!targetModel) return;

  const result = std.store.addSiblingBlocks(
    targetModel,
    [{ flavour: 'affine:database' }],
    place
  );
  const string = result[0];

  if (string == null) return;

  initDatabaseBlock(std.store, targetModel, string, viewType, false);

  if (removeEmptyLine && targetModel.text?.length === 0) {
    std.store.deleteBlock(targetModel);
  }

  next({ insertedDatabaseBlockId: string });
};

export const initDatabaseBlock = (
  doc: Store,
  model: BlockModel,
  databaseId: string,
  viewType: string,
  isAppendNewRow = true
) => {
  const blockModel = doc.getBlock(databaseId)?.model as
    | DatabaseBlockModel
    | undefined;
  if (!blockModel) {
    return;
  }
  const datasource = new DatabaseBlockDataSource(blockModel);
  databaseViewInitTemplate(datasource, viewType);
  if (isAppendNewRow) {
    const parent = doc.getParent(model);
    if (!parent) return;
    doc.addBlock('affine:paragraph', {}, parent.id);
  }
};

/**
 * Creates a doc whose content is a database with a `viewType` view
 * (Notion's "full page" database). The doc title names the database, so it
 * starts empty and the database itself has no title of its own (see
 * `isDocDatabase`). Returns the new doc.
 */
export function createDatabaseDoc(
  workspace: Workspace,
  viewType: string
): Store {
  const store = createDefaultDoc(workspace);
  const note = store.root?.children.find(
    child => child.flavour === 'affine:note'
  );
  if (note) {
    const databaseId = store.addBlock('affine:database', {}, note.id, 0);
    initDatabaseBlock(store, note, databaseId, viewType, false);
    // Undo in the new doc must not remove the database.
    store.resetHistory();
  }
  return store;
}

/**
 * Puts the caret in the title of a database that was just inserted, so the
 * user can name it right away. Waits for the block to render.
 */
export function focusDatabaseTitle(
  std: BlockStdScope,
  databaseId: string,
  frames = 30
) {
  // Drop the text selection first. Syncing a selection change to the DOM
  // blurs the focused element, so the title is focused only afterwards.
  std.selection.clear();
  const tryFocus = (left: number) => {
    const textarea = std.view
      .getBlock(databaseId)
      ?.querySelector<HTMLTextAreaElement>('affine-database-title textarea');
    if (textarea) {
      textarea.focus();
      return;
    }
    if (left > 0) requestAnimationFrame(() => tryFocus(left - 1));
  };
  std.host.updateComplete
    .then(() => requestAnimationFrame(() => tryFocus(frames)))
    .catch(console.error);
}

/**
 * Whether the database is all its doc holds (apart from empty lines), as in
 * Notion's "full page" database. The doc title then names the database, so
 * an empty database title is not shown a second time under it.
 */
export function isDocDatabase(model: DatabaseBlockModel) {
  const store = model.store;
  const note = store.getParent(model);
  if (note?.flavour !== 'affine:note') return false;
  const notes =
    store.root?.children.filter(child => child.flavour === 'affine:note') ?? [];
  if (notes.length !== 1) return false;
  return note.children.every(
    child =>
      child === model ||
      (child.flavour === 'affine:paragraph' && child.text?.length === 0)
  );
}
