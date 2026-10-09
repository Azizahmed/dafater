// oxlint-disable-next-line no-restricted-imports
import 'katex/dist/katex.min.css';

import { useConfirmModal, useLitPortalFactory } from '@affine/component';
import {
  type EdgelessEditor,
  LitDocEditor,
  LitDocTitle,
  LitEdgelessEditor,
  type PageEditor,
} from '@affine/core/blocksuite/editors';
import { getViewManager } from '@affine/core/blocksuite/manager/view';
import { useEnableAI } from '@affine/core/components/hooks/affine/use-enable-ai';
import { useEnableMinimalInterface } from '@affine/core/components/hooks/affine/use-minimal-interface';
import { ServerService } from '@affine/core/modules/cloud';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import type {
  DatabaseRow,
  DatabaseValueCell,
} from '@affine/core/modules/doc-info/types';
import { EditorService } from '@affine/core/modules/editor';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { JournalService } from '@affine/core/modules/journal';
import { useInsidePeekView } from '@affine/core/modules/peek-view';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { ServerFeature } from '@affine/graphql';
import track from '@affine/track';
import { bindTextDirection } from '@arabase/blocksuite';
import type { DocTitle } from '@blocksuite/affine/fragments/doc-title';
import type { DocMode, RootBlockModel } from '@blocksuite/affine/model';
import type { Store } from '@blocksuite/affine/store';
import {
  useFramework,
  useLiveData,
  useService,
  useServiceOptional,
  useServices,
} from '@toeverything/infra';
import type React from 'react';
import {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type DefaultOpenProperty,
  WorkspacePropertiesTable,
} from '../../components/properties';
import { BiDirectionalLinkPanel } from './bi-directional-link-panel';
import { DocIconPicker } from './doc-icon-picker';
import { BlocksuiteEditorJournalDocTitle } from './journal-doc-title';
import { StarterBar } from './starter-bar';
import * as styles from './styles.css';

interface BlocksuiteEditorProps {
  page: Store;
  readonly?: boolean;
  shared?: boolean;
  defaultOpenProperty?: DefaultOpenProperty;
}

const usePatchSpecs = (mode: DocMode, shared?: boolean) => {
  const [reactToLit, portals] = useLitPortalFactory();
  const { workspaceService, featureFlagService } = useServices({
    WorkspaceService,
    FeatureFlagService,
  });
  const isCloud = workspaceService.workspace.flavour !== 'local';
  const framework = useFramework();

  const confirmModal = useConfirmModal();

  const enableAI = useEnableAI();

  const isInPeekView = useInsidePeekView();

  const enableTurboRenderer = useLiveData(
    featureFlagService.flags.enable_turbo_renderer.$
  );

  const enablePDFEmbedPreview = useLiveData(
    featureFlagService.flags.enable_pdf_embed_preview.$
  );

  const serverService = useService(ServerService);
  const serverConfig = useLiveData(serverService.server.config$);

  // comment may not be supported by the server
  const enableComment =
    isCloud && serverConfig.features.includes(ServerFeature.Comment) && !shared;

  const patchedSpecs = useMemo(() => {
    const manager = getViewManager()
      .config.init()
      .foundation(framework)
      .ai(enableAI, framework)
      .theme(framework)
      .editorConfig(framework)
      .editorView({
        framework,
        reactToLit,
        confirmModal,
      })
      .cloud(framework, isCloud)
      .turboRenderer(enableTurboRenderer)
      .pdf(enablePDFEmbedPreview, reactToLit)
      .edgelessBlockHeader({
        framework,
        isInPeekView,
        reactToLit,
      })
      .database(framework)
      .linkedDoc(framework)
      .paragraph(enableAI)
      .mobile(framework)
      .electron(framework)
      .linkPreview(framework)
      .codeBlockPreview(framework)
      .iconPicker(framework)
      .comment(enableComment, framework).value;

    if (BUILD_CONFIG.isMobileEdition) {
      if (mode === 'page') {
        return manager.get('mobile-page');
      } else {
        return manager.get('mobile-edgeless');
      }
    } else {
      return manager.get(mode);
    }
  }, [
    confirmModal,
    enableAI,
    enablePDFEmbedPreview,
    enableTurboRenderer,
    enableComment,
    framework,
    isInPeekView,
    isCloud,
    mode,
    reactToLit,
  ]);

  return [
    patchedSpecs,
    useMemo(
      () => (
        <>
          {portals.map(p => (
            <Fragment key={p.id}>{p.portal}</Fragment>
          ))}
        </>
      ),
      [portals]
    ),
  ] as const;
};

export const BlocksuiteDocEditor = forwardRef<
  PageEditor,
  BlocksuiteEditorProps & {
    onClickBlank?: () => void;
    titleRef?: React.Ref<DocTitle>;
  }
>(function BlocksuiteDocEditor(
  {
    page,
    shared,
    onClickBlank,
    titleRef: externalTitleRef,
    defaultOpenProperty,
    readonly,
  },
  ref
) {
  const titleRef = useRef<DocTitle | null>(null);
  const docRef = useRef<PageEditor | null>(null);
  const journalService = useService(JournalService);
  const isJournal = !!useLiveData(journalService.journalDate$(page.id));

  const editorSettingService = useService(EditorSettingService);

  const onDocRef = useCallback(
    (el: PageEditor) => {
      docRef.current = el;
      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [ref]
  );

  const unbindTitleDirection = useRef<(() => void) | null>(null);
  const onTitleRef = useCallback(
    (el: DocTitle) => {
      titleRef.current = el;
      // Bound in the ref callback (during commit, before paint) so the title
      // never shows a frame in the wrong direction.
      unbindTitleDirection.current?.();
      unbindTitleDirection.current = null;
      const root = page.root as RootBlockModel | null;
      if (el && root) {
        unbindTitleDirection.current = bindTextDirection(el, {
          text$: root.props.title$,
        });
      }
      if (externalTitleRef) {
        if (typeof externalTitleRef === 'function') {
          externalTitleRef(el);
        } else {
          externalTitleRef.current = el;
        }
      }
    },
    [externalTitleRef, page]
  );

  const [specs, portals] = usePatchSpecs('page', shared);

  const displayBiDirectionalLink = useLiveData(
    editorSettingService.editorSetting.settings$.selector(
      s => s.displayBiDirectionalLink
    )
  );

  const displayDocInfo = useLiveData(
    editorSettingService.editorSetting.settings$.selector(s => s.displayDocInfo)
  );

  // only the title and the body: doc info folds into the divider under the
  // title, and links / starter actions move to the top bar
  const minimal = useEnableMinimalInterface();

  // once the title is written and the caret leaves it, the title moves up
  // into the top bar and the body starts right at the content
  const editor = useServiceOptional(EditorService)?.editor;
  const titleInTopBar = useLiveData(editor?.titleInTopBar$);
  const docTitle = useLiveData(editor?.doc.title$);
  const titleAreaRef = useRef<HTMLDivElement>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  const syncTitleFocus = useCallback(() => {
    // read after the focus settled; a window blur keeps activeElement
    requestAnimationFrame(() => {
      const area = titleAreaRef.current;
      setTitleFocused(!!area?.contains(document.activeElement));
    });
  }, []);
  const titleLifted =
    minimal &&
    !isJournal &&
    !!titleInTopBar &&
    !!docTitle?.trim() &&
    !titleFocused;
  useEffect(() => {
    if (!editor) return;
    editor.titleLifted$.next(titleLifted);
    return () => editor.titleLifted$.next(false);
  }, [editor, titleLifted]);

  const onPropertyChange = useCallback((property: DocCustomPropertyInfo) => {
    track.doc.inlineDocInfo.property.editProperty({
      type: property.type,
    });
  }, []);

  const onPropertyAdded = useCallback((property: DocCustomPropertyInfo) => {
    track.doc.inlineDocInfo.property.addProperty({
      type: property.type,
      control: 'at menu',
    });
  }, []);

  const onDatabasePropertyChange = useCallback(
    (_row: DatabaseRow, cell: DatabaseValueCell) => {
      track.doc.inlineDocInfo.databaseProperty.editProperty({
        type: cell.property.type$.value,
      });
    },
    []
  );

  const onPropertyInfoChange = useCallback(
    (property: DocCustomPropertyInfo, field: string) => {
      track.doc.inlineDocInfo.property.editPropertyMeta({
        type: property.type,
        field,
      });
    },
    []
  );

  return (
    <>
      <div className={styles.affineDocViewport}>
        <div
          ref={titleAreaRef}
          className={styles.docTitleArea}
          data-lifted={titleLifted}
          onFocus={syncTitleFocus}
          onBlur={syncTitleFocus}
        >
          {!BUILD_CONFIG.isMobileEdition ? (
            <DocIconPicker docId={page.id} readonly={readonly || shared} />
          ) : null}
          {!isJournal ? (
            <LitDocTitle doc={page} ref={onTitleRef} />
          ) : (
            <BlocksuiteEditorJournalDocTitle page={page} />
          )}
          {!shared && displayDocInfo ? (
            <div className={styles.docPropertiesTableContainer}>
              <WorkspacePropertiesTable
                variant={minimal ? 'minimal' : 'default'}
                className={styles.docPropertiesTable}
                onDatabasePropertyChange={onDatabasePropertyChange}
                onPropertyChange={onPropertyChange}
                onPropertyAdded={onPropertyAdded}
                onPropertyInfoChange={onPropertyInfoChange}
                defaultOpenProperty={defaultOpenProperty}
              />
            </div>
          ) : null}
        </div>
        <LitDocEditor
          className={styles.docContainer}
          ref={onDocRef}
          doc={page}
          specs={specs}
        />
        <div
          className={styles.docEditorGap}
          data-testid="page-editor-blank"
          onClick={onClickBlank}
        ></div>
        {!readonly && !BUILD_CONFIG.isMobileEdition && !minimal && (
          <StarterBar doc={page} />
        )}
        {!shared && displayBiDirectionalLink && !minimal ? (
          <BiDirectionalLinkPanel />
        ) : null}
      </div>
      {portals}
    </>
  );
});
export const BlocksuiteEdgelessEditor = forwardRef<
  EdgelessEditor,
  BlocksuiteEditorProps
>(function BlocksuiteEdgelessEditor({ page }, ref) {
  const [specs, portals] = usePatchSpecs('edgeless');
  const editorRef = useRef<EdgelessEditor | null>(null);

  const onDocRef = useCallback(
    (el: EdgelessEditor) => {
      editorRef.current = el;
      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [ref]
  );

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateComplete
        .then(() => {
          // make sure editor can get keyboard events on showing up
          editorRef.current
            ?.querySelector<HTMLElement>('affine-edgeless-root')
            ?.click();
        })
        .catch(console.error);
    }
  }, []);

  return (
    <div className={styles.affineEdgelessDocViewport}>
      <LitEdgelessEditor ref={onDocRef} doc={page} specs={specs} />
      {portals}
    </div>
  );
});
