/**
 * Meta posts `signed_request` as a form field, but has historically also sent
 * it as JSON. Read both rather than 400ing on a shape the provider chooses.
 */
export async function signedRequestFrom(req: Request): Promise<string | null> {
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await req.json()) as { signed_request?: unknown };
      return typeof body.signed_request === "string" ? body.signed_request : null;
    }
    const form = await req.formData();
    const value = form.get("signed_request");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
