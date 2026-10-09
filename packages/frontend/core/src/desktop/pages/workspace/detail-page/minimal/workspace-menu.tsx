import { Popover } from '@affine/component';
import { useWorkspaceName } from '@affine/core/components/hooks/use-workspace-info';
import { RootAppSidebarContent } from '@affine/core/components/root-app-sidebar';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import * as styles from './minimal-header.css';
import { useHoverDismiss } from './use-hover-dismiss';

const preventAutoFocus = (e: Event) => e.preventDefault();

/**
 * Top bar, left: the workspace name. Pressing it drops down everything the
 * app sidebar holds (search, all docs, journals, notifications, favorites…).
 */
export const MinimalWorkspaceMenu = () => {
  const t = useI18n();
  const workspace = useService(WorkspaceService).workspace;
  const workbench = useService(WorkbenchService).workbench;
  const name = useWorkspaceName(workspace.meta);

  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useHoverDismiss({ open, onDismiss: close, anchorRef });

  // once something in the panel navigated, it has done its job
  useEffect(() => {
    if (!open) return;
    const toKey = (l: { pathname: string; search: string; hash: string }) =>
      l.pathname + l.search + l.hash;
    const initial = toKey(workbench.location$.value);
    const subscription = workbench.location$.subscribe(location => {
      if (toKey(location) !== initial) setOpen(false);
    });
    return () => subscription.unsubscribe();
  }, [open, workbench]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={
        <div className={styles.workspacePanel}>
          <RootAppSidebarContent />
        </div>
      }
      contentOptions={{
        className: clsx(styles.card, styles.workspacePanelContent),
        side: 'bottom',
        align: 'start',
        sideOffset: 8,
        onOpenAutoFocus: preventAutoFocus,
      }}
    >
      <button
        ref={anchorRef}
        type="button"
        className={styles.topBarButton}
        data-open={open}
        data-testid="minimal-header-workspace"
      >
        <span className={styles.buttonLabel}>{name || t['Untitled']()}</span>
      </button>
    </Popover>
  );
};
