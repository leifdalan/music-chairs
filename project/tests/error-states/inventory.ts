// Every request music-chairs makes, and every way it can fail (plan/phase-34.md):
// what the person sees, and what proves it. `error-states.test.tsx` keeps this
// complete (every loader, every action intent, every Google call) and replays
// each probe against the routes; Phase 35's screenshots work from it.

import type { ToastKind } from "../../app/lib/toast-kind";

/** A request the test replays against the route, with `{placeholders}` from its fixture. */
export type Probe = {
  /** Who asks: nobody known, a name-only member, an organizer, or a signed-in stranger. */
  as: "visitor" | "member" | "organizer" | "signed-in";
  /** Path with `{group}`, `{request}`, `{open}`, `{invite}`, `{feed}` placeholders. */
  path: string;
  /** Form fields, posted when present; `{proposed}`, `{member}`, `{organizer}` placeholders. */
  form?: Record<string, string>;
  expect: {
    status: number;
    /** The redirect's target, with placeholders. */
    location?: string;
    /** A key of the returned data the page renders. */
    data?: string;
    /** The kind of toast the redirect leaves. */
    toast?: ToastKind;
  };
};

/** A test, by its exact title, or a check of the recorded browser gate. */
export type Proof = { file: string; test: string } | { gate: "browser.failures"; check: string };

export type Outcome = {
  /** Stable within its call; Phase 35 names screenshots by it. */
  id: string;
  when: string;
  sees: string;
  probe?: Probe;
  proof?: Proof[];
};

export type Call = { key: string; outcomes: Outcome[] };

const FAILURE_TESTS = "tests/client-failure.test.ts";
const STATES = "tests/error-states.test.tsx";
const AUTH = "tests/auth.test.ts";
const CONSENT = "tests/calendar-consent.test.ts";

/** A save in the browser that fails before the server answers (plan/phase-34.md). */
function browserFailure(
  how: "page" | "fetcher" | "elsewhere",
  creates = false,
  id = "browser-failure",
): Outcome {
  const where =
    how === "fetcher"
      ? "at the bottom of the screen with the toasts; the control keeps the change"
      : "at the bottom of the screen with the toasts; the page stays as it was with what was typed";
  return {
    id,
    when: "In the browser, the connection drops, the server answers with an error or doesn't answer within 20 seconds, or the thing was deleted or is organizer-only",
    sees: creates
      ? `“Maybe not saved.” and why, ${where}, with Reload to check rather than Retry`
      : `“Not saved.” or “Maybe not saved.” and why, ${where}, with Retry (Reload when it was deleted or isn't theirs)`,
    proof: [
      {
        file: FAILURE_TESTS,
        test: "stays on the page as data, reloads nothing and never reaches the error page",
      },
      {
        file: FAILURE_TESTS,
        test: "tells a thrown status, a lost connection, a crash and a redirect apart",
      },
      {
        file: FAILURE_TESTS,
        test: "gives up waiting after 20 seconds and says the server didn't answer",
      },
      ...(creates
        ? [
            {
              file: FAILURE_TESTS,
              test: "offers a reload to check, not a retry, for something that would be made twice",
            },
          ]
        : []),
      how === "fetcher"
        ? { file: STATES, test: "shows a failed date's change until it's retried or superseded" }
        : how === "elsewhere"
          ? {
              file: FAILURE_TESTS,
              test: "keeps a form posted to another page's action on the page it came from, as a fetcher",
            }
          : { file: STATES, test: "a failed save says so with Retry, or Reload for a create" },
      how === "fetcher"
        ? { file: FAILURE_TESTS, test: "stays with an in-page save (a fetcher), reloading nothing" }
        : {
            file: STATES,
            test: "keeps the last result while a failure shows, and lets a later result replace it",
          },
    ],
  };
}

/** A page load in the app that never gets an answer. */
const PAGE_UNREACHABLE: Outcome = {
  id: "unreachable",
  when: "Moving to this page in the app while the connection is down, or the server errs",
  sees: "“Couldn't reach music-chairs” (or “Something went wrong on our side”) with Try again and the way back",
  proof: [
    {
      file: STATES,
      test: "the error page names a missing page, an organizer-only page, our failure and a lost connection",
    },
    {
      gate: "browser.failures",
      check: "page load offline: the connection error page with Try again",
    },
  ],
};

const unknownGroup = (suffix = ""): Outcome => ({
  id: "unknown-group",
  when: "The group's address matches no group (deleted, or a mistyped link)",
  sees: "“Page not found”",
  probe: { as: "visitor", path: `/g/nosuchgroup-zzzzzzzz${suffix}`, expect: { status: 404 } },
});

const VISITOR_TO_GROUP = (path: string): Outcome => ({
  id: "visitor",
  when: "Someone this device isn't a member as opens it",
  sees: "The group's page, where they can join",
  probe: { as: "visitor", path, expect: { status: 302, location: "{group}" } },
});

const MEMBER_FORBIDDEN = (path: string, form?: Record<string, string>): Outcome => ({
  id: "organizer-only",
  when: "A member who isn't an organizer asks (for example after losing the role)",
  sees: form
    ? "In the browser “Not saved. Only organizers can do that.”; without JavaScript “Only organizers can see this”"
    : "“Only organizers can see this”, with the way back to the group",
  probe: { as: "member", path, form, expect: { status: 403 } },
});

const UNKNOWN_INTENT = (
  path: string,
  as: Probe["as"] = "organizer",
  fields: Record<string, string> = {},
): Outcome => ({
  id: "unknown-intent",
  when: "A form posts something this page doesn't do (an old page, or a tampered form)",
  sees: "“Something went wrong. Please try again.” at the top of the page",
  probe: {
    as,
    path,
    form: { intent: "no-such-thing", ...fields },
    expect: { status: 400, data: "problem" },
  },
});

export const INVENTORY: Call[] = [
  // Page loads.
  {
    key: "routes/home GET",
    outcomes: [
      PAGE_UNREACHABLE,
      {
        id: "notice",
        when: "Back from Google sign-in or consent that didn't fully work",
        sees: "What happened, in a notice at the top",
        proof: [
          {
            file: STATES,
            test: "home and each page show their own notices; the root shows the rest, each once",
          },
        ],
      },
    ],
  },
  {
    key: "routes/healthz GET",
    outcomes: [
      {
        id: "ok",
        when: "The deploy checks the server",
        sees: "Nobody: the deploy reads “ok”",
        probe: { as: "visitor", path: "/healthz", expect: { status: 200 } },
      },
    ],
  },
  { key: "routes/groups GET", outcomes: [PAGE_UNREACHABLE] },
  {
    key: "routes/group GET",
    outcomes: [PAGE_UNREACHABLE, unknownGroup()],
  },
  {
    key: "routes/schedule GET",
    outcomes: [
      PAGE_UNREACHABLE,
      unknownGroup("/schedule"),
      VISITOR_TO_GROUP("{group}/schedule"),
      {
        id: "calendar-write-failed",
        when: "Google Calendar couldn't be updated the last time music-chairs tried",
        sees: "“Your Google Calendar couldn't be updated (last tried …)” in the calendar panel, to that member only",
        proof: [
          {
            file: STATES,
            test: "shows a calendar that couldn't be updated to its member until an update works",
          },
        ],
      },
      {
        id: "calendar-access-removed",
        when: "Google refused the calendar access music-chairs had (removed at myaccount.google.com)",
        sees: "“Google Calendar access was removed” with Reconnect Google Calendar",
        proof: [
          {
            file: STATES,
            test: "says Google Calendar access was removed, not that it was never given",
          },
        ],
      },
    ],
  },
  {
    key: "routes/profile GET",
    outcomes: [
      {
        id: "to-group",
        when: "Someone opens the profile address itself",
        sees: "The group's page",
        probe: {
          as: "member",
          path: "{group}/profile",
          expect: { status: 302, location: "{group}" },
        },
      },
    ],
  },
  {
    key: "routes/members.add GET",
    outcomes: [
      PAGE_UNREACHABLE,
      VISITOR_TO_GROUP("{group}/members/add"),
      MEMBER_FORBIDDEN("{group}/members/add"),
      {
        id: "contacts-unreadable",
        when: "Google contacts can't be read (an error, no answer within 5 seconds, or access removed)",
        sees: "“Couldn't read your Google contacts right now” or “access was removed” with Reconnect; typing a name still works",
        proof: [
          {
            file: STATES,
            test: "says what happened to Google contacts: unreadable, removed or none found",
          },
        ],
      },
      {
        id: "contacts-none",
        when: "Google has no contacts with an email address",
        sees: "“No contacts with an email address were found”",
        proof: [
          {
            file: STATES,
            test: "says what happened to Google contacts: unreadable, removed or none found",
          },
        ],
      },
    ],
  },
  {
    key: "routes/requests.new GET",
    outcomes: [
      PAGE_UNREACHABLE,
      VISITOR_TO_GROUP("{group}/requests/new"),
      MEMBER_FORBIDDEN("{group}/requests/new"),
      {
        id: "unknown-edit",
        when: "Editing or repeating a request that no longer exists",
        sees: "“Page not found”",
        probe: {
          as: "organizer",
          path: "{group}/requests/new?edit=nosuchrequest",
          expect: { status: 404 },
        },
      },
    ],
  },
  {
    key: "routes/request GET",
    outcomes: [
      PAGE_UNREACHABLE,
      {
        id: "unknown-request",
        when: "The request was deleted, or the link is mistyped",
        sees: "“Page not found”",
        probe: { as: "member", path: "{group}/no-such-request", expect: { status: 404 } },
      },
      {
        id: "visitor",
        when: "Someone not in the group opens a request's address (the share link joins first)",
        sees: "The group's page, where they can join",
        probe: {
          as: "visitor",
          path: "{open}",
          expect: { status: 302, location: "{group}" },
        },
      },
      {
        id: "clashes-unreadable",
        when: "Google Calendar can't be read for clashes (any error, or no answer within 5 seconds)",
        sees: "“Couldn't read your Google Calendar right now; nothing is greyed.” (in a first answer: every date ticked, check them)",
        proof: [
          { file: STATES, test: "reads clashes whatever goes wrong, giving up after 5 seconds" },
        ],
      },
      {
        id: "clashes-access-removed",
        when: "Google refused the calendar access music-chairs had",
        sees: "“Google Calendar access was removed, so clashes can't be shown.” with Reconnect",
        proof: [
          {
            file: STATES,
            test: "says Google Calendar access was removed, not that it was never given",
          },
        ],
      },
    ],
  },
  {
    key: "routes/request-calendar GET",
    outcomes: [
      {
        id: "unknown-group",
        when: "A download link into a group that was deleted",
        sees: "The start page, saying “That link is out of date: what it pointed to was deleted or changed.”",
        probe: {
          as: "visitor",
          path: "/g/nosuchgroup-zzzzzzzz/no-such-request/calendar.ics",
          expect: { status: 302, location: "/?notice=link-gone" },
        },
      },
      {
        id: "unknown-request",
        when: "A download link for a request that was deleted",
        sees: "The group's page, saying “That link is out of date: what it pointed to was deleted or changed.”",
        probe: {
          as: "member",
          path: "{group}/no-such-request/calendar.ics",
          expect: { status: 302, location: "{group}?notice=link-gone" },
        },
      },
      {
        id: "not-ready",
        when: "The download is opened before the request's rehearsals are confirmed (only a link copied or kept from before: the page offers it once they are)",
        sees: "The request page, saying there's no calendar file yet (a browser told to download the link may save that page as a file instead)",
        probe: {
          as: "member",
          path: "{open}/calendar.ics",
          expect: { status: 302, location: "{open}?notice=ics-unavailable" },
        },
      },
      VISITOR_TO_GROUP("{open}/calendar.ics"),
    ],
  },
  {
    key: "routes/rehearsal-link GET",
    outcomes: [
      {
        id: "unknown-rehearsal",
        when: "A link to a proposed time that was deleted",
        sees: "The schedule, saying “That link is out of date: what it pointed to was deleted or changed.”",
        probe: {
          as: "member",
          path: "{open}/no-such-time",
          expect: { status: 302, location: "{group}/schedule?notice=link-gone" },
        },
      },
      {
        id: "unknown-request",
        when: "A link to a proposed time in a request that was deleted",
        sees: "The schedule, saying “That link is out of date: what it pointed to was deleted or changed.”",
        probe: {
          as: "member",
          path: "{group}/no-such-request/no-such-time",
          expect: { status: 302, location: "{group}/schedule?notice=link-gone" },
        },
      },
      {
        id: "unknown-group",
        when: "A link into a group that was deleted",
        sees: "The start page, saying “That link is out of date: what it pointed to was deleted or changed.”",
        probe: {
          as: "visitor",
          path: "/g/nosuchgroup-zzzzzzzz/no-such-request/no-such-time",
          expect: { status: 302, location: "/?notice=link-gone" },
        },
      },
    ],
  },
  {
    key: "routes/join GET",
    outcomes: [
      PAGE_UNREACHABLE,
      {
        id: "unknown-invite",
        when: "An invite link that matches no group",
        sees: "“Page not found”",
        probe: { as: "visitor", path: "/join/nosuchgroup-zzzzzzzz", expect: { status: 404 } },
      },
    ],
  },
  {
    key: "routes/calendar-feed GET",
    outcomes: [
      {
        id: "unknown-feed",
        when: "A calendar app asks for a feed that no longer exists (member removed)",
        sees: "The calendar app reports the feed is gone",
        probe: { as: "visitor", path: "/calendar/nosuchfeed.ics", expect: { status: 404 } },
      },
    ],
  },
  {
    key: "routes/auth.google GET",
    outcomes: [
      {
        id: "unavailable",
        when: "Signing in with Google isn't set up on this server",
        sees: "Back on the page, “Signing in with Google isn't available right now”",
        proof: [{ file: AUTH, test: "is unavailable without the client secret" }],
      },
    ],
  },
  {
    key: "routes/auth.google.calendar GET",
    outcomes: [
      {
        id: "signed-out",
        when: "Asking for a Google permission while not signed in",
        sees: "Signing in with Google first",
        proof: [{ file: CONSENT, test: "sends a visitor who isn't signed in to sign in first" }],
      },
      {
        id: "unknown-permission",
        when: "An unknown permission is asked for (a tampered link)",
        sees: "Back on the page, “Connecting Google Calendar didn't work”",
        proof: [
          {
            file: CONSENT,
            test: "refuses an unknown permission, back where it started with a notice",
          },
        ],
      },
      {
        id: "unavailable",
        when: "Google isn't set up on this server",
        sees: "Back on the page, “Signing in with Google isn't available right now”",
        proof: [
          {
            file: CONSENT,
            test: "goes back with Google unavailable when sign-in with Google is switched off",
          },
        ],
      },
    ],
  },
  {
    key: "routes/auth.google.callback GET",
    outcomes: [
      {
        id: "cancelled",
        when: "Cancelled on Google's screen",
        sees: "Back where it started, “Google sign-in was cancelled”",
        proof: [
          {
            file: AUTH,
            test: "reports a cancelled sign-in without contacting Google, back where it started",
          },
        ],
      },
      {
        id: "expired",
        when: "Took too long, or the browser lost the sign-in cookie",
        sees: "The start page, “That took too long … please try again”",
        proof: [
          {
            file: AUTH,
            test: "says a sign-in took too long when its saved state is gone (plan/phase-34.md)",
          },
        ],
      },
      {
        id: "forged",
        when: "Google's answer doesn't belong to this browser",
        sees: "Back where it started, “Google sign-in didn't work”",
        proof: [
          {
            file: AUTH,
            test: "creates no session when Google's state does not match this browser's",
          },
        ],
      },
      {
        id: "exchange-failed",
        when: "Google refuses or doesn't answer the sign-in",
        sees: "Back where it started, “Google sign-in didn't work”",
        proof: [
          {
            file: AUTH,
            test: "goes back where it started with sign-in failed when Google doesn't answer the exchange",
          },
        ],
      },
      {
        id: "unavailable",
        when: "Google sign-in was switched off on the way",
        sees: "Back where it started, “isn't available right now”",
        proof: [
          {
            file: AUTH,
            test: "goes back with Google unavailable when sign-in was switched off on the way",
          },
        ],
      },
      {
        id: "calendar-declined",
        when: "Signed in but Google Calendar wasn't allowed",
        sees: "“Signed in. Google Calendar wasn't allowed …”",
        proof: [{ file: AUTH, test: "drops a notice carried over from an earlier round trip" }],
      },
      {
        id: "calendar-partial-busy",
        when: "Only seeing clashes was allowed",
        sees: "“connected for clashes only”",
        proof: [
          {
            file: AUTH,
            test: "says Calendar was connected for clashes only when writing wasn't allowed",
          },
        ],
      },
      {
        id: "calendar-partial-write",
        when: "Only adding rehearsals was allowed",
        sees: "“connected for adding rehearsals only”",
        proof: [
          {
            file: AUTH,
            test: "says Calendar was connected for writing only when clashes weren't allowed",
          },
        ],
      },
      {
        id: "calendar-unsaved",
        when: "Google gave no lasting access",
        sees: "“isn't connected. Please try again.”",
        proof: [
          { file: AUTH, test: "says Calendar isn't connected when Google gave no lasting access" },
        ],
      },
      {
        id: "unverified-email",
        when: "Google hasn't verified the email an organizer added a place for",
        sees: "“places organizers added for it can't be found until it does”",
        proof: [
          {
            file: AUTH,
            test: "says an unverified email can't claim the places added for it, only when there are some",
          },
        ],
      },
      {
        id: "account-taken",
        when: "This Google account is already another member of the group",
        sees: "“This Google account is already … stays name-only”",
        proof: [
          {
            file: AUTH,
            test: "refuses a second member of the same group for one Google account, and says so",
          },
        ],
      },
      {
        id: "consent-failed",
        when: "Google refuses or doesn't answer a Calendar or contacts consent",
        sees: "Back where it started, “Connecting … didn't work”",
        proof: [
          {
            file: CONSENT,
            test: "goes back with Calendar failed when Google refuses the exchange, saving nothing",
          },
          {
            file: CONSENT,
            test: "goes back with contacts failed, not a sign-in notice, when Google doesn't answer",
          },
        ],
      },
      {
        id: "contacts-partial",
        when: "Only saved contacts were allowed",
        sees: "“connected for your saved contacts only”",
        proof: [
          {
            file: CONSENT,
            test: "says contacts were connected for saved contacts only when the others weren't allowed",
          },
        ],
      },
    ],
  },
  {
    key: "routes/auth.sign-out GET",
    outcomes: [
      {
        id: "to-start",
        when: "Someone opens the sign-out address",
        sees: "The start page",
        probe: { as: "visitor", path: "/auth/sign-out", expect: { status: 302, location: "/" } },
      },
    ],
  },
  {
    key: "routes/auth.google.disconnect GET",
    outcomes: [
      {
        id: "back",
        when: "Someone opens the disconnect address",
        sees: "The start page",
        probe: {
          as: "visitor",
          path: "/auth/google/disconnect",
          expect: { status: 302, location: "/" },
        },
      },
    ],
  },

  // Saves.
  ...(["groups", "home"] as const).map((page) => ({
    key: `routes/${page} POST (default)`,
    outcomes: [
      browserFailure("page", true),
      {
        id: "refused",
        when: "A group name, your name or the time zone is missing or too long",
        sees: "The form again with what was typed and the reason beside each field",
        probe: {
          as: "visitor" as const,
          path: page === "home" ? "/" : "/groups",
          form: { groupName: "", displayName: "", timeZone: "" },
          expect: { status: 400, data: "errors" },
        },
      },
    ],
  })),
  {
    key: "routes/group POST (default)",
    outcomes: [browserFailure("page"), UNKNOWN_INTENT("{group}")],
  },
  {
    key: "routes/group POST leave",
    outcomes: [
      browserFailure("elsewhere"),
      {
        id: "last-organizer",
        when: "The only organizer tries to leave",
        sees: "Why they can't, at the top of the page",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "leave", confirmed: "1" },
          expect: { status: 400, data: "problem" },
        },
      },
      {
        id: "last-organizer-from-groups",
        when: "The same, from the groups page",
        sees: "Back on the groups page with the reason in an error toast",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "leave", confirmed: "1", returnTo: "/groups" },
          expect: { status: 302, location: "/groups", toast: "error" },
        },
      },
    ],
  },
  {
    key: "routes/group POST set-privacy",
    outcomes: [
      browserFailure("page"),
      MEMBER_FORBIDDEN("{group}", { intent: "set-privacy", value: "on" }),
    ],
  },
  {
    key: "routes/group POST set-optional",
    outcomes: [
      browserFailure("page"),
      {
        id: "unknown-member",
        when: "The member was removed meanwhile",
        sees: "In the browser “Not saved. This was deleted or changed …” with Reload",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "set-optional", memberId: "nosuchmember", value: "on" },
          expect: { status: 404 },
        },
      },
    ],
  },
  {
    key: "routes/group POST set-role",
    outcomes: [
      browserFailure("page"),
      {
        id: "last-organizer",
        when: "Removing the only organizer's role",
        sees: "Why not, at the top of the page",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "set-role", memberId: "{organizer}", value: "off", confirmed: "1" },
          expect: { status: 400, data: "problem" },
        },
      },
      {
        id: "unknown-member",
        when: "The member was removed meanwhile",
        sees: "“Not saved. This was deleted or changed …”",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "set-role", memberId: "nosuchmember", value: "on" },
          expect: { status: 404 },
        },
      },
    ],
  },
  {
    key: "routes/group POST update-group",
    outcomes: [
      browserFailure("page"),
      {
        id: "refused",
        when: "The new name is empty or too long",
        sees: "The settings form with the reason beside the name",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "update-group", name: " ", timeZone: "Europe/London" },
          expect: { status: 400, data: "settingsErrors" },
        },
      },
      {
        id: "refused-from-groups",
        when: "The same, renamed from the groups page",
        sees: "Back on the groups page with the reason in an error toast",
        probe: {
          as: "organizer",
          path: "{group}",
          form: {
            intent: "update-group",
            name: " ",
            timeZone: "Europe/London",
            returnTo: "/groups",
          },
          expect: { status: 302, location: "/groups", toast: "error" },
        },
      },
      MEMBER_FORBIDDEN("{group}", { intent: "update-group", name: "X", timeZone: "Europe/London" }),
    ],
  },
  {
    key: "routes/group POST rename-member",
    outcomes: [
      browserFailure("page"),
      {
        id: "refused",
        when: "The new name is empty or too long",
        sees: "Why, at the top of the page",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "rename-member", memberId: "{member}", displayName: " " },
          expect: { status: 400, data: "problem" },
        },
      },
      {
        id: "unknown-member",
        when: "The member was removed meanwhile",
        sees: "“Not saved. This was deleted or changed …”",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "rename-member", memberId: "nosuchmember", displayName: "X" },
          expect: { status: 404 },
        },
      },
    ],
  },
  {
    key: "routes/group POST remove-member",
    outcomes: [
      browserFailure("page"),
      {
        id: "last-organizer",
        when: "Removing the only organizer",
        sees: "Why not, at the top of the page",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "remove-member", memberId: "{organizer}", confirmed: "1" },
          expect: { status: 400, data: "problem" },
        },
      },
      {
        id: "unknown-member",
        when: "The member was removed meanwhile",
        sees: "“Not saved. This was deleted or changed …”",
        probe: {
          as: "organizer",
          path: "{group}",
          form: { intent: "remove-member", memberId: "nosuchmember", confirmed: "1" },
          expect: { status: 404 },
        },
      },
    ],
  },
  {
    key: "routes/group POST delete-group",
    outcomes: [
      browserFailure("elsewhere"),
      MEMBER_FORBIDDEN("{group}", { intent: "delete-group", confirmed: "1" }),
    ],
  },
  {
    key: "routes/schedule POST (default)",
    outcomes: [
      browserFailure("page"),
      UNKNOWN_INTENT("{group}/schedule", "organizer", { rehearsalId: "{proposed}" }),
    ],
  },
  {
    key: "routes/schedule POST set-calendar",
    outcomes: [
      browserFailure("page"),
      browserFailure("elsewhere", false, "browser-failure-from-home"),
      {
        id: "not-connected",
        when: "Google Calendar isn't connected (any more)",
        sees: "“Connect Google Calendar first.” at the top of the schedule",
        probe: {
          as: "member",
          path: "{group}/schedule",
          form: { intent: "set-calendar", value: "on" },
          expect: { status: 400, data: "problem" },
        },
      },
      {
        id: "not-connected-from-home",
        when: "The same, from the start page",
        sees: "Back on the start page with the reason in an error toast",
        probe: {
          as: "member",
          path: "{group}/schedule",
          form: { intent: "set-calendar", value: "on", returnTo: "/" },
          expect: { status: 302, location: "/", toast: "error" },
        },
      },
    ],
  },
  {
    key: "routes/schedule POST rsvp",
    outcomes: [
      browserFailure("page"),
      {
        id: "unknown-rehearsal",
        when: "The proposed time was deleted meanwhile",
        sees: "“Not saved. This was deleted or changed …” with Reload",
        probe: {
          as: "member",
          path: "{group}/schedule",
          form: { intent: "rsvp", rehearsalId: "nosuchrehearsal", answer: "yes" },
          expect: { status: 404 },
        },
      },
      {
        id: "refused",
        when: "Not yes, no or maybe (a tampered form)",
        sees: "Why, at the top of the schedule",
        probe: {
          as: "member",
          path: "{group}/schedule",
          form: { intent: "rsvp", rehearsalId: "{proposed}", answer: "perhaps" },
          expect: { status: 400, data: "problem" },
        },
      },
    ],
  },
  {
    key: "routes/schedule POST confirm",
    outcomes: [
      browserFailure("page"),
      MEMBER_FORBIDDEN("{group}/schedule", { intent: "confirm", rehearsalId: "{proposed}" }),
      {
        id: "unknown-rehearsal",
        when: "The proposed time was deleted meanwhile",
        sees: "“Not saved. This was deleted or changed …”",
        probe: {
          as: "organizer",
          path: "{group}/schedule",
          form: { intent: "confirm", rehearsalId: "nosuchrehearsal" },
          expect: { status: 404 },
        },
      },
    ],
  },
  {
    key: "routes/schedule POST delete",
    outcomes: [
      browserFailure("page"),
      MEMBER_FORBIDDEN("{group}/schedule", {
        intent: "delete",
        rehearsalId: "{proposed}",
        confirmed: "1",
      }),
      {
        id: "unknown-rehearsal",
        when: "Already deleted",
        sees: "“Not saved. This was deleted or changed …”",
        probe: {
          as: "organizer",
          path: "{group}/schedule",
          form: { intent: "delete", rehearsalId: "nosuchrehearsal", confirmed: "1" },
          expect: { status: 404 },
        },
      },
    ],
  },
  {
    key: "routes/schedule POST notes",
    outcomes: [
      browserFailure("page"),
      {
        id: "refused",
        when: "Notes longer than 1,000 characters",
        sees: "Why, at the top of the schedule",
        probe: {
          as: "organizer",
          path: "{group}/schedule",
          form: { intent: "notes", rehearsalId: "{proposed}", notes: "x".repeat(1001) },
          expect: { status: 400, data: "problem" },
        },
      },
    ],
  },
  {
    key: "routes/profile POST (default)",
    outcomes: [
      browserFailure("elsewhere"),
      {
        id: "refused",
        when: "An empty or too-long name or instrumentation",
        sees: "Back on the same page with the reason in an error toast",
        probe: {
          as: "member",
          path: "{group}/profile",
          form: { displayName: " ", returnTo: "{group}/schedule" },
          expect: { status: 302, location: "{group}/schedule", toast: "error" },
        },
      },
      {
        id: "visitor",
        when: "This device is no longer a member",
        sees: "The group's page",
        probe: {
          as: "visitor",
          path: "{group}/profile",
          form: { displayName: "X" },
          expect: { status: 302, location: "{group}" },
        },
      },
    ],
  },
  {
    key: "routes/members.add POST (default)",
    outcomes: [
      browserFailure("page", true),
      {
        id: "refused",
        when: "No name, or the name or email is already in the group",
        sees: "The form with what was typed and the reason",
        probe: {
          as: "organizer",
          path: "{group}/members/add",
          form: { person: " " },
          expect: { status: 400, data: "error" },
        },
      },
      MEMBER_FORBIDDEN("{group}/members/add", { person: "Someone" }),
    ],
  },
  {
    key: "routes/requests.new POST (default)",
    outcomes: [
      browserFailure("page", true),
      {
        id: "refused",
        when: "A missing name, dates or times",
        sees: "The form with what was typed and the reasons",
        probe: {
          as: "organizer",
          path: "{group}/requests/new",
          form: { name: "" },
          expect: { status: 400, data: "errors" },
        },
      },
      MEMBER_FORBIDDEN("{group}/requests/new", { name: "X" }),
    ],
  },
  {
    key: "routes/requests.new POST add-window",
    outcomes: [
      browserFailure("page"),
      {
        id: "added",
        when: "Another time of day is asked for",
        sees: "One more row, everything typed kept",
        probe: {
          as: "organizer",
          path: "{group}/requests/new",
          form: {
            intent: "add-window",
            name: "X",
            "windowStart-0": "09:00",
            "windowEnd-0": "12:00",
            "windowStart-1": "19:00",
            "windowEnd-1": "22:00",
          },
          expect: { status: 200, data: "extraRow" },
        },
      },
    ],
  },
  {
    key: "routes/request POST (default)",
    outcomes: [browserFailure("page"), UNKNOWN_INTENT("{open}", "member")],
  },
  {
    key: "routes/request POST set-date",
    outcomes: [
      browserFailure("fetcher"),
      {
        id: "date-gone",
        when: "The date is no longer on offer (the request was edited, or the day passed)",
        sees: "“Not saved” by the dates, with the reason",
        probe: {
          as: "member",
          path: "{open}",
          form: { intent: "set-date", date: "2001-01-01", on: "0" },
          expect: { status: 400, data: "dateProblem" },
        },
      },
    ],
  },
  {
    key: "routes/request POST save-dates",
    outcomes: [
      browserFailure("page"),
      {
        id: "refused",
        when: "A date no longer on offer, or a time that isn't one",
        sees: "The dates with the reason, as ticked",
        probe: {
          as: "member",
          path: "{open}",
          form: { intent: "save-dates", date: "2001-01-01" },
          expect: { status: 400, data: "dateErrors" },
        },
      },
    ],
  },
  {
    key: "routes/request POST fill-dates",
    outcomes: [
      browserFailure("fetcher"),
      {
        id: "refused",
        when: "The chosen stretch isn't within the request's times",
        sees: "“Not saved” by the dates, with the reason",
        probe: {
          as: "member",
          path: "{open}",
          form: { intent: "fill-dates", startTime: "", endTime: "" },
          expect: { status: 400, data: "dateProblem" },
        },
      },
    ],
  },
  {
    key: "routes/request POST clear-dates",
    outcomes: [
      browserFailure("page"),
      {
        id: "confirm",
        when: "Without JavaScript, before saying yes",
        sees: "“Clear all your dates?” with the confirm button",
        probe: {
          as: "member",
          path: "{open}",
          form: { intent: "clear-dates" },
          expect: { status: 200, data: "confirm" },
        },
      },
    ],
  },
  {
    key: "routes/request POST answer",
    outcomes: [
      browserFailure("fetcher"),
      {
        id: "refused",
        when: "A preferred number out of range",
        sees: "“Not saved” beside the number, with the reason",
        probe: {
          as: "member",
          path: "{open}",
          form: { intent: "answer", limit: "most", limitCount: "0" },
          expect: { status: 400, data: "capProblem" },
        },
      },
    ],
  },
  {
    key: "routes/request POST propose-times",
    outcomes: [
      browserFailure("page", true),
      MEMBER_FORBIDDEN("{open}", { intent: "propose-times" }),
      {
        id: "refused",
        when: "No time ticked, or a time that isn't free any more",
        sees: "The reason above the free times",
        probe: {
          as: "organizer",
          path: "{open}",
          form: { intent: "propose-times" },
          expect: { status: 400, data: "proposeProblem" },
        },
      },
    ],
  },
  {
    key: "routes/request POST propose",
    outcomes: [
      browserFailure("page", true),
      MEMBER_FORBIDDEN("{open}", { intent: "propose" }),
      {
        id: "refused",
        when: "A missing or past date, or a time that isn't one",
        sees: "“Propose a different time” open with what was typed and the reasons",
        probe: {
          as: "organizer",
          path: "{open}",
          form: { intent: "propose", date: "" },
          expect: { status: 400, data: "errors" },
        },
      },
    ],
  },
  {
    key: "routes/request POST close",
    outcomes: [
      browserFailure("page"),
      MEMBER_FORBIDDEN("{open}", { intent: "close", confirmed: "1" }),
    ],
  },
  {
    key: "routes/request POST reopen",
    outcomes: [browserFailure("page"), MEMBER_FORBIDDEN("{open}", { intent: "reopen" })],
  },
  {
    key: "routes/join POST (default)",
    outcomes: [
      browserFailure("page", true),
      {
        id: "refused",
        when: "No name, or a name only Google can get back into",
        sees: "The form with the name and the reason",
        probe: {
          as: "visitor",
          path: "{invite}",
          form: { displayName: " " },
          expect: { status: 400, data: "error" },
        },
      },
    ],
  },
  {
    key: "routes/join POST new",
    outcomes: [
      browserFailure("page", true),
      {
        id: "refused",
        when: "No name",
        sees: "The form with the reason",
        probe: {
          as: "visitor",
          path: "{invite}",
          form: { intent: "new", displayName: "" },
          expect: { status: 400, data: "error" },
        },
      },
    ],
  },
  {
    key: "routes/join POST pick",
    outcomes: [
      browserFailure("page", true),
      {
        id: "no-longer-a-match",
        when: "The member picked isn't one of the matches any more",
        sees: "“That member isn't one of the matches any more. Type your name again.”",
        probe: {
          as: "visitor",
          path: "{invite}",
          form: { intent: "pick", displayName: "Cellist", memberId: "nosuchmember" },
          expect: { status: 400, data: "error" },
        },
      },
    ],
  },
  {
    key: "routes/auth.sign-out POST (default)",
    outcomes: [
      browserFailure("elsewhere"),
      {
        id: "signed-out",
        when: "Signing out when already signed out",
        sees: "The start page, “Signed out”",
        probe: {
          as: "visitor",
          path: "/auth/sign-out",
          form: {},
          expect: { status: 302, location: "/", toast: "success" },
        },
      },
    ],
  },
  {
    key: "routes/auth.google.disconnect POST (default)",
    outcomes: [
      browserFailure("elsewhere"),
      {
        id: "not-signed-in",
        when: "Not signed in (signed out in another tab)",
        sees: "The start page, “You're not signed in” as an error toast",
        probe: {
          as: "visitor",
          path: "/auth/google/disconnect",
          form: { confirmed: "1" },
          expect: { status: 302, location: "/", toast: "error" },
        },
      },
      {
        id: "partly-done",
        when: "Google doesn't answer, or some events couldn't be removed",
        sees: "“Disconnected from Google here, but …” as a yellow warning toast, never “Saved ✓”",
        proof: [
          {
            file: STATES,
            test: "a partial disconnect is a yellow warning and a refused profile a red error, neither saved",
          },
          {
            file: STATES,
            test: "is waited for longer than its own worst case, so a slow Google isn't called a failure",
          },
        ],
      },
    ],
  },

  // Google.
  {
    key: "google exchangeCode",
    outcomes: [
      {
        id: "refused-or-silent",
        when: "Google refuses the code or doesn't answer within 10 seconds",
        sees: "Back where it started, “… didn't work. Please try again.”",
        proof: [
          {
            file: AUTH,
            test: "goes back where it started with sign-in failed when Google doesn't answer the exchange",
          },
          {
            file: CONSENT,
            test: "goes back with Calendar failed when Google refuses the exchange, saving nothing",
          },
        ],
      },
    ],
  },
  {
    key: "google revokeGrant",
    outcomes: [
      {
        id: "silent",
        when: "Google doesn't answer the revoke",
        sees: "“… Google didn't answer, so remove music-chairs at myaccount.google.com too.” as a yellow warning toast",
        proof: [
          {
            file: STATES,
            test: "a partial disconnect is a yellow warning and a refused profile a red error, neither saved",
          },
        ],
      },
    ],
  },
  {
    key: "google accessTokenFor",
    outcomes: [
      {
        id: "revoked",
        when: "Google refuses the saved access (removed by the person)",
        sees: "“access was removed” with Reconnect wherever it was used",
        proof: [
          {
            file: STATES,
            test: "says Google Calendar access was removed, not that it was never given",
          },
        ],
      },
      {
        id: "silent",
        when: "Google doesn't answer",
        sees: "As the read or write that needed it",
        proof: [
          { file: STATES, test: "reads clashes whatever goes wrong, giving up after 5 seconds" },
        ],
      },
    ],
  },
  {
    key: "google listContacts",
    outcomes: [
      {
        id: "unreadable",
        when: "Any error, or no answer within 5 seconds",
        sees: "“Couldn't read your Google contacts right now”",
        proof: [
          {
            file: STATES,
            test: "says what happened to Google contacts: unreadable, removed or none found",
          },
        ],
      },
    ],
  },
  {
    key: "google queryBusy",
    outcomes: [
      {
        id: "unreadable",
        when: "Any error, or no answer within 5 seconds",
        sees: "“Couldn't read your Google Calendar right now”",
        proof: [
          { file: STATES, test: "reads clashes whatever goes wrong, giving up after 5 seconds" },
        ],
      },
    ],
  },
  {
    key: "google putEvent",
    outcomes: [
      {
        id: "failed",
        when: "Adding or updating an event fails",
        sees: "The calendar panel says it couldn't be updated, until an update works",
        proof: [
          {
            file: STATES,
            test: "shows a calendar that couldn't be updated to its member until an update works",
          },
        ],
      },
    ],
  },
  {
    key: "google removeEvent",
    outcomes: [
      {
        id: "failed",
        when: "Removing an event fails",
        sees: "The calendar panel says it couldn't be updated, until an update works",
        proof: [
          {
            file: STATES,
            test: "shows a calendar that couldn't be updated to its member until an update works",
          },
        ],
      },
    ],
  },
];
