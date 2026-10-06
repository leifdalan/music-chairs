import { Link } from "react-router";

/** One rehearsal from an availability request, as `requestRehearsals` gives it. */
export type ProposedItem = {
  id: string;
  status: "proposed" | "confirmed";
  summary: string;
  location: string;
  answered: number;
  memberCount: number;
};

/**
 * An availability request's rehearsals, compactly (plan/phase-24.md): what,
 * where and how far along, each linking to its card on the schedule, where
 * members answer and organizers confirm.
 */
export function ProposedList({
  items,
  scheduleHref,
  empty,
}: {
  items: ProposedItem[];
  scheduleHref: string;
  /** Shown when there are none; nothing at all when null. */
  empty: string | null;
}) {
  if (items.length === 0) return empty ? <p className="hint">{empty}</p> : null;
  return (
    <ul className="proposed-rehearsals">
      {items.map((item) => (
        <li key={item.id}>
          <span className="proposed-summary">{item.summary}</span>
          {item.location ? <span className="hint"> · {item.location}</span> : null}
          <span className="hint proposed-state">
            {item.status === "confirmed"
              ? "Confirmed"
              : `${item.answered} of ${item.memberCount} answered`}
          </span>
          <Link to={`${scheduleHref}#rehearsal-${item.id}`} className="proposed-link">
            Answer on the schedule
          </Link>
        </li>
      ))}
    </ul>
  );
}
