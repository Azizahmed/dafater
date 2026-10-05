import { RefNodeSlotsProvider } from '@blocksuite/affine-inline-reference';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import { getSelectedModelsCommand } from '@blocksuite/affine-shared/commands';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import { isInsideBlockByFlavour } from '@blocksuite/affine-shared/utils';
import {
  type SlashMenuActionItem,
  type SlashMenuConfig,
  type SlashMenuContext,
} from '@blocksuite/affine-widget-slash-menu';
import { viewPresets } from '@blocksuite/data-view/view-presets';
import {
  DatabaseKanbanViewIcon,
  DatabaseTableViewIcon,
  DataPanelIcon,
  NewPageIcon,
  TodayIcon,
} from '@blocksuite/icons/lit';
import type { BlockModel } from '@blocksuite/store';

import {
  createDatabaseDoc,
  focusDatabaseTitle,
  insertDatabaseBlockCommand,
} from '../commands';
import { KanbanViewTooltip, TableViewTooltip } from './tooltips';

/**
 * Search terms shared by every database item. The slash menu folds Arabic
 * spelling variants (ة/ه, أ/ا…) itself, so one spelling is enough.
 */
const DATABASE_ALIASES = ['database', 'db', 'قاعدة بيانات', 'قواعد بيانات'];

const LINKED_DOC = 'affine:embed-linked-doc';

/**
 * Whether a `flavour` block may be added next to `model`. A database only
 * lives directly in a note, so this hides the items inside callouts, lists
 * and edgeless text instead of letting the insert throw.
 */
const canAddNextTo = (model: BlockModel, flavour: string) => {
  const parent = model.store.getParent(model);
  return !!parent && model.store.schema.safeValidate(flavour, parent.flavour);
};

const canInsertDatabase = ({ model }: SlashMenuContext) =>
  !isInsideBlockByFlavour(model.store, model, 'affine:edgeless-text') &&
  canAddNextTo(model, 'affine:database');

const trackDatabaseCreated = (std: SlashMenuContext['std']) => {
  std.getOptional(TelemetryProvider)?.track('BlockCreated', {
    blockType: 'affine:database',
  });
};

/** Inserts a database with `viewType` where the slash was typed. */
const insertDatabase =
  (
    viewType: string,
    { focusTitle = false } = {}
  ): SlashMenuActionItem['action'] =>
  ({ std }) => {
    std.command
      .chain()
      .pipe(getSelectedModelsCommand)
      .pipe(insertDatabaseBlockCommand, {
        viewType,
        place: 'after',
        removeEmptyLine: true,
      })
      .pipe(({ insertedDatabaseBlockId }) => {
        if (!insertedDatabaseBlockId) return;
        trackDatabaseCreated(std);
        if (focusTitle) focusDatabaseTitle(std, insertedDatabaseBlockId);
      })
      .run();
  };

export const databaseSlashMenuConfig: SlashMenuConfig = {
  disableWhen: ({ model }) => model.flavour === 'affine:database',
  items: [
    {
      // Notion's "Database – Inline": a table, ready to be named.
      name: 'Database',
      description: 'Add a database to this doc.',
      searchAlias: [...DATABASE_ALIASES, 'inline', 'مضمنة'],
      icon: DataPanelIcon(),
      tooltip: {
        figure: TableViewTooltip,
        caption: 'Database',
      },
      group: '7_Database@0',
      when: canInsertDatabase,
      action: insertDatabase(viewPresets.tableViewMeta.type, {
        focusTitle: true,
      }),
    },

    {
      // Notion's "Database – Full page": a new doc holding the database,
      // linked from here. As in Notion, the new doc opens with its title
      // focused, so the database can be named right away.
      name: 'Database – Full Page',
      description: 'In a new doc, linked here.',
      searchAlias: [
        ...DATABASE_ALIASES,
        'full page',
        'page',
        'صفحة مستقلة',
        'صفحة كاملة',
        'مستند مستقل',
      ],
      icon: NewPageIcon(),
      group: '7_Database@1',
      when: ctx =>
        !isInsideBlockByFlavour(
          ctx.model.store,
          ctx.model,
          'affine:edgeless-text'
        ) && canAddNextTo(ctx.model, LINKED_DOC),
      action: ({ std, model }) => {
        const store = std.store;
        // Check before creating the doc, so a failed insert leaves no
        // orphan doc behind.
        if (!canAddNextTo(model, LINKED_DOC)) return;
        const databaseDoc = createDatabaseDoc(
          store.workspace,
          viewPresets.tableViewMeta.type
        );
        const card = { flavour: LINKED_DOC, pageId: databaseDoc.id };
        // Keep a line to write on below the card: the empty "/" line itself,
        // or a new one when the "/" was typed after some text.
        let lineId: string | undefined = model.id;
        if (model.text?.length === 0) {
          store.addSiblingBlocks(model, [card], 'before');
        } else {
          const [cardId] = store.addSiblingBlocks(model, [card], 'after');
          const cardModel = cardId ? store.getModelById(cardId) : null;
          lineId = cardModel
            ? store.addSiblingBlocks(
                cardModel,
                [{ flavour: 'affine:paragraph' }],
                'after'
              )[0]
            : undefined;
        }
        trackDatabaseCreated(std);

        const refNodeSlots = std.getOptional(RefNodeSlotsProvider);
        if (refNodeSlots) {
          refNodeSlots.docLinkClicked.next({
            pageId: databaseDoc.id,
            openMode: 'open-in-active-view',
            host: std.host,
          });
        } else if (lineId) {
          focusTextModel(std, lineId);
        }
      },
    },

    {
      name: 'Table View',
      description: 'Display items in a table format.',
      searchAlias: [...DATABASE_ALIASES, 'table', 'grid', 'جدول بيانات'],
      icon: DatabaseTableViewIcon(),
      tooltip: {
        figure: TableViewTooltip,
        caption: 'Table View',
      },
      group: '7_Database@2',
      when: canInsertDatabase,
      action: insertDatabase(viewPresets.tableViewMeta.type),
    },

    {
      // Notion calls it "Board view"; "kanban" stays searchable.
      name: 'Board View',
      description: 'Track items as cards grouped by status.',
      searchAlias: [
        ...DATABASE_ALIASES,
        'kanban view',
        'board',
        'لوحة',
        'كانبان',
      ],
      icon: DatabaseKanbanViewIcon(),
      tooltip: {
        figure: KanbanViewTooltip,
        caption: 'Board View',
      },
      group: '7_Database@3',
      when: canInsertDatabase,
      action: insertDatabase(viewPresets.kanbanViewMeta.type),
    },

    {
      name: 'Calendar View',
      description: 'Display items by date in a calendar.',
      searchAlias: [...DATABASE_ALIASES, 'calendar', 'تقويم', 'رزنامة'],
      icon: TodayIcon(),
      group: '7_Database@4',
      when: canInsertDatabase,
      action: insertDatabase(viewPresets.calendarViewMeta.type),
    },
  ],
};
