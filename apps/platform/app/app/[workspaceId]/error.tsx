"use client";

import { useEffect } from "react";
import { Button } from "@wizeworks/silicaui-react";

/**
 * A rolling deploy invalidates the Server Action ids an open tab is holding, so
 * the next click fails with UnrecognizedActionError. Without a boundary Next
 * renders a bare "Application error" page, which tells the user nothing and, on
 * a Publish button, leaves them unsure whether it happened.
 */
const isStaleBuild = (e: Error) => /server action|failed to find server action|unrecognizedaction/i.test(`${e.name} ${e.message}`);

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleBuild(error);

  useEffect(() => {
    // The digest is the only handle support has on a server-side failure.
    console.error("workspace error", { digest: error.digest, name: error.name, message: error.message });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-140 flex-col items-start gap-4 px-6 py-20">
      <h1 className="text-xl font-bold tracking-tight">{stale ? "RocketEase updated while this page was open" : "Something went wrong on our side"}</h1>
      <p className="text-sm text-secondary">
        {stale
          ? "Your last action did not run — nothing was saved, sent, or published. Reload to pick up the new version and try it again."
          : "The page could not load. Nothing you were doing has been lost; try again, and if it keeps happening send us the reference below."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button color="primary" onClick={() => (stale ? window.location.reload() : reset())}>
          {stale ? "Reload the page" : "Try again"}
        </Button>
        {!stale && (
          <Button variant="outline" color="neutral" onClick={() => window.location.reload()}>
            Reload
          </Button>
        )}
      </div>
      {error.digest && <p className="text-xs text-secondary/70">Reference {error.digest}</p>}
    </div>
  );
}
