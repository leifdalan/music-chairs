import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { LIMITED_USE, POLICY } from "../app/lib/privacy";
import { ErrorBoundary, Layout } from "../app/root";
import { loader as startSignIn } from "../app/routes/auth.google";
import { loader as startConsent } from "../app/routes/auth.google.calendar";
import Home, { loader as homeLoader } from "../app/routes/home";
import Privacy from "../app/routes/privacy";
import { routeArgs, signedIn, tempDatabase } from "./routes";

tempDatabase();

/** A page's text as a reader sees it: tags dropped, entities decoded, spaces collapsed. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replace(/\s+/g, " ");
}

function renderPrivacy(): string {
  const Stub = createRoutesStub([{ path: "/privacy", Component: Privacy }]);
  return renderToString(<Stub initialEntries={["/privacy"]} />);
}

// The policy's own rows name scopes too; only the rest of the app requests them.
const POLICY_SOURCE = join(__dirname, "..", "app", "lib", "privacy.ts");

/** Every Google scope address written in the app's source, outside the policy. */
function scopesInSource(dir = join(__dirname, "..", "app")): Set<string> {
  const found = new Set<string>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      for (const scope of scopesInSource(path)) found.add(scope);
    } else if (/\.tsx?$/.test(name) && path !== POLICY_SOURCE) {
      for (const match of readFileSync(path, "utf8").matchAll(
        /https:\/\/www\.googleapis\.com\/auth\/[a-z.]+/g,
      )) {
        found.add(match[0]);
      }
    }
  }
  return found;
}

/** The scopes the sign-in and consent routes actually send people to Google with. */
async function scopesAskedFor(): Promise<string[]> {
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");
  try {
    const { cookie } = await signedIn({ sub: "privacy-sub", email: "p@example.test", name: "P" });
    const responses = [
      (await startSignIn(routeArgs("/auth/google", {}))) as Response,
      ...(await Promise.all(
        ["busy", "write", "contacts"].map(
          async (scope) =>
            (await startConsent(
              routeArgs(`/auth/google/calendar?scope=${scope}`, {}, { cookie }),
            )) as Response,
        ),
      )),
    ];
    return responses.flatMap((response) =>
      new URL(response.headers.get("Location")!).searchParams.get("scope")!.split(" "),
    );
  } finally {
    vi.unstubAllEnvs();
  }
}

describe("the privacy policy", () => {
  it("is a public page naming the operator, the contact, Gravatar and the Limited Use statement", () => {
    const text = textOf(renderPrivacy());

    expect(text).toContain("Leif Dalan");
    expect(text).toContain("leifdalan+rtc@gmail.com");
    expect(text).toContain("Gravatar");
    expect(text).toContain(LIMITED_USE);
    expect(text).toContain(`Last updated ${POLICY.updated}`);
    for (const heading of [
      "What we collect",
      "Who it is shared with",
      "How it is protected",
      "How long we keep it",
      "Removing your data and disconnecting Google",
    ]) {
      expect(text).toContain(heading);
    }
  });

  it("names exactly the Google permissions the app's code asks for", async () => {
    const requested = new Set([...scopesInSource(), ...(await scopesAskedFor())]);
    const text = textOf(renderPrivacy());

    // The scan sees the scopes the app is known to request.
    expect(requested).toContain("https://www.googleapis.com/auth/contacts.other.readonly");
    expect(requested).toContain("openid");
    expect(requested).toContain("https://www.googleapis.com/auth/calendar.events.owned");
    expect(new Set(POLICY.googleScopes.map((row) => row.scope))).toEqual(requested);
    for (const scope of requested) expect(text).toContain(scope);
  });
});

describe("the server", () => {
  it("is provisioned to keep its logs for the 30 days the policy states", () => {
    const provision = readFileSync(join(__dirname, "..", "deploy", "provision.sh"), "utf8");

    expect(provision).toContain("/etc/systemd/journald.conf.d/music-chairs.conf");
    expect(provision).toContain("MaxRetentionSec=30day");
    expect(provision).toContain("systemctl restart systemd-journald");
    expect(textOf(renderPrivacy())).toContain("are kept for 30 days");
  });
});

describe("the home page", () => {
  it("says what the app does and why it asks Google, with the policy link, to a signed-out visitor", async () => {
    const loaderData = await homeLoader(routeArgs("/", {}));
    const Stub = createRoutesStub([{ id: "home", path: "/", Component: Home }]);
    const html = renderToString(
      <Stub initialEntries={["/"]} hydrationData={{ loaderData: { home: loaderData } }} />,
    );
    const text = textOf(html);

    expect(text).toContain("What music-chairs does");
    expect(text).toContain("Signing in with Google is optional");
    expect(text).toContain("Google Calendar");
    expect(text).toContain("contacts");
    expect(html).toContain('href="/privacy"');
  });
});

describe("every page", () => {
  it("ends with a link to the privacy policy", () => {
    const Stub = createRoutesStub([
      {
        path: "/g/:groupId",
        Component: () => (
          <Layout>
            <main>Group</main>
          </Layout>
        ),
      },
      {
        path: "/broken",
        Component: () => (
          <Layout>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- route props carry router internals */}
            <ErrorBoundary {...({ error: new Error("broken") } as any)} />
          </Layout>
        ),
      },
    ]);
    const footer = /<footer class="site-footer"><a [^>]*href="\/privacy"[^>]*>Privacy policy<\/a>/;

    expect(renderToString(<Stub initialEntries={["/g/abc"]} />)).toMatch(footer);
    const errorPage = renderToString(<Stub initialEntries={["/broken"]} />);
    expect(errorPage).toContain("Something went wrong");
    expect(errorPage).toMatch(footer);
  });
});
