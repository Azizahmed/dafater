import { Loading, Scrollable } from '@affine/component';
import { WorkspaceDetailSkeleton } from '@affine/component/setting-components';
import type { ModalProps } from '@affine/component/ui/modal';
import { Modal } from '@affine/component/ui/modal';
import {
  AuthService,
  DefaultServerService,
  ServersService,
} from '@affine/core/modules/cloud';
import type { DialogComponentProps } from '@affine/core/modules/dialogs';
import type {
  SettingTab,
  WORKSPACE_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs/constant';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { createIsland, type Island } from '@affine/core/utils/island';
import { useTranslation } from '@affine/i18n';
import { FrameworkScope, useLiveData, useService } from '@toeverything/infra';
import { debounce } from 'lodash-es';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

import { AccountSetting } from './account-setting';
import { GeneralSetting } from './general-setting';
import { isServerSetting, ServerSetting } from './server-setting';
import { SettingSidebar } from './setting-sidebar';
import * as style from './style.css';
import {
  SubPageContext,
  type SubPageContextType,
  SubPageTarget,
} from './sub-page';
import type { SettingState } from './types';
import { WorkspaceSetting } from './workspace-setting';

interface SettingProps extends ModalProps {
  activeTab?: SettingTab;
  onCloseSetting: () => void;
  scrollAnchor?: string;
}

const isWorkspaceSetting = (key: string): boolean =>
  key.startsWith('workspace:');

const CenteredLoading = () => {
  return (
    <div className={style.centeredLoading}>
      <Loading size={24} />
    </div>
  );
};

// Dafater has no plans, billing or licenses: tabs that upstream callers may
// still request fall back to an existing tab.
const REMOVED_TAB_FALLBACK: Partial<Record<SettingTab, SettingTab>> = {
  plans: 'appearance',
  billing: 'appearance',
  'workspace:billing': 'workspace:preference',
  'workspace:license': 'workspace:preference',
};

const resolveSettingTab = (tab: SettingTab): SettingTab =>
  REMOVED_TAB_FALLBACK[tab] ?? tab;

const SettingModalInner = ({
  activeTab: initialActiveTab = 'appearance',
  onCloseSetting,
  scrollAnchor: initialScrollAnchor,
}: SettingProps) => {
  const [subPageIslands, setSubPageIslands] = useState<Island[]>([]);
  const [settingState, setSettingState] = useState<SettingState>({
    activeTab: resolveSettingTab(initialActiveTab),
    scrollAnchor: initialScrollAnchor,
  });
  const globalContextService = useService(GlobalContextService);
  const { i18n } = useTranslation('translation');

  const currentServerId = useLiveData(
    globalContextService.globalContext.serverId.$
  );
  const currentLanguageKey = i18n.resolvedLanguage ?? i18n.language;
  const serversService = useService(ServersService);
  const defaultServerService = useService(DefaultServerService);
  const currentServer =
    useLiveData(
      currentServerId ? serversService.server$(currentServerId) : null
    ) ?? defaultServerService.server;
  const loginStatus = useLiveData(
    currentServer.scope.get(AuthService).session.status$
  );

  const modalContentRef = useRef<HTMLDivElement>(null);
  const modalContentWrapperRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let animationFrameId: number;
    const onResize = debounce(() => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        if (!modalContentRef.current || !modalContentWrapperRef.current) return;

        const wrapperWidth = modalContentWrapperRef.current.offsetWidth;
        const wrapperHeight = modalContentWrapperRef.current.offsetHeight;
        const contentWidth = modalContentRef.current.offsetWidth;

        const wrapper = modalContentWrapperRef.current;

        wrapper?.style.setProperty(
          '--setting-modal-width',
          `${wrapperWidth}px`
        );
        wrapper?.style.setProperty(
          '--setting-modal-height',
          `${wrapperHeight}px`
        );
        wrapper?.style.setProperty(
          '--setting-modal-content-width',
          `${contentWidth}px`
        );
        wrapper?.style.setProperty(
          '--setting-modal-gap-x',
          `${(wrapperWidth - contentWidth) / 2}px`
        );
      });
    }, 200);
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const onTabChange = useCallback(
    (key: SettingTab) => {
      setSettingState({ activeTab: resolveSettingTab(key) });
    },
    [setSettingState]
  );
  const addSubPageIsland = useCallback(() => {
    const island = createIsland();
    setSubPageIslands(prev => [...prev, island]);
    const dispose = () => {
      setSubPageIslands(prev => prev.filter(i => i !== island));
    };
    return { island, dispose };
  }, []);

  const contextValue = useMemo(
    () =>
      ({
        islands: subPageIslands,
        addIsland: addSubPageIsland,
      }) satisfies SubPageContextType,
    [subPageIslands, addSubPageIsland]
  );

  useEffect(() => {
    const resolved = resolveSettingTab(settingState.activeTab);
    if (resolved !== settingState.activeTab) {
      setSettingState({ activeTab: resolved });
    }
  }, [settingState.activeTab]);

  useEffect(() => {
    if (settingState.scrollAnchor) {
      flushSync(() => {
        const target = modalContentRef.current?.querySelector(
          `#${settingState.scrollAnchor}`
        );
        if (target) {
          target.scrollIntoView();
        }
      });
    }
    modalContentWrapperRef.current?.scrollTo({ top: 0 });
  }, [settingState]);
  return (
    <FrameworkScope
      key={`setting-modal-${currentServerId}-${currentLanguageKey}`}
      scope={currentServer.scope}
    >
      <SettingSidebar
        activeTab={settingState.activeTab}
        onTabChange={onTabChange}
      />
      <SubPageContext.Provider value={contextValue}>
        <Scrollable.Root>
          <Scrollable.Viewport
            data-testid="setting-modal-content"
            className={style.wrapper}
            ref={modalContentWrapperRef}
            data-setting-page
            data-open
          >
            <div className={style.centerContainer}>
              <div ref={modalContentRef} className={style.content}>
                <Suspense fallback={<WorkspaceDetailSkeleton />}>
                  {settingState.activeTab === 'account' &&
                  loginStatus === 'authenticated' ? (
                    <AccountSetting onChangeSettingState={setSettingState} />
                  ) : isWorkspaceSetting(settingState.activeTab) ? (
                    <WorkspaceSetting
                      activeTab={settingState.activeTab}
                      scrollAnchor={settingState.scrollAnchor}
                      onCloseSetting={onCloseSetting}
                      onChangeSettingState={setSettingState}
                    />
                  ) : isServerSetting(settingState.activeTab) ? (
                    <ServerSetting activeTab={settingState.activeTab} />
                  ) : !isWorkspaceSetting(settingState.activeTab) ? (
                    <GeneralSetting
                      activeTab={settingState.activeTab}
                      onChangeSettingState={setSettingState}
                    />
                  ) : null}
                </Suspense>
              </div>
            </div>
            <Scrollable.Scrollbar />
          </Scrollable.Viewport>
          <SubPageTarget />
        </Scrollable.Root>
      </SubPageContext.Provider>
    </FrameworkScope>
  );
};

export const SettingDialog = ({
  close,
  activeTab,
  scrollAnchor,
}: DialogComponentProps<WORKSPACE_DIALOG_SCHEMA['setting']>) => {
  return (
    <Modal
      width={1280}
      height={920}
      contentOptions={{
        ['data-testid' as string]: 'setting-modal',
        style: {
          maxHeight: '85vh',
          maxWidth: 'calc(100dvw - 100px)',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
        },
      }}
      open
      onOpenChange={() => close()}
      closeButtonOptions={{
        style: { insetInlineEnd: 14, top: 14 },
      }}
    >
      <Suspense fallback={<CenteredLoading />}>
        <SettingModalInner
          activeTab={activeTab}
          onCloseSetting={close}
          scrollAnchor={scrollAnchor}
        />
      </Suspense>
    </Modal>
  );
};
