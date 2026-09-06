/*
 * The decision with the live provider registry plugged in. Kept apart from
 * support.ts so the pure decision can be tested without a database (the
 * registry module opens the pool on import).
 */
import type { ProviderKey } from "@rocketease/providers";
import { providers } from "@/lib/providers";
import { hideDecision, type HideChannel, type HideDecision } from "./support";

const adapterCanHide = (provider: ProviderKey) => Boolean(providers().get(provider)?.hideItem);

/** Can this comment be hidden at the network, here, now? */
export const canHideAt = (ch: HideChannel, kind: string): HideDecision => hideDecision(ch, kind, adapterCanHide);
