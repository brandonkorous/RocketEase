"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ValidationIssue } from "@make-it-social/providers";
import { saveDraft, scheduleItem } from "@/lib/actions/content";
import { requestApproval } from "@/lib/actions/approvals";
import { workspacePath } from "@/lib/nav";
import type { Approval, ComposerAsset, ComposerChannel, ComposerItem, Method, Override } from "./types";

function defaultWhen(tz: string) {
  const d = new Date(Date.now() + 60 * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const minute = String(((Math.ceil(Number(g("minute")) / 15) * 15) % 60)).padStart(2, "0");
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${minute}` };
}

function withUtm(link: string, utm: { source: string; medium: string; campaign: string }) {
  if (!link) return "";
  try {
    const u = new URL(link);
    if (utm.source) u.searchParams.set("utm_source", utm.source);
    if (utm.medium) u.searchParams.set("utm_medium", utm.medium);
    if (utm.campaign) u.searchParams.set("utm_campaign", utm.campaign);
    return u.toString();
  } catch {
    return link;
  }
}

export function useComposer(args: { workspaceId: string; timezone: string; item: ComposerItem; channels: ComposerChannel[]; assets: ComposerAsset[]; approval: Approval }) {
  const { workspaceId, timezone, item, channels, assets, approval } = args;
  const router = useRouter();
  const dw = defaultWhen(timezone);
  const [title, setTitle] = useState(item.title);
  const [text, setText] = useState(item.sharedText);
  const [assetIds, setAssetIds] = useState<string[]>(item.sharedAssetIds);
  const [link, setLink] = useState(item.link ?? "");
  const [utm, setUtm] = useState({ source: "", medium: "social", campaign: "" });
  const [selected, setSelected] = useState<string[]>(item.channelIds.length ? item.channelIds : channels.filter((c) => c.formats.length).slice(0, 6).map((c) => c.id));
  const [customize, setCustomize] = useState(Object.values(item.variants).some((v) => v.textOverride !== null || v.firstComment));
  const [overrides, setOverrides] = useState<Record<string, Override>>(Object.fromEntries(Object.entries(item.variants).map(([k, v]) => [k, { textOverride: v.textOverride, firstComment: v.firstComment ?? "", linkOverride: v.linkOverride }])));
  const [validation, setValidation] = useState<Record<string, ValidationIssue[]>>(Object.fromEntries(Object.entries(item.variants).map(([k, v]) => [k, v.validation])));
  const [save, setSave] = useState<{ saving: boolean; savedAt: string | null; error: string | null }>({ saving: false, savedAt: null, error: null });
  const [method, setMethod] = useState<Method>(approval.required && approval.state !== "approved" ? "review" : "schedule");
  const [date, setDate] = useState(item.scheduledAtLocal?.slice(0, 10) ?? dw.date);
  const [time, setTime] = useState(item.scheduledAtLocal?.slice(11, 16) ?? dw.time);
  const [reviewer, setReviewer] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const firstRun = useRef(true);

  const effectiveLink = useMemo(() => withUtm(link, utm), [link, utm]);
  const selectedChannels = channels.filter((c) => selected.includes(c.id));
  const chosenAssets = assetIds.map((id) => assets.find((a) => a.id === id)).filter((a): a is ComposerAsset => Boolean(a));
  const issues = selected.flatMap((id) => (validation[id] ?? []).map((i) => ({ ...i, channelId: id })));

  const buildInput = useCallback(
    () => ({
      workspaceId, itemId: item.id, title: title || undefined, sharedText: text, sharedAssetIds: assetIds, link: effectiveLink || "", channelIds: selected,
      variants: Object.fromEntries(selected.map((id) => { const o = overrides[id]; return [id, customize && o ? { textOverride: o.textOverride, firstComment: o.firstComment || null, linkOverride: o.linkOverride } : { textOverride: null, firstComment: null, linkOverride: null }]; })),
    }),
    [workspaceId, item.id, title, text, assetIds, effectiveLink, selected, overrides, customize],
  );

  const persist = useCallback(async () => {
    setSave((s) => ({ ...s, saving: true, error: null }));
    const r = await saveDraft(buildInput());
    if ("validation" in r) {
      setValidation(Object.fromEntries(Object.entries(r.validation).map(([k, v]) => [k, v.issues])));
      setSave({ saving: false, savedAt: r.savedAt, error: null });
      return true;
    }
    setSave({ saving: false, savedAt: null, error: r.error ?? "Could not save" });
    return false;
  }, [buildInput]);

  // Debounced autosave; the very first render only saves when the draft has no variants yet.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (item.channelIds.length === 0 && selected.length) void persist();
      return;
    }
    const t = setTimeout(() => void persist(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, text, assetIds, effectiveLink, selected, overrides, customize]);

  const submit = (m: Method) => {
    setSubmitError(null);
    start(async () => {
      if (!(await persist())) return;
      const detail = workspacePath(workspaceId, `posts/${item.id}`);
      if (m === "draft") return router.push(detail);
      const r = m === "review"
        ? await requestApproval({ workspaceId, itemId: item.id, assigneeUserId: reviewer || null, note: reviewNote || undefined, scheduleOnApprove: `${date}T${time}` })
        : await scheduleItem({ workspaceId, itemId: item.id, when: m === "now" ? "now" : `${date}T${time}` });
      if (r.error) setSubmitError(r.error);
      else router.push(("redirect" in r && r.redirect) || detail);
    });
  };

  const toggleChannel = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return {
    title, setTitle, text, setText, assetIds, setAssetIds, link, setLink, utm, setUtm, selected, toggleChannel, customize, setCustomize, overrides, setOverrides,
    validation, save, method, setMethod, date, setDate, time, setTime, reviewer, setReviewer, reviewNote, setReviewNote, submitError, pending, submit,
    effectiveLink, selectedChannels, chosenAssets, issues, router,
  };
}

export type ComposerState = ReturnType<typeof useComposer>;
