// the following import is used to ensure the block suite editor effects are run
import '../blocksuite/block-suite-editor';

import { DebugLogger } from '@affine/debug';
import { I18n } from '@affine/i18n';
import onboardingArUrl from '@affine/templates/onboarding.ar.zip';
import onboardingUrl from '@affine/templates/onboarding.zip';
import { ZipTransformer } from '@blocksuite/affine/widgets/linked-doc';

import { DocsService } from '../modules/doc';
import { OrganizeService } from '../modules/organize';
import {
  getAFFiNEWorkspaceSchema,
  type WorkspacesService,
} from '../modules/workspace';

/** Doc ids in `onboarding.zip` and its translations. */
const SHOWCASE_DOC_IDS = {
  gettingStarted: 'F-TNy6Tt3t',
  folderTutorial: 'kV_wO0ALWs',
};

/**
 * Doc titles in `onboarding.zip` and its translations. The import assigns
 * new ids (`replaceIdMiddleware`), so the docs are found by title.
 */
const SHOWCASE_DOC_TITLES = {
  gettingStarted: ['Getting Started', 'دليل البدء'],
  folderTutorial: ['How to use folder and Tags', 'كيفية استخدام المجلدات'],
};

export async function buildShowcaseWorkspace(
  workspacesService: WorkspacesService,
  flavour: string,
  workspaceName: string
) {
  const meta = await workspacesService.create(flavour, async docCollection => {
    docCollection.meta.initialize();
    docCollection.doc.getMap('meta').set('name', workspaceName);
    // The showcase docs are user data once created: use the active language.
    const url = I18n.language === 'ar' ? onboardingArUrl : onboardingUrl;
    const blob = await (await fetch(url)).blob();

    await ZipTransformer.importDocs(
      docCollection,
      getAFFiNEWorkspaceSchema(),
      blob
    );
  });

  const { workspace, dispose } = workspacesService.open({ metadata: meta });

  await workspace.engine.doc.waitForDocReady(workspace.id);

  const docsService = workspace.scope.get(DocsService);

  // should jump to "Getting Started" (same doc ids in every language)
  const defaultDoc = docsService.list.docs$.value.find(
    p =>
      p.id === SHOWCASE_DOC_IDS.gettingStarted ||
      SHOWCASE_DOC_TITLES.gettingStarted.some(t => p.title$.value.startsWith(t))
  );
  const folderTutorialDoc = docsService.list.docs$.value.find(
    p =>
      p.id === SHOWCASE_DOC_IDS.folderTutorial ||
      SHOWCASE_DOC_TITLES.folderTutorial.some(t => p.title$.value.startsWith(t))
  );

  // create default organize
  if (folderTutorialDoc) {
    const organizeService = workspace.scope.get(OrganizeService);
    const folderId = organizeService.folderTree.rootFolder.createFolder(
      I18n['com.affine.workspace.showcase.first-folder'](),
      organizeService.folderTree.rootFolder.indexAt('after')
    );
    const firstFolderNode =
      organizeService.folderTree.folderNode$(folderId).value;
    firstFolderNode?.createLink(
      'doc',
      folderTutorialDoc.id,
      firstFolderNode.indexAt('after')
    );
  }

  dispose();

  return { meta, defaultDocId: defaultDoc?.id };
}

const logger = new DebugLogger('createFirstAppData');

let firstAppDataPromise:
  | Promise<Awaited<ReturnType<typeof buildShowcaseWorkspace>>>
  | undefined;

export function createFirstAppData(workspacesService: WorkspacesService) {
  if (workspacesService.list.workspaces$.value.length > 0) {
    return;
  }

  if (
    !BUILD_CONFIG.isMobileEdition &&
    localStorage.getItem('is-first-open') !== null
  ) {
    return;
  }

  firstAppDataPromise ??= buildShowcaseWorkspace(
    workspacesService,
    'local',
    // Created in the active language; it is user data afterwards.
    I18n['com.affine.workspace.showcase.name']()
  ).finally(() => {
    firstAppDataPromise = undefined;
  });

  return firstAppDataPromise.then(({ meta, defaultDocId }) => {
    localStorage.setItem('is-first-open', 'false');
    logger.info('create first workspace', defaultDocId);
    return { meta, defaultPageId: defaultDocId };
  });
}
