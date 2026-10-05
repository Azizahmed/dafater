import type { CSSProperties, SVGAttributes } from 'react';
import { useId } from 'react';

export interface DafaterLogoProps extends Omit<
  SVGAttributes<SVGSVGElement>,
  'width' | 'height'
> {
  /** Width and height. Numbers are px; defaults to `1em` so it follows font-size like an icon. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /**
   * `color` (default): teal gradient rounded square with the white notebook glyph.
   * `mono`: only the notebook + «د» glyph painted with `currentColor`.
   */
  variant?: 'color' | 'mono';
}

/** Dafater (دفاتر) logo: the Arabic letter «د» on a notebook with a right-side spine. */
export const DafaterLogo = ({
  size = '1em',
  className,
  style,
  variant = 'color',
  ...rest
}: DafaterLogoProps) => {
  const gradientId = `dafater-g-${useId().replace(/:/g, '')}`;
  const mono = variant === 'mono';
  const ink = mono ? 'currentColor' : '#fff';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={mono ? '18 14 60 68' : '0 0 96 96'}
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
    >
      {mono ? null : (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#16B3A0" />
              <stop offset="1" stopColor="#0E5A70" />
            </linearGradient>
          </defs>
          <rect width="96" height="96" rx="22" fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d="M24 20h40a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H24z"
        fill={ink}
        opacity={mono ? 0.2 : 0.16}
      />
      <path
        d="M64 20v56"
        stroke={ink}
        strokeWidth="3"
        opacity={mono ? 0.6 : 0.35}
      />
      <path
        d="M38 30c7 3 16 11 16 21c0 6-3 9-9 9H31"
        fill="none"
        stroke={ink}
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
