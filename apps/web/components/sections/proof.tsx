import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "@rocketease/ui/icons";
import { DashboardSurface } from "../product-surfaces";

const CAPABILITIES = ["Visual content calendar", "Cross-platform publishing", "Unified social inbox", "Paid ads management", "Advanced analytics & reporting", "Team collaboration & approvals"];

export function ProductProof() {
  return (
    <section id="product" className="border-t border-base-300 bg-base-200" aria-labelledby="proof-heading">
      <div className="page-container section-pad grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-4">
          <h2 id="proof-heading" className="h2-marketing">
            See everything.
            <br />
            Do anything.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-secondary">
            From content planning to ad performance, RocketEase gives you the clarity and
            control to grow your brand without stitching tools together.
          </p>
          <ul className="mt-8 flex flex-col gap-3">
            {CAPABILITIES.map((c) => (
              <li key={c} className="flex items-center gap-3 text-base font-medium">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-content">
                  <CheckIcon size={12} />
                </span>
                {c}
              </li>
            ))}
          </ul>
          <Link href="/features" className="mt-8 inline-flex items-center gap-1.5 text-base font-semibold hover:underline">
            Explore all features <ArrowRightIcon size={15} />
          </Link>
        </div>
        <div className="lg:col-span-8">
          <DashboardSurface />
        </div>
      </div>
    </section>
  );
}
