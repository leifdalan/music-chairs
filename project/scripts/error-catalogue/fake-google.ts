// A stand-in for Google, for the error-state catalogue (plan/phase-35.md): the
// app reaches it instead of Google in local fault mode (MUSIC_CHAIRS_FAKE_GOOGLE).
// Its consent screen is a plain page with Continue and Cancel; its answers
// (sign-in, tokens, revoke, free/busy, calendar events, contacts) follow the
// scenario the catalogue script sets before each state.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export type Identity = { sub: string; email: string; name: string; email_verified: boolean };

export type Scenario = {
  /** Who signs in on the consent screen. */
  identity: Identity;
  /** What the consent screen does: send a code, cancel, or return a state that isn't this browser's. */
  consent: "allow" | "cancel" | "forged-state";
  /** The scopes granted, or null for everything asked. */
  scopes: string[] | null;
  /** Whether the code exchange includes a refresh token. */
  refreshToken: boolean;
  /** The code exchange: a good answer, an error, or no answer. */
  exchange: "ok" | "500" | "slow";
  refresh: "ok" | "invalid_grant" | "slow";
  revoke: "ok" | "503" | "slow";
  freeBusy: "ok" | "500" | "slow";
  events: "ok" | "500";
  contacts: "ok" | "empty" | "500";
};

export const DEFAULT_SCENARIO: Scenario = {
  identity: { sub: "fake-sub", email: "fake@example.test", name: "Fake", email_verified: true },
  consent: "allow",
  scopes: null,
  refreshToken: true,
  exchange: "ok",
  refresh: "ok",
  revoke: "ok",
  freeBusy: "ok",
  events: "ok",
  contacts: "ok",
};

/** Longer than any wait in the app (5 s reads, 10 s sign-in), so "slow" is no answer in time. */
const SLOW_MS = 12_000;

export type FakeGoogle = {
  url: string;
  scenario: Scenario;
  set(changes: Partial<Scenario>): void;
  reset(): void;
  close(): Promise<void>;
};

type Grant = { identity: Identity; nonce: string; scope: string; refreshToken: boolean };

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts the fake on a free local port. */
export async function startFakeGoogle(): Promise<FakeGoogle> {
  const grants = new Map<string, Grant>();
  let issued = 0;
  const fake: FakeGoogle = {
    url: "",
    scenario: structuredClone(DEFAULT_SCENARIO),
    set(changes) {
      fake.scenario = { ...fake.scenario, ...changes };
    },
    reset() {
      fake.scenario = structuredClone(DEFAULT_SCENARIO);
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", fake.url);
    const s = fake.scenario;
    try {
      if (request.method === "GET" && url.pathname === "/o/oauth2/v2/auth") {
        // The consent screen: Continue sends the scenario's answer back to the app.
        const back = new URL(url.searchParams.get("redirect_uri") ?? "");
        const state = url.searchParams.get("state") ?? "";
        if (s.consent === "cancel") {
          back.search = new URLSearchParams({ error: "access_denied", state }).toString();
        } else {
          const asked = (url.searchParams.get("scope") ?? "").split(" ").filter(Boolean);
          const granted = s.scopes ? ["openid", "email", "profile", ...s.scopes] : asked;
          const code = `code-${++issued}`;
          grants.set(code, {
            identity: s.identity,
            nonce: url.searchParams.get("nonce") ?? "",
            scope: [...new Set(granted)].join(" "),
            refreshToken: s.refreshToken,
          });
          back.search = new URLSearchParams({
            code,
            state: s.consent === "forged-state" ? "not-this-browser" : state,
          }).toString();
        }
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><meta name="viewport" content="width=device-width">
<title>Google (stand-in)</title>
<main style="font-family:system-ui;max-width:28rem;margin:3rem auto;padding:0 1rem">
<h1>Google (stand-in)</h1>
<p>This local stand-in takes the place of Google's consent screen in the error-state catalogue.</p>
<p>Signing in as ${s.identity.email}.</p>
<p><a id="continue" href="${back.href.replace(/&/g, "&amp;")}">Continue</a></p>
</main>`);
        return;
      }
      if (request.method === "POST" && url.pathname === "/token") {
        const form = new URLSearchParams(await body(request));
        if (form.get("grant_type") === "refresh_token") {
          if (s.refresh === "slow") await sleep(SLOW_MS);
          if (s.refresh === "invalid_grant") return json(response, 400, { error: "invalid_grant" });
          // Short-lived, so the app asks again on every call and each state sees its scenario.
          return json(response, 200, { access_token: `access-${++issued}`, expires_in: 30 });
        }
        if (s.exchange === "slow") await sleep(SLOW_MS);
        if (s.exchange === "500") return json(response, 500, { error: "backend_error" });
        const grant = grants.get(form.get("code") ?? "");
        if (!grant) return json(response, 400, { error: "invalid_grant" });
        const claims = {
          iss: "https://accounts.google.com",
          aud: form.get("client_id"),
          exp: Math.floor(Date.now() / 1000) + 600,
          nonce: grant.nonce,
          ...grant.identity,
        };
        const idToken = `${part({ alg: "none" })}.${part(claims)}.x`;
        return json(response, 200, {
          id_token: idToken,
          access_token: `access-${++issued}`,
          expires_in: 30,
          scope: grant.scope,
          ...(grant.refreshToken ? { refresh_token: `refresh-${grant.identity.sub}` } : {}),
        });
      }
      if (request.method === "POST" && url.pathname === "/revoke") {
        if (s.revoke === "slow") await sleep(SLOW_MS);
        return json(response, s.revoke === "ok" ? 200 : 503, {});
      }
      if (url.pathname === "/calendar/v3/freeBusy") {
        if (s.freeBusy === "slow") await sleep(SLOW_MS);
        if (s.freeBusy === "500") return json(response, 500, {});
        return json(response, 200, { calendars: { primary: { busy: [] } } });
      }
      if (url.pathname.startsWith("/calendar/v3/calendars/primary/events")) {
        if (s.events === "500") return json(response, 500, {});
        if (request.method === "DELETE") {
          response.writeHead(204);
          response.end();
          return;
        }
        return json(response, 200, { id: url.pathname.split("/").pop() });
      }
      if (url.pathname === "/v1/people/me/connections" || url.pathname === "/v1/otherContacts") {
        if (s.contacts === "500") return json(response, 500, {});
        const people =
          s.contacts === "empty"
            ? []
            : [
                {
                  names: [{ displayName: "Sam Smith" }],
                  emailAddresses: [{ value: "sam@example.test" }],
                },
              ];
        return json(
          response,
          200,
          url.pathname === "/v1/otherContacts" ? { otherContacts: [] } : { connections: people },
        );
      }
      json(response, 404, { error: "not_found" });
    } catch (error) {
      json(response, 500, { error: String(error) });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fake Google has no port");
  fake.url = `http://127.0.0.1:${address.port}`;
  return fake;
}
