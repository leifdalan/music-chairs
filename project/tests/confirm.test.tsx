import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { confirmationNeeded } from "../app/.server/confirm";
import { CALENDAR_SCOPES } from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { ConfirmForm, ConfirmPanel } from "../app/components/confirm-form";
import { action as availabilityAction } from "../app/routes/availability";
import { action as groupAction } from "../app/routes/group";
import { action as requestAction } from "../app/routes/request";
import { action as scheduleAction } from "../app/routes/schedule";
import { deviceCookie, requestIn, routeArgs, signedIn, tempDatabase, thrownBy } from "./routes";

const count = tempDatabase();

// 2026-10-02 (a Friday) in Europe/London.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

let people = 0;

/** A group with an organizer, a member signed in with Google who writes to Calendar, and one of everything. */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
  people += 1;
  const { account, cookie: session } = await signedIn({
    sub: `confirm-sub-${people}`,
    email: `confirm${people}@example.test`,
    name: "Cel",
  });
  const cellist = store.addMember(group.id, "Cellist", "member", account.id);
  store.saveGrant(account.id, "refresh-1", [CALENDAR_SCOPES.write]);
  store.setCalendarSync(group.id, cellist.id, true);
  const slot = store.addSlot(cellist.id, {
    kind: "weekly",
    startDate: "2026-10-08",
    endDate: null,
    startMinute: 1140,
    endMinute: 1320,
  });
  const rehearsal = store.addRehearsal(
    group.id,
    requestIn(group.id),
    { kind: "weekly", startDate: "2026-10-08", endDate: null, startMinute: 1140, endMinute: 1260 },
    "Studio",
  );
  const request = store.createRequest(group.id, {
    name: "Concert",
    startDate: "2026-11-02",
    endDate: "2026-11-29",
    windows: [{ startMinute: 1140, endMinute: 1320 }],
  });
  return {
    store,
    group,
    organizer,
    cellist,
    slot,
    rehearsal,
    request,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: `${await deviceCookie(group.id, cellist.deviceToken)}; ${session}`,
  };
}

type Band = Awaited<ReturnType<typeof band>>;

/** Every destructive action: who posts it, where, its fields, and whether it happened. */
const destructive: {
  name: string;
  run: (b: Band, form: Record<string, string>) => Promise<unknown>;
  as: "organizer" | "cellist";
  form: (b: Band) => Record<string, string>;
  done: (b: Band) => boolean;
}[] = [
  {
    name: "deleting a time",
    as: "cellist",
    run: (b, form) =>
      availabilityAction(
        routeArgs(
          `/g/${b.group.id}/availability`,
          { groupId: b.group.id },
          { cookie: b.cellistCookie, form },
        ),
      ),
    form: (b) => ({ intent: "delete", slotId: b.slot.id }),
    done: (b) => b.store.findSlot(b.cellist.id, b.slot.id) === null,
  },
  {
    name: "closing a request",
    as: "organizer",
    run: (b, form) =>
      requestAction(
        routeArgs(
          `/g/${b.group.id}/requests/${b.request.id}`,
          { groupId: b.group.id, requestId: b.request.id },
          { cookie: b.organizerCookie, form },
        ),
      ),
    form: () => ({ intent: "close" }),
    done: (b) => b.store.findRequest(b.group.id, b.request.id)?.open === false,
  },
  ...(
    [
      [
        "deleting a rehearsal",
        (b: Band) => ({ intent: "delete", rehearsalId: b.rehearsal.id }),
        (b: Band) => b.store.findRehearsal(b.group.id, b.rehearsal.id) === null,
      ],
      [
        "ending a weekly rehearsal",
        (b: Band) => ({ intent: "end", rehearsalId: b.rehearsal.id, endDate: "2026-10-22" }),
        (b: Band) => b.store.findRehearsal(b.group.id, b.rehearsal.id)?.endDate === "2026-10-22",
      ],
      [
        "cancelling a date",
        (b: Band) => ({ intent: "cancel-date", rehearsalId: b.rehearsal.id, date: "2026-10-15" }),
        (b: Band) =>
          b.store.findRehearsal(b.group.id, b.rehearsal.id)?.skips.includes("2026-10-15") === true,
      ],
    ] as const
  ).map(([name, form, done]) => ({
    name,
    as: "organizer" as const,
    run: (b: Band, fields: Record<string, string>) =>
      scheduleAction(
        routeArgs(
          `/g/${b.group.id}/schedule`,
          { groupId: b.group.id },
          { cookie: b.organizerCookie, form: fields },
        ),
      ),
    form,
    done,
  })),
  {
    name: "turning off Google Calendar writing",
    as: "cellist",
    run: (b, form) =>
      scheduleAction(
        routeArgs(
          `/g/${b.group.id}/schedule`,
          { groupId: b.group.id },
          { cookie: b.cellistCookie, form },
        ),
      ),
    form: () => ({ intent: "set-calendar", value: "off" }),
    done: (b) => b.store.findMember(b.group.id, b.cellist.id)?.calendarSync === false,
  },
  ...(
    [
      [
        "making an organizer",
        (b: Band) => ({ intent: "set-role", memberId: b.cellist.id, value: "on" }),
        (b: Band) => b.store.findMember(b.group.id, b.cellist.id)?.role === "organizer",
      ],
      [
        "removing a member",
        (b: Band) => ({ intent: "remove-member", memberId: b.cellist.id }),
        (b: Band) => b.store.findMember(b.group.id, b.cellist.id) === null,
      ],
      [
        "deleting the group",
        () => ({ intent: "delete-group" }),
        (b: Band) => b.store.findGroup(b.group.id) === null,
      ],
    ] as const
  ).map(([name, form, done]) => ({
    name,
    as: "organizer" as const,
    run: (b: Band, fields: Record<string, string>) =>
      groupAction(
        routeArgs(
          `/g/${b.group.id}`,
          { groupId: b.group.id },
          { cookie: b.organizerCookie, form: fields },
        ),
      ),
    form,
    done,
  })),
];

describe("are you sure", () => {
  for (const item of destructive) {
    it(`${item.name}: asks first and changes nothing, then acts once confirmed`, async () => {
      const b = await band();
      const before = count("availability") + count("rehearsals") + count("members");

      const asked = (await item.run(b, item.form(b))) as {
        confirm?: { fields: string[][]; title: string };
      };

      expect(statusOf(asked) ?? 200).toBe(200);
      expect(asked.confirm?.title).toBeTruthy();
      expect(asked.confirm?.fields).toEqual(Object.entries(item.form(b)));
      expect(item.done(b)).toBe(false);
      expect(count("availability") + count("rehearsals") + count("members")).toBe(before);

      await item.run(b, { ...item.form(b), confirmed: "1" });
      expect(item.done(b)).toBe(true);
    });
  }

  it("refuses a member before asking anything", async () => {
    const b = await band();
    for (const item of destructive.filter((entry) => entry.as === "organizer")) {
      const fields = item.form(b);
      const run = item.run;
      // The same action posted with the member's cookie.
      const asMember = { ...b, organizerCookie: b.cellistCookie };
      expect(statusOf(await thrownBy(run(asMember, fields)))).toBe(403);
      expect(item.done(b)).toBe(false);
    }
  });

  it("checks the input and the target before asking", async () => {
    const b = await band();
    const schedule = (form: Record<string, string>) =>
      scheduleAction(
        routeArgs(
          `/g/${b.group.id}/schedule`,
          { groupId: b.group.id },
          { cookie: b.organizerCookie, form },
        ),
      );

    const past = (await schedule({
      intent: "end",
      rehearsalId: b.rehearsal.id,
      endDate: "2026-09-01",
    })) as {
      data: unknown;
    };
    expect(past.data).toEqual({ problem: "Choose a last date from today onwards." });
    expect(
      statusOf(
        await thrownBy(schedule({ intent: "delete", rehearsalId: "AAAAAAAAAAAAAAAAAAAAAA" })),
      ),
    ).toBe(404);
    const wrongDate = (await schedule({
      intent: "cancel-date",
      rehearsalId: b.rehearsal.id,
      date: "2026-10-16",
    })) as { data: { problem?: string } };
    expect(wrongDate.data.problem).toContain("isn't one of this rehearsal's weeks");
  });

  it("names only the posted fields and takes nothing but an explicit confirmation", () => {
    const form = new FormData();
    form.set("intent", "delete");
    form.set("slotId", "abc");
    expect(confirmationNeeded(form, { title: "T", body: "B", label: "L" })).toEqual({
      confirm: {
        title: "T",
        body: "B",
        label: "L",
        fields: [
          ["intent", "delete"],
          ["slotId", "abc"],
        ],
      },
    });
    form.set("confirmed", "yes");
    expect(confirmationNeeded(form, { title: "T", body: "B", label: "L" })).not.toBeNull();
    form.set("confirmed", "1");
    expect(confirmationNeeded(form, { title: "T", body: "B", label: "L" })).toBeNull();
  });
});

describe("confirm rendering", () => {
  function render(element: React.ReactNode, path = "/g/x/schedule?view=list"): string {
    const Stub = createRoutesStub([{ path: "/g/x/schedule", Component: () => element }]);
    return renderToString(<Stub initialEntries={[path]} />).replaceAll("<!-- -->", "");
  }

  it("the confirm page re-posts the same fields with the confirmation, and cancels back", () => {
    const html = render(
      <ConfirmPanel
        prompt={{
          title: "Delete this rehearsal?",
          body: "Gone for good.",
          label: "Delete rehearsal",
          fields: [
            ["intent", "delete"],
            ["rehearsalId", "r1"],
          ],
        }}
      />,
    );

    expect(html).toContain("Delete this rehearsal?");
    expect(html).toContain('<input type="hidden" name="intent" value="delete"/>');
    expect(html).toContain('<input type="hidden" name="rehearsalId" value="r1"/>');
    const confirmButton = html.match(/<button[^>]*name="confirmed"[^>]*>/)?.[0] ?? "";
    expect(confirmButton).toContain('value="1"');
    expect(confirmButton).toContain('type="submit"');
    expect(html).toContain('href="/g/x/schedule?view=list"');
  });

  it("the button works as a plain submit before the page is interactive", () => {
    const html = render(
      <ConfirmForm
        fields={{ intent: "delete", rehearsalId: "r1" }}
        trigger="Delete"
        title="Delete this rehearsal?"
        body="Gone."
        label="Delete rehearsal"
        feedbackKey="delete-r1"
      />,
    );

    expect(html).toMatch(/<button type="submit"[^>]*>Delete<\/button>/);
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain('name="confirmed"');
  });
});
