// Every error state (plan/phase-34.md): the inventory names every page load,
// every save and every Google call with each way it can fail; this keeps it
// complete, replays each of its probes against the routes, and proves the
// states it names render as described.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createRoutesStub, matchPath } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { googleWriteState, scheduleSync, whenSynced } from "../app/.server/calendar-sync";
import { googleClashes } from "../app/.server/clashes";
import { readToast, redirectWithToast } from "../app/.server/flash";
import { toastKind } from "../app/lib/toast-kind";
import {
  accessRevoked,
  CONTACTS_SCOPES,
  forgetAccessToken,
  GOOGLE_TIMEOUT_MS,
  READ_TIMEOUT_MS,
} from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { PageFailure } from "../app/components/failure-alert";
import { outcomeOf, shownChange } from "../app/components/request-dates";
import { confirmationId, IDLE, nextFeedback } from "../app/components/submit-button";
import { Toaster } from "../app/components/toast";
import { addDays, todayInZone } from "../app/lib/availability";
import {
  ACTION_TIMEOUT_MS,
  DISCONNECT_TIMEOUT_MS,
  keepResult,
  type Failure,
} from "../app/lib/client-failure";
import { STOP_WRITING_WAIT_MS } from "../app/.server/calendar-sync";
import { groupPath, invitePath } from "../app/lib/group-address";
import { CALENDAR_SCOPES } from "../app/lib/google-scopes";
import { NOTICES, noticeText } from "../app/lib/notices";
import { ErrorBoundary, errorPage, Layout } from "../app/root";
import * as disconnect from "../app/routes/auth.google.disconnect";
import * as signOut from "../app/routes/auth.sign-out";
import * as feed from "../app/routes/calendar-feed";
import * as group from "../app/routes/group";
import * as groups from "../app/routes/groups";
import * as healthz from "../app/routes/healthz";
import * as home from "../app/routes/home";
import * as join_ from "../app/routes/join";
import AddMembers, * as membersAdd from "../app/routes/members.add";
import * as profile from "../app/routes/profile";
import * as rehearsalLink from "../app/routes/rehearsal-link";
import * as request from "../app/routes/request";
import * as requestCalendar from "../app/routes/request-calendar";
import * as requestsNew from "../app/routes/requests.new";
import * as schedule from "../app/routes/schedule";
import { fakeGoogle, type GoogleFake } from "./google-fake";
import { INVENTORY, type Probe } from "./error-states/inventory";
import { deviceCookie, ORIGIN, requestHrefOf, routeArgs, signedIn, tempDatabase } from "./routes";

tempDatabase();

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Route ids (`routes/<file>`) with their URL patterns, from `app/routes.ts`. */
function routeTable(): { id: string; pattern: string; file: string }[] {
  const source = read("app/routes.ts");
  const table = [...source.matchAll(/route\("([^"]+)", "(routes\/[^"]+)"\)/g)].map(
    ([, pattern, file]) => ({ pattern: `/${pattern}`, file }),
  );
  const index = /index\("(routes\/[^"]+)"\)/.exec(source);
  if (index) table.unshift({ pattern: "/", file: index[1] });
  return table.map(({ pattern, file }) => ({
    id: file.replace(/\.tsx?$/, ""),
    pattern,
    file: `app/${file}`,
  }));
}

/** Every key the inventory must have: loaders, action intents, Google calls. */
function requiredKeys(): string[] {
  const keys: string[] = [];
  for (const route of routeTable()) {
    const source = read(route.file);
    if (/export (async )?function loader\b/.test(source)) keys.push(`${route.id} GET`);
    if (/export (async )?function action\b/.test(source)) {
      keys.push(`${route.id} POST (default)`);
      // Every save fails in the browser the same way (plan/phase-34.md).
      if (!/export async function clientAction[\s\S]*?withFailures\(/.test(source)) {
        keys.push(`${route.id} has no clientAction calling withFailures`);
      }
      const intents = [
        ...source.matchAll(/intent === "([a-z-]+)"/g),
        ...source.matchAll(/get\("intent"\) === "([a-z-]+)"/g),
      ].map((match) => match[1]);
      for (const intent of new Set(intents)) keys.push(`${route.id} POST ${intent}`);
    }
  }
  // Google calls: exported async functions in google.ts that reach the network,
  // directly or through the module's own helpers.
  const google = read("app/.server/google.ts");
  const starts = [...google.matchAll(/^(export )?(async )?function (\w+)/gm)];
  const bodies = starts.map((match, index) => ({
    name: match[3],
    exported: match[1] !== undefined && match[2] !== undefined,
    body: google.slice(match.index, starts[index + 1]?.index ?? google.length),
  }));
  const reaching = new Set(["fetch"]);
  for (let grew = true; grew;) {
    grew = false;
    for (const { name, body } of bodies) {
      const calls = [...reaching].some((callee) =>
        new RegExp(`\\b${callee}\\(`).test(body.slice(body.indexOf("{"))),
      );
      if (calls && !reaching.has(name)) {
        reaching.add(name);
        grew = true;
      }
    }
  }
  for (const { name, exported } of bodies) {
    if (exported && reaching.has(name)) keys.push(`google ${name}`);
  }
  return keys;
}

/** Whether `file` has a test titled exactly `title`. */
function hasTest(file: string, title: string): boolean {
  const quoted = JSON.stringify(title)
    .slice(1, -1)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bit\\(\\s*["'\`]${quoted}["'\`]`).test(read(file));
}

describe("the error-state inventory", () => {
  it("names every page load, every save's intent and every Google call, and nothing else", () => {
    const required = requiredKeys();
    const listed = INVENTORY.map((call) => call.key);

    expect(required.length).toBeGreaterThanOrEqual(60);
    expect(required.filter((key) => !listed.includes(key))).toEqual([]);
    expect(listed.filter((key) => !required.includes(key))).toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("gives every call outcomes with stable ids, each proved by a probe or a test that exists", () => {
    const problems: string[] = [];
    for (const call of INVENTORY) {
      const ids = call.outcomes.map((outcome) => outcome.id);
      if (ids.length === 0) problems.push(`${call.key}: no outcomes`);
      if (new Set(ids).size !== ids.length) problems.push(`${call.key}: repeated outcome id`);
      // Every save can fail in the browser; each says how it shows.
      if (call.key.includes(" POST ") && !ids.some((id) => id.startsWith("browser-failure"))) {
        problems.push(`${call.key}: no browser failure`);
      }
      for (const outcome of call.outcomes) {
        const tests = (outcome.proof ?? []).filter((proof) => "file" in proof);
        if (!outcome.probe && tests.length === 0) {
          problems.push(`${call.key} ${outcome.id}: nothing proves it`);
        }
        for (const proof of tests) {
          if (!hasTest(proof.file, proof.test)) {
            problems.push(`${call.key} ${outcome.id}: no test "${proof.test}" in ${proof.file}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("answers every probe as the inventory says", async () => {
    const store = getStore();
    const { group: band, organizer } = store.createGroup("Error Band", "Viola", "Europe/London");
    const member = store.addMember(band.id, "Cellist", "member");
    const today = todayInZone(band.timeZone, new Date());
    const open = store.createRequest(band.id, {
      name: "Open request",
      startDate: today,
      endDate: addDays(today, 30),
      windows: [{ startMinute: 1140, endMinute: 1260 }],
    });
    const proposed = store.addRehearsal(
      band.id,
      open.id,
      { date: addDays(today, 7), startMinute: 1140, endMinute: 1260 },
      "Hall",
    );
    const stranger = await signedIn({ sub: "probe-stranger", email: "s@example.test", name: "S" });
    const cookies: Record<Probe["as"], string | undefined> = {
      visitor: undefined,
      member: await deviceCookie(band.id, member.deviceToken),
      organizer: await deviceCookie(band.id, organizer.deviceToken),
      "signed-in": stranger.cookie,
    };
    const openPath = requestHrefOf(band, open.id);
    const values: Record<string, string> = {
      group: groupPath(band),
      open: openPath,
      "open-encoded": encodeURIComponent(openPath),
      invite: invitePath(band),
      proposed: proposed.id,
      member: member.id,
      organizer: organizer.id,
    };
    const fill = (text: string) => text.replace(/\{([a-z-]+)\}/g, (_, name) => values[name]);
    const modules: Record<string, { loader?: unknown; action?: unknown }> = {
      "routes/auth.google.disconnect": disconnect,
      "routes/auth.sign-out": signOut,
      "routes/calendar-feed": feed,
      "routes/group": group,
      "routes/groups": groups,
      "routes/healthz": healthz,
      "routes/home": home,
      "routes/join": join_,
      "routes/members.add": membersAdd,
      "routes/profile": profile,
      "routes/rehearsal-link": rehearsalLink,
      "routes/request": request,
      "routes/request-calendar": requestCalendar,
      "routes/requests.new": requestsNew,
      "routes/schedule": schedule,
    };
    const routes = routeTable();

    const mismatches: unknown[] = [];
    let probes = 0;
    for (const call of INVENTORY) {
      for (const outcome of call.outcomes) {
        const probe = outcome.probe;
        if (!probe) continue;
        probes += 1;
        const id = call.key.split(" ")[0];
        const path = fill(probe.path);
        const pathname = new URL(path, ORIGIN).pathname;
        const route = routes.find((item) => item.id === id);
        const params = route ? matchPath(route.pattern, pathname)?.params : undefined;
        const handler = modules[id]?.[probe.form ? "action" : "loader"] as
          ((args: unknown) => Promise<unknown>) | undefined;
        if (!params || !handler) {
          mismatches.push({
            call: call.key,
            outcome: outcome.id,
            problem: "no route for the probe",
          });
          continue;
        }
        const form = probe.form
          ? Object.fromEntries(Object.entries(probe.form).map(([k, v]) => [k, fill(v)]))
          : undefined;
        let value: unknown;
        try {
          value = await handler(routeArgs(path, params, { cookie: cookies[probe.as], form }));
        } catch (thrown) {
          value = thrown;
        }
        const got = await answerOf(value);
        const want = {
          status: probe.expect.status,
          ...(probe.expect.location ? { location: fill(probe.expect.location) } : {}),
          ...(probe.expect.data ? { data: probe.expect.data } : {}),
          ...(probe.expect.toast ? { toast: probe.expect.toast } : {}),
        };
        const seen = {
          status: got.status,
          ...(want.location ? { location: got.location } : {}),
          ...(want.data ? { data: got.keys.includes(want.data) ? want.data : got.keys } : {}),
          ...(want.toast ? { toast: got.toast } : {}),
        };
        if (JSON.stringify(seen) !== JSON.stringify(want)) {
          mismatches.push({ call: call.key, outcome: outcome.id, want, seen });
        }
      }
    }

    expect(probes).toBeGreaterThan(50);
    expect(mismatches).toEqual([]);
  });
});

/** What a loader or action answered (returned or thrown), as the probes compare it. */
async function answerOf(value: unknown): Promise<{
  status: number;
  location: string | null;
  keys: string[];
  toast: string | null;
}> {
  if (value instanceof Response) {
    const cookie = value.headers
      .getSetCookie()
      .map((header) => header.split(";")[0])
      .find((pair) => pair.startsWith("mc_toast="));
    const toast = cookie
      ? (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast
      : null;
    return {
      status: value.status,
      location: value.headers.get("Location"),
      keys: [],
      toast: toast?.kind ?? null,
    };
  }
  const wrapped = value as { type?: string; data?: unknown; init?: ResponseInit | null } | null;
  if (wrapped && typeof wrapped === "object" && wrapped.type === "DataWithResponseInit") {
    const body = wrapped.data;
    return {
      status: wrapped.init?.status ?? 200,
      location: null,
      keys: body && typeof body === "object" ? Object.keys(body) : [],
      toast: null,
    };
  }
  if (value instanceof Error) throw value;
  return {
    status: 200,
    location: null,
    keys: value && typeof value === "object" ? Object.keys(value) : [],
    toast: null,
  };
}

const failure = (overrides: Partial<Failure> = {}): Failure => ({
  kind: "offline",
  message: "The connection dropped.",
  certain: false,
  retry: true,
  entries: [["intent", "rsvp"]],
  ...overrides,
});

describe("what a failed save shows", () => {
  it("a failed save says so with Retry, or Reload for a create", () => {
    const render = (shown: Failure) => {
      const Stub = createRoutesStub([
        { path: "/page", Component: () => <PageFailure failure={shown} /> },
      ]);
      return renderToString(<Stub initialEntries={["/page"]} />);
    };

    const dropped = render(failure());
    expect(dropped).toContain("Maybe not saved.");
    expect(dropped).toContain("The connection dropped.");
    expect(dropped).toContain("Retry");
    expect(dropped).toContain('role="alert"');
    const server = render(
      failure({ kind: "server", message: "Something went wrong on our side.", certain: true }),
    );
    expect(server).toContain("Not saved.");
    const create = render(
      failure({
        message: "The connection dropped. Reload to check before trying again.",
        retry: false,
      }),
    );
    expect(create).toContain("Reload");
    expect(create).not.toContain("Retry");
  });
});

describe("what stays on screen after a failed save", () => {
  const failed = (entries: [string, string][]) => ({ failure: failure({ entries }) });

  it("keeps the last result while a failure shows, and lets a later result replace it", () => {
    type Result = { values: string };
    let memory = keepResult<Result>({ seen: undefined, kept: undefined }, { values: "first" });
    expect(memory.kept).toEqual({ values: "first" });
    const failure1 = failed([["name", "x"]]);
    memory = keepResult<Result>(memory, failure1);
    expect(memory).toEqual({ seen: failure1, kept: { values: "first" } });
    // The same data again changes nothing.
    expect(keepResult<Result>(memory, failure1)).toBe(memory);
    memory = keepResult<Result>(memory, { values: "second" });
    expect(memory.kept).toEqual({ values: "second" });
    // A redirect clears the page's action data: nothing is kept any more.
    expect(keepResult<Result>(memory, undefined).kept).toBeUndefined();
  });

  it("shows a failed date's change until it's retried or superseded", () => {
    const ticking = new FormData();
    ticking.set("on", "1");
    const untick = failed([
      ["intent", "set-date"],
      ["on", "0"],
    ]);

    expect(shownChange(ticking, undefined, false)).toEqual({ on: true });
    expect(shownChange(undefined, untick, true)).toEqual({ on: false });
    // Superseded (Select all or Clear all saved since): the saved state shows.
    expect(shownChange(undefined, untick, false)).toBeNull();
    expect(shownChange(undefined, { dateSaved: true }, true)).toBeNull();

    const submit = vi.fn(async () => {});
    const outcome = outcomeOf(untick, submit);
    expect(outcome.failure?.message).toBe("The connection dropped.");
    outcome.retry();
    const [sentForm, options] = submit.mock.calls[0] as unknown as [FormData, object];
    expect([...sentForm.entries()]).toEqual(untick.failure.entries);
    expect(options).toEqual({ method: "post" });
    expect(outcomeOf({ dateProblem: "Gone" }, submit)).toMatchObject({
      problem: "Gone",
      failure: null,
    });
  });
});

describe("saves that make something", () => {
  it("offer Reload, not Retry, whichever of their buttons sent them", async () => {
    const creating: [string, { clientAction: (args: never) => Promise<unknown> }, string[]][] = [
      ["home", home, ["(default)"]],
      ["groups", groups, ["(default)"]],
      ["join", join_, ["(default)", "new", "pick"]],
      ["members.add", membersAdd, ["(default)"]],
      ["requests.new", requestsNew, ["(default)", "save"]],
      ["request", request, ["propose", "propose-times"]],
    ];
    const offered: string[] = [];
    for (const [name, module, intents] of creating) {
      for (const intent of intents) {
        const body = new URLSearchParams(intent === "(default)" ? {} : { intent });
        const result = (await module.clientAction({
          request: new Request(`${ORIGIN}/x`, { method: "POST", body }),
          serverAction: () => Promise.reject(new TypeError("Failed to fetch")),
        } as never)) as { data: { failure: Failure } };
        if (result.data.failure.retry) offered.push(`${name} ${intent}`);
      }
    }
    // On pages whose every form makes something, every intent their buttons send.
    for (const [name, , intents] of creating.filter(([name]) =>
      ["home", "join", "members.add", "requests.new"].includes(name),
    )) {
      const source = read(`app/routes/${name}.tsx`);
      const sent = [...source.matchAll(/name="intent"\s+value="([a-z-]+)"/g)].map((m) => m[1]);
      for (const intent of sent) {
        if (name === "requests.new" && intent === "add-window") continue;
        if (!intents.includes(intent)) offered.push(`${name} ${intent} (not listed)`);
      }
    }
    expect(offered).toEqual([]);
  });
});

describe("the error page", () => {
  const status = (code: number) => ({ status: code, statusText: "", internal: false, data: null });

  it("the error page names a missing page, an organizer-only page, our failure and a lost connection", () => {
    expect(errorPage(status(404))).toMatchObject({ title: "Page not found", retry: false });
    expect(errorPage(status(403))).toMatchObject({
      title: "Only organizers can see this",
      toGroup: true,
    });
    expect(errorPage(status(502))).toMatchObject({
      title: "Something went wrong on our side",
      retry: true,
    });
    expect(errorPage(new TypeError("Failed to fetch"))).toMatchObject({
      title: "Couldn't reach music-chairs",
      retry: true,
      toGroup: true,
    });
    expect(errorPage(new Error("boom"))).toMatchObject({ title: "Something went wrong" });
    // A bug in the page is a TypeError too; only a fetch that got no answer is "offline".
    expect(errorPage(new TypeError("Cannot read properties of undefined"))).toMatchObject({
      title: "Something went wrong",
      toGroup: false,
    });
    for (const message of ["Load failed", "NetworkError when attempting to fetch resource."]) {
      expect(errorPage(new TypeError(message)).title).toBe("Couldn't reach music-chairs");
    }

    const render = (error: unknown, at: string) => {
      const Stub = createRoutesStub([
        { id: "page", path: "/g/:groupAddress/*", Component: () => null, ErrorBoundary },
      ]);
      return renderToString(
        <Stub initialEntries={[at]} hydrationData={{ errors: { page: error } }} />,
      );
    };
    const offline = render(new TypeError("Failed to fetch"), "/g/quartet-abc/schedule");
    expect(offline).toContain("Couldn&#x27;t reach music-chairs");
    expect(offline).toContain("Try again");
    expect(offline).toContain('href="/g/quartet-abc"');
    const forbidden = render(status(403), "/g/quartet-abc/members/add");
    expect(forbidden).toContain('href="/g/quartet-abc"');
    expect(forbidden).not.toContain("Try again");
    const missing = render(status(404), "/g/quartet-abc/nothing");
    expect(missing).not.toContain('href="/g/quartet-abc"');
  });
});

describe("notices", () => {
  it("home and each page show their own notices; the root shows the rest, each once", () => {
    const at =
      "/groups?notice=signin-expired&notice=calendar-failed&notice=signin-expired&notice=bogus";
    const render = (handled: string[]) => {
      const Stub = createRoutesStub([
        {
          path: "/groups",
          handle: { notices: handled },
          Component: () => (
            <Layout>
              <main>Page</main>
            </Layout>
          ),
        },
      ]);
      return renderToString(<Stub initialEntries={[at]} />);
    };
    const count = (html: string, text: string) =>
      html.split(text.replace(/'/g, "&#x27;")).length - 1;

    const unhandled = render([]);
    expect(count(unhandled, NOTICES["signin-expired"])).toBe(1);
    expect(count(unhandled, NOTICES["calendar-failed"])).toBe(1);
    expect(unhandled).not.toContain("bogus");
    // A page that shows calendar notices itself leaves only the rest to the root.
    const handled = render(["calendar-failed"]);
    expect(count(handled, NOTICES["calendar-failed"])).toBe(0);
    expect(count(handled, NOTICES["signin-expired"])).toBe(1);
    // The page's own text, from the same address.
    expect(noticeText(new Request(`${ORIGIN}${at}`), ["calendar-failed", "signin-expired"])).toBe(
      `${NOTICES["signin-expired"]} ${NOTICES["calendar-failed"]}`,
    );
  });
});

/** A member signed in with Google on this device, with `scopes` granted. */
async function googleMember(scopes: string[]) {
  const store = getStore();
  const { group: band, organizer } = store.createGroup("Google Band", "Viola", "Europe/London");
  const { account, cookie: session } = await signedIn({
    sub: `google-member-${Math.random()}`,
    email: `gm-${Math.random()}@example.test`,
    name: "Gee",
  });
  const member = store.addMember(band.id, "Gee", "member", account.id);
  store.saveGrant(account.id, "refresh-1", scopes);
  forgetAccessToken(account.id);
  const cookie = `${await deviceCookie(band.id, member.deviceToken)}; ${session}`;
  return { store, band, organizer, account, member, cookie };
}

function stubClientEnv() {
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");
}

describe("Google reads", () => {
  const range = () => {
    const today = todayInZone("Europe/London", new Date());
    return { from: today, to: addDays(today, 6) };
  };
  const windows = [{ startMinute: 1140, endMinute: 1260 }];

  it("reads clashes whatever goes wrong, giving up after 5 seconds", async () => {
    stubClientEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { band, cookie } = await googleMember([CALENDAR_SCOPES.busy]);
    const page = () =>
      new Request(`${ORIGIN}${groupPath(band)}/x`, { headers: { Cookie: cookie } });

    const google: GoogleFake = fakeGoogle();
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    expect((await googleClashes(page(), band, range(), windows)).state).toBe("ready");
    // The token refresh and the free/busy reads all give up after 5 seconds.
    expect(timeouts.mock.calls.length).toBeGreaterThan(1);
    expect(timeouts.mock.calls.every(([ms]) => ms === READ_TIMEOUT_MS)).toBe(true);
    expect(READ_TIMEOUT_MS).toBe(5000);

    // Not only Google's own errors: anything at all leaves the page working.
    google.freeBusyAnswer = { status: 500, body: {} };
    expect(await googleClashes(page(), band, range(), windows)).toEqual({ state: "error" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await googleClashes(page(), band, range(), windows)).toEqual({ state: "error" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );
    expect(await googleClashes(page(), band, range(), windows)).toEqual({ state: "error" });
  });

  it("says Google Calendar access was removed, not that it was never given", async () => {
    stubClientEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { store, band, account, member, cookie } = await googleMember([
      CALENDAR_SCOPES.busy,
      CALENDAR_SCOPES.write,
    ]);
    store.setCalendarSync(band.id, member.id, true);
    const page = () =>
      new Request(`${ORIGIN}${groupPath(band)}/x`, { headers: { Cookie: cookie } });
    const google = fakeGoogle();
    google.refreshAnswer = { status: 400, body: { error: "invalid_grant" } };

    expect(await googleClashes(page(), band, range(), windows)).toMatchObject({
      state: "connect",
      revoked: true,
    });
    expect(store.findGrant(account.id)).toBeNull();
    expect(accessRevoked(account.id)).toBe(true);
    expect(await googleWriteState(page(), band, store.findMember(band.id, member.id)!)).toBe(
      "revoked",
    );
    const panel = (await schedule.loader(
      routeArgs(
        `${groupPath(band)}/schedule`,
        { groupAddress: groupPath(band).slice(3) },
        { cookie },
      ),
    )) as { calendar: { google: { state: string } } };
    expect(panel.calendar.google.state).toBe("revoked");

    // A new grant (or a disconnect) forgets it: never connected again reads as "connect".
    store.saveGrant(account.id, "refresh-2", [CALENDAR_SCOPES.busy]);
    forgetAccessToken(account.id);
    store.disconnectGoogle(account.id);
    expect(await googleClashes(page(), band, range(), windows)).toMatchObject({
      state: "connect",
      revoked: false,
    });
  });

  it("says what happened to Google contacts: unreadable, removed or none found", async () => {
    stubClientEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = getStore();
    const { account, cookie: session } = await signedIn({
      sub: "contacts-organizer",
      email: "co@example.test",
      name: "Co",
    });
    const { group: band, organizer } = store.createGroup("Contacts Band", "Co", "Europe/London");
    store.linkMember(band.id, organizer.id, account.id);
    const cookie = `${await deviceCookie(band.id, organizer.deviceToken)}; ${session}`;
    const load = async () =>
      (
        (await membersAdd.loader(
          routeArgs(
            `${groupPath(band)}/members/add`,
            { groupAddress: groupPath(band).slice(3) },
            { cookie },
          ),
        )) as { suggestions: { state: string; revoked?: boolean; contacts?: unknown[] } }
      ).suggestions;
    const grant = () => {
      store.saveGrant(account.id, "refresh-c", [CONTACTS_SCOPES.saved, CONTACTS_SCOPES.other]);
      forgetAccessToken(account.id);
    };

    grant();
    const google = fakeGoogle();
    const empty = await load();
    expect(empty).toEqual({ state: "ready", contacts: [] });
    const Stub = createRoutesStub([{ id: "page", path: "/add", Component: AddMembers }]);
    const html = renderToString(
      <Stub
        initialEntries={["/add"]}
        hydrationData={{
          loaderData: {
            page: { groupHref: "/g/x", groupName: "X", notice: null, suggestions: empty },
          },
        }}
      />,
    );
    expect(html).toContain("No contacts with an email address were found");

    grant();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("oauth2"))
          return Response.json({ access_token: "t", expires_in: 3600 });
        throw new TypeError("fetch failed");
      }),
    );
    expect(await load()).toEqual({ state: "error" });

    grant();
    const refused = fakeGoogle();
    refused.refreshAnswer = { status: 400, body: { error: "invalid_grant" } };
    expect(await load()).toMatchObject({ state: "connect", revoked: true });
    void google;
  });
});

describe("Google writes", () => {
  it("shows a calendar that couldn't be updated to its member until an update works", async () => {
    stubClientEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { store, band, organizer, account, member, cookie } = await googleMember([
      CALENDAR_SCOPES.write,
    ]);
    store.setCalendarSync(band.id, member.id, true);
    const today = todayInZone(band.timeZone, new Date());
    const rehearsal = store.addRehearsal(
      band.id,
      store.createRequest(band.id, {
        name: "Writes",
        startDate: today,
        endDate: addDays(today, 30),
        windows: [{ startMinute: 1140, endMinute: 1260 }],
      }).id,
      { date: addDays(today, 7), startMinute: 1140, endMinute: 1260 },
      "Hall",
    );
    store.confirmRehearsal(band.id, rehearsal.id);
    const target = { memberId: member.id, groupId: band.id, accountId: account.id };
    const panel = async (as: string) =>
      (
        (await schedule.loader(
          routeArgs(
            `${groupPath(band)}/schedule`,
            { groupAddress: groupPath(band).slice(3) },
            { cookie: as },
          ),
        )) as { calendar: { google: { state: string; failedAt: string | null } | null } }
      ).calendar.google;

    const google = fakeGoogle();
    google.queue.set("PUT /calendars/primary/events", [{ status: 500, body: {} }]);
    google.queue.set("POST /calendars/primary/events", [{ status: 500, body: {} }]);
    scheduleSync([target]);
    await whenSynced();

    const failed = await panel(cookie);
    expect(failed?.state).toBe("on");
    expect(failed?.failedAt).toMatch(/\d/);
    // Only to its own member: the organizer's panel says nothing of it.
    expect(
      (await panel(await deviceCookie(band.id, organizer.deviceToken)))?.failedAt ?? null,
    ).toBeNull();

    google.queue.clear();
    scheduleSync([target]);
    await whenSynced();
    expect((await panel(cookie))?.failedAt).toBeNull();
  });
});

describe("Disconnect Google", () => {
  it("is waited for longer than its own worst case, so a slow Google isn't called a failure", async () => {
    expect(DISCONNECT_TIMEOUT_MS).toBeGreaterThan(STOP_WRITING_WAIT_MS + GOOGLE_TIMEOUT_MS);
    vi.useFakeTimers();
    try {
      let answered = false;
      const outcome = disconnect.clientAction({
        request: new Request(`${ORIGIN}/auth/google/disconnect`, { method: "POST" }),
        serverAction: () => new Promise<never>(() => {}),
      } as never);
      void outcome.then(() => (answered = true));
      await vi.advanceTimersByTimeAsync(STOP_WRITING_WAIT_MS + GOOGLE_TIMEOUT_MS);
      expect(answered).toBe(false);
      expect(ACTION_TIMEOUT_MS).toBeLessThan(STOP_WRITING_WAIT_MS + GOOGLE_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(DISCONNECT_TIMEOUT_MS);
      expect(answered).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("error toasts", () => {
  it("never turn a pressed button to Saved", () => {
    const pressed = nextFeedback(IDLE, { type: "press", key: "k", toastId: null, now: 0 });
    const saving = nextFeedback(pressed, { type: "navigating" });
    const refused = confirmationId({ id: "t1", kind: "error" });
    const confirmed = confirmationId({ id: "t2", kind: "success" });

    expect(refused).toBeNull();
    expect(nextFeedback(saving, { type: "idle", toastId: refused, now: 1 }).phase).toBe("idle");
    expect(nextFeedback(saving, { type: "idle", toastId: confirmed, now: 1 }).phase).toBe("saved");
    const html = renderToString(
      createElement(createRoutesStub([{ id: "root", path: "/", Component: Toaster }]), {
        initialEntries: ["/"],
        hydrationData: {
          loaderData: { root: { toast: { id: "t1", message: "No", kind: "error" } } },
        },
      }),
    );
    expect(html).toContain('class="toast toast-error" role="alert"');
  });

  it("are green for success, yellow for done but not fully, red for refusals; only red is an alert", () => {
    const render = (kind: "success" | "warning" | "error") =>
      renderToString(
        createElement(createRoutesStub([{ id: "root", path: "/", Component: Toaster }]), {
          initialEntries: ["/"],
          hydrationData: { loaderData: { root: { toast: { id: kind, message: "M", kind } } } },
        }),
      );
    // The always-mounted region announces success and warnings politely.
    for (const kind of ["success", "warning"] as const) {
      const html = render(kind);
      expect(html).toContain(`class="toast toast-${kind}"`);
      expect(html).not.toContain('role="alert"');
      expect(html).toContain('role="status"');
    }
    expect(render("error")).toContain('class="toast toast-error" role="alert"');
    // A warning is not a confirmation: the pressed button doesn't say Saved.
    expect(confirmationId({ id: "w", kind: "warning" })).toBeNull();
  });

  it("keep their kind through the toast cookie, and read anything unknown as success", async () => {
    for (const kind of ["success", "warning", "error"] as const) {
      const sent = await redirectWithToast("/", "M", { kind });
      expect((await answerOf(sent)).toast).toBe(kind);
    }
    expect(toastKind("surprise")).toBe("success");
  });

  it("a partial disconnect is a yellow warning and a refused profile a red error, neither saved", async () => {
    stubClientEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const toastOf = async (response: Response) => (await answerOf(response)).toast;
    const { band, cookie } = await googleMember([CALENDAR_SCOPES.busy]);

    const refusedProfile = (await profile.action(
      routeArgs(
        `${groupPath(band)}/profile`,
        { groupAddress: groupPath(band).slice(3) },
        { cookie, form: { displayName: " ", returnTo: groupPath(band) } },
      ),
    )) as Response;
    expect(await toastOf(refusedProfile)).toBe("error");

    const google = fakeGoogle();
    google.revokeAnswer = { status: 503, body: {} };
    const partly = (await disconnect.action(
      routeArgs("/auth/google/disconnect", {}, { cookie, form: { confirmed: "1" } }),
    )) as Response;
    expect(await toastOf(partly)).toBe("warning");
    const toast = await readToast(
      new Request(ORIGIN, {
        headers: {
          Cookie: partly.headers
            .getSetCookie()
            .map((header) => header.split(";")[0])
            .find((pair) => pair.startsWith("mc_toast="))!,
        },
      }),
    );
    expect(toast.toast?.message).toContain("Google didn't answer");
  });
});
