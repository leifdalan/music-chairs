// Failed actions stay on the page (plan/phase-34.md): `withFailures` turns a
// failed server action into data with an error status, so React Router keeps
// the page, reloads nothing behind it and never shows the error page; a
// redirect still navigates.
import {
  createMemoryRouter,
  data,
  redirect,
  UNSAFE_ErrorResponseImpl as ErrorResponse,
  type RouteObject,
} from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ACTION_TIMEOUT_MS, describeFailure, withFailures } from "../app/lib/client-failure";
import { shouldRevalidate as rootShouldRevalidate } from "../app/root";

/** A root and a page whose action runs `withFailures` around `server`; counts loader runs. */
function app(server: () => Promise<unknown>, creates: string[] = []) {
  const loads = { root: 0, page: 0, other: 0 };
  const routes: RouteObject[] = [
    {
      id: "root",
      path: "/",
      loader: () => {
        loads.root += 1;
        return null;
      },
      shouldRevalidate: ({ actionResult }) => rootShouldRevalidate({ actionResult }),
      children: [
        {
          id: "page",
          path: "page",
          loader: () => {
            loads.page += 1;
            return null;
          },
          action: ({ request }) => withFailures({ request, serverAction: server }, { creates }),
        },
        {
          id: "other",
          path: "other",
          loader: () => {
            loads.other += 1;
            return null;
          },
        },
      ],
    },
  ];
  const router = createMemoryRouter(routes, { initialEntries: ["/page"] });
  return { router, loads };
}

/** Resolves once the router has nothing in flight: no navigation and no busy fetcher. */
function settled(router: ReturnType<typeof createMemoryRouter>): Promise<void> {
  const idle = () =>
    router.state.initialized &&
    router.state.navigation.state === "idle" &&
    [...router.state.fetchers.values()].every((fetcher) => fetcher.state === "idle");
  return new Promise((resolve) => {
    if (idle()) return resolve();
    const stop = router.subscribe(() => {
      if (!idle()) return;
      stop();
      resolve();
    });
  });
}

/**
 * A fetcher's finished data, as React Router's provider keeps it: the router
 * hands an idle fetcher to its subscribers once and then drops it from state.
 */
function fetcherData(router: ReturnType<typeof createMemoryRouter>, key: string) {
  const seen: { data?: unknown } = {};
  router.getFetcher(key); // as a mounted useFetcher does
  router.subscribe((state) => {
    const fetcher = state.fetchers.get(key);
    if (fetcher?.state === "idle") seen.data = fetcher.data;
  });
  return seen;
}

function form(fields: Record<string, string>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return body;
}

const offline = () => Promise.reject(new TypeError("Failed to fetch"));

describe("a failed save, in React Router", () => {
  it("stays on the page as data, reloads nothing and never reaches the error page", async () => {
    const { router, loads } = app(offline);
    router.initialize();
    await settled(router);
    const before = { ...loads };

    await router.navigate("/page", {
      formMethod: "post",
      formData: form({ intent: "rsvp", answer: "yes" }),
    });

    expect(router.state.errors).toBeNull();
    expect(router.state.location.pathname).toBe("/page");
    expect(router.state.actionData?.page).toMatchObject({
      failure: {
        kind: "offline",
        retry: true,
        entries: [
          ["intent", "rsvp"],
          ["answer", "yes"],
        ],
      },
    });
    expect(loads).toEqual(before);
    router.dispose();
  });

  it("stays with an in-page save (a fetcher), reloading nothing", async () => {
    const { router, loads } = app(offline);
    router.initialize();
    await settled(router);
    const before = { ...loads };

    const done = fetcherData(router, "tick");
    await router.fetch("tick", "page", "/page", {
      formMethod: "post",
      formData: form({ intent: "set-date" }),
    });
    await settled(router);

    expect(router.state.errors).toBeNull();
    expect(done.data).toMatchObject({ failure: { kind: "offline" } });
    expect(loads).toEqual(before);
    router.dispose();
  });

  it("keeps a form posted to another page's action on the page it came from, as a fetcher", async () => {
    const { router, loads } = app(offline);
    router.initialize();
    await settled(router);
    await router.navigate("/other");
    await settled(router);
    const before = { ...loads };

    const done = fetcherData(router, "rename");
    await router.fetch("rename", "other", "/page", {
      formMethod: "post",
      formData: form({ intent: "rename" }),
    });
    await settled(router);

    expect(router.state.location.pathname).toBe("/other");
    expect(router.state.errors).toBeNull();
    expect(done.data).toMatchObject({ failure: { kind: "offline" } });
    expect(loads).toEqual(before);
    router.dispose();
  });

  it("lets a redirect navigate as before, reloading the pages it lands on", async () => {
    const { router, loads } = app(() => Promise.reject(redirect("/other")));
    router.initialize();
    await settled(router);

    await router.navigate("/page", { formMethod: "post", formData: form({ intent: "rsvp" }) });

    expect(router.state.location.pathname).toBe("/other");
    expect(router.state.errors).toBeNull();
    expect(loads.other).toBe(1);
    router.dispose();
  });

  it("passes a refusal through unchanged", async () => {
    const { router } = app(() =>
      Promise.resolve(data({ problem: "Choose yes, no or maybe." }, { status: 400 })),
    );
    router.initialize();
    await settled(router);

    await router.navigate("/page", { formMethod: "post", formData: form({ intent: "rsvp" }) });

    expect(router.state.actionData?.page).toEqual({ problem: "Choose yes, no or maybe." });
    router.dispose();
  });
});

describe("what a failure is called", () => {
  const plain = { offlineBefore: false, creates: false };

  it("tells a thrown status, a lost connection, a crash and a redirect apart", async () => {
    const thrown = async (status: number) => {
      // What a thrown `data(null, { status })` arrives as in the browser.
      const { router } = app(() => Promise.reject(new ErrorResponse(status, "", null)));
      router.initialize();
      await settled(router);
      await router.navigate("/page", { formMethod: "post", formData: form({}) });
      const result = router.state.actionData?.page as { failure: { kind: string; retry: boolean } };
      router.dispose();
      return [result.failure.kind, result.failure.retry];
    };
    expect(await thrown(403)).toEqual(["forbidden", false]);
    expect(await thrown(404)).toEqual(["gone", false]);
    expect(await thrown(502)).toEqual(["server", true]);
    expect(describeFailure(new Error("boom"), plain)?.kind).toBe("server");
    // A gateway's 502-504 may come after the app saved: "Maybe not saved".
    expect(describeFailure(new ErrorResponse(503, "", null), plain)).toMatchObject({
      kind: "server",
      certain: false,
      retry: true,
    });
    expect(describeFailure(new ErrorResponse(500, "", null), plain)?.certain).toBe(true);
    expect(describeFailure(new TypeError("Failed to fetch"), plain)).toMatchObject({
      kind: "offline",
      message: "The connection dropped.",
      certain: false,
      retry: true,
    });
    // Offline before sending: it certainly never left, so even a create can be sent again.
    expect(
      describeFailure(new TypeError("x"), { offlineBefore: true, creates: true }),
    ).toMatchObject({ message: "You're offline.", certain: true, retry: true });
    expect(describeFailure(redirect("/x"), plain)).toBeNull();
  });

  it("offers a reload to check, not a retry, for something that would be made twice", () => {
    expect(
      describeFailure(new TypeError("x"), { offlineBefore: false, creates: true }),
    ).toMatchObject({
      retry: false,
      certain: false,
      message: "The connection dropped. Reload to check before trying again.",
    });
    expect(describeFailure(new Error("x"), { offlineBefore: false, creates: true })).toMatchObject({
      retry: false,
      certain: false,
    });
  });

  it("gives up waiting after 20 seconds and says the server didn't answer", async () => {
    vi.useFakeTimers();
    try {
      const request = new Request("http://test/page", { method: "post", body: form({ a: "1" }) });
      const outcome = withFailures({ request, serverAction: () => new Promise<never>(() => {}) });
      await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS - 1);
      let settledEarly = false;
      void outcome.then(() => (settledEarly = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settledEarly).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = (await outcome) as unknown as {
        data: { failure: { kind: string; message: string; entries: [string, string][] } };
        init: { status: number };
      };
      expect(result.init.status).toBe(503);
      expect(result.data.failure).toMatchObject({
        kind: "timeout",
        message: "The server didn't answer in time.",
        entries: [["a", "1"]],
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
