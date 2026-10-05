import path from 'node:path';

import { app } from 'electron';

import { PersistentJSONFileStorage } from './json-file';

export const globalStateStorage = new PersistentJSONFileStorage(
  path.join(app.getPath('userData'), 'global-state.json')
);

export const globalCacheStorage = new PersistentJSONFileStorage(
  path.join(app.getPath('userData'), 'global-cache.json')
);

// Fresh profiles start in the product's default language (Arabic). E2E
// suites that assert English UI strings start the app with
// AFFINE_E2E_LANGUAGE=en (see tests/kit electron fixture).
const e2eLanguage = process.env.AFFINE_E2E_LANGUAGE;
if (e2eLanguage && !globalCacheStorage.get('i18n_lng')) {
  globalCacheStorage.set('i18n_lng', e2eLanguage);
}
