// The header's Gravatar picture, fetched by the server and served from the
// site, so the browser never contacts gravatar.com (plan/phase-40.md).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BLANK, forgetPictures, gravatarHash, gravatarUrl } from "../app/.server/gravatar";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { loader } from "../app/routes/avatar";
import { deviceCookie, ORIGIN, signedIn, tempDatabase } from "./routes";

tempDatabase();

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
let calls: string[] = [];
let answer: () => Response = () => new Response(PNG, { headers: { "Content-Type": "image/png" } });

beforeEach(() => {
  forgetPictures();
  calls = [];
  answer = () => new Response(PNG, { headers: { "Content-Type": "image/png" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return answer();
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

let people = 0;
async function account() {
  people += 1;
  return signedIn({ sub: `avatar-${people}`, email: `Pic${people}@Example.test`, name: "Pic" });
}
const get = (path: string, cookie?: string) =>
  loader({
    request: new Request(`${ORIGIN}${path}`, { headers: cookie ? { Cookie: cookie } : {} }),
    params: {},
    context: {},
  } as never) as Promise<Response>;
const bytes = async (response: Response) => new Uint8Array(await response.arrayBuffer());

describe("the header's picture", () => {
  it("is addressed on this site, changing with the email", () => {
    const url = gravatarUrl("a@example.test");
    expect(url).toMatch(/^\/avatar\?v=[0-9a-f]{16}$/);
    expect(gravatarUrl("b@example.test")).not.toBe(url);
    expect(gravatarUrl("a@example.test", "band-x")).toMatch(/^\/avatar\?g=band-x&v=[0-9a-f]{16}$/);
  });

  it("fetches the signed-in account's own Gravatar once, then serves it from the cache", async () => {
    const { cookie, account: who } = await account();
    const first = await get("/avatar?v=0", cookie);
    const second = await get("/avatar?v=0", cookie);

    expect(calls).toEqual([`https://gravatar.com/avatar/${gravatarHash(who.email)}?s=96&d=blank`]);
    for (const response of [first, second]) {
      expect(response.headers.get("Content-Type")).toBe("image/png");
      expect(response.headers.get("Cache-Control")).toBe("private, max-age=86400");
      expect(response.headers.get("Vary")).toBe("Cookie");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(await bytes(response)).toEqual(PNG);
    }
  });

  it("is the group member's picture on that group's pages, whatever the address says", async () => {
    const { account: who } = await account();
    const store = getStore();
    const { group } = store.createGroup("Picture Band", "Viola", "Europe/London");
    const cellist = store.addMember(group.id, "Cellist", "member", who.id);
    // This device's membership only, not signed in: the group alone decides whose picture.
    const cookie = await deviceCookie(group.id, cellist.deviceToken);
    const address = groupPath(group).slice(3);

    await get(`/avatar?g=${address}&v=ffffffffffffffff`, cookie);
    expect(calls).toEqual([
      `https://gravatar.com/avatar/${gravatarHash(cellist.googleEmail)}?s=96&d=blank`,
    ]);
    // Without the group, nobody is signed in: no picture, and nothing fetched.
    calls = [];
    const away = await get("/avatar?v=ffffffffffffffff", cookie);
    expect(calls).toEqual([]);
    expect(away.headers.get("Content-Type")).toBe("image/gif");
  });

  it("is a transparent image, fetched from nowhere, without a Google email", async () => {
    const response = await get("/avatar?v=0");

    expect(calls).toEqual([]);
    expect(response.headers.get("Content-Type")).toBe("image/gif");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=600");
    expect(await bytes(response)).toEqual(BLANK.body);
  });

  it("is the transparent image, for ten minutes, when Gravatar sends no picture, too much, or nothing", async () => {
    const { cookie } = await account();
    for (const bad of [
      () => new Response("<html>", { headers: { "Content-Type": "text/html" } }),
      () =>
        new Response(new Uint8Array(100 * 1024 + 1), { headers: { "Content-Type": "image/png" } }),
      () => new Response(PNG, { status: 404, headers: { "Content-Type": "image/png" } }),
      () => {
        throw new TypeError("fetch failed");
      },
    ]) {
      forgetPictures();
      calls = [];
      answer = bad;
      const response = await get("/avatar?v=0", cookie);
      expect(response.headers.get("Content-Type")).toBe("image/gif");
      expect(response.headers.get("Cache-Control")).toBe("private, max-age=600");
      // The failure is kept for ten minutes: asking again fetches nothing.
      await get("/avatar?v=0", cookie);
      expect(calls).toHaveLength(1);
    }
  });

  it("asks Gravatar once however many ask at the same moment", async () => {
    const { cookie } = await account();
    await Promise.all([
      get("/avatar?v=0", cookie),
      get("/avatar?v=0", cookie),
      get("/avatar?v=0", cookie),
    ]);
    expect(calls).toHaveLength(1);
  });
});
