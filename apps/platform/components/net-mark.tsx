import { PlatformIcon, type Platform } from "@make-it-social/ui/icons";

/** Network identity mark. The demo network's blue is a brand color, the one place hex is allowed. */
export function NetMark({ network, size = 16 }: { network: string; size?: number }) {
  if (network === "mock") return <span className="flex items-center justify-center rounded-full bg-[#1d4ed8] text-xs font-bold text-white" style={{ width: size, height: size }} aria-label="Demo network">D</span>;
  return <PlatformIcon platform={network as Platform} size={size} />;
}
