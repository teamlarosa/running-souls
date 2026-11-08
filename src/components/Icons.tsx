/**
 * Icons.tsx — inline SVG, stroke-based, currentColor.
 * Kept local so the app has no icon dependency.
 */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const Svg = ({ size = 20, children, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a7 7 0 0 1 16 0v1" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const IconBolt = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />
  </Svg>
);

export const IconWaves = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 8c1.5-1.5 3-1.5 4.5 0S9.5 9.5 11 8s3-1.5 4.5 0S18.5 9.5 20 8" />
    <path d="M2 13c1.5-1.5 3-1.5 4.5 0S9.5 14.5 11 13s3-1.5 4.5 0S18.5 14.5 20 13" />
    <path d="M2 18c1.5-1.5 3-1.5 4.5 0S9.5 19.5 11 18s3-1.5 4.5 0S18.5 19.5 20 18" />
  </Svg>
);

export const IconActivity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h4l2-6 4 12 2-6h6" />
  </Svg>
);

export const IconTimer = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5" />
    <path d="M9 2h6" />
  </Svg>
);

export const IconRoute = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="5" r="2.5" />
    <path d="M8.5 19h5a4 4 0 0 0 0-8h-3a3.5 3.5 0 0 1 0-7H16" />
  </Svg>
);

export const IconFlame = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 22a6 6 0 0 0 6-6c0-4-3-6-3-10 0 0-3 2-3 6 0 0-2-1-2-3 0 0-4 3-4 7a6 6 0 0 0 6 6Z" />
  </Svg>
);

export const IconMountain = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 20 5.5-11 4 7 2.5-4L21 20z" />
  </Svg>
);

export const IconSlope = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 20h18" />
    <path d="M3 20 20 6" />
    <path d="M16 6h4v4" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 12 5 5L20 6" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h16" />
    <path d="m14 6 6 6-6 6" />
  </Svg>
);

export const IconGauge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21a9 9 0 1 1 9-9" />
    <path d="M12 12l4-4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
);
