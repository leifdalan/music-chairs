// Readable group addresses (plan/phase-19.3.md): the format, finding a group
// by its address, redirects from out-of-date names, and every link the app
// renders using the address rather than the group's internal id.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { getStore } from "../app/.server/store";
import { MIGRATIONS } from "../app/.server/store";
import { groupPath, SHORT_ID_ALPHABET, shortIdOf, slugify } from "../app/lib/group-address";
import { loader as profileLoader } from "../app/routes/profile";
import GroupPage, { action as groupAction, loader as groupLoader } from "../app/routes/group";
import Groups, { loader as groupsLoader } from "../app/routes/groups";
import Home, { action as homeAction, loader as homeLoader } from "../app/routes/home";
import RequestPage, { loader as requestLoader } from "../app/routes/request";
import Schedule, { loader as scheduleLoader } from "../app/routes/schedule";
import {
  addressOf,
  deviceCookie,
  groupAt,
  requestIn,
  routeArgs,
  tempDatabase,
  thrownBy,
} from "./routes";

tempDatabase();
beforeAll(() => {
  getStore();
});

describe("the address format", () => {
  it.each([
    ["Thursday Quartet", "thursday-quartet"],
    ["Café Trío", "cafe-trio"],
    ["  --Brass!!  & Wind--  ", "brass-wind"],
    ["Straße Ørkester Łódź", "strasse-orkester-lodz"],
    ["Æther Œuvre Đorđe Þór", "aether-oeuvre-dorde-thor"],
    ["弦楽四重奏", "group"],
    ["!!!", "group"],
    ["The 2nd Avenue Saxophone and Clarinet Ensemble", "the-2nd-avenue-saxophone-and-clarinet"],
  ])("slugs %j as %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
    expect(slugify(name).length).toBeLessThanOrEqual(40);
  });

  it("reads the short id from the end of an address only", () => {
    expect(shortIdOf("thursday-quartet-k3x9m2pq")).toBe("k3x9m2pq");
    expect(shortIdOf("K3X9M2PQ-old-name-K3X9M2PQ")).toBe("k3x9m2pq");
    expect(shortIdOf("k3x9m2pq")).toBeNull();
    expect(shortIdOf("quartet-k3x9m2p")).toBeNull();
    expect(shortIdOf("quartet-k3x9m2pl")).toBeNull();
    expect(shortIdOf("AAAAAAAAAAAAAAAAAAAAAA")).toBeNull();
  });

  it("keeps the alphabet at 32 characters, as migration 10's `& 31` assumes", () => {
    expect(SHORT_ID_ALPHABET).toHaveLength(32);
    expect(MIGRATIONS[9]).toContain(`'${SHORT_ID_ALPHABET}'`);
    expect(MIGRATIONS[9]).toContain("(random() & 31) + 1");
  });

  it("gives every new group a short id from the 32-character alphabet", () => {
    const store = getStore();
    const ids = Array.from(
      { length: 50 },
      () => store.createGroup("Many", "Viola", "Europe/London").group.shortId,
    );

    expect(ids.every((id) => /^[23456789abcdefghijkmnpqrstuvwxyz]{8}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(50);
  });
});

function quartet(name = "Thursday Quartet") {
  const store = getStore();
  const { group, organizer } = store.createGroup(name, "Viola", "Europe/London");
  return { store, group, organizer };
}

const statusOf = (thrown: unknown) =>
  thrown instanceof Response ? thrown.status : (thrown as { init?: ResponseInit }).init?.status;

describe("finding a group by its address", () => {
  it("loads the group's pages at its current address", async () => {
    const { group, organizer } = quartet();
    const cookie = await deviceCookie(group.id, organizer.deviceToken);

    const page = await groupLoader(
      routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie }),
    );

    expect(page.groupName).toBe("Thursday Quartet");
    expect(groupPath(group)).toMatch(/^\/g\/thursday-quartet-[23456789a-km-np-z]{8}$/);
  });

  it.each([
    ["an out-of-date name", (shortId: string) => `old-name-${shortId}`],
    ["capitals in the short id", (shortId: string) => `thursday-quartet-${shortId.toUpperCase()}`],
  ])(
    "redirects %s to the current address, keeping the page and query, uncached",
    async (_kind, address) => {
      const { group, organizer } = quartet();
      const cookie = await deviceCookie(group.id, organizer.deviceToken);
      const stale = address(group.shortId);

      const thrown = (await thrownBy(
        scheduleLoader(
          routeArgs(`/g/${stale}/schedule?times=list`, { groupAddress: stale }, { cookie }),
        ),
      )) as Response;

      expect(thrown.status).toBe(301);
      expect(thrown.headers.get("Location")).toBe(`${groupPath(group)}/schedule?times=list`);
      expect(thrown.headers.get("Cache-Control")).toBe("no-store");
    },
  );

  it("redirects a percent-encoded out-of-date address to the right page", async () => {
    const { group, organizer } = quartet();
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    // React Router hands the route the decoded segment; the URL stays encoded.
    const decoded = `café-trio-${group.shortId}`;

    const thrown = (await thrownBy(
      scheduleLoader(
        routeArgs(
          `/g/${encodeURIComponent(decoded)}/schedule`,
          { groupAddress: decoded },
          { cookie },
        ),
      ),
    )) as Response;

    expect(thrown.headers.get("Location")).toBe(`${groupPath(group)}/schedule`);
  });

  it("sends the profile route's page to the group, through the same address rules", async () => {
    const { group } = quartet();
    const stale = `old-name-${group.shortId}`;

    const current = (await profileLoader(
      routeArgs(`${groupPath(group)}/profile`, { groupAddress: addressOf(group) }),
    )) as Response;
    // The loader is synchronous, so it throws rather than rejecting.
    const moved = (await thrownBy(
      (async () => profileLoader(routeArgs(`/g/${stale}/profile`, { groupAddress: stale })))(),
    )) as Response;
    const unknown = await thrownBy(
      (async () =>
        profileLoader(
          routeArgs("/g/quartet-zzzzzzzz/profile", { groupAddress: "quartet-zzzzzzzz" }),
        ))(),
    );

    expect(current.headers.get("Location")).toBe(groupPath(group));
    expect(moved.headers.get("Location")).toBe(`${groupPath(group)}/profile`);
    expect(statusOf(unknown)).toBe(404);
  });

  it("redirects a data request to the page, not to the data", async () => {
    const { group, organizer } = quartet();
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    const stale = `old-name-${group.shortId}`;

    const thrown = (await thrownBy(
      scheduleLoader(routeArgs(`/g/${stale}/schedule.data`, { groupAddress: stale }, { cookie })),
    )) as Response;

    expect(thrown.headers.get("Location")).toBe(`${groupPath(group)}/schedule`);
  });

  it("acts on a post to an out-of-date address without redirecting", async () => {
    const { store, group, organizer } = quartet();
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    const stale = `old-name-${group.shortId}`;

    const response = (await groupAction(
      routeArgs(
        `/g/${stale}`,
        { groupAddress: stale },
        {
          cookie,
          form: { intent: "set-privacy", value: "on" },
        },
      ),
    )) as Response;

    expect(store.findGroup(group.id)?.showNames).toBe(true);
    expect(response.headers.get("Location")).toBe(groupPath(group));
  });

  it.each([
    ["an unknown short id", "thursday-quartet-zzzzzzzz"],
    ["a group's old internal id", "INTERNAL"],
    ["an address with no short id", "thursday-quartet"],
  ])("does not find %s", async (_kind, address) => {
    const { group } = quartet();
    const asked = address === "INTERNAL" ? group.id : address;

    const thrown = await thrownBy(groupLoader(routeArgs(`/g/${asked}`, { groupAddress: asked })));

    expect(statusOf(thrown)).toBe(404);
  });

  it("goes to the new address after a rename from the group page", async () => {
    const { store, group, organizer } = quartet("Old Name");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);

    const response = (await groupAction(
      routeArgs(
        groupPath(group),
        { groupAddress: addressOf(group) },
        {
          cookie,
          form: { intent: "update-group", name: "New Name", timeZone: "Europe/London" },
        },
      ),
    )) as Response;

    const renamed = store.findGroup(group.id)!;
    expect(response.headers.get("Location")).toBe(`/g/new-name-${group.shortId}`);
    expect(groupPath(renamed)).toBe(`/g/new-name-${group.shortId}`);
  });
});

describe("links", () => {
  function stub(id: string, path: string, Component: unknown, data: unknown, at = path) {
    const Stub = createRoutesStub([{ id, path, Component: Component as never }]);
    return renderToString(
      <Stub initialEntries={[at]} hydrationData={{ loaderData: { [id]: data } }} />,
    ).replaceAll("<!-- -->", "");
  }

  it("use the address, never the group's internal id, on every page that links to the group", async () => {
    const { store, group, organizer } = quartet();
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    const requestId = requestIn(group.id, { name: "Address gig" });
    store.addRehearsal(
      group.id,
      requestId,
      { kind: "once", startDate: "2099-01-08", endDate: null, startMinute: 1140, endMinute: 1260 },
      "Hall",
    );
    const path = groupPath(group);
    const address = addressOf(group);

    const loaded = {
      home: await homeLoader(routeArgs("/", {}, { cookie })),
      groups: await groupsLoader(routeArgs("/groups", {}, { cookie })),
      group: await groupLoader(routeArgs(path, { groupAddress: address }, { cookie })),
      schedule: await scheduleLoader(
        routeArgs(`${path}/schedule`, { groupAddress: address }, { cookie }),
      ),
      request: await requestLoader(
        routeArgs(
          `${path}/requests/${requestId}`,
          { groupAddress: address, requestId },
          { cookie },
        ),
      ),
    };
    const pages = [
      stub("home", "/", Home, loaded.home),
      stub("groups", "/groups", Groups, loaded.groups),
      stub("group", "/g/:groupAddress", GroupPage, loaded.group, path),
      stub("schedule", "/g/:groupAddress/schedule", Schedule, loaded.schedule, `${path}/schedule`),
      stub(
        "request",
        "/g/:groupAddress/requests/:requestId",
        RequestPage,
        loaded.request,
        `${path}/requests/${requestId}`,
      ),
    ];

    for (const html of pages) {
      expect(html).toContain(`href="${path}`);
      expect(html).not.toContain(group.id);
    }
    for (const data of Object.values(loaded)) {
      expect(JSON.stringify(data)).not.toContain(group.id);
    }
  });

  it("opens a new group at its address", async () => {
    const created = (await homeAction(
      routeArgs(
        "/?index",
        {},
        {
          form: { groupName: "Café Trío", displayName: "Oboe", timeZone: "Europe/London" },
        },
      ),
    )) as Response;

    const location = created.headers.get("Location") ?? "";
    expect(location).toMatch(/^\/g\/cafe-trio-[23456789a-km-np-z]{8}$/);
    expect(groupAt(location)?.name).toBe("Café Trío");
  });
});
