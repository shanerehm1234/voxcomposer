import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const IconSkull = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3a7 7 0 0 0-7 7v3.5c0 1 .6 1.5 1.5 1.8.5.2.5.7.5 1.2V19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2.5c0-.5 0-1 .5-1.2.9-.3 1.5-.8 1.5-1.8V10a7 7 0 0 0-7-7Z" />
    <circle cx="9" cy="11" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="11" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRelay = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="8" width="18" height="8" rx="4" />
    <circle cx="9" cy="12" r="2.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconBulb = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.2 1 2V16h6v-.5c0-.8.3-1.4 1-2A6 6 0 0 0 12 3Z" />
  </svg>
);

export const IconSensor = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12a7 7 0 0 1 7-7M5 16a11 11 0 0 1 11-11" opacity={0.6} />
    <circle cx="7" cy="17" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IconMusic = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6" cy="18" r="2.4" />
    <circle cx="17" cy="16" r="2.4" />
  </svg>
);

export const IconPlay = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 5l12 7-12 7V5Z" fill="currentColor" />
  </svg>
);

export const IconPause = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconStop = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const IconSkipStart = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 5v14M19 5l-9 7 9 7V5Z" />
  </svg>
);

export const IconLoop = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M17 4l3 3-3 3M7 20l-3-3 3-3" />
    <path d="M20 7H8a4 4 0 0 0-4 4M4 17h12a4 4 0 0 0 4-4" />
  </svg>
);

export const IconTimeline = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h10M4 12h16M4 17h7" />
    <circle cx="17" cy="7" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="13" cy="17" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IconDevices = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="13" height="9" rx="1.5" />
    <rect x="15" y="10" width="6" height="9" rx="1.5" />
  </svg>
);

export const IconMedia = (p: IconProps) => <IconMusic {...p} />;

export const IconSettings = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M22 12h-3M5 12H2M19.07 4.93l-2.12 2.12M7.05 16.95l-2.12 2.12M19.07 19.07l-2.12-2.12M7.05 7.05 4.93 4.93" />
  </svg>
);

export const IconExport = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v12M8 11l4 4 4-4" />
    <path d="M5 21h14" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconRefresh = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v5h-5" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconUpload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 16V4M8 8l4-4 4 4" />
    <path d="M5 20h14" />
  </svg>
);

export const IconFolderOpen = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1H3z" />
    <path d="m3 10 1.5 8a2 2 0 0 0 2 1.7h11a2 2 0 0 0 2-1.7L21 10z" />
  </svg>
);

export const IconBattery = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2" y="8" width="17" height="9" rx="2" />
    <path d="M22 11v3" />
  </svg>
);

export const IconChip = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </svg>
);

export const IconSdCard = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 2h8l4 4v16H6z" />
    <path d="M10 2v4M13 2v4M16 6v2" />
  </svg>
);

export const IconFog = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 19h11a4 4 0 0 0 .5-7.97A6 6 0 0 0 5 11" opacity={0.95} />
    <path d="M7 22h10M5 22h0" />
    <path d="M9 15c.6.8.6 1.7 0 2.5M13 15c.6.8.6 1.7 0 2.5M17 15c.6.8.6 1.7 0 2.5" opacity={0.6} />
  </svg>
);

export const IconMotion = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M6 6a8 8 0 0 0 0 12M18 6a8 8 0 0 1 0 12" opacity={0.5} />
  </svg>
);

export const deviceIcon: Record<string, (p: IconProps) => JSX.Element> = {
  skull: IconSkull,
  relay: IconRelay,
  dmx: IconBulb,
  sense: IconSensor,
  audio: IconMusic,
  pixel: IconBulb,
  custom: IconDevices,
  fog: IconFog,
  motion: IconMotion,
};

/** Resolve a device's icon, honoring an optional per-device hint over its type. */
export function resolveDeviceIcon(type: string, hint?: string): (p: IconProps) => JSX.Element {
  return deviceIcon[hint ?? ''] ?? deviceIcon[type] ?? deviceIcon.custom!;
}
