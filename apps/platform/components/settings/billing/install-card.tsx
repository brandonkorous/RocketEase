import type { InstallView } from "@/lib/billing/licence-view";

function UpdateLine({ install }: { install: InstallView }) {
  if (!install.feedConfigured) return <span>Update checks are off. This install never calls out. Set UPDATE_FEED_URL to ask RocketEase’s feed once a day.</span>;
  if (install.error) return <span><span aria-hidden="true">⚠</span> {install.error}{install.checkedAt ? ` Last tried ${install.checkedAt}.` : ""}</span>;
  if (!install.latestVersion) return <span>Not checked yet. The worker asks once a day.</span>;
  const standing = install.standing === "current" ? "This is the latest build listed for your channel." : `A newer build is listed: ${install.latestVersion}.`;
  return (
    <span>
      {standing} Checked {install.checkedAt}.{" "}
      {install.notesUrl && <a href={install.notesUrl} target="_blank" rel="noreferrer" className="underline">Release notes ↗</a>}
    </span>
  );
}

/** Version and update channel of a self-hosted install; every line states a fact or says why there is none. */
export function InstallCard({ install }: { install: InstallView }) {
  return (
    <section aria-labelledby="billing-install">
      <h3 id="billing-install" className="text-base font-semibold">This install</h3>
      <dl className="mt-4 grid max-w-140 grid-cols-[160px_1fr] gap-y-3 text-sm">
        <dt className="text-secondary/70">Version</dt>
        <dd className="font-mono text-xs">{install.version}{install.sha ? ` (${install.sha})` : ""}</dd>
        <dt className="text-secondary/70">Channel</dt>
        <dd>{install.channel}</dd>
        <dt className="text-secondary/70">Updates</dt>
        <dd><UpdateLine install={install} /></dd>
      </dl>
    </section>
  );
}
