// How the error-state catalogue reaches each outcome of the Phase 34 inventory
// (plan/phase-35.md), and what must be on screen before it is photographed.
// Probes run as a person with JavaScript meets them; browser failures go
// through the app's own router with the network failing; every other outcome
// has a named driver below. An outcome with no way to be reached is an error.
import { CALENDAR_SCOPES } from "../../app/lib/google-scopes.ts";
import type { Call, Outcome, Probe } from "../../tests/error-states/inventory.ts";
import type { FakeGoogle, Identity, Scenario } from "./fake-google.ts";
import type { Seeded } from "./seed.ts";

/** What must be on screen: a phrase, an element, or the page the browser landed on. */
export type Mark = { text?: string; selector?: string; path?: string };

export type Role = Probe["as"] | "google" | "pianist";

/** A request failing in the browser: dropped, answered 500, or never answered. */
export type Fault = "drop" | "drop-data" | "500" | "hold" | null;

/** What the catalogue script offers a driver. */
export type Driver = {
  google: FakeGoogle;
  seeded: Seeded;
  fill(text: string): string;
  /** Sets the browser's cookies to this role's. */
  as(role: Role, extra?: Record<string, string>): Promise<void>;
  /** A real page load. */
  go(path: string): Promise<void>;
  /** A post through the app's router, as a form on the page sends it. */
  submit(path: string, form: Record<string, string>): Promise<void>;
  /** A post through a fetcher of the page; `key` is the control's own. */
  fetch(key: string, path: string, form: Record<string, string>): Promise<void>;
  /** A client navigation through the app's router. */
  navigate(path: string): Promise<void>;
  /** Runs `expression` in the page and returns its value. */
  run<T>(expression: string): Promise<T>;
  fault(fault: Fault): Promise<void>;
  /** Continues on the fake Google's consent page. */
  consent(): Promise<void>;
  /** Signs a role in again through the fake Google (a fresh grant clears the app's caches). */
  signInAgain(role: "organizer", scope?: "contacts"): Promise<void>;
  /** A save by a role over plain HTTP, outside the browser. */
  post(role: Role, path: string, form: Record<string, string>): Promise<void>;
  /** Restarts the app without Google configured (the last stage). */
  withoutGoogle(): Promise<void>;
  sleep(ms: number): Promise<void>;
};

export type State = {
  key: string;
  outcome: string;
  when: string;
  sees: string;
  proofs: string[];
  mark: Mark;
  /** States run in stage order; later stages may change Google grants or the server. */
  stage: number;
  /** Seconds to wait for the mark (a request held past the app's 20 s wait needs longer). */
  wait?: number;
  /** Runs against the app with Google not configured (the run restarts it first). */
  withoutGoogle?: boolean;
  drive(driver: Driver): Promise<void>;
};

const BUSY = CALENDAR_SCOPES.busy;
const WRITE = CALENDAR_SCOPES.write;
const CONTACTS_SAVED = "https://www.googleapis.com/auth/contacts.readonly";

/** The first quoted phrase of `sees`, its longest part around any "…". */
export function quotedMark(sees: string): string | null {
  const quoted = /“([^”]+)”/.exec(sees)?.[1];
  if (!quoted) return null;
  const parts = quoted
    .split("…")
    .map((part) =>
      part
        .trim()
        .replace(/^[.,;:]+|[,;:]+$/g, "")
        .trim(),
    )
    .filter(Boolean);
  return parts.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Marks for outcomes whose `sees` quotes nothing, by "<call key> <outcome id>". */
const MARKS: Record<string, Mark> = {
  "routes/home GET notice": { selector: ".route-notices .notice, .notice" },
  "routes/healthz GET ok": { path: "/healthz", text: "ok" },
  "routes/avatar GET no-picture": { path: "/avatar" },
  "routes/schedule GET visitor": { path: "{group}" },
  "routes/profile GET to-group": { path: "{group}" },
  "routes/members.add GET visitor": { path: "{group}" },
  "routes/requests.new GET visitor": { path: "{group}" },
  "routes/request GET visitor": { path: "{group}" },
  "routes/request-calendar GET visitor": { path: "{group}" },
  "routes/request-calendar GET not-ready": { text: "There's no calendar file" },
  "routes/calendar-feed GET unknown-feed": { text: "Not found" },
  "routes/auth.google.calendar GET signed-out": { text: "Google (stand-in)" },
  "routes/auth.sign-out GET to-start": { path: "/" },
  "routes/auth.google.disconnect GET back": { path: "/" },
  "routes/groups POST (default) refused": { selector: ".field-error" },
  "routes/home POST (default) refused": { selector: ".field-error" },
  "routes/group POST leave last-organizer": { selector: ".problem-alert" },
  "routes/group POST leave last-organizer-from-groups": { selector: ".toast-error" },
  "routes/group POST set-role last-organizer": { selector: ".problem-alert" },
  "routes/group POST update-group refused": { selector: ".field-error" },
  "routes/group POST update-group refused-from-groups": { selector: ".toast-error" },
  "routes/group POST rename-member refused": { selector: ".problem-alert" },
  "routes/group POST remove-member last-organizer": { selector: ".problem-alert" },
  "routes/schedule POST set-calendar not-connected-from-home": { selector: ".toast-error" },
  "routes/schedule POST rsvp refused": { selector: ".problem-alert" },
  "routes/schedule POST notes refused": { selector: ".problem-alert" },
  "routes/profile POST (default) refused": { selector: ".toast-error" },
  "routes/profile POST (default) visitor": { path: "{group}" },
  "routes/members.add POST (default) refused": { selector: ".field-error" },
  "routes/requests.new POST (default) refused": { selector: ".field-error" },
  "routes/requests.new POST add-window added": { text: "Time 3: not set" },
  "routes/request POST save-dates refused": { selector: "#dates-error" },
  "routes/request POST propose-times refused": { selector: "[role=alert]" },
  "routes/join POST (default) refused": { selector: ".field-error" },
  "routes/join POST new refused": { selector: ".field-error" },
  "google accessTokenFor silent": { text: "Couldn't read your Google Calendar right now" },
  "google putEvent failed": { text: "couldn't be updated" },
  "google removeEvent failed": { text: "couldn't be updated" },
};

/** The page a post is made from: the action's own page, or where its forms are. */
function pageFor(path: string): string {
  if (/\/profile$/.test(path)) return path.replace(/\/profile$/, "/schedule");
  if (path.startsWith("/auth/")) return "/";
  return path;
}

/** An index route's action is addressed with `?index`. */
function actionFor(key: string, path: string): string {
  return key.startsWith("routes/home ") && path === "/" ? "/?index" : path;
}

/** The request page's fetchers, keyed as its controls key them. */
const FETCHERS: Record<string, (requestId: string, first: string) => string> = {
  "set-date": (id, first) => `set-date-${id}-${first}`,
  "fill-dates": (id) => `set-date-${id}-all`,
  answer: () => "request-cap",
};

/** The request page's id and first date, from its loader data. */
function requestOnPage(d: Driver): Promise<[string, string]> {
  return d.run<[string, string]>(
    `(() => { const data = window.__reactRouterDataRouter.state.loaderData["routes/request"]; return [data.requestId, data.dates.from]; })()`,
  );
}

async function requestFetcherKey(d: Driver, intent: string): Promise<string> {
  const [requestId, first] = await requestOnPage(d);
  return FETCHERS[intent](requestId, first);
}

/** Pages only organizers can open: a member's save from them is an organizer who lost the role. */
const ORGANIZER_PAGES = new Set(["routes/members.add", "routes/requests.new"]);

function probeDriver(call: Call, probe: Probe): State["drive"] {
  const [route, , intent] = call.key.split(" ");
  return async (d) => {
    const path = d.fill(probe.path);
    if (!probe.form) {
      await d.as(probe.as);
      return d.go(path);
    }
    const form = Object.fromEntries(Object.entries(probe.form).map(([k, v]) => [k, d.fill(v)]));
    const lostRole = probe.as === "member" && ORGANIZER_PAGES.has(route);
    await d.as(lostRole ? "organizer" : probe.as);
    await d.go(pageFor(path));
    // The page was open as an organizer; the save goes as the member it now is.
    if (lostRole) await d.as("member");
    if (intent in FETCHERS) return d.fetch(await requestFetcherKey(d, intent), path, form);
    return d.submit(actionFor(call.key, path), form);
  };
}

/** Forms posted to another page's action, through the control's own fetcher on the page that has it. */
const ELSEWHERE: Record<
  string,
  {
    role: Role;
    page: string;
    key: (d: Driver) => string;
    action: string;
    form: Record<string, string>;
  }
> = {
  "routes/group POST leave browser-failure": {
    role: "member",
    page: "/groups",
    key: (d) => `elsewhere:leave-${d.seeded.group.slice(3)}`,
    action: "{group}",
    form: { intent: "leave", returnTo: "/groups", confirmed: "1" },
  },
  "routes/group POST delete-group browser-failure": {
    role: "organizer",
    page: "/groups",
    key: (d) => `elsewhere:delete-${d.seeded.group.slice(3)}`,
    action: "{group}",
    form: { intent: "delete-group", returnTo: "/groups", confirmed: "1" },
  },
  "routes/profile POST (default) browser-failure": {
    role: "member",
    page: "{group}/schedule",
    key: () => "elsewhere:profile-save",
    action: "{group}/profile",
    form: { displayName: "Cellist", instrument: "Cello", returnTo: "{group}/schedule" },
  },
  "routes/auth.sign-out POST (default) browser-failure": {
    role: "organizer",
    page: "/",
    key: () => "elsewhere:profile-sign-out",
    action: "/auth/sign-out",
    form: {},
  },
  "routes/auth.google.disconnect POST (default) browser-failure": {
    role: "organizer",
    page: "/",
    key: () => "elsewhere:profile-disconnect",
    action: "/auth/google/disconnect?returnTo=%2F",
    form: { confirmed: "1" },
  },
  "routes/schedule POST set-calendar browser-failure-from-home": {
    role: "google",
    page: "/",
    key: (d) => `elsewhere:set-calendar-${d.seeded.complete}`,
    action: "{group}/schedule",
    form: { intent: "set-calendar", value: "on", returnTo: "/" },
  },
};

/** Where each route's page saves are made, and by whom. */
const PAGES: Record<string, { path: string; role: Role }> = {
  "routes/group": { path: "{group}", role: "organizer" },
  "routes/groups": { path: "/groups", role: "organizer" },
  "routes/home": { path: "/", role: "visitor" },
  "routes/join": { path: "{invite}", role: "visitor" },
  "routes/members.add": { path: "{group}/members/add", role: "organizer" },
  "routes/requests.new": { path: "{group}/requests/new", role: "organizer" },
  "routes/request": { path: "{open}", role: "organizer" },
  "routes/schedule": { path: "{group}/schedule", role: "organizer" },
};

/** Who answers a request's dates: the member, who has answered (so the dates save one by one). */
const MEMBER_INTENTS = new Set([
  "set-date",
  "save-dates",
  "fill-dates",
  "clear-dates",
  "answer",
  "rsvp",
]);

function browserFailureDriver(call: Call, outcome: Outcome): State["drive"] | null {
  const [route, , intent] = call.key.split(" ");
  const elsewhere = ELSEWHERE[`${call.key} ${outcome.id}`];
  const probe = call.outcomes.find((item) => item.probe?.form)?.probe;
  const form: Record<string, string> = probe?.form
    ? { ...probe.form }
    : intent === "(default)"
      ? {}
      : { intent };
  if (elsewhere) {
    return async (d) => {
      await d.as(elsewhere.role);
      await d.go(d.fill(elsewhere.page));
      await d.fault("drop");
      const filled = Object.fromEntries(
        Object.entries(elsewhere.form).map(([k, v]) => [k, d.fill(v)]),
      );
      await d.fetch(elsewhere.key(d), d.fill(elsewhere.action), filled);
    };
  }
  const page = PAGES[route];
  if (!page) return null;
  return async (d) => {
    await d.as(MEMBER_INTENTS.has(intent) ? "member" : page.role);
    const path = d.fill(page.path);
    await d.go(path);
    await d.fault("drop");
    const filled = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, d.fill(v)]));
    if (intent in FETCHERS) return d.fetch(await requestFetcherKey(d, intent), path, filled);
    return d.submit(actionFor(call.key, path), filled);
  };
}

function unreachableDriver(call: Call): State["drive"] | null {
  const page = PAGES[call.key.split(" ")[0]];
  if (!page) return null;
  return async (d) => {
    await d.as("organizer");
    await d.go("/privacy");
    await d.fault("drop-data");
    await d.navigate(d.fill(page.path));
  };
}

let fresh = 0;
/** A new Google identity, so each sign-in outcome starts from no grant. */
function newcomer(): Identity {
  fresh += 1;
  return {
    sub: `catalogue-${fresh}`,
    email: `newcomer${fresh}@example.test`,
    name: "Newcomer",
    email_verified: true,
  };
}

/** A sign-in in the browser through the fake Google's consent page. */
function signIn(
  as: Role,
  returnTo: string,
  scenario: Partial<Scenario>,
  start = "/auth/google",
): State["drive"] {
  return async (d) => {
    d.google.set({ identity: newcomer(), ...scenario });
    await d.as(as);
    await d.go(
      `${start}${start.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(d.fill(returnTo))}`,
    );
    await d.consent();
  };
}

let zone = 0;
/**
 * Changing the group's time zone makes the app put every written event again
 * (the time zone alternates between two with London's clock, so dates stay).
 */
const rewrite = async (d: Driver, events: Scenario["events"]) => {
  d.google.set({ events });
  zone += 1;
  await d.post("organizer", "{group}", {
    intent: "update-group",
    name: "Thursday Quartet",
    timeZone: zone % 2 === 1 ? "Europe/Dublin" : "Europe/London",
  });
  await d.sleep(1500);
};

/** A successful update first, so the panel's failure can only be this state's own. */
const failingWrite =
  (cause: (d: Driver) => Promise<void>): State["drive"] =>
  async (d) => {
    await rewrite(d, "ok");
    d.google.set({ events: "500" });
    await cause(d);
    await d.sleep(1500);
    await d.as("organizer");
    await d.go(d.fill("{group}/schedule"));
  };

/** Putting events again fails. */
const putFails = failingWrite((d) => rewrite(d, "500"));

/** Answering No to a confirmed rehearsal removes its event, and that fails. */
const removeFails = failingWrite(async (d) => {
  await d.post("organizer", "{group}/schedule", {
    intent: "rsvp",
    rehearsalId: d.fill("{confirmed}"),
    answer: "no",
  });
});

const revoked =
  (page: string): State["drive"] =>
  async (d) => {
    d.google.set({ refresh: "invalid_grant" });
    await d.as("organizer");
    // Reading clashes finds the access gone; "Your times" opens in the List view.
    await d.go(d.fill("{open}?times=list"));
    if (page !== "{open}") await d.go(d.fill(page));
  };

/** Drivers for outcomes the inventory proves by test, by "<call key> <outcome id>". */
const DRIVERS: Record<
  string,
  { stage: number; wait?: number; withoutGoogle?: boolean; drive: State["drive"] }
> = {
  "routes/home GET notice": {
    stage: 1,
    drive: async (d) => {
      await d.as("visitor");
      await d.go("/?notice=signin-failed");
    },
  },
  "routes/auth.google.calendar GET signed-out": {
    stage: 1,
    drive: async (d) => {
      await d.as("visitor");
      await d.go(
        `/auth/google/calendar?scope=busy&returnTo=${encodeURIComponent(d.fill("{group}"))}`,
      );
    },
  },
  "routes/auth.google.calendar GET unknown-permission": {
    stage: 1,
    drive: async (d) => {
      await d.as("organizer");
      await d.go(
        `/auth/google/calendar?scope=everything&returnTo=${encodeURIComponent(d.fill("{group}/schedule"))}`,
      );
    },
  },
  "routes/auth.google.callback GET cancelled": {
    stage: 2,
    drive: signIn("visitor", "/groups", { consent: "cancel" }),
  },
  "routes/auth.google.callback GET expired": {
    stage: 2,
    drive: async (d) => {
      await d.as("visitor");
      await d.go("/auth/google/callback?code=late&state=late");
    },
  },
  "routes/auth.google.callback GET forged": {
    stage: 2,
    drive: signIn("visitor", "/groups", { consent: "forged-state" }),
  },
  "routes/auth.google.callback GET exchange-failed": {
    stage: 2,
    drive: signIn("visitor", "/groups", { exchange: "500" }),
  },
  "google exchangeCode refused-or-silent": {
    stage: 2,
    wait: 25,
    drive: signIn("visitor", "/groups", { exchange: "slow" }),
  },
  "routes/auth.google.callback GET calendar-declined": {
    stage: 2,
    drive: signIn("visitor", "/groups", { scopes: [] }),
  },
  "routes/auth.google.callback GET calendar-partial-busy": {
    stage: 2,
    drive: signIn("visitor", "/groups", { scopes: [BUSY] }),
  },
  "routes/auth.google.callback GET calendar-partial-write": {
    stage: 2,
    drive: signIn("visitor", "/groups", { scopes: [WRITE] }),
  },
  "routes/auth.google.callback GET calendar-unsaved": {
    stage: 2,
    drive: signIn("visitor", "/groups", { refreshToken: false }),
  },
  "routes/auth.google.callback GET unverified-email": {
    stage: 2,
    drive: async (d) => {
      d.google.set({ identity: d.seeded.identities.invited });
      await d.as("visitor");
      await d.go("/auth/google?returnTo=%2Fgroups");
      await d.consent();
    },
  },
  "routes/auth.google.callback GET account-taken": {
    stage: 2,
    drive: async (d) => {
      d.google.set({ identity: d.seeded.identities.google });
      await d.as("pianist");
      await d.go(`/auth/google?returnTo=${encodeURIComponent(d.fill("{group}"))}`);
      await d.consent();
    },
  },
  "routes/auth.google.callback GET consent-failed": {
    stage: 2,
    drive: async (d) => {
      d.google.set({ identity: d.seeded.identities.organizer, exchange: "500" });
      await d.as("organizer");
      await d.go(
        `/auth/google/calendar?scope=busy&returnTo=${encodeURIComponent(d.fill("{group}/schedule"))}`,
      );
      await d.consent();
    },
  },
  "routes/auth.google.callback GET contacts-partial": {
    stage: 2,
    drive: async (d) => {
      d.google.set({ identity: d.seeded.identities.organizer, scopes: [CONTACTS_SAVED] });
      await d.as("organizer");
      await d.go(
        `/auth/google/calendar?scope=contacts&returnTo=${encodeURIComponent(d.fill("{group}/members/add"))}`,
      );
      await d.consent();
    },
  },
  "routes/request GET clashes-unreadable": {
    stage: 3,
    drive: async (d) => {
      d.google.set({ freeBusy: "500" });
      await d.as("organizer");
      await d.go(d.fill("{open}?times=list"));
    },
  },
  "google queryBusy unreadable": {
    stage: 3,
    wait: 20,
    drive: async (d) => {
      d.google.set({ freeBusy: "slow" });
      await d.as("organizer");
      await d.go(d.fill("{open}?times=list"));
    },
  },
  "google accessTokenFor silent": {
    stage: 3,
    wait: 20,
    drive: async (d) => {
      d.google.set({ refresh: "slow" });
      await d.as("organizer");
      await d.go(d.fill("{open}?times=list"));
    },
  },
  "routes/members.add GET contacts-unreadable": {
    stage: 4,
    drive: async (d) => {
      await d.signInAgain("organizer", "contacts");
      d.google.set({ contacts: "500" });
      await d.as("organizer");
      await d.go(d.fill("{group}/members/add"));
    },
  },
  "google listContacts unreadable": {
    stage: 4,
    drive: async (d) => {
      await d.signInAgain("organizer", "contacts");
      d.google.set({ contacts: "500" });
      await d.as("organizer");
      await d.go(d.fill("{group}/members/add"));
    },
  },
  "routes/members.add GET contacts-none": {
    stage: 4,
    drive: async (d) => {
      await d.signInAgain("organizer", "contacts");
      d.google.set({ contacts: "empty" });
      await d.as("organizer");
      await d.go(d.fill("{group}/members/add"));
    },
  },
  "routes/schedule GET calendar-write-failed": { stage: 5, drive: putFails },
  "google putEvent failed": { stage: 5, drive: putFails },
  "google removeEvent failed": { stage: 5, drive: removeFails },
  // Removing access deletes the organizer's grant; each of these signs in again first.
  "routes/request GET clashes-access-removed": {
    stage: 6,
    drive: async (d) => {
      await d.signInAgain("organizer");
      await revoked("{open}")(d);
    },
  },
  "routes/schedule GET calendar-access-removed": {
    stage: 6,
    drive: async (d) => {
      await d.signInAgain("organizer");
      await revoked("{group}/schedule")(d);
    },
  },
  "google accessTokenFor revoked": {
    stage: 6,
    drive: async (d) => {
      await d.signInAgain("organizer");
      await revoked("{group}/schedule")(d);
    },
  },
  "routes/auth.google.disconnect POST (default) partly-done": {
    stage: 7,
    drive: async (d) => {
      await d.signInAgain("organizer");
      d.google.set({ revoke: "503" });
      await d.as("organizer");
      await d.go("/");
      await d.submit("/auth/google/disconnect?returnTo=%2F", { confirmed: "1" });
    },
  },
  "google revokeGrant silent": {
    stage: 7,
    wait: 30,
    drive: async (d) => {
      await d.signInAgain("organizer");
      // No answer: the app gives up on Google after 10 seconds.
      d.google.set({ revoke: "slow" });
      await d.as("organizer");
      await d.go("/");
      await d.submit("/auth/google/disconnect?returnTo=%2F", { confirmed: "1" });
    },
  },
  // Without Google configured: the server restarts without its client (the last stage).
  "routes/auth.google.callback GET unavailable": {
    stage: 8,
    drive: async (d) => {
      d.google.set({ identity: newcomer() });
      await d.as("visitor");
      await d.go("/auth/google?returnTo=%2Fgroups");
      await d.withoutGoogle();
      await d.consent();
    },
  },
  "routes/auth.google GET unavailable": {
    stage: 9,
    withoutGoogle: true,
    drive: async (d) => {
      await d.as("visitor");
      await d.go("/auth/google?returnTo=%2Fgroups");
    },
  },
  "routes/auth.google.calendar GET unavailable": {
    stage: 9,
    withoutGoogle: true,
    drive: async (d) => {
      await d.as("organizer");
      await d.go(
        `/auth/google/calendar?scope=busy&returnTo=${encodeURIComponent(d.fill("{group}/schedule"))}`,
      );
    },
  },
};

/** Catalogue entries beyond the inventory (plan/phase-35.md, R6 and R11). */
const EXTRAS: State[] = [
  {
    key: "server",
    outcome: "crash",
    when: "The server itself fails while building a page (a bug, or a database it can't read)",
    sees: "“Something went wrong” with Try again and the way back",
    proofs: [
      "tests/error-states.test.tsx: the error page names a missing page, an organizer-only page, our failure and a lost connection",
    ],
    mark: { text: "Something went wrong" },
    stage: 1,
    drive: async (d) => {
      await d.as("organizer", { mc_fault: "crash" });
      await d.go(d.fill("{group}"));
    },
  },
  ...(["500", "hold"] as const).flatMap((fault): State[] => [
    {
      key: "routes/schedule POST rsvp",
      outcome: fault === "500" ? "server-error" : "no-answer",
      when:
        fault === "500"
          ? "An answer is saved while a gateway in front of the app answers with an error"
          : "An answer is saved and the server doesn't answer within 20 seconds",
      sees:
        fault === "500"
          ? "“Maybe not saved.” and “Something went wrong on our side.”, with Retry"
          : "“Maybe not saved.” and “The server didn't answer in time.”, with Retry",
      proofs: [
        "tests/client-failure.test.ts: tells a thrown status, a lost connection, a crash and a redirect apart",
      ],
      mark: {
        text: fault === "500" ? "Something went wrong on our side" : "didn't answer in time",
      },
      stage: 1,
      wait: 30,
      drive: async (d) => {
        await d.as("member");
        await d.go(d.fill("{group}/schedule"));
        await d.fault(fault);
        await d.submit(d.fill("{group}/schedule"), {
          intent: "rsvp",
          rehearsalId: d.fill("{proposed}"),
          answer: "yes",
        });
      },
    },
    {
      key: "routes/request POST set-date",
      outcome: fault === "500" ? "server-error" : "no-answer",
      when:
        fault === "500"
          ? "A date is ticked while a gateway in front of the app answers with an error"
          : "A date is ticked and the server doesn't answer within 20 seconds",
      sees:
        fault === "500"
          ? "“Maybe not saved.” and “Something went wrong on our side.” by the dates, with Retry"
          : "“Maybe not saved.” and “The server didn't answer in time.” by the dates, with Retry",
      proofs: [
        "tests/error-states.test.tsx: shows a failed date's change until it's retried or superseded",
      ],
      mark: {
        text: fault === "500" ? "Something went wrong on our side" : "didn't answer in time",
      },
      stage: 1,
      wait: 30,
      drive: async (d) => {
        await d.as("member");
        const path = d.fill("{open}");
        await d.go(path);
        await d.fault(fault);
        const [requestId, first] = await requestOnPage(d);
        await d.fetch(FETCHERS["set-date"](requestId, first), path, {
          intent: "set-date",
          date: first,
          on: "0",
        });
      },
    },
  ]),
];

function proofText(outcome: Outcome): string[] {
  return (outcome.proof ?? []).map((proof) =>
    "file" in proof
      ? `${proof.file.replace(/^project\//, "")}: ${proof.test}`
      : `browser gate: ${proof.check}`,
  );
}

/** Every state to photograph, and the inventory outcomes no driver reaches. */
export function catalogueStates(inventory: Call[]): { states: State[]; unreached: string[] } {
  const states: State[] = [];
  const unreached: string[] = [];
  for (const call of inventory) {
    for (const outcome of call.outcomes) {
      const id = `${call.key} ${outcome.id}`;
      const named = DRIVERS[id];
      const drive =
        named?.drive ??
        (outcome.probe
          ? probeDriver(call, outcome.probe)
          : outcome.id.startsWith("browser-failure")
            ? browserFailureDriver(call, outcome)
            : outcome.id === "unreachable"
              ? unreachableDriver(call)
              : null);
      const quoted = quotedMark(outcome.sees);
      const mark = MARKS[id] ?? (quoted ? { text: quoted } : null);
      if (!drive || !mark) {
        unreached.push(`${id}${drive === null ? "" : " (no mark)"}`);
        continue;
      }
      states.push({
        key: call.key,
        outcome: outcome.id,
        when: outcome.when,
        sees: outcome.sees,
        proofs: proofText(outcome),
        mark,
        stage: named?.stage ?? 1,
        wait: named?.wait,
        withoutGoogle: named?.withoutGoogle,
        drive,
      });
    }
  }
  states.push(...EXTRAS);
  states.sort((a, b) => a.stage - b.stage);
  return { states, unreached };
}
