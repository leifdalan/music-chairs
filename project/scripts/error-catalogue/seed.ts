// Seeds a band for the error-state catalogue through the app's own pages and
// the fake Google (plan/phase-35.md): an organizer signed in with Google and
// allowed contacts; name-only members; a Google member whose calendar writing
// is off; a stranger signed in; a place added by email; an open request with a
// proposed time and a complete one.
import type { FakeGoogle, Identity } from "./fake-google.ts";

/** One browser's cookies, as `name=value` pairs. */
export class Jar {
  cookies = new Map<string, string>();
  take(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0];
      const name = pair.slice(0, pair.indexOf("="));
      const value = pair.slice(pair.indexOf("=") + 1);
      if (value === "" || /max-age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

export type Seeded = {
  roles: { organizer: Jar; member: Jar; pianist: Jar; google: Jar; stranger: Jar };
  group: string;
  invite: string;
  open: string;
  complete: string;
  identities: { organizer: Identity; google: Identity; stranger: Identity; invited: Identity };
};

/** A day `days` from today, as YYYY-MM-DD (a day ahead of UTC, so never past in Europe). */
export function day(days: number): string {
  return new Date(Date.now() + (days + 1) * 86_400_000).toISOString().slice(0, 10);
}

export function client(origin: string) {
  /** One request without following redirects; the jar keeps what it sets. */
  async function send(jar: Jar, path: string, form?: Record<string, string>): Promise<Response> {
    const response = await fetch(new URL(path, origin), {
      method: form ? "POST" : "GET",
      redirect: "manual",
      headers: { Cookie: jar.header() },
      body: form ? new URLSearchParams(form) : undefined,
    });
    jar.take(response);
    return response;
  }
  /** Follows redirects within the app and to the fake Google's consent page and back. */
  async function follow(jar: Jar, path: string, form?: Record<string, string>): Promise<string> {
    let response = await send(jar, path, form);
    let at = path;
    for (let hops = 0; hops < 10; hops++) {
      const location = response.headers.get("Location");
      if (response.status < 300 || response.status >= 400 || !location) break;
      at = location;
      if (new URL(location, origin).origin !== new URL(origin).origin) {
        // The fake Google's consent page: Continue goes back to the app.
        const page = await (await fetch(location)).text();
        const href = /id="continue" href="([^"]+)"/.exec(page)?.[1].replace(/&amp;/g, "&");
        if (!href) throw new Error(`no Continue on the consent page at ${location}`);
        at = href;
        response = await send(jar, new URL(href).pathname + new URL(href).search);
        continue;
      }
      response = await send(jar, location);
    }
    if (response.status >= 400) throw new Error(`seed: ${path} answered ${response.status}`);
    return new URL(at, origin).pathname + new URL(at, origin).search;
  }
  return { send, follow };
}

/** Signs `jar` in through the fake Google as `identity`, from `returnTo`. */
export async function signIn(
  origin: string,
  google: FakeGoogle,
  jar: Jar,
  identity: Identity,
  returnTo: string,
): Promise<string> {
  google.set({ identity });
  return client(origin).follow(jar, `/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function seed(origin: string, google: FakeGoogle): Promise<Seeded> {
  const { send, follow } = client(origin);
  const roles = {
    organizer: new Jar(),
    member: new Jar(),
    pianist: new Jar(),
    google: new Jar(),
    stranger: new Jar(),
  };
  const identities = {
    organizer: {
      sub: "seed-organizer",
      email: "viola@example.test",
      name: "Viola",
      email_verified: true,
    },
    google: { sub: "seed-google", email: "gee@example.test", name: "Gee", email_verified: true },
    stranger: {
      sub: "seed-stranger",
      email: "stranger@example.test",
      name: "Stranger",
      email_verified: true,
    },
    invited: { sub: "seed-una", email: "una@example.test", name: "Una", email_verified: false },
  };

  const group = await follow(roles.organizer, "/?index", {
    groupName: "Thursday Quartet",
    displayName: "Viola",
    timeZone: "Europe/London",
  });
  const page = await (await send(roles.organizer, group)).text();
  const invite = /\/join\/thursday-quartet-[a-z0-9]{8}/.exec(page)?.[0];
  if (!invite) throw new Error("seed: no invite link on the organizer's group page");

  await follow(roles.member, invite, { displayName: "Cellist" });
  await follow(roles.pianist, invite, { displayName: "Pianist" });
  // Signing in on the group page links the organizer's member to Google;
  // then contacts are allowed for adding members.
  await signIn(origin, google, roles.organizer, identities.organizer, group);
  google.set({ identity: identities.organizer });
  await follow(
    roles.organizer,
    `/auth/google/calendar?scope=contacts&returnTo=${encodeURIComponent(`${group}/members/add`)}`,
  );
  await follow(roles.organizer, `${group}/members/add`, { person: "Una <una@example.test>" });
  // A Google member, joining while signed in, so the member is the account's.
  await signIn(origin, google, roles.google, identities.google, invite);
  await follow(roles.google, invite, { displayName: "Gee" });
  await signIn(origin, google, roles.stranger, identities.stranger, "/");

  const times = { "windowStart-0": "19:00", "windowEnd-0": "22:00" };
  const complete = await follow(roles.organizer, `${group}/requests/new`, {
    intent: "save",
    name: "Autumn concert",
    startDate: day(7),
    endDate: day(14),
    ...times,
  });
  await follow(roles.organizer, complete, {
    intent: "propose",
    date: day(10),
    startTime: "19:30",
    endTime: "21:30",
    location: "Hall",
  });
  const schedule = await (await send(roles.organizer, `${group}/schedule`)).text();
  const proposed =
    /name="intent" value="confirm"\/><input type="hidden" name="rehearsalId" value="([A-Za-z0-9_-]{22})"/.exec(
      schedule,
    )?.[1];
  if (!proposed) throw new Error("seed: no proposed rehearsal to confirm");
  await follow(roles.organizer, `${group}/schedule`, { intent: "confirm", rehearsalId: proposed });

  const open = await follow(roles.organizer, `${group}/requests/new`, {
    intent: "save",
    name: "Open request",
    startDate: day(1),
    endDate: day(28),
    ...times,
  });
  for (const jar of [roles.member, roles.google, roles.organizer]) {
    await follow(jar, open, {
      intent: "save-dates",
      date: day(3),
      startTime: "19:00",
      endTime: "22:00",
    });
    await follow(jar, open, { intent: "answer", limit: "any" });
  }
  await follow(roles.organizer, open, {
    intent: "propose",
    date: day(8),
    startTime: "19:30",
    endTime: "21:30",
    location: "Studio B",
    notes: "Bring the Brahms parts",
  });
  // The Google member stops calendar writing, so home offers "Add to Google Calendar".
  await follow(roles.google, `${group}/schedule`, {
    intent: "set-calendar",
    value: "off",
    confirmed: "1",
  });
  google.reset();
  return { roles, group, invite, open, complete, identities };
}
