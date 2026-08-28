import { redirect } from "next/navigation";
import { listUserWorkspaces, requireUser } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

/** Entry: send the user to their most recent workspace, or into onboarding. */
export default async function RootPage() {
  const session = await requireUser();
  const workspaces = await listUserWorkspaces(session.user.id);
  if (workspaces.length === 0) redirect("/onboarding");
  redirect(workspacePath(workspaces[0].id));
}
