import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/* ---------- Platform marks: the only place color appears. ---------- */

export type Platform = "instagram" | "facebook" | "linkedin" | "tiktok" | "x" | "youtube" | "pinterest" | "google_business" | "threads" | "bluesky";

export const PLATFORM_NAMES: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  pinterest: "Pinterest",
  google_business: "Google Business Profile",
  threads: "Threads",
  bluesky: "Bluesky",
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
    case "threads":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill={c("#0a0a0a")} />
          <path
            d="M12.3 18c-3.4 0-5.5-2.3-5.5-6s2.1-6 5.4-6c2.5 0 4.2 1.3 4.8 3.4l-1.5.4c-.4-1.5-1.6-2.3-3.3-2.3-2.4 0-3.8 1.7-3.8 4.5s1.4 4.5 3.9 4.5c1.9 0 3.1-.9 3.1-2.3 0-.8-.4-1.4-1.1-1.7-.2 1.8-1.3 2.9-3 2.9-1.5 0-2.6-.9-2.6-2.3 0-1.5 1.3-2.5 3.3-2.5.4 0 .8 0 1.2.1-.1-1-.7-1.6-1.8-1.6-.8 0-1.4.3-1.8.9l-1.2-.8c.6-.9 1.7-1.5 3-1.5 2 0 3.2 1.2 3.4 3.1 1.4.5 2.2 1.6 2.2 3.1 0 2.4-1.9 4.1-4.7 4.1Zm-.6-5.4c0 .6.5 1 1.2 1 .9 0 1.5-.6 1.6-1.8-.4-.1-.8-.2-1.2-.2-1 0-1.6.4-1.6 1Z"
            fill={ink}
          />
        </svg>
      );
    case "bluesky":
      return (
        <svg {...common}>
          <path
            d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"
            fill={c("#1185FE")}
          />
        </svg>
      );
  }
}
