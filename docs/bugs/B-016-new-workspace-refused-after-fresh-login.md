# B-016 — "New workspace" refused an organization owner after a fresh login

- **Severity:** P2 — an owner could not add a workspace from `/onboarding/workspace` unless
  the session had been through onboarding or an invitation in the same login.
- **Found:** 2026-09-06, in the self-hosted live check (expired-licence pass), where the owner
  signs in fresh and tries to add a workspace.
- **Status:** fixed.

## What happened

```
Only organization owners and admins can create workspaces.
```

shown to the person who created the organization ten minutes earlier — on a fresh login.

## Cause

`createWorkspace` asked Better Auth for the **active member**:

```ts
const member = await auth.api.getActiveMember({ headers: h, query: { organizationId } });
```

A session that has not called `setActiveOrganization` yet (onboarding and invitation
acceptance do; a plain login does not) has no active organization, and the answer is
"not a member" — for anyone. The check confused *"which organization is active in this
session"* with *"is this person an owner of that organization"*.

## Fix

Read the membership ROW, which is the fact being checked:

```ts
const membership = await db.query.member.findFirst({ where: (m, { and, eq }) => and(eq(m.organizationId, organizationId), eq(m.userId, session.user.id)), columns: { role: true } });
```

The licence and billing gates that follow were unaffected; they run after this check.

## Lesson

A session's *active* organization is a UI convenience. Authorization reads the membership
table. The same rule already held for workspaces (`requireWorkspace`); this was the one
organization-level check that had not followed it.
