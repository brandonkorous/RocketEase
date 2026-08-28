/** Business hours for automation conditions. Pure: no db, unit-testable. */

/** Mon-Fri 09:00-17:00 in the given IANA timezone. */
export function inBusinessHours(at: Date, timezone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(at);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return !["Sat", "Sun"].includes(weekday) && hour >= 9 && hour < 17;
}
