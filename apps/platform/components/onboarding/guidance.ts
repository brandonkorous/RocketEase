import type { OnboardingStep } from "./steps";

/** Guidance exists for every onboarding step, plus the standalone new-workspace page. */
export type GuidanceKey = OnboardingStep | "new-workspace";

export type Guidance = {
  /** Heading for the help panel — what this step is really asking for. */
  title: string;
  copy: string;
  /** Field-by-field definitions, in the order the form shows them. */
  terms: { term: string; def: string }[];
};

/**
 * Contextual help shown beside each step (onboarding.md: teach a surface when
 * it is encountered). Definitions only — no capability claims beyond the docs.
 */
export const GUIDANCE: Record<GuidanceKey, Guidance> = {
  "new-workspace": {
    title: "What a workspace is",
    copy: "A workspace is one isolated brand or client. Its channels, content, conversations, and reports never mix with another workspace's, and every screen names the one you are in.",
    terms: [
      { term: "Organization", def: "The company or agency that will own and be billed for this workspace." },
      { term: "Workspace name", def: "The brand or client this workspace is for. It labels the calendar, inbox, and reports, and appears on every publish confirmation." },
      { term: "Scheduling timezone", def: "Scheduled times, calendar slots, and reporting windows are shown in this zone. Timestamps are stored in UTC." },
      { term: "Members", def: "Nobody but you can see this workspace until you invite them to it from Team." },
    ],
  },
  workspace: {
    title: "Organizations and workspaces",
    copy: "Your organization owns billing and everything under it. Inside it, a workspace is one isolated brand or client — its channels, content, conversations, and reports never mix with another workspace's.",
    terms: [
      { term: "Organization name", def: "Your company or agency. It owns billing and every workspace you create." },
      { term: "Workspace name", def: "The brand or client this workspace is for. It labels the calendar, inbox, and reports, and appears on every publish confirmation." },
      { term: "Workspace type", def: "Brand for social you run for yourself. Agency client for social you run on someone else's behalf." },
      { term: "Time zone", def: "Scheduled times, calendar slots, and reporting windows are shown in this zone. Timestamps are stored in UTC." },
    ],
  },
  connect: {
    title: "What a channel is",
    copy: "A channel is one connected social profile, page, or ad account. Connecting sends you to the network's own site to approve access — RocketEase never sees your password.",
    terms: [
      { term: "Provider vs. channel", def: "One provider can hold several channels. Meta, for example, covers both Facebook Pages and Instagram accounts." },
      { term: "Permissions", def: "What you can publish, read, or reply to depends on what each network grants. Anything a network withholds is marked unavailable rather than shown as empty." },
      { term: "First sync", def: "Profile details, capabilities, and connection health load in the background after you connect. You can keep going while it runs." },
      { term: "Skipping", def: "You can connect accounts any time from Connected accounts. Publishing needs at least one." },
    ],
  },
  invite: {
    title: "Roles decide what people can do",
    copy: "Roles are presets, applied per workspace. Invite someone once and they only ever see the workspaces you add them to.",
    terms: [
      { term: "Admin", def: "Workspace settings, members, and channel connections, plus everything a Manager can do." },
      { term: "Manager", def: "Creates, schedules, and publishes content, approves work, and handles conversations." },
      { term: "Creator", def: "Drafts and edits content. Whether they can publish directly depends on your approval policy." },
      { term: "Responder", def: "Works the inbox — replies to messages, comments, and mentions. No publishing." },
      { term: "Analyst", def: "Reads analytics and exports reports. No content or inbox access." },
      { term: "Client approver", def: "Comments on and decides only the items assigned to them. Cannot browse the rest of the workspace." },
      { term: "Viewer", def: "Read-only." },
    ],
  },
  goals: {
    title: "Why we ask",
    copy: "Goals are saved on the workspace as a record of what this brand is working toward. Pick as many as apply — you can change them any time in Settings.",
    terms: [
      { term: "Not a commitment", def: "Goals never limit what you can do. Every feature stays available whatever you pick." },
      { term: "Per workspace", def: "Each brand or client sets its own goals, so an agency can run different plays side by side." },
    ],
  },
  "first-post": {
    title: "Content items and post variants",
    copy: "You write the idea once as a content item. Each channel you pick gets its own post variant — the version that actually publishes, with its own limits and formatting.",
    terms: [
      { term: "Shared text", def: "The starting copy every selected channel inherits. Per-channel edits come next, in Create." },
      { term: "Channels", def: "Tap a channel to include or exclude it. You can change the selection in Create." },
      { term: "Nothing publishes yet", def: "Continue saves a draft and opens Create, where you add media, tweak each channel, and choose a time." },
    ],
  },
  done: {
    title: "What happens next",
    copy: "Home shows the next best action for this workspace, and a resumable checklist covers anything you skipped.",
    terms: [
      { term: "Nothing is locked in", def: "Channels, teammates, goals, and workspace details are all editable from Settings." },
      { term: "Pick up where you left off", def: "Skipped steps stay on the Home checklist and deep-link straight back to the flow." },
    ],
  },
};
