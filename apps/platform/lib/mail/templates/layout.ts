/* Shared chrome for every transactional email. Monochrome, no images by default. */

export const APP_NAME = "Make It Social";

export type Rendered = { subject: string; html: string; text: string };

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${esc(label)}</a></p>`;

const frame = (masthead: string, title: string, body: string, footer: string) =>
  `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a">
<div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:14px;padding:32px">
${masthead}
<h1 style="font-size:22px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 12px">${esc(title)}</h1>
<div style="font-size:15px;line-height:1.6;color:#404040">${body}</div>
<p style="font-size:12px;color:#737373;margin-top:32px">${footer}</p>
</div></body></html>`;

export const layout = (title: string, body: string) =>
  frame(`<p style="font-weight:700;font-size:16px;margin:0 0 20px">${APP_NAME}</p>`, title, body, "If you didn't expect this email, you can ignore it.");

/** Agency-branded chrome for client-facing mail: a name and an optional logo, never an accent colour. */
export const brandedLayout = (brand: { name: string; logoDataUri?: string | null; footerText?: string | null }, title: string, body: string) =>
  frame(
    brand.logoDataUri
      ? `<img src="${brand.logoDataUri}" alt="${esc(brand.name)}" style="max-height:36px;max-width:180px;display:block;margin:0 0 20px" />`
      : `<p style="font-weight:700;font-size:16px;margin:0 0 20px">${esc(brand.name)}</p>`,
    title,
    body,
    esc(brand.footerText || `Sent by ${brand.name}.`),
  );
