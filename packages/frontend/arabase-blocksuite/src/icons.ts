import { html, type TemplateResult } from 'lit';

// Paths adapted from Material Icons "format_textdirection_*" (Apache-2.0).
const PILCROW = 'M10 10v5h2V4h2v11h2V4h2V2h-8C7.79 2 6 3.79 6 6s1.79 4 4 4z';

function icon(arrow: string): TemplateResult {
  return html`<svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="${PILCROW}" />
    <path d="${arrow}" />
  </svg>`;
}

export const TextDirectionRtlIcon = icon('M8 17v-3l-4 4 4 4v-3h12v-2H8z');
export const TextDirectionLtrIcon = icon('M16 17v-3l4 4-4 4v-3H4v-2h12z');
export const TextDirectionAutoIcon = icon(
  'M7 15l-3 3 3 3v-2h10v2l3-3-3-3v2H7z'
);
