import { Button, Modal, SafeArea, Scrollable } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { ImageIcon, LinkIcon, TextIcon } from '@blocksuite/icons/rc';

import { PageHeader } from '../page-header';
import { LinkPreview } from './link-preview';
import { SelectionPage, type SelectionPageOption } from './selection-page';
import * as styles from './style.css';
import type { PendingShareItem, ShareInboxProvider } from './types';
import { useShareImport } from './use-share-import';
export type { ShareInboxProvider } from './types';

const errorMessage = (t: ReturnType<typeof useI18n>, error?: string) => {
  switch (error) {
    case 'workspace-not-found':
      return t['com.affine.mobile.share-import.error.workspace-not-found']();
    case 'permission-denied':
      return t['com.affine.mobile.share-import.error.permission-denied']();
    case 'destination-not-found':
      return t['com.affine.mobile.share-import.error.destination-not-found']();
    case 'offline-confirmation-required':
      return t[
        'com.affine.mobile.share-import.error.offline-confirmation-required'
      ]();
    case 'attachment-missing':
      return t['com.affine.mobile.share-import.error.attachment-missing']();
    case 'attachment-too-large':
      return t['com.affine.mobile.share-import.error.attachment-too-large']();
    case 'attachment-write-failed':
      return t[
        'com.affine.mobile.share-import.error.attachment-write-failed'
      ]();
    case 'import-conflict':
      return t['com.affine.mobile.share-import.error.import-conflict']();
    case 'completion-failed':
      return t['com.affine.mobile.share-import.error.completion-failed']();
    default:
      return undefined;
  }
};

const sourceDetails = (
  t: ReturnType<typeof useI18n>,
  item: PendingShareItem
) => {
  if (item.content.kind === 'url') {
    return {
      title: item.title,
      detail: item.content.url?.replace(/^https?:\/\//, '').split('/')[0],
    };
  }
  if (item.content.kind === 'image') {
    return {
      title: item.title,
      detail:
        item.attachments?.[0]?.fileName ??
        t['com.affine.mobile.share-import.shared-image'](),
    };
  }
  if (item.content.kind === 'pdf') {
    return {
      title: item.title,
      detail:
        item.attachments?.[0]?.fileName ??
        t['com.affine.mobile.share-import.shared-pdf'](),
    };
  }
  return {
    title: item.title,
    detail: t['com.affine.mobile.share-import.characters']({
      count: String(item.content.text?.length ?? 0),
    }),
  };
};

const SourceIcon = ({
  kind,
}: {
  kind: PendingShareItem['content']['kind'];
}) => {
  switch (kind) {
    case 'url':
      return <LinkIcon />;
    case 'image':
      return <ImageIcon />;
    case 'pdf':
      return <TextIcon />;
    case 'text':
      return <TextIcon />;
  }
};

export const ShareImportController = ({
  provider,
}: {
  provider: ShareInboxProvider;
}) => {
  const t = useI18n();
  const {
    entry,
    setEntry,
    item,
    page,
    setPage,
    activeSelection,
    destinations,
    isLoadingDestinations,
    isSaving,
    attachmentPreview,
    selectedWorkspace,
    selectedWorkspaceName,
    selectedWorkspaceKey,
    selectedPreviewServerConfig,
    previewOwner,
    servers,
    workspaces,
    workspacesService,
    updateSelection,
    save,
  } = useShareImport(provider);
  if (!entry) return null;

  if (entry.status === 'unsupported-version') {
    return (
      <Modal
        fullScreen
        animation="slideBottom"
        open
        withoutCloseButton
        onOpenChange={() => setEntry(undefined)}
        contentOptions={{ style: { padding: 0 } }}
      >
        <div className={styles.page}>
          <PageHeader
            suffix={
              <Button variant="plain" onClick={() => setEntry(undefined)}>
                {t['com.affine.mobile.share-import.not-now']()}
              </Button>
            }
          >
            <span className={styles.headerTitle}>
              {t['com.affine.mobile.share-import.update-required.title']()}
            </span>
          </PageHeader>
          <main className={styles.main}>
            <div className={styles.warning}>
              {t[
                'com.affine.mobile.share-import.update-required.description'
              ]()}
            </div>
          </main>
        </div>
      </Modal>
    );
  }

  if (!item) return null;

  const tagIds = activeSelection?.tagIds ?? [];
  const collectionId = activeSelection?.collectionId ?? '';

  const workspaceOptions: SelectionPageOption[] = workspaces.map(workspace => ({
    id: `${workspace.flavour}:${workspace.id}`,
    label: workspacesService.getProfile(workspace).name$.value || workspace.id,
    detail:
      workspace.flavour === 'local'
        ? t['com.affine.mobile.share-import.on-this-device']()
        : t['com.affine.workspace-card.status.cloud'](),
  }));
  const tagOptions: SelectionPageOption[] =
    destinations?.tags.map(tag => ({
      id: tag.id,
      label: tag.name,
      color: tag.color,
    })) ?? [];
  const collectionOptions: SelectionPageOption[] = [
    { id: '', label: t['com.affine.mobile.share-import.no-collection']() },
    ...(destinations?.collections.map(collection => ({
      id: collection.id,
      label: collection.name,
    })) ?? []),
  ];

  const selectedTagNames =
    destinations?.tags
      .filter(tag => tagIds.includes(tag.id))
      .map(tag => tag.name) ?? [];
  const collectionName =
    destinations?.collections.find(collection => collection.id === collectionId)
      ?.name ?? t['com.affine.mobile.share-import.none']();
  const requiresOfflineConfirmation =
    item.lastError === 'offline-confirmation-required' ||
    destinations?.verification === 'unavailable';
  const source = sourceDetails(t, item);

  const content = (() => {
    if (page === 'workspace') {
      return (
        <SelectionPage
          title={t['com.affine.settings.workspace']()}
          options={workspaceOptions}
          selectedIds={selectedWorkspaceKey ? [selectedWorkspaceKey] : []}
          onBack={() => setPage('main')}
          onSelect={id => {
            updateSelection(current =>
              current.workspaceKey === id
                ? current
                : {
                    ...current,
                    workspaceKey: id,
                    tagIds: [],
                    collectionId: '',
                  }
            );
            setEntry(current =>
              current?.status === 'ready'
                ? {
                    status: 'ready',
                    item: {
                      ...current.item,
                      lastError:
                        current.item.lastError === 'completion-failed'
                          ? 'completion-failed'
                          : undefined,
                    },
                  }
                : current
            );
            setPage('main');
          }}
        />
      );
    }
    if (page === 'tags') {
      return (
        <SelectionPage
          title={t['Tags']()}
          multiple
          options={tagOptions}
          selectedIds={tagIds}
          onBack={() => setPage('main')}
          onSelect={id =>
            updateSelection(current => ({
              ...current,
              tagIds: current.tagIds.includes(id)
                ? current.tagIds.filter(currentId => currentId !== id)
                : [...current.tagIds, id],
            }))
          }
          onConfirm={() => setPage('main')}
        />
      );
    }
    if (page === 'collection') {
      return (
        <SelectionPage
          title={t['com.affine.m.selector.type-collection']()}
          options={collectionOptions}
          selectedIds={[collectionId]}
          onBack={() => setPage('main')}
          onSelect={id => {
            updateSelection(current => ({ ...current, collectionId: id }));
            setPage('main');
          }}
        />
      );
    }
    if (page === 'offline') {
      return (
        <div className={styles.page}>
          <PageHeader back backAction={() => setPage('main')}>
            <span className={styles.headerTitle}>
              {t['com.affine.mobile.share-import.offline.title']()}
            </span>
          </PageHeader>
          <main className={styles.confirmation}>
            <h2 className={styles.confirmationTitle}>
              {selectedWorkspaceName}
            </h2>
            <p className={styles.confirmationText}>
              {t['com.affine.mobile.share-import.offline.description']()}
            </p>
          </main>
          <SafeArea bottom className={styles.footer}>
            <Button
              className={styles.action}
              variant="primary"
              disabled={isSaving}
              onClick={() => void save(true).catch(console.error)}
            >
              {isSaving
                ? t['com.affine.mobile.share-import.saving']()
                : t['com.affine.mobile.share-import.save-using-local-data']()}
            </Button>
          </SafeArea>
        </div>
      );
    }

    return (
      <div className={styles.page}>
        <PageHeader
          suffix={
            <Button variant="plain" onClick={() => setEntry(undefined)}>
              {t['com.affine.mobile.share-import.not-now']()}
            </Button>
          }
        >
          <span className={styles.headerTitle}>
            {t['com.affine.mobile.share-import.choose-destination']()}
          </span>
        </PageHeader>

        <Scrollable.Root className={styles.scrollArea}>
          <Scrollable.Scrollbar />
          <Scrollable.Viewport>
            <main className={styles.main}>
              {item.content.kind === 'url' && previewOwner ? (
                <LinkPreview
                  key={`${item.id}:${selectedWorkspace?.flavour ?? ''}:${selectedWorkspace?.id ?? ''}:${selectedPreviewServerConfig?.type ?? ''}`}
                  item={item}
                  owner={previewOwner}
                  workspace={selectedWorkspace}
                  servers={servers}
                />
              ) : (
                <section className={styles.source}>
                  <div className={styles.sourceIcon}>
                    {attachmentPreview ? (
                      <img
                        className={styles.sourceImage}
                        src={attachmentPreview}
                        alt=""
                      />
                    ) : (
                      <SourceIcon kind={item.content.kind} />
                    )}
                  </div>
                  <div className={styles.sourceContent}>
                    <div className={styles.sourceTitle}>{source.title}</div>
                    {source.detail ? (
                      <div className={styles.sourceDetail}>{source.detail}</div>
                    ) : null}
                  </div>
                </section>
              )}

              <section className={styles.destinationGroup}>
                <button
                  className={styles.destinationRow}
                  type="button"
                  onClick={() => setPage('workspace')}
                >
                  <span className={styles.rowLabel}>
                    {t['com.affine.settings.workspace']()}
                  </span>
                  <span className={styles.rowValue}>
                    {selectedWorkspaceName ??
                      t['com.affine.mobile.share-import.choose']()}
                    <span className={styles.rowArrow}>›</span>
                  </span>
                </button>

                <button
                  className={styles.destinationRow}
                  type="button"
                  disabled={!destinations || isLoadingDestinations}
                  onClick={() => setPage('tags')}
                >
                  <span className={styles.rowLabel}>
                    {t['Tags']()}{' '}
                    <span className={styles.optional}>
                      {t['com.affine.mobile.share-import.optional']()}
                    </span>
                  </span>
                  <span className={styles.rowValue}>
                    {selectedTagNames.length
                      ? t['com.affine.mobile.share-import.selected-count']({
                          count: String(selectedTagNames.length),
                        })
                      : t['com.affine.mobile.share-import.none']()}
                    <span className={styles.rowArrow}>›</span>
                  </span>
                </button>

                <button
                  className={styles.destinationRow}
                  type="button"
                  disabled={!destinations || isLoadingDestinations}
                  onClick={() => setPage('collection')}
                >
                  <span className={styles.rowLabel}>
                    {t['com.affine.m.selector.type-collection']()}{' '}
                    <span className={styles.optional}>
                      {t['com.affine.mobile.share-import.optional']()}
                    </span>
                  </span>
                  <span className={styles.rowValue}>
                    {collectionName}
                    <span className={styles.rowArrow}>›</span>
                  </span>
                </button>
              </section>

              {isLoadingDestinations ? (
                <div className={styles.status}>
                  {t['com.affine.mobile.share-import.checking-workspace']()}
                </div>
              ) : requiresOfflineConfirmation ? (
                <div className={styles.warning}>
                  {t['com.affine.mobile.share-import.offline-warning']()}
                </div>
              ) : null}

              {errorMessage(t, item.lastError) ? (
                <div className={styles.error}>
                  {errorMessage(t, item.lastError)}
                </div>
              ) : null}
            </main>
          </Scrollable.Viewport>
        </Scrollable.Root>

        <SafeArea bottom className={styles.footer}>
          <Button
            className={styles.action}
            variant="primary"
            disabled={
              !selectedWorkspace ||
              !destinations ||
              isSaving ||
              isLoadingDestinations
            }
            onClick={() => {
              if (requiresOfflineConfirmation) {
                setPage('offline');
              } else {
                void save(false).catch(console.error);
              }
            }}
          >
            {isSaving
              ? t['com.affine.mobile.share-import.saving']()
              : t['Save']()}
          </Button>
        </SafeArea>
      </div>
    );
  })();

  return (
    <Modal
      fullScreen
      animation="slideBottom"
      open
      withoutCloseButton
      onOpenChange={() => setEntry(undefined)}
      contentOptions={{ style: { padding: 0 } }}
    >
      {content}
    </Modal>
  );
};
