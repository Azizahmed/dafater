import {
  ConfigExtensionFactory,
  LifeCycleWatcher,
  type WidgetComponent,
} from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import {
  AFFINE_SLASH_MENU_WIDGET,
  type SlashMenuItem,
} from '@blocksuite/affine/widgets/slash-menu';
import type { Subscription } from 'rxjs';

/** Which part of a slash-menu item a string comes from. */
export type SlashMenuTextField = 'name' | 'description' | 'group' | 'caption';

/**
 * Supplied by the host to localise BlockSuite's slash menu, which has no keys
 * of its own: it receives the English source text and returns the localised
 * text, or `undefined` to keep the English. Called each time the menu opens,
 * so language switches apply without re-creating the editor.
 */
export type SlashMenuTranslate = (
  english: string,
  field: SlashMenuTextField
) => string | undefined;

type ItemTransform = (item: SlashMenuItem) => SlashMenuItem;

const GROUP_PATTERN = /^(\d+)_(.*)@(\d+)$/;

function translated(
  translate: SlashMenuTranslate,
  english: string,
  field: SlashMenuTextField
): string | undefined {
  const text = translate(english, field);
  return text && text !== english ? text : undefined;
}

/**
 * Localises one item (sub-menus are handled by the menu, which applies the
 * transform at every level). The English name stays searchable through
 * `searchAlias`, so "/heading" keeps working in any language.
 */
export function localizeSlashMenuItem(
  item: SlashMenuItem,
  translate: SlashMenuTranslate
): SlashMenuItem {
  const result = { ...item };

  const name = translated(translate, item.name, 'name');
  if (name) {
    result.name = name;
    const aliases = item.searchAlias ?? [];
    result.searchAlias = aliases.includes(item.name)
      ? aliases
      : [...aliases, item.name];
  }

  if (item.description) {
    const description = translated(translate, item.description, 'description');
    if (description) result.description = description;
  }

  const match = item.group?.match(GROUP_PATTERN);
  if (match) {
    const [, index, label, order] = match;
    const group = translated(translate, label, 'group');
    // `_` and `@` delimit the group string; such a label cannot be encoded.
    if (group && !/[_@]/.test(group)) {
      result.group = `${index}_${group}@${order}` as SlashMenuItem['group'];
    }
  }

  if ('tooltip' in result && result.tooltip) {
    const caption = translated(translate, result.tooltip.caption, 'caption');
    if (caption) result.tooltip = { ...result.tooltip, caption };
  }

  return result;
}

interface TransformableWidget {
  configItemTransform: ItemTransform;
}

function isTransformable(
  view: WidgetComponent
): view is WidgetComponent & TransformableWidget {
  return (
    typeof (view as Partial<TransformableWidget>).configItemTransform ===
    'function'
  );
}

/** The translator used by {@link SlashMenuLocalizer}, provided through DI. */
export const SlashMenuLocalizerConfig = ConfigExtensionFactory<{
  translate: SlashMenuTranslate;
}>('arabase-slash-menu-i18n');

/**
 * Installs {@link localizeSlashMenuItem} on the slash-menu widget through its
 * public `configItemTransform` hook, whenever the widget is (re)created.
 * A top-level named class: BlockSuite's DI identifies classes by name.
 */
export class SlashMenuLocalizer extends LifeCycleWatcher {
  static override readonly key = 'arabase-slash-menu-i18n';

  private readonly _installed = new WeakSet<WidgetComponent>();

  private _subscription: Subscription | null = null;

  private readonly _install = (view: WidgetComponent) => {
    if (view.widgetId !== AFFINE_SLASH_MENU_WIDGET) return;
    if (!isTransformable(view) || this._installed.has(view)) return;
    const translate = this.std.getOptional(
      SlashMenuLocalizerConfig.identifier
    )?.translate;
    if (!translate) return;
    this._installed.add(view);
    const previous = view.configItemTransform;
    view.configItemTransform = item =>
      localizeSlashMenuItem(previous(item), translate);
  };

  override mounted() {
    super.mounted();
    this._subscription = this.std.view.viewUpdated.subscribe(payload => {
      if (payload.type === 'widget' && payload.method === 'add') {
        this._install(payload.view);
      }
    });
    const rootId = this.std.store.root?.id;
    const existing =
      rootId && this.std.view.getWidget(AFFINE_SLASH_MENU_WIDGET, rootId);
    if (existing) this._install(existing);
  }

  override unmounted() {
    super.unmounted();
    this._subscription?.unsubscribe();
    this._subscription = null;
  }
}

/** The localizer together with its translator. */
export function SlashMenuLocalizerExtension(
  translate: SlashMenuTranslate
): ExtensionType[] {
  return [SlashMenuLocalizerConfig({ translate }), SlashMenuLocalizer];
}
