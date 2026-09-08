"use client";

import { ACTION_TYPES, BUTTON_LABEL, TOPIC_LABEL, TOPIC_TYPES, type ActionType, type GbpPostSettings, type TopicType } from "@rocketease/providers/client";
import { Input, Label, Textarea } from "@wizeworks/silicaui-react";

type Props = { channelId: string; value: GbpPostSettings; onChange: (v: GbpPostSettings) => void; hasLink: boolean };

/** Google's own definitions, shown where the choice is made. */
const HINT = {
  type: "An update is plain. An event and an offer need a title and dates; Google keeps them until their end date.",
  button: "One button per post; its link is the post link unless you give it another. Call now uses the location's phone number.",
  dates: "The location's own calendar. Without times, Google shows the event as all day.",
  lifetime: "Google archives posts older than 6 months unless they have a date range.",
};

function EventFields({ id, value, onChange }: { id: string; value: GbpPostSettings; onChange: (v: GbpPostSettings) => void }) {
  const e = value.event ?? {};
  const set = (patch: Partial<NonNullable<GbpPostSettings["event"]>>) => onChange({ ...value, event: { ...e, ...patch } });
  const field = (key: keyof typeof e, label: string, type: "text" | "date" | "time", extra: Record<string, unknown> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} type={type} value={e[key] ?? ""} onChange={(ev) => set({ [key]: ev.target.value })} {...extra} />
    </div>
  );
  return (
    <>
      {field("title", "Title", "text", { maxLength: 200, placeholder: "e.g. Autumn tasting night" })}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("startDate", "Start date", "date")}
        {field("startTime", "Start time", "time")}
        {field("endDate", "End date", "date")}
        {field("endTime", "End time", "time")}
      </div>
      <p className="text-xs text-secondary/70">{HINT.dates}</p>
    </>
  );
}

function OfferFields({ id, value, onChange }: { id: string; value: GbpPostSettings; onChange: (v: GbpPostSettings) => void }) {
  const o = value.offer ?? {};
  const set = (patch: Partial<NonNullable<GbpPostSettings["offer"]>>) => onChange({ ...value, offer: { ...o, ...patch } });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor={`${id}-coupon`}>Coupon code</Label><Input id={`${id}-coupon`} value={o.couponCode ?? ""} maxLength={58} onChange={(ev) => set({ couponCode: ev.target.value })} placeholder="optional" /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor={`${id}-redeem`}>Redeem link</Label><Input id={`${id}-redeem`} type="url" value={o.redeemOnlineUrl ?? ""} onChange={(ev) => set({ redeemOnlineUrl: ev.target.value })} placeholder="https:// (optional)" /></div>
      </div>
      <div className="flex flex-col gap-1.5"><Label htmlFor={`${id}-terms`}>Terms and conditions</Label><Textarea id={`${id}-terms`} rows={2} value={o.termsConditions ?? ""} onChange={(ev) => set({ termsConditions: ev.target.value })} placeholder="optional" /></div>
    </>
  );
}

/** The knobs a Business Profile post has and nothing else does: its type, its one button, and the event or offer details Google requires. */
export function GbpPostSettings({ channelId, value, onChange, hasLink }: Props) {
  const id = `gbp-${channelId}`;
  const topic: TopicType = value.topicType ?? "STANDARD";
  const cta = value.callToAction ?? { actionType: hasLink ? "LEARN_MORE" : "NONE" };
  const needsUrl = cta.actionType !== "NONE" && cta.actionType !== "CALL";
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-box border border-base-300 p-4" aria-label="Google Business Profile post settings">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-type`}>Post type</Label>
          <select id={`${id}-type`} className="select select-sm w-full" value={topic} onChange={(ev) => onChange({ ...value, topicType: ev.target.value as TopicType })}>
            {TOPIC_TYPES.map((t) => (<option key={t} value={t}>{TOPIC_LABEL[t]}</option>))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-button`}>Button</Label>
          <select id={`${id}-button`} className="select select-sm w-full" value={cta.actionType} onChange={(ev) => onChange({ ...value, callToAction: { ...cta, actionType: ev.target.value as ActionType | "NONE" } })}>
            <option value="NONE">No button</option>
            {ACTION_TYPES.map((a) => (<option key={a} value={a}>{BUTTON_LABEL[a]}</option>))}
          </select>
        </div>
      </div>
      {needsUrl && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-url`}>Button link</Label>
          <Input id={`${id}-url`} type="url" value={cta.url ?? ""} onChange={(ev) => onChange({ ...value, callToAction: { ...cta, url: ev.target.value } })} placeholder={hasLink ? "Uses the post link when empty" : "https://"} />
        </div>
      )}
      <p className="text-xs text-secondary/70">{HINT.type} {HINT.button}</p>
      {topic !== "STANDARD" && <EventFields id={id} value={value} onChange={onChange} />}
      {topic === "OFFER" && <OfferFields id={id} value={value} onChange={onChange} />}
      {topic === "STANDARD" && <p className="text-xs text-secondary/70">{HINT.lifetime}</p>}
    </div>
  );
}
