"use client";

import { useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { generateAgencyRollup } from "@/lib/actions/agency/rollup";
import { useActionFeedback } from "@/lib/use-action-feedback";

/**
 * One document covering every client workspace you can see. Per-workspace
 * sections only — figures are never combined across clients.
 */
export function RollupButton({ organizationId }: { organizationId: string }) {
  const { notify } = useActionFeedback();
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setUrl(null);
    const res = await generateAgencyRollup(organizationId);
    setPending(false);
    notify(res);
    if (res.url) {
      setUrl(res.url);
      window.open(res.url, "_blank", "noopener");
    }
  }

  return (
    <span className="flex items-center gap-2">
      <Button size="sm" variant="outline" color="neutral" loading={pending} onClick={generate}>
        Generate agency overview
      </Button>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium hover:underline">
          Open again
        </a>
      )}
    </span>
  );
}
