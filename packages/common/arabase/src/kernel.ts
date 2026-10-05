import type { DirectionStrategy } from './bidi';
import {
  applyDocumentLocale,
  createBootScript,
  LOCALE_HINT_KEY,
  readLocaleHint,
  writeLocaleHint,
} from './boot';
import { baseLanguage, localeDirection, type TextDirection } from './direction';
import { matchLocale, resolveLocale } from './locale';

export interface ArabaseLocaleInfo {
  dir?: TextDirection;
  /**
   * Font stack for the locale's script. Hosts append it *after* their Latin
   * fonts so Latin glyphs are unchanged and only this script falls through.
   */
  fontFamily?: string;
  /** Bidi strategy for user content written while this locale is active. */
  directionStrategy?: DirectionStrategy;
}

/**
 * A unit of product behaviour plugged into the kernel. Modules are plain
 * objects so they can be shared between projects and composed freely.
 */
export interface ArabaseModule {
  /** Unique, stable id (`arabic`, `hijri-calendar`, …). */
  readonly id: string;
  /** Per-locale metadata, keyed by locale or base language (`ar`). */
  readonly locales?: Readonly<Record<string, ArabaseLocaleInfo>>;
  /**
   * Global CSS installed once by `installStyles()`. It must be scoped (for
   * example with `:dir(rtl)` or `:lang(ar)`) so other locales are untouched.
   */
  readonly styles?: string;
  /** Called once by `createArabase()`; may return a disposer. */
  setup?(arabase: Arabase): void | (() => void);
}

export interface ArabaseOptions {
  /** Locale for fresh installs. */
  defaultLocale: string;
  supportedLocales: readonly string[];
  modules?: readonly ArabaseModule[];
  /** localStorage key of the pre-paint locale hint. */
  storageKey?: string;
}

type LocaleListener = (locale: string, dir: TextDirection) => void;

export class Arabase {
  readonly defaultLocale: string;
  readonly supportedLocales: readonly string[];
  readonly modules: readonly ArabaseModule[];
  readonly storageKey: string;

  private _locale: string;
  private readonly _listeners = new Set<LocaleListener>();
  private readonly _disposers: (() => void)[] = [];

  constructor(options: ArabaseOptions) {
    this.supportedLocales = options.supportedLocales;
    this.defaultLocale =
      matchLocale(options.defaultLocale, options.supportedLocales) ??
      options.defaultLocale;
    this.modules = options.modules ?? [];
    this.storageKey = options.storageKey ?? LOCALE_HINT_KEY;
    this._locale = this.defaultLocale;

    const ids = new Set<string>();
    for (const module of this.modules) {
      if (ids.has(module.id)) {
        throw new Error(`arabase: duplicated module "${module.id}"`);
      }
      ids.add(module.id);
    }
  }

  get locale(): string {
    return this._locale;
  }

  get dir(): TextDirection {
    return this.directionOf(this._locale);
  }

  getModule(id: string): ArabaseModule | undefined {
    return this.modules.find(module => module.id === id);
  }

  /** Metadata for a locale merged from all modules (exact key beats base). */
  localeInfo(locale: string): ArabaseLocaleInfo {
    const base = baseLanguage(locale);
    const info: ArabaseLocaleInfo = {};
    for (const module of this.modules) {
      Object.assign(info, module.locales?.[base], module.locales?.[locale]);
    }
    return info;
  }

  directionOf(locale: string): TextDirection {
    return this.localeInfo(locale).dir ?? localeDirection(locale);
  }

  /**
   * Locale to render with on startup: the host's stored choice, then the
   * pre-paint hint, then the product default.
   */
  resolveInitialLocale(stored?: string | null): string {
    return resolveLocale(
      [stored, readLocaleHint(this.supportedLocales, this.storageKey)],
      {
        supportedLocales: this.supportedLocales,
        defaultLocale: this.defaultLocale,
      }
    );
  }

  /**
   * Makes `locale` the active locale: updates `<html lang dir>`, persists the
   * pre-paint hint and notifies listeners. No-op when nothing changes.
   */
  setLocale(locale: string): void {
    const resolved = matchLocale(locale, this.supportedLocales) ?? locale;
    const dir = this.directionOf(resolved);
    applyDocumentLocale(resolved, dir);
    writeLocaleHint(resolved, this.storageKey);
    if (resolved === this._locale) return;
    this._locale = resolved;
    for (const listener of this._listeners) listener(resolved, dir);
  }

  /** Bound, so it can be passed around (e.g. to `useSyncExternalStore`). */
  readonly subscribe = (listener: LocaleListener): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /** Inline `<head>` script restoring the stored locale before first paint. */
  bootScript(): string {
    return createBootScript({
      defaultLocale: this.defaultLocale,
      supportedLocales: this.supportedLocales,
      storageKey: this.storageKey,
      directionOf: locale => this.directionOf(locale),
    });
  }

  /** Installs every module stylesheet once (idempotent). */
  installStyles(doc: Document = document): void {
    for (const module of this.modules) {
      if (!module.styles) continue;
      const selector = `style[data-arabase-module="${module.id}"]`;
      if (doc.head.querySelector(selector)) continue;
      const style = doc.createElement('style');
      style.dataset.arabaseModule = module.id;
      style.textContent = module.styles;
      doc.head.append(style);
    }
  }

  /** @internal */
  _setup(): this {
    for (const module of this.modules) {
      const dispose = module.setup?.(this);
      if (dispose) this._disposers.push(dispose);
    }
    return this;
  }

  dispose(): void {
    this._disposers.splice(0).forEach(dispose => dispose());
    this._listeners.clear();
  }
}

export function createArabase(options: ArabaseOptions): Arabase {
  return new Arabase(options)._setup();
}
