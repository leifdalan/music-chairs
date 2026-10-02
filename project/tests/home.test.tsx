import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { readMemberships } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import { GROUP_NAME_MAX } from "../app/lib/names";
import Home, { action } from "../app/routes/home";
import { cookieFrom, routeArgs, tempDatabase } from "./routes";

const count = tempDatabase();

beforeAll(() => {
  getStore();
});

function create(form: Record<string, string>) {
  return action(routeArgs("/?index", {}, { form }));
}

describe("home route", () => {
  it("renders the product name, tagline and create-group form without a browser", () => {
    const Stub = createRoutesStub([{ path: "/", Component: Home }]);

    const html = renderToString(<Stub initialEntries={["/"]} />);

    expect(html).toContain("<h1>music-chairs</h1>");
    expect(html).toContain("collect availability");
    expect(html).toContain('name="groupName"');
    expect(html).toContain('name="displayName"');
    // The submit button is disabled only while a submission is in flight.
    expect(html).not.toContain("disabled");
  });

  it("creates the group with its creator as organizer and opens the group page", async () => {
    const response = await create({ groupName: " Thursday Quartet ", displayName: "Viola" });

    expect(response).toBeInstanceOf(Response);
    const created = response as Response;
    expect(created.status).toBe(302);
    const groupId = created.headers.get("Location")!.replace("/g/", "");
    expect(getStore().findGroup(groupId)?.name).toBe("Thursday Quartet");
    const [organizer] = getStore().listMembers(groupId);
    expect(organizer).toMatchObject({ displayName: "Viola", role: "organizer" });

    const memberships = await readMemberships(
      new Request("http://music-chairs.test/", { headers: { Cookie: cookieFrom(created) } }),
    );
    expect(memberships).toEqual({ [groupId]: organizer.id });
  });

  it.each([
    [{ groupName: "", displayName: "Viola" }, { groupName: "Group name is required." }],
    [{ groupName: "   ", displayName: "Viola" }, { groupName: "Group name is required." }],
    [{ groupName: "Quartet", displayName: " " }, { displayName: "Your name is required." }],
    [
      { groupName: "x".repeat(GROUP_NAME_MAX + 1), displayName: "Viola" },
      { groupName: `Group name must be at most ${GROUP_NAME_MAX} characters.` },
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
    const Stub = createRoutesStub([{ id: "home", path: "/", Component: Home }]);

    const html = renderToString(
      <Stub
        initialEntries={["/"]}
        hydrationData={{
          actionData: {
            home: {
              errors: { groupName: "Group name is required." },
              values: { groupName: "", displayName: "Viola" },
            },
          },
        }}
      />,
    );

    expect(html).toContain("Group name is required.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('value="Viola"');
  });
});
