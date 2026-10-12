// A steady page (plan/phase-33.md): actions that return to the page keep its
// scroll position, a form that leaves the page doesn't, and the view a page was
// posted from (List or Calendar) survives the round trip.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { createMemoryRouter, redirect } from "react-router";
import { describe, expect, it } from "vitest";

import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { action as groupAction } from "../app/routes/group";
import { action as requestAction } from "../app/routes/request";
import { action as scheduleAction } from "../app/routes/schedule";
import {
  addressOf,
  deviceCookie,
  requestHrefOf,
  requestIn,
  routeArgs,
  slugFor,
  tempDatabase,
} from "./routes";

tempDatabase();

const APP = join(__dirname, "../app");

/** Forms that go to another page, where starting at the top is right. */
const LEAVES_PAGE = new Set([
  "components/create-group-form.tsx", // to the new group
  "components/profile-menu.tsx#/auth/sign-out", // signing out
  "routes/home.tsx#/auth/sign-out",
  "routes/join.tsx", // into the group
  "routes/requests.new.tsx", // to the request
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

type FoundForm = { file: string; line: number; action: string | null; staysPut: boolean };

/** Every `<Form method="post">` in the app, parsed, with how it treats scrolling. */
function postForms(): FoundForm[] {
  const found: FoundForm[] = [];
  for (const path of sources(APP)) {
    const file = relative(APP, path);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(source) === "Form"
      ) {
        const attributes = new Map<string, string | null>();
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) continue;
          const name = attribute.name.getText(source);
          const value = attribute.initializer;
          attributes.set(
            name,
            !value ? "" : ts.isStringLiteral(value) ? value.text : value.getText(source),
          );
        }
        if (attributes.get("method") === "post") {
          found.push({
            file,
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            action: attributes.get("action") ?? null,
            staysPut:
              attributes.has("preventScrollReset") &&
              attributes.get("preventScrollReset") !== "{false}",
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe("forms that return to the page", () => {
  it("all keep the page's scroll position; only forms that leave the page don't", () => {
    const forms = postForms();
    const leaving = (form: FoundForm) =>
      LEAVES_PAGE.has(form.file) || LEAVES_PAGE.has(`${form.file}#${form.action}`);

    expect(forms.length).toBeGreaterThan(20);
    // The ones this phase is about are among those found.
    for (const file of [
      "routes/schedule.tsx",
      "components/confirm-form.tsx",
      "components/profile-menu.tsx",
      "routes/request.tsx",
    ]) {
      expect(forms.some((form) => form.file === file && form.staysPut)).toBe(true);
    }
    const unsteady = forms.filter((form) => !form.staysPut && !leaving(form));
    expect(unsteady.map((form) => `${form.file}:${form.line}`)).toEqual([]);
    const needlesslySteady = forms.filter((form) => form.staysPut && leaving(form));
    expect(needlesslySteady.map((form) => `${form.file}:${form.line}`)).toEqual([]);
  });

  it("marks deleting a group from its own page as leaving the page", () => {
    const source = readFileSync(join(APP, "routes/group.tsx"), "utf8");
    const confirm =
      /<ConfirmForm\s+fields=\{\{ intent: "delete-group" \}\}([^>]*)>/.exec(source)?.[1] ?? "";
    expect(confirm).toMatch(/\bleavesPage\b/);
  });

  // A premise check on React Router itself, which the forms above rely on.
  it("keep the scroll position through the action's redirect, which a plain post doesn't", async () => {
    const outcome = async (preventScrollReset: boolean) => {
      const router = createMemoryRouter(
        [
          {
            path: "/page",
            loader: () => null,
            action: () => redirect("/page"),
            Component: () => null,
          },
        ],
        { initialEntries: ["/page"] },
      );
      await router.initialize();
      await router.navigate("/page", {
        formMethod: "post",
        formData: new FormData(),
        preventScrollReset,
      });
      const state = router.state;
      router.dispose();
      return { at: state.location.pathname, kept: state.preventScrollReset };
    };

    expect(await outcome(true)).toEqual({ at: "/page", kept: true });
    expect(await outcome(false)).toEqual({ at: "/page", kept: false });
  });
});

describe("the view a page was posted from", () => {
  async function band() {
    const store = getStore();
    const { group, organizer } = store.createGroup("Steady Band", "Viola", "Europe/London");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    const requestId = requestIn(group.id, { name: "Steady request" });
    const rehearsal = store.addRehearsal(
      group.id,
      requestId,
      { date: "2099-01-08", startMinute: 1140, endMinute: 1260 },
      "Hall",
    );
    return { store, group, cookie, requestId, rehearsal };
  }

  it("is kept when the schedule and the request page return to themselves, and a notice isn't", async () => {
    const b = await band();
    const answered = (await scheduleAction(
      routeArgs(
        `${groupPath(b.group)}/schedule?free=list&notice=calendar-connected`,
        { groupAddress: addressOf(b.group) },
        {
          cookie: b.cookie,
          form: { intent: "rsvp", rehearsalId: b.rehearsal.id, answer: "yes" },
        },
      ),
    )) as Response;
    const capped = (await requestAction(
      routeArgs(
        `${requestHrefOf(b.group, b.requestId)}.data?times=list&_routes=routes%2Frequest`,
        { groupAddress: addressOf(b.group), requestSlug: slugFor(b.requestId) },
        { cookie: b.cookie, form: { intent: "answer", limit: "any" } },
      ),
    )) as Response;

    expect(answered.headers.get("Location")).toBe(`${groupPath(b.group)}/schedule?free=list`);
    expect(capped.headers.get("Location")).toBe(
      `${requestHrefOf(b.group, b.requestId)}?times=list`,
    );
  });

  it("marks deleting a group from its own page as leaving the page, and from the groups page as not", async () => {
    const b = await band();
    const ask = (fields: Record<string, string>) =>
      groupAction(
        routeArgs(
          groupPath(b.group),
          { groupAddress: addressOf(b.group) },
          {
            cookie: b.cookie,
            form: { intent: "delete-group", ...fields },
          },
        ),
      ) as unknown as Promise<{ confirm: { leavesPage?: boolean } }>;

    expect((await ask({})).confirm.leavesPage).toBe(true);
    expect((await ask({ returnTo: "/groups" })).confirm.leavesPage).toBe(false);
    expect(b.store.findGroup(b.group.id)).not.toBeNull();
  });
});
