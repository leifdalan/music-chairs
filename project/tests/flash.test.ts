import { describe, expect, it } from "vitest";

import { readToast, redirectWithToast } from "../app/.server/flash";
import { loader as rootLoader } from "../app/root";
import { ORIGIN, routeArgs, setCookies } from "./routes";

describe("toasts after a change", () => {
  it("leaves a one-shot message after any headers the action set", async () => {
    const response = await redirectWithToast("/g/abc", "Availability saved", {
      headers: { "Set-Cookie": "mc_members=abc; Path=/" },
    });

    expect(response.status).toBe(302);
    expect(response.headers.getSetCookie()[0]).toMatch(/^mc_members=/);
    const toast = setCookies(response).mc_toast;
    expect(toast).toBeTruthy();
    const read = await readToast(new Request(ORIGIN, { headers: { Cookie: toast } }));
    expect(read.toast?.message).toBe("Availability saved");
    expect(read.clear).toMatch(/^mc_toast=;/);
  });

  it("gives every message its own id, so a repeat shows again", async () => {
    const first = await redirectWithToast("/", "Saved");
    const second = await redirectWithToast("/", "Saved");
    const id = async (response: Response) =>
      (await readToast(new Request(ORIGIN, { headers: { Cookie: setCookies(response).mc_toast } })))
        .toast?.id;

    expect(await id(first)).not.toBe(await id(second));
  });

  it("is delivered and cleared by the root loader, which leaves other pages alone", async () => {
    const response = await redirectWithToast("/", "Group created");
    const cookie = setCookies(response).mc_toast;

    const withToast = (await rootLoader(routeArgs("/", {}, { cookie }))) as unknown as {
      data: { toast: { message: string } | null };
      init: ResponseInit | null;
    };
    const without = (await rootLoader(routeArgs("/", {}))) as unknown as {
      data: { toast: unknown };
      init: ResponseInit | null;
    };

    expect(withToast.data.toast?.message).toBe("Group created");
    expect(new Headers(withToast.init?.headers).get("Set-Cookie")).toMatch(/^mc_toast=;/);
    expect(without.data.toast).toBeNull();
    expect(without.init?.headers).toBeUndefined();
  });
});
