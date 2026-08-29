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

/* ---------- Platform marks: the only place color appears. ---------- */

export type Platform = "instagram" | "facebook" | "linkedin" | "tiktok" | "x" | "youtube" | "pinterest" | "google_business";

export const PLATFORM_NAMES: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  pinterest: "Pinterest",
  google_business: "Google Business Profile",
};

/**
 * Brand colors live only inside the platform mark itself.
 * `mono` renders the same glyph in currentColor for the trust strip.
 */
export function PlatformIcon({
  platform,
  size = 20,
  mono = false,
  title,
  ...rest
}: IconProps & { platform: Platform; mono?: boolean; title?: string }) {
  const label = title ?? PLATFORM_NAMES[platform];
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    role: "img" as const,
    "aria-label": label,
    ...rest,
  };
  const c = (hex: string) => (mono ? "currentColor" : hex);
  const ink = mono ? "var(--color-base-100)" : "#fff";

  switch (platform) {
    case "instagram":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="6" fill={c("#E1306C")} />
          <circle cx="12" cy="12" r="4.2" fill="none" stroke={ink} strokeWidth="2" />
          <circle cx="17.3" cy="6.7" r="1.2" fill={ink} />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill={c("#1877F2")} />
          <path
            d="M13.4 20v-6.2h2.1l.3-2.5h-2.4V9.7c0-.7.2-1.2 1.2-1.2H16V6.3c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3v1.8H8.8v2.5h2.1V20h2.5Z"
            fill={ink}
          />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="4" fill={c("#0A66C2")} />
          <path
            d="M7.2 9.5h2.3V17H7.2V9.5Zm1.15-3.6a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7ZM10.9 9.5h2.2v1c.3-.6 1.1-1.2 2.3-1.2 2.4 0 2.9 1.6 2.9 3.7V17H16v-3.6c0-.9 0-2-1.2-2s-1.4.9-1.4 1.9V17h-2.3V9.5Z"
            fill={ink}
          />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill={c("#0a0a0a")} />
          <path
            d="M13.2 6h1.9c.1 1.4 1 2.4 2.4 2.6v1.9c-.9 0-1.7-.3-2.4-.8v3.9a3.6 3.6 0 1 1-3.6-3.6h.5v1.9h-.5a1.7 1.7 0 1 0 1.7 1.7V6Z"
            fill={ink}
          />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill={c("#0a0a0a")} />
          <path
            d="M7.5 7h2.6l2.4 3.3L15.3 7h1.4l-3.6 4.1L17 17h-2.6l-2.6-3.5L8.7 17H7.3l3.9-4.4L7.5 7Z"
            fill={ink}
          />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="4" fill={c("#FF0000")} />
          <path d="M10 9v6l5-3-5-3Z" fill={ink} />
        </svg>
      );
    case "pinterest":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill={c("#E60023")} />
          <path
            d="M12.3 6c-3.3 0-5 2.4-5 4.3 0 1.2.5 2.2 1.4 2.6.2.1.3 0 .4-.2l.1-.6c0-.2 0-.2-.1-.4-.3-.3-.5-.8-.5-1.4 0-1.8 1.4-3.5 3.6-3.5 2 0 3 1.2 3 2.8 0 2.1-.9 3.9-2.3 3.9-.8 0-1.3-.6-1.2-1.4.2-.9.7-1.9.7-2.6 0-.6-.3-1.1-1-1.1-.8 0-1.4.8-1.4 1.9 0 .7.2 1.2.2 1.2l-1 4c-.3 1.2 0 2.6 0 2.8 0 .1.1.1.2 0 .1-.1 1.1-1.4 1.5-2.6l.6-2.1c.3.5 1.1 1 1.9 1 2.5 0 4.3-2.3 4.3-5.4C17.7 8.1 15.5 6 12.3 6Z"
            fill={ink}
          />
        </svg>
      );
    case "google_business":
      return (
        <svg {...common}>
          <path d="M12 10.2v3.7h5.2c-.2 1.3-1.7 3.9-5.2 3.9a5.8 5.8 0 1 1 0-11.6c1.7 0 2.8.7 3.4 1.3l2.3-2.2A9 9 0 0 0 12 3a9 9 0 1 0 0 18c5.2 0 8.6-3.6 8.6-8.8 0-.6-.1-1.1-.2-1.6H12Z" fill={c("#4285F4")} />
          <path d="M3.9 7.6 7 9.9a5.8 5.8 0 0 1 8.4-2.4l2.3-2.2A9 9 0 0 0 3.9 7.6Z" fill={c("#EA4335")} />
          <path d="m7 14.1-3.1 2.3A9 9 0 0 0 12 21c2.4 0 4.5-.8 6-2.2l-2.9-2.3a5.8 5.8 0 0 1-8.1-2.4Z" fill={c("#34A853")} />
        </svg>
      );
  }
}
