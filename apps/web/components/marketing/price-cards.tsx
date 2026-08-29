import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { AUTH_LINKS } from "@/lib/nav";
import { MONTHLY, PRICES_CONFIGURED, TRIAL_DAYS, YEARLY, type PriceDisplay } from "@/lib/pricing";

export function PriceCards() {
  if (!PRICES_CONFIGURED) return <TalkToUs />;
  return (
    <div className="grid max-w-3xl gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 sm:grid-cols-2">
      <PriceCard price={MONTHLY} label="Monthly" />
      <PriceCard price={YEARLY} label="Yearly" highlight />
    </div>
  );
}

function PriceCard({ price, label, highlight }: { price: PriceDisplay; label: string; highlight?: boolean }) {
  if (!price.amount) return null;
  return (
    <div className="bg-base-100 p-7">
      <div className="flex items-center gap-3">
        <h3 className="text-base font-semibold text-base-content">{label}</h3>
        {highlight && (
          <span className="rounded-selector bg-primary px-2 py-0.5 text-xs font-semibold text-primary-content">Two months free</span>
        )}
      </div>
      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-5xl font-bold tracking-tight text-base-content tabular-nums">${price.amount}</span>
        <span className="text-base text-secondary">/{price.interval}</span>
      </p>
      <p className="mt-2 text-sm text-secondary">{price.note}</p>
      <Link href={AUTH_LINKS.signup} className={`${buttonClasses({ color: highlight ? "primary" : "neutral", variant: highlight ? "solid" : "outline" })} mt-6 w-full`}>
        Start {TRIAL_DAYS}-day trial
      </Link>
    </div>
  );
}

/** Shown until NEXT_PUBLIC_PRICE_* are baked into the build. */
function TalkToUs() {
  return (
    <div className="max-w-2xl rounded-box border border-base-300 bg-base-200 p-8">
      <h3 className="text-xl font-semibold text-base-content">Pricing is being finalised</h3>
      <p className="mt-3 text-base leading-relaxed text-secondary">
        We are not going to put a number here that changes next week. The shape is settled — one plan, priced per workspace, every
        feature included, {TRIAL_DAYS}-day free trial, AI credits metered on top. The number is not, and we will publish it here the
        moment it is.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/contact" className={buttonClasses({ color: "primary" })}>
          Ask us what it will cost
        </Link>
        <Link href={AUTH_LINKS.signup} className={buttonClasses({ color: "neutral", variant: "outline" })}>
          Start free trial
        </Link>
      </div>
    </div>
  );
}
