import type { Capabilities, CapabilityPath, CatalogEntry } from "@make-it-social/providers/client";
import { capabilitySupported, reasonFor } from "@make-it-social/providers/client";
import { NetMark } from "@/components/net-mark";
import { CAPABILITY_COLUMNS as COLUMNS } from "@/lib/capabilities";

const FORMATS: Record<string, string> = { text: "Text", image: "Image", carousel: "Carousel", video: "Video", reel: "Reel", story: "Story", document: "Document" };
const SCHEDULING: Record<Capabilities["scheduling"], string> = { native: "Network", internal: "Make It Social", none: "No" };
const LINKS: Record<string, string> = { inline: "In the post", attached: "Attached", none: "No" };

const HEAD = "border-b border-base-300 px-3 py-2 text-left align-bottom font-medium";

export function CapabilityMatrix({ entries }: { entries: CatalogEntry[] }) {
  return (
    <div className="mt-8 overflow-x-auto rounded-box border border-base-300">
      <table className="w-full min-w-300 border-collapse text-sm">
        <caption className="sr-only">What each social network lets Make It Social do, and why anything is unavailable.</caption>
        <thead className="text-xs text-secondary">
          <tr>
            <th scope="col" className={`${HEAD} sticky left-0 bg-base-100`}>Network</th>
            <th scope="col" className={HEAD}>Formats</th>
            <th scope="col" className={HEAD}>Scheduled by</th>
            <th scope="col" className={HEAD}>Links</th>
            {COLUMNS.map((c) => (
              <th key={c.path} scope="col" className={HEAD}>
                <span className="block text-secondary/60">{c.group}</span>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-base-300">
          {entries.map((e) => (<Row key={e.kind} entry={e} />))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ entry }: { entry: CatalogEntry }) {
  const caps = entry.capabilities;
  const formats = caps.formats.map((f) => FORMATS[f] ?? f).join(", ");
  return (
    <tr className="align-top">
      <th scope="row" className="sticky left-0 bg-base-100 px-3 py-3 text-left font-semibold">
        <span className="flex items-center gap-2"><NetMark network={entry.network} size={18} />{entry.label}</span>
      </th>
      <td className="px-3 py-3">{formats || <Missing reason={reasonFor(caps, "formats")} />}</td>
      <td className="px-3 py-3">{caps.scheduling === "none" ? <Missing reason={reasonFor(caps, "scheduling")} /> : SCHEDULING[caps.scheduling]}</td>
      <td className="px-3 py-3">{caps.limits.links && caps.limits.links !== "none" ? LINKS[caps.limits.links] : <Missing reason={reasonFor(caps, "limits.links")} />}</td>
      {COLUMNS.map((c) => (
        <td key={c.path} className="px-3 py-3">
          <Cell entry={entry} path={c.path} label={c.label} />
        </td>
      ))}
    </tr>
  );
}

function Cell({ entry, path, label }: { entry: CatalogEntry; path: CapabilityPath; label: string }) {
  const ok = capabilitySupported(entry.capabilities, path);
  if (!ok) return <Missing reason={reasonFor(entry.capabilities, path)} label={label} />;
  const condition = entry.conditional[path] ?? reasonFor(entry.capabilities, path);
  if (condition) return <span title={condition} className="cursor-help">✓<span className="text-secondary/70">*</span><span className="sr-only"> {label}: yes, with a condition. {condition}</span></span>;
  return <span>✓<span className="sr-only"> {label}: yes</span></span>;
}

function Missing({ reason, label }: { reason?: string; label?: string }) {
  return (
    <span title={reason} className={reason ? "cursor-help text-secondary" : "text-secondary"}>
      —<span className="sr-only"> {label ? `${label}: ` : ""}no. {reason ?? "Not available on this network."}</span>
    </span>
  );
}
