import { describe, expect, it } from "vitest";
import { inboxPollDue } from "./cadence";

const now = Date.parse("2026-10-24T12:00:00Z");
const ago = (min: number) => new Date(now - min * 60_000);

describe("inboxPollDue", () => {
  it("polls a channel that has never synced", () => expect(inboxPollDue(undefined, now)).toBe(true));
  it("polls every tick while there is recent activity", () => expect(inboxPollDue({ freshAt: ago(5), lastSuccessAt: ago(2) }, now)).toBe(true));
  it("backs off when the channel is quiet", () => expect(inboxPollDue({ freshAt: ago(90), lastSuccessAt: ago(2) }, now)).toBe(false));
  it("polls a quiet channel again after about 15 minutes", () => expect(inboxPollDue({ freshAt: ago(90), lastSuccessAt: ago(14) }, now)).toBe(true));
});
