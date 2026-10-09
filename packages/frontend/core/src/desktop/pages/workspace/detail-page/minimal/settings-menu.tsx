import { Menu, MenuItem, MenuSeparator, MenuSub } from '@affine/component';
import { useEditorModeSwitch } from '@affine/core/blocksuite/block-suite-mode-switch';
import { useEnableCloud } from '@affine/core/components/hooks/affine/use-enable-cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { ShareMenuContent } from '@affine/core/modules/share-menu';
import { ViewService, WorkbenchService } from '@affine/core/modules/workbench';
import type { Workspace } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { DocMode } from '@blocksuite/affine/model';
import type { Store } from '@blocksuite/affine/store';
import {
  AiIcon,
  ChartPanelIcon,
  CloseIcon,
  CommentIcon,
  EdgelessIcon,
  ExportIcon,
  FrameIcon,
  PageIcon,
  PropertyIcon,
  SettingsIcon,
  ShareIcon,
  TocIcon,
  TodayIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { type ReactNode, useCallback, useRef, useState } from 'react';

import * as styles from './minimal-header.css';
import { useHoverDismiss } from './use-hover-dismiss';

/**
 * The side panel tabs, in the order the classic side panel shows them.
 * Only the tabs the doc page registered (AI enabled, cloud workspace, ...)
 * are listed.
 */
const SIDE_PANEL_TABS: {
  id: string;
  icon: ReactNode;
  label: (t: ReturnType<typeof useI18n>) => string;
}[] = [
  {
    id: 'chat',
    icon: <AiIcon />,
    label: t => t['com.affine.minimal-interface.panel.chat'](),
  },
  {
    id: 'properties',
    icon: <PropertyIcon />,
    label: t => t['com.affine.minimal-interface.panel.properties'](),
  },
  {
    id: 'journal',
    icon: <TodayIcon />,
    label: t => t['com.affine.minimal-interface.panel.journal'](),
  },
  {
    id: 'outline',
    icon: <TocIcon />,
    label: t => t['com.affine.minimal-interface.panel.outline'](),
  },
  {
    id: 'frame',
    icon: <FrameIcon />,
    label: t => t['com.affine.minimal-interface.panel.frame'](),
  },
  {
    id: 'adapter',
    icon: <ExportIcon />,
    label: t => t['com.affine.minimal-interface.panel.adapter'](),
  },
  {
    id: 'comment',
    icon: <CommentIcon />,
    label: t => t['com.affine.minimal-interface.panel.comment'](),
  },
  {
    id: 'analytics',
    icon: <ChartPanelIcon />,
    label: t => t['com.affine.minimal-interface.panel.analytics'](),
  },
];

/**
 * Page / edgeless as a pill with a sliding thumb.
 */
const ModeSegmented = ({
  mode,
  disabled,
  onChange,
}: {
  mode?: DocMode;
  disabled?: boolean;
  onChange: (mode: DocMode) => void;
}) => {
  const t = useI18n();
  const options = [
    {
      value: 'page' as const,
      icon: <PageIcon />,
      label: t['com.affine.pageMode.page'](),
    },
    {
      value: 'edgeless' as const,
      icon: <EdgelessIcon />,
      label: t['com.affine.pageMode.edgeless'](),
    },
  ];
  const index = Math.max(
    0,
    options.findIndex(option => option.value === mode)
  );
  return (
    <div className={styles.segmented} role="radiogroup">
      <div
        className={styles.segmentedThumb}
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === mode}
          className={styles.segmentedOption}
          data-active={option.value === mode}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          data-testid={`minimal-header-mode-${option.value}`}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
};

/**
 * Top bar, right: one word, "Settings". Pressing it drops down sharing,
 * every side panel tab (AI, properties, calendar, table of contents, frames,
 * markdown, comments, analytics), page / edgeless and the app settings.
 */
export const MinimalSettingsMenu = ({
  page,
  workspace,
}: {
  page: Store;
  workspace: Workspace;
}) => {
  const t = useI18n();
  const workbench = useService(WorkbenchService).workbench;
  const workspaceDialogService = useService(WorkspaceDialogService);
  const view = useService(ViewService).view;
  const confirmEnableCloud = useEnableCloud();

  const {
    currentMode: mode,
    trash: isInTrash,
    onModeChange,
  } = useEditorModeSwitch();
  const sidebarOpen = useLiveData(workbench.sidebarOpen$);
  const registeredTabs = useLiveData(view.sidebarTabs$);
  const activeTab = useLiveData(view.activeSidebarTab$);
  const panelTabs = SIDE_PANEL_TABS.filter(tab =>
    registeredTabs.some(registered => registered.id === tab.id)
  );
  const isSharedMode = workspace.openOptions.isSharedMode;

  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useHoverDismiss({ open, onDismiss: close, anchorRef });

  const handleShareOpenChange = useCallback((open: boolean) => {
    if (open) {
      track.$.sharePanel.$.open();
    }
  }, []);

  const openAllSettings = useCallback(() => {
    workspaceDialogService.open('setting', { activeTab: 'appearance' });
  }, [workspaceDialogService]);

  // pressing the open tab again closes the side panel
  const togglePanelTab = useCallback(
    (id: string) => {
      if (sidebarOpen && activeTab?.id === id) {
        workbench.closeSidebar();
        return;
      }
      view.activeSidebarTab(id);
      workbench.openSidebar();
    },
    [activeTab, sidebarOpen, view, workbench]
  );

  return (
    <Menu
      rootOptions={{ open, onOpenChange: setOpen }}
      contentOptions={{
        align: 'end',
        sideOffset: 8,
        className: styles.card,
        style: { width: 260 },
      }}
      items={
        <>
          <div className={styles.cardHeader}>
            {t['com.affine.settingSidebar.title']()}
            <button
              type="button"
              className={styles.cardClose}
              onClick={close}
              aria-label={t['com.affine.modal.close']()}
            >
              <CloseIcon />
            </button>
          </div>
          {!isSharedMode && !isInTrash ? (
            <>
              <MenuSub
                triggerOptions={{ prefixIcon: <ShareIcon /> }}
                subOptions={{ onOpenChange: handleShareOpenChange }}
                subContentOptions={{
                  className: styles.card,
                  sideOffset: 12,
                  alignOffset: -8,
                  // to handle overflow when the width is not enough
                  collisionPadding: 20,
                }}
                items={
                  <div className={styles.shareMenu}>
                    <ShareMenuContent
                      workspaceMetadata={workspace.meta}
                      currentPage={page}
                      onEnableAffineCloud={() =>
                        confirmEnableCloud(workspace, {
                          openPageId: page.id,
                        })
                      }
                    />
                  </div>
                }
              >
                {t['com.affine.share-menu.shareButton']()}
              </MenuSub>
              <MenuSeparator />
            </>
          ) : null}
          {panelTabs.map(tab => (
            <MenuItem
              key={tab.id}
              prefixIcon={tab.icon}
              selected={sidebarOpen && activeTab?.id === tab.id}
              onSelect={() => togglePanelTab(tab.id)}
              data-testid={`minimal-header-panel-${tab.id}`}
            >
              {tab.label(t)}
            </MenuItem>
          ))}
          {panelTabs.length > 0 ? <MenuSeparator /> : null}
          <ModeSegmented
            mode={mode}
            disabled={!!isInTrash}
            onChange={onModeChange}
          />
          {!isSharedMode ? (
            <>
              <MenuSeparator />
              <MenuItem
                prefixIcon={<SettingsIcon />}
                onSelect={openAllSettings}
              >
                {t['com.affine.minimal-interface.all-settings']()}
              </MenuItem>
            </>
          ) : null}
        </>
      }
    >
      <button
        ref={anchorRef}
        type="button"
        className={clsx(styles.topBarButton, styles.settingsButton)}
        data-open={open}
        data-testid="minimal-header-settings"
      >
        {t['com.affine.settingSidebar.title']()}
      </button>
    </Menu>
  );
};
