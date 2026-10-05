import { EditorChevronDown } from '@blocksuite/affine/components/toolbar';
import type { ToolbarActionGenerator } from '@blocksuite/affine/shared/services';
import {
  type SlashMenuActionItem,
  SlashMenuConfigExtension,
} from '@blocksuite/affine/widgets/slash-menu';
import { html, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import {
  getDirectionTargets,
  getExplicitDirection,
  setTextDirectionCommand,
  supportsTextDirection,
  type TextDirectionChoice,
} from './commands';
import {
  TextDirectionAutoIcon,
  TextDirectionLtrIcon,
  TextDirectionRtlIcon,
} from './icons';
import type { ArabaseEditorLabel, ArabaseTranslate } from './labels';

interface DirectionOption {
  value: TextDirectionChoice;
  label: ArabaseEditorLabel;
  description: ArabaseEditorLabel;
  icon: TemplateResult;
  searchAlias: string[];
}

const DIRECTION_OPTIONS: DirectionOption[] = [
  {
    value: null,
    label: 'direction.auto',
    description: 'direction.auto.description',
    icon: TextDirectionAutoIcon,
    searchAlias: ['auto', 'direction', 'تلقائي', 'اتجاه'],
  },
  {
    value: 'rtl',
    label: 'direction.rtl',
    description: 'direction.rtl.description',
    icon: TextDirectionRtlIcon,
    searchAlias: ['rtl', 'right', 'arabic', 'يمين', 'عربي', 'اتجاه'],
  },
  {
    value: 'ltr',
    label: 'direction.ltr',
    description: 'direction.ltr.description',
    icon: TextDirectionLtrIcon,
    searchAlias: ['ltr', 'left', 'english', 'يسار', 'إنجليزي', 'اتجاه'],
  },
];

/**
 * Format-toolbar dropdown (next to "Align") to pick the writing direction of
 * the selected blocks. Exposed as a plain action so the host decides which
 * toolbar module it joins.
 */
export function createTextDirectionToolbarAction(
  t: ArabaseTranslate
): ToolbarActionGenerator {
  return {
    id: 'b.align-direction',
    when: ({ std }) => getDirectionTargets(std).length > 0,
    generate({ std, chain }) {
      const targets = getDirectionTargets(std);
      if (!targets.length) return null;
      const current = getExplicitDirection(targets);
      const active =
        DIRECTION_OPTIONS.find(option => option.value === current) ??
        DIRECTION_OPTIONS[0];
      const update = (textDirection: TextDirectionChoice) => {
        chain
          .pipe(setTextDirectionCommand, {
            textDirection,
            selectedModels: targets,
          })
          .run();
      };
      const title = t('direction.title');

      return {
        content: html`
          <editor-menu-button
            .contentPadding=${'8px'}
            .button=${html`
              <editor-icon-button aria-label=${title} .tooltip=${title}>
                ${active.icon} ${EditorChevronDown}
              </editor-icon-button>
            `}
          >
            <div data-size="large" data-orientation="vertical">
              ${repeat(
                DIRECTION_OPTIONS,
                option => option.label,
                option => html`
                  <editor-menu-action
                    aria-label=${t(option.label)}
                    ?data-selected=${option.value === current}
                    @click=${() => update(option.value)}
                  >
                    ${option.icon}<span class="label">${t(option.label)}</span>
                  </editor-menu-action>
                `
              )}
            </div>
          </editor-menu-button>
        `,
      };
    },
  };
}

/** Slash-menu items ("/rtl", "/يمين"…) placed after the alignment items. */
export function TextDirectionSlashMenuExtension(t: ArabaseTranslate) {
  return SlashMenuConfigExtension('arabase-text-direction', {
    items: () =>
      DIRECTION_OPTIONS.map((option, index): SlashMenuActionItem => ({
        name: t(option.label),
        description: t(option.description),
        icon: option.icon,
        group: `2_Align@${10 + index}`,
        searchAlias: option.searchAlias,
        when: ({ model }) => supportsTextDirection(model),
        action: ({ std, model }) => {
          std.command.exec(setTextDirectionCommand, {
            textDirection: option.value,
            selectedModels: [model],
          });
        },
      })),
  });
}
