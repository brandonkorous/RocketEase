import { PLATFORM_NAMES, PlatformIcon } from "@make-it-social/ui/icons";
import { LAUNCH_PLATFORMS } from "./shared";

export function TrustStrip() {
  return (
    <section className="border-y border-base-300 bg-base-200 pt-14 pb-16" aria-labelledby="trust-heading">
      <div className="page-container text-center">
        <h2 id="trust-heading" className="text-sm font-semibold text-secondary/70">
          Built for the networks your customers already use
        </h2>
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-5 text-secondary/70">
          {LAUNCH_PLATFORMS.map((p) => (
            <li key={p} className="flex items-center gap-2 opacity-70 transition-opacity hover:opacity-100">
              <PlatformIcon platform={p} size={22} mono />
              <span className="text-base font-semibold text-base-content">{PLATFORM_NAMES[p]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-secondary/70">
          Availability depends on each network&apos;s API. Customer logos will appear here once we have permission to show them.
        </p>
      </div>
    </section>
  );
}
