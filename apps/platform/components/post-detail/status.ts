/** Status chips shared by the post detail header and its destination rows. */
export const STATUS: Record<string, { label: string; color: "success" | "warning" | "error" | "neutral" | "info" }> = {
  draft: { label: "Draft", color: "neutral" },
  scheduled: { label: "Scheduled", color: "info" },
  publishing: { label: "Publishing", color: "info" },
  published: { label: "Published", color: "success" },
  partially_published: { label: "Partially published", color: "warning" },
  failed: { label: "Failed", color: "error" },
  canceled: { label: "Canceled", color: "neutral" },
  in_review: { label: "In review", color: "warning" },
  changes_requested: { label: "Changes requested", color: "warning" },
  approved: { label: "Approved", color: "success" },
};

export const statusOf = (key: string) => STATUS[key] ?? STATUS.draft;
