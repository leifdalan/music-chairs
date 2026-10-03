// A scripted stand-in for Google's token, free/busy and Calendar event
// endpoints, installed as the global `fetch`. It records every call and lets a
// test choose answers per endpoint.
import { vi } from "vitest";

export type FakeCall = { method: string; url: string; body: unknown };

type Answer = { status?: number; body?: unknown };

export type GoogleFake = {
  calls: FakeCall[];
  /** Calls to the Calendar API (not the token endpoint or the People API). */
  calendarCalls(): FakeCall[];
  /** Calls to the People API (contacts). */
  peopleCalls(): FakeCall[];
  /** Saved and other contacts the People API answers with, in pages of `contactsPageSize`. */
  contacts: { name?: string; emails: string[] }[];
  otherContacts: { name?: string; emails: string[] }[];
  contactsPageSize: number;
  peopleAnswer: Answer | null;
  busy: { start: string; end: string }[];
  freeBusyAnswer: Answer | null;
  /** One-off free/busy answers, used in order before `freeBusyAnswer`. */
  freeBusyAnswers: Answer[];
  /** Answers by "METHOD /path" prefix, consumed one at a time; a missing entry succeeds. */
  queue: Map<string, Answer[]>;
  refreshAnswer: Answer | null;
  codeAnswer: Answer | null;
};

/** Installs the fake; restore with `vi.unstubAllGlobals()`. */
export function fakeGoogle(): GoogleFake {
  const fake: GoogleFake = {
    calls: [],
    calendarCalls: () =>
      fake.calls.filter(
        (call) =>
          !call.url.includes("oauth2.googleapis.com") &&
          !call.url.includes("people.googleapis.com"),
      ),
    peopleCalls: () => fake.calls.filter((call) => call.url.includes("people.googleapis.com")),
    contacts: [],
    otherContacts: [],
    contactsPageSize: 1000,
    peopleAnswer: null,
    busy: [],
    freeBusyAnswer: null,
    freeBusyAnswers: [],
    queue: new Map(),
    refreshAnswer: null,
    codeAnswer: null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      const raw = typeof init.body === "string" ? init.body : String(init.body ?? "");
      const body = raw.startsWith("{")
        ? JSON.parse(raw)
        : Object.fromEntries(new URLSearchParams(raw));
      fake.calls.push({ method, url, body });
      const reply = (answer: Answer) => {
        const status = answer.status ?? 200;
        const empty = answer.body === undefined || status === 204;
        return new Response(empty ? null : JSON.stringify(answer.body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      };
      if (url === "https://oauth2.googleapis.com/token") {
        const form = body as Record<string, string>;
        if (form.grant_type === "refresh_token") {
          return reply(
            fake.refreshAnswer ?? { body: { access_token: "access-token", expires_in: 3600 } },
          );
        }
        return reply(fake.codeAnswer ?? { status: 400, body: { error: "no code answer set" } });
      }
      if (url.startsWith("https://people.googleapis.com/")) {
        if (fake.peopleAnswer) return reply(fake.peopleAnswer);
        const parsed = new URL(url);
        const other = parsed.pathname === "/v1/otherContacts";
        const list = other ? fake.otherContacts : fake.contacts;
        const start = Number(parsed.searchParams.get("pageToken") ?? 0);
        const page = list.slice(start, start + fake.contactsPageSize).map((person) => ({
          ...(person.name ? { names: [{ displayName: person.name }] } : {}),
          emailAddresses: person.emails.map((value) => ({ value })),
        }));
        const next = start + fake.contactsPageSize;
        return reply({
          body: {
            [other ? "otherContacts" : "connections"]: page,
            ...(next < list.length ? { nextPageToken: String(next) } : {}),
          },
        });
      }
      const path = new URL(url).pathname.replace("/calendar/v3", "");
      if (path === "/freeBusy") {
        return reply(
          fake.freeBusyAnswers.shift() ??
            fake.freeBusyAnswer ?? { body: { calendars: { primary: { busy: fake.busy } } } },
        );
      }
      // Only the event paths the app may use exist; anything else is a loud 404.
      const known =
        (method === "POST" && path === "/calendars/primary/events") ||
        ((method === "PUT" || method === "DELETE") &&
          /^\/calendars\/primary\/events\/[a-v0-9]{5,1024}$/.test(path));
      if (!known) return reply({ status: 404, body: { error: "unknown path in fake" } });
      const key = [...fake.queue.keys()].find((prefix) => `${method} ${path}`.startsWith(prefix));
      const answer = key ? fake.queue.get(key)?.shift() : undefined;
      return reply(answer ?? (method === "DELETE" ? { status: 204 } : { body: {} }));
    }),
  );
  return fake;
}

/** An unsigned JWT-shaped ID token, as Google's token endpoint returns it. */
export function idToken(claims: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}
