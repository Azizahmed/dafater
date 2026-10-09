import { MenuItem, MenuSeparator, MenuSub } from '@affine/component';
import { PageHeaderMenuButton } from '@affine/core/blocksuite/block-suite-header/menu';
import { useGuard } from '@affine/core/components/guard';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { DocService, DocsService } from '@affine/core/modules/doc';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { DocLinksService } from '@affine/core/modules/doc-link';
import { EditorService } from '@affine/core/modules/editor';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  NoteBlockModel,
  NoteDisplayMode,
  ParagraphBlockModel,
} from '@blocksuite/affine/model';
import { matchModels } from '@blocksuite/affine/shared/utils';
import type { Store } from '@blocksuite/affine/store';
import { LinkedPageIcon, LinkIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as styles from './minimal-header.css';
import { useHoverDismiss } from './use-hover-dismiss';

// the menu sits in the 52px top bar, keep a large width so nothing is folded
const MENU_CONTAINER_WIDTH = 1024;

const HEADING_TYPES = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

interface Heading {
  id: string;
  level: number;
  text: string;
}

const collectHeadings = (store: Store): Heading[] => {
  const root = store.root;
  if (!root) return [];
  return root.children.flatMap(note => {
    if (
      !matchModels(note, [NoteBlockModel]) ||
      note.props.displayMode === NoteDisplayMode.EdgelessOnly
    ) {
      return [];
    }
    return note.children.flatMap(block => {
      if (
        !matchModels(block, [ParagraphBlockModel]) ||
        !HEADING_TYPES.has(block.props.type)
      ) {
        return [];
      }
      const text = block.props.text.toString().trim();
      if (!text) return [];
      return [{ id: block.id, level: Number(block.props.type[1]), text }];
    });
  });
};

const stopMenuKeys = (e: KeyboardEvent) => {
  // keep the menu's typeahead from stealing the keys typed into the field
  e.stopPropagation();
};

const DocRenameInput = ({
  inputRef,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
}) => {
  const t = useI18n();
  const docsService = useService(DocsService);
  const doc = useService(DocService).doc;
  const isSharedMode =
    useService(WorkspaceService).workspace.openOptions.isSharedMode;
  const title = useLiveData(doc.record.title$) ?? '';
  const canEdit = useGuard('Doc_Update', doc.id);

  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);

  const commit = useAsyncCallback(async () => {
    const next = value.trim();
    if (next === title) return;
    await docsService.changeDocTitle(doc.id, next);
    track.$.header.actions.renameDoc();
  }, [doc.id, docsService, title, value]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    stopMenuKeys(e);
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }, []);

  return (
    <input
      ref={inputRef}
      className={styles.renameInput}
      value={value}
      placeholder={t['Untitled']()}
      disabled={!canEdit || isSharedMode}
      onChange={e => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      data-testid="minimal-header-rename-input"
    />
  );
};

const DocOutline = () => {
  const t = useI18n();
  const editor = useService(EditorService).editor;
  const store = useService(DocService).doc.blockSuiteDoc;
  const [headings, setHeadings] = useState(() => collectHeadings(store));

  useEffect(() => {
    setHeadings(collectHeadings(store));
    const subscription = store.slots.blockUpdated.subscribe(() => {
      setHeadings(collectHeadings(store));
    });
    return () => subscription.unsubscribe();
  }, [store]);

  const scrollTo = useCallback(
    (blockId: string) => {
      const host = editor.editorContainer$.value?.host;
      host?.view
        .getBlock(blockId)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [editor]
  );

  const minLevel = useMemo(
    () => Math.min(...headings.map(h => h.level)),
    [headings]
  );

  return (
    <>
      <div className={styles.sectionTitle}>
        {t['com.affine.minimal-interface.table-of-contents']()}
      </div>
      {headings.length === 0 ? (
        <div className={styles.emptyHint}>
          {t['com.affine.minimal-interface.no-headings']()}
        </div>
      ) : (
        <div className={styles.outlineList}>
          {headings.map(heading => (
            <MenuItem
              key={heading.id}
              onSelect={() => scrollTo(heading.id)}
              style={{
                paddingInlineStart: 8 + (heading.level - minLevel) * 14,
              }}
              data-testid="minimal-header-toc-item"
            >
              <span className={styles.outlineItem}>{heading.text}</span>
            </MenuItem>
          ))}
        </div>
      )}
    </>
  );
};

const LinkedDocItem = ({ docId }: { docId: string }) => {
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const workbench = useService(WorkbenchService).workbench;
  const title = useLiveData(docDisplayMetaService.title$(docId));
  const Icon = useLiveData(docDisplayMetaService.icon$(docId));
  return (
    <MenuItem prefixIcon={<Icon />} onSelect={() => workbench.openDoc(docId)}>
      {title}
    </MenuItem>
  );
};

const LinkedDocsSub = ({
  icon,
  label,
  docIds,
}: {
  icon: ReactNode;
  label: string;
  docIds: string[];
}) => {
  const t = useI18n();
  return (
    <MenuSub
      triggerOptions={{ prefixIcon: icon }}
      subContentOptions={{ className: styles.card, sideOffset: 12 }}
      items={
        docIds.length ? (
          docIds.map(docId => <LinkedDocItem key={docId} docId={docId} />)
        ) : (
          <MenuItem disabled>
            {t['com.affine.minimal-interface.no-links']()}
          </MenuItem>
        )
      }
    >
      {`${label} · ${docIds.length}`}
    </MenuSub>
  );
};

// the bi-directional links, which the minimal page no longer shows at its end
const DocLinks = () => {
  const t = useI18n();
  const docLinksService = useService(DocLinksService);
  const backlinks = useLiveData(docLinksService.backlinks.backlinks$);
  const links = useLiveData(docLinksService.links.links$);

  useEffect(() => {
    docLinksService.backlinks.revalidateFromCloud();
  }, [docLinksService]);

  const backlinkDocIds = useMemo(
    () => [...new Set((backlinks ?? []).map(link => link.docId))],
    [backlinks]
  );
  const linkDocIds = useMemo(
    () => [...new Set(links.map(link => link.docId))],
    [links]
  );

  return (
    <>
      <LinkedDocsSub
        icon={<LinkedPageIcon />}
        label={t['com.affine.page-properties.backlinks']()}
        docIds={backlinkDocIds}
      />
      <LinkedDocsSub
        icon={<LinkIcon />}
        label={t['com.affine.page-properties.outgoing-links']()}
        docIds={linkDocIds}
      />
    </>
  );
};

/**
 * Top bar, center: the doc title, shown once the page title scrolled away.
 * Pressing it drops down everything about the doc: rename, table of
 * contents, links and the doc options.
 */
export const MinimalDocTitleMenu = ({
  page,
  isJournal,
  visible,
}: {
  page: Store;
  isJournal: boolean;
  visible: boolean;
}) => {
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const title = useLiveData(docDisplayMetaService.title$(page.id));
  const editor = useService(EditorService).editor;
  const mode = useLiveData(editor.mode$);
  const isInTrash = useLiveData(editor.doc.meta$.map(meta => meta.trash));

  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useHoverDismiss({ open, onDismiss: close, anchorRef });

  // "Rename" closes the menu on select: bring it back with the field focused
  const onRename = useCallback(() => {
    setTimeout(() => {
      setOpen(true);
      setTimeout(() => renameInputRef.current?.select(), 100);
    }, 200 /* wait for menu animation end */);
  }, []);

  if (isInTrash) {
    return (
      <span
        className={clsx(styles.plainTitle, styles.titleButton)}
        data-visible={visible}
        data-testid="minimal-header-title"
      >
        <span className={styles.buttonLabel}>{title}</span>
      </span>
    );
  }

  return (
    <PageHeaderMenuButton
      page={page}
      isJournal={isJournal}
      containerWidth={MENU_CONTAINER_WIDTH}
      rename={onRename}
      open={open}
      onOpenChange={setOpen}
      contentOptions={{
        className: clsx(styles.card, styles.docMenu),
        sideOffset: 8,
      }}
      header={
        <>
          {isJournal ? null : <DocRenameInput inputRef={renameInputRef} />}
          {mode === 'page' ? <DocOutline /> : null}
          <MenuSeparator />
          <DocLinks />
          <MenuSeparator />
        </>
      }
      trigger={
        <button
          ref={anchorRef}
          type="button"
          className={clsx(styles.topBarButton, styles.titleButton)}
          data-visible={visible}
          data-open={open}
          data-testid="minimal-header-title"
        >
          <span className={styles.buttonLabel}>{title}</span>
        </button>
      }
    />
  );
};
