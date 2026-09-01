/**
 * Client-safe surface: types, the registry and pure helpers. Adapters (and any
 * key-reading code) stay behind the package root, so a "use client" component
 * can render "why this model" without bundling a vendor SDK.
 */
export * from "./types";
export * from "./io";
export { MODELS, modelByKey, modelLabel, modelsForJob, availableModels, describeCatalog, type AdapterAvailability, type CatalogEntry } from "./catalog";
export { routeJob, isRouted, type RoutingPolicy, type RoutingResult, type RoutingRejection } from "./routing";
export { estimate, quantityFor, parseRates, totalEstimate } from "./cost";
export * from "./transcribe";
