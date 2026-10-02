import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { readMemberships } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import { GROUP_NAME_MAX } from "../app/lib/names";
import Home, { action, loader } from "../app/routes/home";
import { cookieFrom, routeArgs, tempDatabase } from "./routes";

const count = tempDatabase();

beforeAll(() => {
  getStore();
});

function create(form: Record<string, string>) {
  return action(routeArgs("/?index", {}, { form }));
}

function render(hydrationData: object): string {
  const Stub = createRoutesStub([{ id: "home", path: "/", Component: Home }]);
  return renderToString(<Stub initialEntries={["/"]} hydrationData={hydrationData} />);
}

const zones = loader();

describe("home route", () => {
  it("renders the product name, tagline and create-group form without a browser", () => {
    const html = render({ loaderData: { home: zones } });

    expect(html).toContain("<h1>music-chairs</h1>");
    expect(html).toContain("collect availability");
    expect(html).toContain('name="groupName"');
    expect(html).toContain('name="displayName"');
    expect(html).toContain('name="timeZone"');
    expect(html).toContain('<option value="Europe/London">Europe/London</option>');
    // The submit button is disabled only while a submission is in flight.
    expect(html).not.toContain("disabled");
  });

  it("offers UTC and every zone the runtime knows, with no zone preselected on the server", () => {
    const html = render({ loaderData: { home: zones } });

    expect(zones.timeZones[0]).toBe("UTC");
    expect(zones.timeZones).toContain("America/Los_Angeles");
    expect(html).toContain('<option value="" selected="">Choose your time zone</option>');
  });

  it("creates the group with its creator as organizer and opens the group page", async () => {
    const response = await create({
      groupName: " Thursday Quartet ",
      displayName: "Viola",
      timeZone: "Europe/London",
    });

    expect(response).toBeInstanceOf(Response);
    const created = response as Response;
    expect(created.status).toBe(302);
    const groupId = created.headers.get("Location")!.replace("/g/", "");
    expect(getStore().findGroup(groupId)).toMatchObject({
      name: "Thursday Quartet",
      timeZone: "Europe/London",
    });
    const [organizer] = getStore().listMembers(groupId);
    expect(organizer).toMatchObject({ displayName: "Viola", role: "organizer" });

    const memberships = await readMemberships(
      new Request("http://music-chairs.test/", { headers: { Cookie: cookieFrom(created) } }),
    );
    expect(Object.keys(memberships)).toEqual([groupId]);
    expect(getStore().findMemberByDevice(groupId, memberships[groupId])?.id).toBe(organizer.id);
    expect(memberships[groupId]).not.toBe(organizer.id);
  });

  it.each([
    ["US/Eastern", "America/New_York"],
    ["europe/london", "Europe/London"],
  ])("stores the zone alias %s under its canonical name %s", async (alias, canonical) => {
    const response = (await create({
      groupName: "Raga Trio",
      displayName: "Sitar",
      timeZone: alias,
    })) as Response;

    const groupId = response.headers.get("Location")!.replace("/g/", "");
    expect(getStore().findGroup(groupId)?.timeZone).toBe(canonical);
  });

  it.each([
    [
      { groupName: "", displayName: "Viola", timeZone: "UTC" },
      { groupName: "Group name is required." },
    ],
    [
      { groupName: "   ", displayName: "Viola", timeZone: "UTC" },
      { groupName: "Group name is required." },
    ],
    [
      { groupName: "Quartet", displayName: " ", timeZone: "UTC" },
      { displayName: "Your name is required." },
    ],
    [
      { groupName: "x".repeat(GROUP_NAME_MAX + 1), displayName: "Viola", timeZone: "UTC" },
      { groupName: `Group name must be at most ${GROUP_NAME_MAX} characters.` },
    ],
    [
      { groupName: "Quartet", displayName: "Viola", timeZone: "" },
      { timeZone: "Choose the group's time zone." },
    ],
    [
      { groupName: "Quartet", displayName: "Viola", timeZone: "Mars/Base" },
      { timeZone: "Choose the group's time zone." },
    ],
  ])("rejects %j with a readable error and stores nothing", async (form, errors) => {
    const groups = count("groups");
    const members = count("members");

    const result = await create(form);

    expect(result).not.toBeInstanceOf(Response);
    const rejected = result as Exclude<typeof result, Response>;
    expect(rejected.init?.status).toBe(400);
    expect(rejected.data.errors).toMatchObject(errors);
    expect(rejected.data.values).toEqual(form);
    expect(count("groups")).toBe(groups);
    expect(count("members")).toBe(members);
  });

  it("renders the rejected values and errors back into the form", () => {
    const html = render({
      loaderData: { home: zones },
      actionData: {
        home: {
          errors: { groupName: "Group name is required." },
          values: { groupName: "", displayName: "Viola", timeZone: "Europe/Paris" },
        },
      },
    });

    expect(html).toContain("Group name is required.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('value="Viola"');
    expect(html).toContain('<option value="Europe/Paris" selected="">');
  });
});
