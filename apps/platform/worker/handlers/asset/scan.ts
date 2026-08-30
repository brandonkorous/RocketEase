/*
 * Malware scanning. When CLAMAV_URL is unset there is no scanner, and this said
 * so only in a note that read "(dev)" while recording the asset as `clean` — so
 * production reported a control it was not running. The note is now accurate and
 * machine-readable, and REQUIRE_ASSET_SCAN makes the absence fail closed.
 */
import { NOT_SCANNED_NOTE } from "@/lib/assets/scan-note";

export async function scanBuffer(buf: Buffer): Promise<{ status: "clean" | "infected" | "error"; note?: string }> {
  const url = process.env.CLAMAV_URL;
  if (!url) {
    // Fail closed where that is the deliberate posture; otherwise pass, but say so.
    if (process.env.REQUIRE_ASSET_SCAN === "1") return { status: "error", note: "a scan is required here, and no scanner is configured" };
    return { status: "clean", note: NOT_SCANNED_NOTE };
  }
  try {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(buf)]), "upload");
    const res = await fetch(`${url.replace(/\/$/, "")}/scan`, { method: "POST", body: fd });
    const body = (await res.json()) as { infected?: boolean; viruses?: string[]; result?: { is_infected?: boolean; viruses?: string[] }[] };
    const infected = body.infected ?? body.result?.[0]?.is_infected ?? false;
    const viruses = body.viruses ?? body.result?.[0]?.viruses ?? [];
    return infected ? { status: "infected", note: viruses.join(", ") } : { status: "clean" };
  } catch (e) {
    return { status: "error", note: e instanceof Error ? e.message : "scan failed" };
  }
}
