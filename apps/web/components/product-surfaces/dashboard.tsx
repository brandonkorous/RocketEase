import { PLATFORM_NAMES, PlatformIcon, type Platform } from "@make-it-social/ui/icons";
import { AppSidebar } from "./sidebar";

/* Illustrative numbers only — never presented as a customer claim. */
const SERIES_ORGANIC = [22, 30, 27, 38, 41, 36, 48, 52, 47, 60, 66, 62, 74];
const SERIES_PAID = [10, 12, 18, 16, 22, 28, 25, 31, 36, 34, 42, 46, 50];
const KPIS = [
  { label: "Reach", value: "128.7K", note: "Organic + paid" }, { label: "Engagement", value: "24.9K", note: "All channels" },
  { label: "Link clicks", value: "3.2K", note: "Attributed" }, { label: "Conversions", value: "1.1K", note: "Pixel + UTM" },
];
const CHANNELS: { platform: Platform; posts: number; reach: string; eng: string }[] = [
  { platform: "instagram", posts: 12, reach: "48.2K", eng: "9.4K" }, { platform: "facebook", posts: 11, reach: "31.4K", eng: "6.8K" },
  { platform: "linkedin", posts: 9, reach: "22.6K", eng: "4.1K" }, { platform: "tiktok", posts: 7, reach: "26.5K", eng: "4.6K" },
];
const TOP_POSTS: { platform: Platform; title: string; reach: string }[] = [
  { platform: "instagram", title: "Spring collection reveal", reach: "18.7K" }, { platform: "tiktok", title: "Behind the scenes: studio day", reach: "15.2K" },
  { platform: "linkedin", title: "How we plan a month of content", reach: "9.8K" }, { platform: "facebook", title: "Customer spotlight: Lisa", reach: "8.1K" },
];
const W = 560;
const H = 160;

function toPath(series: number[]) {
  const step = W / (series.length - 1);
  return series.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - (v / 80) * H).toFixed(1)}`).join(" ");
}

function PerformanceChart() {
  return (
    <div className="rounded-lg border border-base-300 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Performance</span>
        <span className="flex items-center gap-3 text-xs text-secondary/70">
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-base-content" /> Organic</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t-2 border-dashed border-secondary/50" /> Paid</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Line chart of organic and paid reach rising over the last 14 days">
        {[0.25, 0.5, 0.75].map((t) => (<line key={t} x1="0" x2={W} y1={H * t} y2={H * t} className="stroke-base-300" strokeWidth="1" />))}
        <path d={toPath(SERIES_PAID)} fill="none" className="stroke-secondary/60" strokeWidth="2" strokeDasharray="4 4" />
        <path className="draw-line stroke-base-content" d={toPath(SERIES_ORGANIC)} fill="none" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ChannelTable() {
  return (
    <div className="rounded-lg border border-base-300 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Channels</span>
        <span className="text-xs text-secondary/70">Data refreshed 15 min ago</span>
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-xs text-secondary/70">
          <tr><th className="pb-1.5 font-medium">Channel</th><th className="pb-1.5 text-right font-medium">Posts</th><th className="pb-1.5 text-right font-medium">Reach</th><th className="pb-1.5 text-right font-medium">Engagement</th></tr>
        </thead>
        <tbody className="divide-y divide-base-300">
          {CHANNELS.map((c) => (
            <tr key={c.platform}>
              <td className="py-1.5"><span className="flex items-center gap-1.5 font-medium"><PlatformIcon platform={c.platform} size={13} />{PLATFORM_NAMES[c.platform]}</span></td>
              <td className="py-1.5 text-right">{c.posts}</td>
              <td className="py-1.5 text-right">{c.reach}</td>
              <td className="py-1.5 text-right font-semibold">{c.eng}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardSurface() {
  return (
    <div className="product-frame flex w-full text-xs text-base-content">
      <AppSidebar active="home" />
      <div className="flex min-w-0 flex-1 flex-col gap-3 bg-base-100 p-3 md:p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Overview</span>
          <span className="rounded-md border border-base-300 px-2 py-1 text-xs font-medium">Last 14 days</span>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-base-300 overflow-hidden rounded-lg border border-base-300 sm:grid-cols-4">
          {KPIS.map((k) => (
            <div key={k.label} className="px-3 py-2.5">
              <dt className="text-xs font-medium text-secondary/70">{k.label}</dt>
              <dd className="mt-0.5 text-lg font-bold leading-none tracking-tight">{k.value}</dd>
              <dd className="mt-1 text-xs text-secondary/70">{k.note}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
          <PerformanceChart />
          <div className="rounded-lg border border-base-300 p-3">
            <div className="mb-2 font-semibold">Top posts</div>
            <ul className="flex flex-col gap-2">
              {TOP_POSTS.map((p) => (
                <li key={p.title} className="flex items-center gap-2">
                  <PlatformIcon platform={p.platform} size={14} />
                  <span className="min-w-0 flex-1 truncate text-xs">{p.title}</span>
                  <span className="text-xs font-semibold">{p.reach}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <ChannelTable />
      </div>
    </div>
  );
}
