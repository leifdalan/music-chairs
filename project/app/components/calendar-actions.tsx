import { Form } from "react-router";

import { formatDate } from "~/lib/availability";

import { SubmitButton } from "./submit-button";

export type GoogleWriteState = "unlinked" | "other-account" | "connect" | "off" | "on";

/**
 * A complete request's "Add to calendar" pair (plan/phase-17.md): a download
 * of its confirmed dates, and Google Calendar writing for the group in the
 * same states as the schedule page's calendar panel. `returnTo` is the page
 * it is shown on, where the Google controls come back to.
 */
export function CalendarActions({
  groupId,
  requestId,
  requestName,
  google,
  until,
  returnTo,
}: {
  groupId: string;
  requestId: string;
  requestName: string;
  google: GoogleWriteState | null;
  until: string;
  returnTo: string;
}) {
  // A plain link: the file is a download, not a page the router can show.
  const download = `/g/${groupId}/requests/${requestId}/calendar.ics`;
  const connect = `/auth/google/calendar?scope=write&returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <div className="calendar-actions">
      <a
        className="button-link secondary small"
        href={download}
        download
        aria-label={`Download ${requestName} for your calendar`}
      >
        Download for your calendar
      </a>
      {google === "off" ? (
        <Form method="post" action={`/g/${groupId}/schedule`} replace>
          <input type="hidden" name="intent" value="set-calendar" />
          <input type="hidden" name="value" value="on" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton
            feedbackKey={`set-calendar-${requestId}`}
            className="secondary small"
            label={`Add ${requestName} to Google Calendar`}
          >
            Add to Google Calendar
          </SubmitButton>
        </Form>
      ) : null}
      {google === "connect" ? (
        <a className="button-link secondary small" href={connect}>
          Connect Google Calendar
        </a>
      ) : null}
      <p className="hint">
        The download is a one-time copy of dates through {formatDate(until)}; the calendar feed or
        Google Calendar keeps them up to date.
        {google === "on" ? " Already in your Google Calendar." : null}
        {google === "unlinked"
          ? " To add them to Google Calendar, sign in with Google from the group page."
          : null}
        {google === "other-account"
          ? " To add them to Google Calendar, sign in with Google as this member."
          : null}
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
      {item.answered !== null ? ` · ${item.answered} of ${item.memberCount} answered` : ""}
      {item.complete ? <strong className="request-complete"> · Complete</strong> : null}
    </span>
  );
}
