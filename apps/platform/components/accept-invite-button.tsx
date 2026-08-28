"use client";

import { useState, useTransition } from "react";
import { Alert, AlertContent, Button } from "@wizeworks/silicaui-react";
import { acceptInvitation } from "@/lib/actions/invitations";

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert color="error" role="alert">
          <AlertContent>{error}</AlertContent>
        </Alert>
      )}
      <Button
        color="primary"
        size="lg"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInvitation(token);
            if (res?.error) setError(res.error);
          })
        }
      >
        Accept invitation
      </Button>
    </div>
  );
}
