export * from "./types";
export * from "./inbox-types";
export * from "./insights-types";
export { validateAgainstCapabilities } from "./validate";
export { httpJson, categoryFromStatus } from "./http";
export { mockProvider, mockControl, mockInbox, mockInsights, type MockBehaviour } from "./mock";
export { createMetaProvider } from "./meta";
export { createLinkedInProvider } from "./linkedin";
export { createTikTokProvider } from "./tiktok";

import type { ProviderAdapter, ProviderConfig, ProviderKey } from "./types";
import { mockProvider } from "./mock";
import { createMetaProvider } from "./meta";
import { createLinkedInProvider } from "./linkedin";
import { createTikTokProvider } from "./tiktok";

export type ProviderRegistryConfig = Partial<Record<Exclude<ProviderKey, "mock">, ProviderConfig>> & { enableMock?: boolean };

/**
 * Build the set of adapters available in this deployment. A provider without
 * credentials configured simply isn't offered (feature-flag by configuration).
 */
export function createProviderRegistry(cfg: ProviderRegistryConfig): Map<ProviderKey, ProviderAdapter> {
  const m = new Map<ProviderKey, ProviderAdapter>();
  if (cfg.enableMock) m.set("mock", mockProvider);
  if (cfg.meta?.clientId) m.set("meta", createMetaProvider(cfg.meta));
  if (cfg.linkedin?.clientId) m.set("linkedin", createLinkedInProvider(cfg.linkedin));
  if (cfg.tiktok?.clientId) m.set("tiktok", createTikTokProvider(cfg.tiktok));
  return m;
}
