import { Download } from "lucide-react";
import { Form } from "react-router";

import { formatDate } from "~/lib/availability";
import { Badge } from "~/components/ui/badge";
import { buttonVariants } from "~/components/ui/button";

import { SubmitButton } from "./submit-button";

export type GoogleWriteState = "unlinked" | "other-account" | "connect" | "off" | "on";

/**
 * A complete request's "Add to calendar" pair (plan/phase-17.md): a download
 * of its confirmed dates, and Google Calendar writing for the group in the
 * same states as the schedule page's calendar panel. `returnTo` is the page
 * it is shown on, where the Google controls come back to.
 */
export function CalendarActions({
  groupHref,
  requestId,
  requestName,
  google,
  until,
  returnTo,
}: {
  /** The group's path (`groupPath`). */
  groupHref: string;
  requestId: string;
  requestName: string;
  google: GoogleWriteState | null;
  until: string;
  returnTo: string;
}) {
  // A plain link: the file is a download, not a page the router can show.
  const download = `${groupHref}/requests/${requestId}/calendar.ics`;
  const connect = `/auth/google/calendar?scope=write&returnTo=${encodeURIComponent(returnTo)}`;
  // Google first (plan/phase-19.1.md): the switch, the connect link, or why
  // there is neither; then the one-time download.
  const googleHint =
    google === "on"
      ? "Already in your Google Calendar."
      : google === "unlinked"
        ? "To add them to Google Calendar, sign in with Google from the group page."
        : google === "other-account"
          ? "To add them to Google Calendar, sign in with Google as this member."
          : null;
  return (
    <div className="calendar-actions">
      {google === "off" ? (
        <Form method="post" action={`${groupHref}/schedule`} replace>
          <input type="hidden" name="intent" value="set-calendar" />
          <input type="hidden" name="value" value="on" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton
            feedbackKey={`set-calendar-${requestId}`}
            variant="outline"
            size="sm"
            label={`Add ${requestName} to Google Calendar`}
          >
            Add to Google Calendar
          </SubmitButton>
        </Form>
      ) : null}
      {google === "connect" ? (
        <a className={buttonVariants({ variant: "outline", size: "sm" })} href={connect}>
          Connect Google Calendar
        </a>
      ) : null}
      {googleHint ? <p className="hint">{googleHint}</p> : null}
      <a
        className={buttonVariants({ variant: "outline", size: "sm" })}
        href={download}
        download
        aria-label={`Download ${requestName} for your calendar (.ics)`}
      >
        <Download aria-hidden="true" />
        .ics
      </a>
      <p className="hint">
        The download is a one-time copy of dates through {formatDate(until)}; the calendar feed or
        Google Calendar keeps them up to date.
      </p>
    </div>
  );
}

/** "2 of 3 confirmed · 4 of 5 answered", or "Complete". */
export function ProgressFigures({
  item,
}: {
  item: {
    confirmed: number;
    total: number;
    answered: number | null;
    memberCount: number;
    complete: boolean;
  };
}) {
  return (
    <span className="hint progress-figures">
      {item.confirmed} of {item.total} confirmed
      {item.answered !== null ? ` · ${item.answered} of ${item.memberCount} answered all` : ""}
      {item.complete ? (
        <>
          {" "}
          <Badge variant="success" className="request-complete">
            Complete
          </Badge>
        </>
      ) : null}
    </span>
  );
}
