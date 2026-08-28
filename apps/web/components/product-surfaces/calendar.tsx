import { ImageIcon, PlatformIcon, type Platform } from "@make-it-social/ui/icons";
import { AppSidebar } from "./sidebar";

type Post = { day: number; time: string; platform: Platform; tone: 1 | 2 | 3 };

const PLATFORMS: Platform[] = ["instagram", "facebook", "linkedin", "tiktok", "x", "youtube"];
const WEEK = ["Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16"];
const POSTS: Post[] = [
  { day: 0, time: "9:00", platform: "instagram", tone: 1 }, { day: 0, time: "2:00", platform: "linkedin", tone: 2 }, { day: 0, time: "6:30", platform: "youtube", tone: 3 },
  { day: 1, time: "10:00", platform: "facebook", tone: 3 }, { day: 1, time: "4:00", platform: "tiktok", tone: 1 },
  { day: 2, time: "9:15", platform: "instagram", tone: 2 }, { day: 2, time: "1:00", platform: "youtube", tone: 3 }, { day: 2, time: "5:00", platform: "linkedin", tone: 1 },
  { day: 3, time: "8:45", platform: "x", tone: 1 }, { day: 3, time: "3:30", platform: "facebook", tone: 2 }, { day: 3, time: "7:00", platform: "instagram", tone: 3 },
  { day: 4, time: "11:00", platform: "linkedin", tone: 3 }, { day: 4, time: "5:00", platform: "instagram", tone: 1 },
];
const TONES = { 1: "bg-base-300", 2: "bg-secondary/60", 3: "bg-secondary/80" } as const;
const DELAYS = ["reveal-delay-1", "reveal-delay-2", "reveal-delay-3"];

function PostChip({ post, index }: { post: Post; index: number }) {
  return (
    <div className={`reveal flex items-center gap-1.5 rounded-md border border-base-300 bg-base-100 p-1.5 ${DELAYS[index % 3]}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${TONES[post.tone]} text-base-100`}>
        <ImageIcon size={12} />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1 text-xs font-semibold leading-none">
        <PlatformIcon platform={post.platform} size={11} />
        {post.time}
      </span>
    </div>
  );
}

function ComposerStrip() {
  return (
    <div className="reveal reveal-delay-3 m-3 mt-0 rounded-lg border border-base-300 bg-base-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">Create post</span>
        <span className="text-xs text-secondary/70">Draft saved</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-label="Selected channels">
          {PLATFORMS.map((p, i) => (
            <span key={p} className={`rounded-full p-0.5 ${i < 4 ? "ring-2 ring-primary ring-offset-1" : "opacity-40"}`}>
              <PlatformIcon platform={p} size={18} />
            </span>
          ))}
        </div>
        <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content">Schedule</span>
      </div>
    </div>
  );
}

export function HeroCalendar() {
  return (
    <div className="product-frame flex aspect-16/11 w-full text-xs text-base-content md:aspect-16/10">
      <AppSidebar active="calendar" />
      <div className="flex min-w-0 flex-1 flex-col bg-base-100">
        <div className="flex items-center justify-between border-b border-base-300 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold">Calendar</span>
            <span className="hidden rounded-md border border-base-300 px-2 py-1 text-xs font-medium sm:inline">May 12 – 16, 2025</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-md border border-base-300 px-2 py-1 text-xs font-medium">Week</span>
            <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-content">+ Create post</span>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-3 divide-x divide-base-300 sm:grid-cols-5">
          {WEEK.map((label, day) => (
            <div key={label} className={`min-w-0 flex-col ${day > 2 ? "hidden sm:flex" : "flex"}`}>
              <div className="border-b border-base-300 px-2 py-1.5 text-xs font-semibold text-secondary/70">{label}</div>
              <div className="flex flex-col gap-1.5 p-1.5">
                {POSTS.filter((p) => p.day === day).map((p, i) => (
                  <PostChip key={`${p.platform}-${p.time}`} post={p} index={day + i} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <ComposerStrip />
      </div>
    </div>
  );
}
