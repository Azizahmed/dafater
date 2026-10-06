import type { SVGProps } from 'react';

/** Small line icons missing from @blocksuite/icons (Notion-style toolbar). */
const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const LightbulbIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M7.5 14.5h5M8.25 17h3.5" />
    <path d="M10 2.75a5 5 0 0 0-3.1 8.93c.55.43.85 1.05.85 1.7v.12h4.5v-.12c0-.65.3-1.27.85-1.7A5 5 0 0 0 10 2.75Z" />
  </svg>
);

export const SlidersIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M3 6h7M14 6h3M3 14h3M10 14h7" />
    <circle cx="12" cy="6" r="2" />
    <circle cx="8" cy="14" r="2" />
  </svg>
);

export const ThumbUpIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M6.5 8.5 9.4 3.3c.2-.36.6-.55 1-.47.9.18 1.45 1.08 1.2 1.96l-.8 2.71h4.07c.98 0 1.7.92 1.46 1.87l-1.33 5.3a2 2 0 0 1-1.94 1.52H6.5" />
    <path d="M3.5 8.5h3v7.7h-3z" />
  </svg>
);

export const ThumbDownIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props} style={{ transform: 'scaleY(-1)', ...props.style }}>
    <path d="M6.5 8.5 9.4 3.3c.2-.36.6-.55 1-.47.9.18 1.45 1.08 1.2 1.96l-.8 2.71h4.07c.98 0 1.7.92 1.46 1.87l-1.33 5.3a2 2 0 0 1-1.94 1.52H6.5" />
    <path d="M3.5 8.5h3v7.7h-3z" />
  </svg>
);

export const SpeakerIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <path d="M3.5 8v4h3l4 3.5v-11l-4 3.5h-3Z" />
    <path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.4 6.4 0 0 1 0 9" />
  </svg>
);

export const AddPersonIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    <circle cx="8" cy="6.5" r="3" />
    <path d="M2.75 16.5c.6-2.9 2.6-4.5 5.25-4.5 1.2 0 2.27.33 3.12.97" />
    <path d="M15 11v5.5M12.25 13.75h5.5" />
  </svg>
);
