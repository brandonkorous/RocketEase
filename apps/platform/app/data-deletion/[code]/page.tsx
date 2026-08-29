import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@wizeworks/silicaui-react";
import { db } from "@/db";
import type { DeletionRequestStatus } from "@/db/schema/connections";

export const metadata: Metadata = { title: "Data deletion request — RocketEase" };
export const dynamic = "force-dynamic";

const STATUS: Record<DeletionRequestStatus, { label: string; body: string }> = {
  received: { label: "Received", body: "We have your request and it is queued. This page updates as it progresses." },
  processing: { label: "In progress", body: "We are revoking access tokens and removing the data held for your account." },
  completed: {
    label: "Completed",
    body: "Access tokens were revoked and deleted immediately. Cached provider data — profile details, conversations, insights and post records — is removed within 30 days.",
  },
  no_match: {
    label: "Nothing to delete",
    body: "We found no data held for this account. That usually means it was already disconnected, or it was never connected to RocketEase.",
  },
  failed: { label: "Needs attention", body: "Something went wrong and we are retrying. If this does not clear, contact us with the confirmation code below." },
};

export default async function DeletionStatusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const request = await db.query.providerDeletionRequest.findFirst({ where: (r, { eq }) => eq(r.confirmationCode, code) });
  if (!request) notFound();

  const status = STATUS[request.status];
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-bold tracking-tight">Data deletion request</h1>

      <div className="mt-8 rounded-box border border-base-300 p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{status.label}</h2>
          <Badge color="neutral" variant="outline">
            {request.provider}
          </Badge>
        </div>
        <p className="mt-3 leading-relaxed text-secondary">{status.body}</p>

        <dl className="mt-6 space-y-3 border-t border-base-300 pt-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Confirmation code</dt>
            <dd className="font-mono">{request.confirmationCode}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Requested</dt>
            <dd>{request.receivedAt.toISOString().slice(0, 10)}</dd>
          </div>
          {request.completedAt && (
            <div className="flex justify-between gap-4">
              <dt className="text-secondary">Completed</dt>
              <dd>{request.completedAt.toISOString().slice(0, 10)}</dd>
            </div>
          )}
        </dl>
      </div>

      <p className="mt-8 text-sm leading-relaxed text-secondary">
        Content already published to a social network is not affected — RocketEase cannot delete it there. Remove it at the network
        itself. Questions about this request: <a href="mailto:support@rocketease.com" className="underline">support@rocketease.com</a>.
      </p>
    </main>
  );
}
