/*
 * Copying a brand kit between workspaces. Pure: which sections may move, and
 * how the source kit becomes a patch for the target. Library assets never move
 * — an asset row belongs to one workspace — so the assets section carries its
 * external links only and keeps the target's own asset list.
 */
import type { BrandSection } from "./schema";
import type { BrandKit, Logo } from "./types";

export const COPYABLE: BrandSection[] = ["identity", "voice", "visual", "messaging", "audiences", "rules", "channels", "assets"];

/** `logos` are the target-side copies (new storage keys); a logo storage could not copy is simply absent. */
export function copyPatch(source: BrandKit, target: BrandKit, sections: BrandSection[], logos: Logo[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const s of new Set(sections)) {
    switch (s) {
      case "voice":
        patch.voice = source.voice;
        patch.voiceRules = source.voiceRules;
        break;
      case "visual":
        patch.visual = { ...source.visual, logos };
        break;
      case "assets":
        patch.assets = { assetIds: target.assets.assetIds, links: source.assets.links };
        break;
      default:
        patch[s] = source[s];
    }
  }
  return patch;
}

/** What the copy replaced, for the audit row: names and counts, never the essay. */
export const copySummary = (sections: BrandSection[], logos: Logo[]) => ({ sections: [...new Set(sections)], logos: logos.length });
