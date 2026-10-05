import { notify } from '@affine/component';
import { DebugLogger } from '@affine/debug';
import {
  getOrCreateI18n,
  i18nCompletenesses,
  type Language,
  SUPPORTED_LANGUAGES,
} from '@affine/i18n';
import { effect, Entity, fromPromise, LiveData } from '@toeverything/infra';
import { catchError, EMPTY, exhaustMap } from 'rxjs';

import { arabase, setLocalizedCssVariables } from '../../arabase';
import type { GlobalCache } from '../../storage';

export type LanguageInfo = {
  key: Language;
  name: string;
  originalName: string;
  completeness: number;
};

const logger = new DebugLogger('i18n');

function mapLanguageInfo(
  language: Language = arabase.defaultLocale as Language
): LanguageInfo {
  const languageInfo = SUPPORTED_LANGUAGES[language];

  return {
    key: language,
    name: languageInfo.name,
    originalName: languageInfo.originalName,
    completeness: i18nCompletenesses[language],
  };
}

export class I18n extends Entity {
  private readonly i18n = getOrCreateI18n();

  get i18next() {
    return this.i18n;
  }

  readonly currentLanguageKey$ = LiveData.from(
    this.cache.watch<Language>('i18n_lng'),
    undefined
  );

  readonly currentLanguage$ = this.currentLanguageKey$
    .distinctUntilChanged()
    .map(mapLanguageInfo);

  readonly languageList: Array<LanguageInfo> =
    // @ts-expect-error same key indexing
    Object.keys(SUPPORTED_LANGUAGES).map(mapLanguageInfo);

  private initialized = false;

  constructor(private readonly cache: GlobalCache) {
    super();
    this.i18n.on('languageChanged', (language: Language) => {
      this.applyLanguage(language);
    });
  }

  /**
   * Applies the stored (or default) language. Idempotent, and must run
   * before the first render: bundled languages switch synchronously, so the
   * first frame already has the right strings, `lang` and `dir`.
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    arabase.installStyles();
    const language = arabase.resolveInitialLocale(
      this.cache.get<Language>('i18n_lng')
    ) as Language;
    if (this.i18n.language === language) {
      this.applyLanguage(language);
    } else {
      this.changeLanguage(language);
    }
  }

  private applyLanguage(language: Language) {
    arabase.setLocale(language);
    setLocalizedCssVariables({
      '--affine-doc-title-placeholder': this.i18n.t('Title'),
    });
    if (this.cache.get('i18n_lng') !== language) {
      this.cache.set('i18n_lng', language);
    }
  }

  changeLanguage = effect(
    exhaustMap((language: string) =>
      fromPromise(() => this.i18n.changeLanguage(language)).pipe(
        catchError(error => {
          notify({
            theme: 'error',
            title: this.i18n.t('com.affine.i18n.change-language-failed.title'),
            message: this.i18n.t(
              'com.affine.i18n.change-language-failed.message'
            ),
          });

          logger.error('Failed to change language', error);

          return EMPTY;
        })
      )
    )
  );
}
