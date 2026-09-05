import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** The RocketEase mark. Solid in currentColor: black by default, white when reversed. */
export function Mark({ size = 28, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M23.74 18.48 55.07 8.07Q59.98 6.43 58 11.34L47.32 37.77Q46.45 39.93 45 40.61L27.44 48.87Q26.24 49.44 26.92 47.93L33.03 34.41Q35.64 28.65 29.5 30.71L13.58 36.05 21.75 20.64Q22.72 18.82 23.74 18.48ZM24.68 38.03 17.88 51.03 6.77 55.93Q5.62 56.44 6 55.68L11.94 43.71Z"
        fill="currentColor"
      />
    </svg>
  );
}

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function CheckIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="m5 12 4.5 4.5L19 7" strokeWidth="2.25" />
    </svg>
  );
}
export function ArrowRightIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="M5 12h14M13 6l6 6-6 6" strokeWidth="2" />
    </svg>
  );
}
export function CalendarIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
export function SendIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="M21 3 10.5 13.5M21 3l-7 18-3.5-7.5L3 10l18-7Z" />
    </svg>
  );
}
export function InboxIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4 3.5V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <path d="M8 10h8M8 13.5h5" />
    </svg>
  );
}
export function ChartIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
export function MenuIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="2" />
    </svg>
  );
}
export function CloseIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="M6 6l12 12M18 6 6 18" strokeWidth="2" />
    </svg>
  );
}
export function HomeIcon({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10" />
    </svg>
  );
}
export function FolderIcon({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h5l2 2h8A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
    </svg>
  );
}
export function ShieldIcon({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
export function SettingsIcon({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  );
}
export function ImageIcon({ size = 14, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} {...rest}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  );
}

/* Platform marks (the only place color appears) live in platform-icon.tsx; re-exported so `@rocketease/ui/icons` stays the one import. */
export { PlatformIcon, PLATFORM_NAMES, type Platform } from "./platform-icon";
