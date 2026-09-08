/*
 * How this copy of RocketEase is run (docs/plans/m14.12-self-hosted.md).
 *
 * `cloud` is RocketEase's own service: Stripe subscriptions, many organizations.
 * `self-hosted` is a licence-owned install on someone else's cluster: ONE
 * organization, entitlements from a licence key checked offline, no Stripe.
 *
 * Env only, no `server-only`: the worker asks too.
 */
export type DeploymentMode = "cloud" | "self-hosted";
export type UpdateChannel = "stable" | "edge";

export const UPDATE_CHANNELS = ["stable", "edge"] as const;

export const deploymentMode = (): DeploymentMode => (process.env.DEPLOYMENT_MODE === "self-hosted" ? "self-hosted" : "cloud");
export const isSelfHosted = () => deploymentMode() === "self-hosted";

/** stable follows tagged releases; edge follows every build of main. */
export const updateChannel = (): UpdateChannel => (process.env.UPDATE_CHANNEL === "edge" ? "edge" : "stable");

/** The build's own label — a release tag (v1.2.0), edge-<sha>, or "dev". Set when the image is built. */
export const appVersion = () => process.env.APP_VERSION?.trim() || "dev";
export const gitSha = () => process.env.GIT_SHA?.trim() || null;
