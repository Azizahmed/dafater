/**
 * Product locale configuration. Free of translation resources so it is cheap
 * to import early during startup.
 */
import type { Language } from './resources';

/**
 * Language of fresh installs. Product setting from `BUILD_CONFIG` (Dafater is
 * Arabic-first), shared with the build tools that render the initial HTML.
 */
export const DEFAULT_LANGUAGE = BUILD_CONFIG.defaultLanguage as Language;

/** Every key of `SUPPORTED_LANGUAGES` (kept in sync by a unit test). */
export const LANGUAGE_CODES = [
  'ar',
  'en',
] as const satisfies readonly Language[];
