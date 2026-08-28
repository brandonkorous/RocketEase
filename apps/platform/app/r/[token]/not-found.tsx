/** Every dead share link lands here with a 404: unknown, expired and revoked look the same from outside. */
export default function ShareNotFound() {
  return (
    <main className="mx-auto w-full max-w-260 px-6 py-12">
      <h1 className="app-title">This link isn&rsquo;t available</h1>
      <p className="mt-2 max-w-140 text-base text-secondary">
        Report links are time-limited and can be withdrawn at any time, so this one may have expired or been revoked — or the address was mistyped. Ask whoever
        sent it for a fresh link.
      </p>
    </main>
  );
}
