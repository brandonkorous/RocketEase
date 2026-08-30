/*
 * The app's own public origin.
 *
 * Redirects MUST be built on this rather than on `req.url`. Behind the shared
 * Caddy proxy the Next standalone server sees its own bind address, so
 * `new URL(path, req.url)` resolves to https://0.0.0.0:3000/... — an absolute
 * URL that leaves the browser stranded. It looks correct locally, where the
 * bind address and the public origin happen to be the same.
 */
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001").replace(/\/+$/, "");

/** Absolute URL for an in-app path, safe to hand to NextResponse.redirect. */
export const absoluteUrl = (path: string) => new URL(path, appUrl()).toString();
