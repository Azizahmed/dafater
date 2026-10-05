# arabase

> طبقة مشتركة تجعل العربية (واتجاه RTL) تجربة أصيلة في منتجاتنا: «دفاتر» أولًا، ثم أي مشروع لاحق.

arabase is the shared layer that makes Arabic — and right-to-left writing in
general — a first-class experience. Dafater is its first host; the packages are
written to be reused by other products.

## Packages

| Package               | Path                                   | Depends on                  | Purpose                                                                                                                                                                                |
| --------------------- | -------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@arabase/core`       | `packages/common/arabase`              | nothing                     | Kernel: module system, locale ↔ direction, bidi detection, pre-paint boot script. Framework-agnostic (DOM only).                                                                       |
| `@arabase/blocksuite` | `packages/frontend/arabase-blocksuite` | `@arabase/core`, BlockSuite | Editor adapter: per-block writing direction, direction commands, toolbar/slash-menu entries, shortcut, editor bidi CSS, Arabic catalogs of BlockSuite's UI, bidi-aware HTML clipboard. |

Product decisions (default language, theme fonts, labels) stay in the host
app — for Dafater in `packages/frontend/core/src/modules/arabase`.

```
┌──────────────────────────── Dafater (host app) ────────────────────────────┐
│ modules/arabase   → createArabase({ defaultLocale, modules: [arabic(), …] })│
│ modules/i18n      → arabase.resolveInitialLocale() / arabase.setLocale()    │
│ manager/view.ts   → ArabaseEditorViewExtension (+ translate options)        │
│ tools/cli html    → <html lang dir> + arabase boot script                   │
└──────────────┬──────────────────────────────────────────┬──────────────────┘
               │                                          │
      @arabase/core (kernel)                    @arabase/blocksuite (editor)
      modules · bidi · boot                     watcher · commands · UI · CSS
```

## Kernel (`@arabase/core`)

```ts
import { createArabase } from '@arabase/core';
import { arabicModule } from '@arabase/core/arabic';

export const arabase = createArabase({
  defaultLocale: 'ar',
  supportedLocales: ['ar', 'en', 'fr'],
  modules: [arabicModule()],
});

arabase.resolveInitialLocale(storedChoice); // stored → hint → default
arabase.setLocale('en'); // <html lang dir>, hint, listeners (no-op if same)
arabase.subscribe((locale, dir) => {}); // bound, usable with useSyncExternalStore
arabase.installStyles(); // module stylesheets, once
arabase.bootScript(); // inline <head> script
```

### Modules

A module is a plain object — add one to extend the product without touching
the kernel:

```ts
const hijriCalendar: ArabaseModule = {
  id: 'hijri-calendar',
  locales: { ar: { numberingSystem: 'arab' } }, // metadata merged per locale
  styles: ':root{--calendar-start-day:6}', // scoped global CSS
  setup(arabase) {
    // runs once in createArabase(); may return a disposer
    return arabase.subscribe(locale => {});
  },
};
```

The built-in `arabicModule()` declares Arabic as RTL, sets the bidi strategy
for user content (`rtl-priority`) and exposes Arabic font stacks
(`--arabase-arabic-font`, `--arabase-arabic-serif-font`). System fonts come
first (no download, no swap layout shift where they exist); the bundled
Noto Sans Arabic (`@arabase/core/arabic/fonts.css`, Arabic subset, 166 KB,
OFL) is the last resort and is only fetched on systems without any of them.

### First paint

1. Static HTML is rendered with the product default (`<html lang="ar" dir="rtl">`),
   so a fresh install is correct before any script runs.
2. `createBootScript()` returns a ~500-byte inline script for `<head>` that
   restores the user's choice from the `arabase:locale` hint before `<body>`
   exists. `legacySources` lets a host read where older versions stored the
   language (Dafater: the app's GlobalCache on web, the preload's shared
   storage on desktop), so the first start after an update is right too.
3. The app resolves the language synchronously before its first render
   (bundled default language, `initAsync: false`), so the first committed
   frame already has the right strings.

### Direction of user content

`detectTextDirection(text, strategy)`:

- `rtl-priority` (default for Arabic): any strong RTL letter ⇒ RTL; else any
  letter ⇒ LTR; else `null` (inherit). An Arabic sentence that _starts_ with
  a Latin term (“API endpoint يرجع JSON”) stays RTL.
- `first-strong`: the Unicode P2/P3 rule, same as `dir="auto"`.

Arabic-Indic digits, marks and punctuation never decide a direction.

## Editor adapter (`@arabase/blocksuite`)

Register one view extension and configure it:

```ts
manager.configure(ArabaseEditorViewExtension, {
  translate, // labels for the direction UI (called at render time)
  translateSlashMenu, // optional: localise BlockSuite's slash-menu texts
  strategy: 'rtl-priority',
  shortcuts: true, // Ctrl + Right/Left Shift
});
```

What it does:

- **Per-block direction** — a lifecycle watcher binds every paragraph/list
  block in `connectedCallback` (before first paint): `dir` = explicit choice
  (`textDirection` prop) → content → inherited (empty blocks follow their
  parent / the UI). Local and remote (collaborative) edits are tracked through
  Y.Text events; insert-only edits are classified from the inserted text only.
- **Always LTR** — code and LaTeX blocks.
- **Manual control** — toolbar dropdown (`createTextDirectionToolbarAction`),
  slash-menu items (`/rtl`, `/ltr`, `/يمين` …), Ctrl + Right Shift / Ctrl + Left
  Shift (Word / Google Docs convention). Choices are stored with the content,
  copied with it, synced and undoable; “Automatic” clears them.
- **Bidi CSS** — inline code and links are isolated, table cells follow their
  own content, Arabic headings drop Latin letter-spacing.
- **Tables and databases** — their direction follows all of their text
  (`bindContentDirection`, `CONTENT_DIRECTION_SOURCES`); an explicit
  `textDirection` prop wins, empty ones inherit the UI direction.
- **Strategy follows the UI language** — `editorDirectionStrategy$`:
  `rtl-priority` while Arabic is active, `first-strong` otherwise.
- **Copy out** — `BidiHtmlClipboardExtension` adds `dir` to every paragraph,
  list item, heading and table of the copied HTML (code stays LTR), so text
  pasted into Word, Google Docs or Gmail keeps its direction.
- `bindTextDirection(element, { text$ })` for other surfaces (Dafater uses it
  for the document title).

### Translating BlockSuite's UI

BlockSuite has no i18n layer of its own. arabase adds one tiny engine hook,
`t()` in `@blocksuite/global/i18n`: the **English text is the key**, so
anything without a translation stays English and the engine code reads the
same as before (`t('Bold')`, `t('Delete {count} rows', { count })`).

- Catalogs: `packages/frontend/arabase-blocksuite/src/locales/ar/*.json`,
  one file per editor area, plus `GLOSSARY.md` (one Arabic term per concept,
  shared with `@affine/i18n`).
- `editorLocaleModule()` (an arabase module) installs the catalog of the
  active language and the direction strategy; components that render through
  `SignalWatcher` update immediately on a language switch.
- Hosts add catalogs for their own editor plugins with
  `registerEditorCatalog(locale, name, entries)` (Dafater:
  `packages/frontend/core/src/modules/arabase/locales/ar.json`).
- `t()` must run at render time, never at module load, and never on user
  content. Defaults that become data (column names, view names…) are created
  in the active language.
- Tests fail on any `t('…')` literal without an Arabic entry, on placeholder
  mismatches and on conflicting translations across catalog files.
  `missingEditorTranslations()` lists strings displayed untranslated at
  runtime.

## Dafater integration points

| Concern                           | File                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Product default language          | `tools/utils/src/build-config.ts` (`BUILD_CONFIG.defaultLanguage`)                           |
| Offered languages (ar, en)        | `packages/frontend/i18n/src/resources/index.ts`, `locale-config.ts`                          |
| Editor UI catalogs                | `@arabase/blocksuite/locales` + `modules/arabase/locales/ar.json` (Dafater plugins)          |
| Arabic onboarding content         | `packages/frontend/templates/onboarding/onboarding.ar.zip`                                   |
| arabase instance                  | `packages/frontend/core/src/modules/arabase/index.ts`                                        |
| Product font (Thmanyah default)   | `packages/frontend/core/src/modules/arabase/fonts/` (`setFont`, Settings → Appearance)       |
| Language boot / switching         | `packages/frontend/core/src/modules/i18n/{entities/i18n.ts,context.tsx}`                     |
| Radix direction (menus, scroll)   | `packages/frontend/core/src/modules/i18n/context.tsx`                                        |
| Editor extension + labels         | `packages/frontend/core/src/blocksuite/manager/view.ts`, `modules/arabase/editor.ts`         |
| Toolbar placement                 | `packages/frontend/core/src/blocksuite/view-extensions/editor-config/toolbar/index.ts`       |
| Initial HTML (web/desktop/mobile) | `tools/cli/src/rspack-shared/{template.html,html-plugin.ts}`                                 |
| Server-rendered pages             | `packages/backend/server/src/core/doc-renderer/controller.ts` (reads `assets-manifest.json`) |
| UI helpers                        | `@affine/component` → `mirrorInRtl`, `userText` (`src/styles/direction.css.ts`)              |

## Engine (BlockSuite) changes

Kept minimal, behaviour-identical for LTR documents, and upstreamable. Review
these when merging upstream AFFiNE:

| File                                                                                                    | Change                                                                      |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `affine/model/src/consts/text.ts`, `blocks/{paragraph,list}/*-model.ts`                                 | Optional `textDirection` prop (like `textAlign`).                           |
| `affine/blocks/paragraph/src/{styles,paragraph-block,heading-icon}.ts`                                  | Logical properties (quote bar, placeholder, children indent, heading icon). |
| `affine/blocks/list/src/{styles,list-block}.ts`, `blocks/divider`, `blocks/callout`                     | Logical properties.                                                         |
| `affine/components/src/toggle-button/toggle-button.ts`                                                  | Logical position; chevron mirrors in RTL.                                   |
| `affine/fragments/doc-title/src/doc-title.ts`                                                           | Placeholder from `--affine-doc-title-placeholder`.                          |
| `framework/std/src/inline/services/event.ts`                                                            | Arrow keys around inline embeds move visually in RTL.                       |
| `affine/widgets/drag-handle/**`, `affine/shared/src/utils/{dnd/calc-drop-target,dom/point-to-block}.ts` | Drag handle, hover area and drop targets mirrored for RTL blocks.           |
| `affine/widgets/slash-menu/src/utils.ts`                                                                | Item transform also applies to sub-menus.                                   |
| `framework/global/src/i18n` (+ `affine/all` re-export)                                                  | `t()` / `setTranslator()`: the translation hook, identity when unset.       |
| `affine/model/src/blocks/{table,database}/*-model.ts`                                                   | Optional `textDirection` prop.                                              |
| Engine UI strings across `affine/**`                                                                    | Wrapped in `t('English')` at render time.                                   |

## Gotchas

- **`@radix-ui/react-direction` is pinned to the exact version the Radix
  primitives use** (`1.1.1` in `@affine/core` and `@affine/component`). The
  `DirectionProvider` context only works when every primitive shares one copy;
  a `^` range resolved to a newer copy and silently turned every Radix menu and
  scroll area back to LTR. Bump it together with the Radix packages.
- **BlockSuite extensions must be top-level named classes.** Its DI identifies
  classes by `constructor.name`; anonymous class expressions returned from
  factories lose their name after minification and the editor fails to start
  in production builds only. Pass options through `ConfigExtensionFactory`.
- **Localised CSS strings** (e.g. the title placeholder) live in a dedicated
  `<style>`; the root element's inline style is rewritten by other features.

## Tests

```sh
yarn vitest --run packages/common/arabase packages/frontend/arabase-blocksuite packages/frontend/i18n
yarn workspace @affine-test/affine-local playwright test e2e/arabase-rtl.spec.ts
```

The other E2E suites assert English UI strings; the shared test kit pins
English through the `arabase:locale` hint unless a test opts into Arabic.
