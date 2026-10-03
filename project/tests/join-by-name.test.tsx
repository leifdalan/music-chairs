import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { readToast } from "../app/.server/flash";
import { findViewer } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import Join, { action, loader } from "../app/routes/join";
import { ORIGIN, routeArgs, setCookies, signedIn, tempDatabase } from "./routes";

const count = tempDatabase();
beforeAll(() => {
  getStore();
});

let people = 0;

/** A group with an organizer (Viola), a name-only member Spare, and a Google-linked member Cellist. */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
  const spare = store.addMember(group.id, "Spare", "member");
  people += 1;
  const { account } = await signedIn({
    sub: `join-sub-${people}`,
    email: `join${people}@example.test`,
    name: "Cellist",
  });
  const cellist = store.addMember(group.id, "Cellist", "member", account.id);
  return { store, group, organizer, spare, cellist };
}

function post(token: string, form: Record<string, string>, cookie?: string) {
  return action(
    routeArgs(`/join/${token}`, { inviteToken: token }, { cookie, form }),
  ) as Promise<unknown>;
}

/** The membership cookie a response sets, as a Cookie header. */
function membershipOf(response: unknown): string {
  return Object.values(setCookies(response as Response)).find((pair) =>
    pair.startsWith("mc_members"),
  )!;
}

async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

describe("getting back in by name", () => {
  it("signs this device in as the name-only member of that name, in any case or spacing", async () => {
    const { store, group, spare } = await band();
    const before = count("members");

    const response = await post(group.inviteToken, { displayName: "  SPARE " });

    expect(statusOf(response)).toBe(302);
    expect(await toastOf(response)).toBe("Welcome back, Spare");
    expect(count("members")).toBe(before);
    const viewer = await findViewer(
      new Request(ORIGIN, { headers: { Cookie: membershipOf(response) } }),
      group,
    );
    expect(viewer?.id).toBe(spare.id);
    expect(store.findMember(group.id, spare.id)?.googleEmail).toBeNull();
  });

  it("matches the same name written with different Unicode forms and inner spaces", async () => {
    const { store, group } = await band();
    const zoe = store.addMember(group.id, "Zoé  Smith", "member");

    const response = await post(group.inviteToken, { displayName: "zoé smith" });

    const viewer = await findViewer(
      new Request(ORIGIN, { headers: { Cookie: membershipOf(response) } }),
      group,
    );
    expect(viewer?.id).toBe(zoe.id);
  });

  it("lets a signed-in joiner choose between a matching member and joining as new", async () => {
    const { store, group, spare } = await band();
    const { cookie, account } = await signedIn({
      sub: "join-visitor",
      email: "visitor@example.test",
      name: "Spare",
    });

    const offered = (await post(group.inviteToken, { displayName: "Spare" }, cookie)) as {
      choices: { id: string }[];
      canJoinAsNew: boolean;
    };
    expect(offered.choices.map((choice) => choice.id)).toEqual([spare.id]);
    expect(offered.canJoinAsNew).toBe(true);

    // "That's me": this device becomes Spare, still unlinked.
    const picked = await post(
      group.inviteToken,
      { intent: "pick", memberId: spare.id, displayName: "Spare" },
      cookie,
    );
    expect(statusOf(picked)).toBe(302);
    const viewer = await findViewer(
      new Request(ORIGIN, { headers: { Cookie: membershipOf(picked) } }),
      group,
    );
    expect(viewer?.id).toBe(spare.id);
    expect(store.findMember(group.id, spare.id)?.googleEmail).toBeNull();
    expect(store.findMemberByAccount(group.id, account.id)).toBeNull();

    // "No, I'm new": a new member linked to the account.
    const before = count("members");
    const joined = await post(group.inviteToken, { intent: "new", displayName: "Spare" }, cookie);
    expect(await toastOf(joined)).toBe("You joined Quartet");
    expect(count("members")).toBe(before + 1);
    expect(store.findMemberByAccount(group.id, account.id)?.displayName).toBe("Spare");
  });

  it("joins a signed-in joiner who shares a Google-linked member's name as a new member", async () => {
    const { store, group } = await band();
    const { cookie, account } = await signedIn({
      sub: "join-namesake",
      email: "namesake@example.test",
      name: "Cellist",
    });

    const response = await post(group.inviteToken, { displayName: "Cellist" }, cookie);

    expect(await toastOf(response)).toBe("You joined Quartet");
    expect(store.findMemberByAccount(group.id, account.id)?.displayName).toBe("Cellist");
  });

  it("ignores joining as new without a signed-in account", async () => {
    const { group, spare } = await band();

    const response = await post(group.inviteToken, { intent: "new", displayName: "Spare" });

    const viewer = await findViewer(
      new Request(ORIGIN, { headers: { Cookie: membershipOf(response) } }),
      group,
    );
    expect(viewer?.id).toBe(spare.id);
  });

  it("offers the members of that name to pick from, and checks the pick", async () => {
    const { store, group, spare } = await band();
    const other = store.addMember(group.id, "spare", "member");
    store.setProfile(group.id, other.id, { displayName: "spare", instrument: "tuba" });
    const otherGroup = store.createGroup("Other", "Oboe", "Europe/London").group;
    const stranger = store.addMember(otherGroup.id, "Spare", "member");

    const offered = (await post(group.inviteToken, { displayName: "Spare" })) as {
      choices: { id: string; displayName: string; instrument: string }[];
    };

    expect(offered.choices).toEqual([
      { id: spare.id, displayName: "Spare", instrument: "" },
      { id: other.id, displayName: "spare", instrument: "tuba" },
    ]);
    // Neither device token is in the answer or on the page.
    const Stub = createRoutesStub([{ id: "join", path: "/join/:inviteToken", Component: Join }]);
    const html = renderToString(
      <Stub
        initialEntries={["/join/x"]}
        hydrationData={{
          loaderData: { join: { groupName: "Quartet", account: null, signInUrl: null } },
          actionData: { join: offered },
        }}
      />,
    ).replaceAll("<!-- -->", "");
    expect(html).toContain("spare · tuba");
    for (const text of [JSON.stringify(offered), html]) {
      expect(text).not.toContain(store.deviceTokenFor(group.id, spare.id)!);
      expect(text).not.toContain(store.deviceTokenFor(group.id, other.id)!);
    }

    const picked = await post(group.inviteToken, {
      intent: "pick",
      memberId: other.id,
      displayName: "Spare",
    });
    const viewer = await findViewer(
      new Request(ORIGIN, { headers: { Cookie: membershipOf(picked) } }),
      group,
    );
    expect(viewer?.id).toBe(other.id);

    // A pick of someone who doesn't match the typed name, or from another group, is refused.
    for (const form of [
      { intent: "pick", memberId: other.id, displayName: "Somebody" },
      { intent: "pick", memberId: stranger.id, displayName: "Spare" },
    ]) {
      const refused = await post(group.inviteToken, form);
      expect(statusOf(refused)).toBe(400);
      // A refusal is page data, not a redirect, so it sets no membership cookie.
      expect(refused).not.toBeInstanceOf(Response);
    }
  });

  it("refuses the name of a Google-linked member or an organizer, and joins nobody", async () => {
    const { group } = await band();
    const before = count("members");

    const google = (await post(group.inviteToken, { displayName: "cellist" })) as {
      data: { error: string };
    };
    const organizer = (await post(group.inviteToken, { displayName: "VIOLA" })) as {
      data: { error: string };
    };

    expect(google.data.error).toBe(
      "Cellist signs in with Google. Sign in with Google to get back in, or join with a different name.",
    );
    expect(organizer.data.error).toBe(
      "Viola is an organizer. Organizers get back in with Google, or from a device they used before.",
    );
    expect(count("members")).toBe(before);
  });

  it("joins a new member when no one has that name", async () => {
    const { group } = await band();
    const before = count("members");

    const response = await post(group.inviteToken, { displayName: "Newcomer" });

    expect(await toastOf(response)).toBe("You joined Quartet");
    expect(count("members")).toBe(before + 1);
  });

  it("offers Google sign-in back to this invite when Google is set up", async () => {
    const { group } = await band();
    process.env.MUSIC_CHAIRS_GOOGLE_CLIENT_ID = "client";
    process.env.MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET = "secret";
    try {
      const page = (await loader(
        routeArgs(`/join/${group.inviteToken}`, { inviteToken: group.inviteToken }),
      )) as { signInUrl: string | null };
      expect(page.signInUrl).toBe(
        `/auth/google?returnTo=${encodeURIComponent(`/join/${group.inviteToken}`)}`,
      );
    } finally {
      delete process.env.MUSIC_CHAIRS_GOOGLE_CLIENT_ID;
      delete process.env.MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET;
    }
  });
});
