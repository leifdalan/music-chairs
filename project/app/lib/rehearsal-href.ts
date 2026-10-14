/**
 * A link to one rehearsal on its group's schedule (plan/phase-39.md): the hash
 * finds its card, and for a proposed rehearsal the calendar opens on its date
 * (`on`). A confirmed one has no popup, and its date may hold another's.
 */
export function rehearsalHref(
  schedulePath: string,
  rehearsal: { id: string; date: string; status: "proposed" | "confirmed" },
): string {
  const on = rehearsal.status === "proposed" ? `?on=${rehearsal.date}` : "";
  return `${schedulePath}${on}#rehearsal-${rehearsal.id}`;
}
