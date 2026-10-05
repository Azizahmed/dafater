import ar from './ar.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };

/**
 * Languages offered by Dafater: Arabic (default) and English.
 *
 * The other translation files in this folder are kept (they are maintained
 * upstream) but are neither bundled nor offered. To bring one back, add it
 * here as a lazy resource and to `LANGUAGE_CODES` in `../locale-config.ts`.
 */
export type Language = 'ar' | 'en';

export type LanguageResource = typeof en;
export const SUPPORTED_LANGUAGES: Record<
  Language,
  {
    name: string;
    originalName: string;
    flagEmoji: string;
    rtl?: boolean;
    resource:
      | Partial<LanguageResource>
      | (() => Promise<{ default: Partial<LanguageResource> }>);
  }
> = {
  ar: {
    name: 'Arabic',
    originalName: 'العربية',
    flagEmoji: '🇸🇦',
    rtl: true,
    // Bundled like English: Arabic is the default language (see
    // locale-config.ts), so it must be available for the first render.
    resource: ar,
  },
  en: {
    name: 'English',
    originalName: 'English',
    flagEmoji: '🇬🇧',
    resource: en,
  },
};
