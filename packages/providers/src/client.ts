/**
 * Client-safe surface: types and pure helpers only. Adapters (and node:crypto)
 * stay behind the package root so "use client" components never bundle them.
 */
export * from "./types";
export * from "./inbox-types";
export * from "./insights-types";
export * from "./ads-types";
export { validateAgainstCapabilities } from "./validate";
export { PROVIDER_COST_NOTES, estimatePublishCost, isFreeToPublish, type CapWindow, type CostVariant, type CostWindow, type PublishCost } from "./cost";
export * from "./disclosure";
export { CAPABILITY_PATHS, capabilitySupported, extraNotes, reasonFor, type CapabilityPath, type CatalogEntry } from "./capability-paths";
