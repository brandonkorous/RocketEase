/** ClamAV REST (clamav-rest / clamd HTTP) when CLAMAV_URL is set; otherwise a dev no-op that records it was skipped. */
export async function scanBuffer(buf: Buffer): Promise<{ status: "clean" | "infected" | "error"; note?: string }> {
  const url = process.env.CLAMAV_URL;
  if (!url) return { status: "clean", note: "scanner not configured (dev)" };
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
