/*
 * RocketEase's licence public key, baked into the build so an install cannot
 * point the check at a key of its own. EMPTY until the key ceremony:
 *
 *   pnpm exec tsx scripts/licence.ts keygen
 *
 * paste the PUBLIC half here, keep the private half out of every repository.
 * LICENCE_PUBLIC_KEY in the environment overrides it for local checks only.
 */
export const DEFAULT_LICENCE_PUBLIC_KEY = "";
