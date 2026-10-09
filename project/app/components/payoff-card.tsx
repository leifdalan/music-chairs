import { Check } from "lucide-react";
import { Link } from "react-router";

import { formatDate, timeRange } from "~/lib/availability";

export type PayoffAnswer = "yes" | "no" | "maybe" | null;

/** A confirmed rehearsal's next date, as the payoff shows it (plan/phase-26.md). */
export type PayoffData = {
  date: string;
  startMinute: number;
  endMinute: number;
  location: string;
  /** The viewer's own answer for this date. */
  mine: PayoffAnswer;
  /** Names of those who said yes, when the viewer may see names; else null. */
  comingNames: string[] | null;
  /** How many said yes, and how many answered at all. */
  yes: number;
  answered: number;
};

/** "You're on", or what the viewer said, for a confirmed date. */
export function payoffHeadline(mine: PayoffAnswer): string {
  if (mine === "yes") return "You're on";
  if (mine === "maybe") return "Confirmed — you said maybe";
  if (mine === "no") return "Confirmed — you said you can't make it";
  return "Confirmed — are you coming?";
}

/** Who is coming: yes answers only, as names when allowed, else a count. */
export function comingLine({ comingNames, yes, answered }: PayoffData): string {
  if (answered === 0) return "No one has answered yet";
  if (yes === 0) return "No one has said yes yet";
  if (comingNames) return `Coming: ${comingNames.join(", ")}`;
  return `${yes} coming`;
}

/** The payoff's content: the headline, when and where, and who is coming. */
export function PayoffBody({ payoff }: { payoff: PayoffData }) {
  return (
    <div className="payoff">
      <p className="payoff-headline">
        <Check aria-hidden="true" className="payoff-check" />
        {payoffHeadline(payoff.mine)}
      </p>
      <p className="payoff-when">
        {formatDate(payoff.date)} · {timeRange(payoff.startMinute, payoff.endMinute)}
        {payoff.location ? ` · ${payoff.location}` : ""}
      </p>
      <p className="hint payoff-coming">{comingLine(payoff)}</p>
    </div>
  );
}

/**
 * The home page's payoff for a group's next confirmed rehearsal: a card of
 * its own, linking to the rehearsal on the schedule.
 */
export function PayoffCard({
  payoff,
  groupName,
  href,
}: {
  payoff: PayoffData;
  groupName: string;
  href: string;
}) {
  return (
    <li className="payoff-card">
      <p className="hint payoff-group">{groupName}</p>
      <PayoffBody payoff={payoff} />
      <Link to={href} className="payoff-link">
        Open on the schedule
      </Link>
    </li>
  );
}
