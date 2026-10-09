import { useRegisterCopyLinkCommands } from '@affine/core/components/hooks/affine/use-register-copy-link-commands';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { EditorService } from '@affine/core/modules/editor';
import { JournalService } from '@affine/core/modules/journal';
import { ViewIcon, ViewTitle } from '@affine/core/modules/workbench';
import type { Workspace } from '@affine/core/modules/workspace';
import type { Store } from '@blocksuite/affine/store';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';

import { MinimalDocTitleMenu } from './doc-title-menu';
import * as styles from './minimal-header.css';
import { MinimalSettingsMenu } from './settings-menu';
import { MinimalWorkspaceMenu } from './workspace-menu';

/**
 * The single, static top bar of the minimal doc interface:
 * workspace name · doc title · settings
 */
export const MinimalDocHeader = ({
  page,
  workspace,
  titleScrolledOut,
}: {
  page: Store;
  workspace: Workspace;
  /** the page title left the viewport, so the bar shows it instead */
  titleScrolledOut: boolean;
}) => {
  useRegisterCopyLinkCommands({
    workspaceMeta: workspace.meta,
    docId: page.id,
  });

  const docDisplayMetaService = useService(DocDisplayMetaService);
  const title = useLiveData(docDisplayMetaService.title$(page.id));
  const journalService = useService(JournalService);
  const isJournal = !!useLiveData(journalService.journalDate$(page.id));
  const editor = useService(EditorService).editor;
  const mode = useLiveData(editor.mode$);
  const titleLifted = useLiveData(editor.titleLifted$);

  // this bar shows the title, so the page body may hand it over
  useEffect(() => {
    editor.titleInTopBar$.next(true);
    return () => editor.titleInTopBar$.next(false);
  }, [editor]);

  return (
    <div className={styles.header} data-testid="header">
      <ViewTitle title={title} />
      <ViewIcon icon={isJournal ? 'journal' : (mode ?? 'page')} />
      <div className={styles.left}>
        <MinimalWorkspaceMenu />
      </div>
      <div className={styles.center}>
        <MinimalDocTitleMenu
          page={page}
          isJournal={isJournal}
          // edgeless has no page title to scroll past
          visible={titleScrolledOut || titleLifted || mode === 'edgeless'}
        />
      </div>
      <div className={styles.right}>
        <MinimalSettingsMenu page={page} workspace={workspace} />
      </div>
    </div>
  );
};
