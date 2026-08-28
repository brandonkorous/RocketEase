import type { RuleAction } from "@/db/schema/automations";
import type { Creator } from "../capabilities";
import type { Subject } from "../facts";

/** Everything an action needs: which rule is acting, on what, and as whom. */
export type ApplyContext = {
  rule: { id: string; name: string };
  runId: string;
  subject: Subject;
  /** The rule's creator, re-loaded this run. Null when they left the workspace. */
  creator: Creator | null;
};

export type ActionHandler = (c: ApplyContext, a: RuleAction) => Promise<import("@/db/schema/automations").ActionOutcome>;
