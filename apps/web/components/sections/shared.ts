import { buttonClasses } from "@wizeworks/silicaui-react/server";
import type { Platform } from "@rocketease/ui/icons";

export const primaryCta = buttonClasses({ color: "primary" });
export const textCta = buttonClasses({ color: "neutral", variant: "ghost" });
export const LAUNCH_PLATFORMS: Platform[] = ["instagram", "facebook", "linkedin", "tiktok", "x", "youtube", "pinterest"];
