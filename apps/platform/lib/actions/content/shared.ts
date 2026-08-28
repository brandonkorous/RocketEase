import { AuthorizationError } from "@/lib/authz";

export type ActionState = { error?: string; ok?: string };
export const fail = (error: string): ActionState => ({ error });

/** Turns authorization failures into a user-facing ActionState; rethrows everything else. */
export const guard = async <T>(fn: () => Promise<T>): Promise<T | ActionState> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthorizationError) return fail("You don't have permission to do that.");
    throw e;
  }
};

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "workspace";
