import { afterEach, describe, expect, it, vi } from "vitest";

import { authorizationUrl, exchangeCode, GoogleSignInError, pkcePair } from "../app/.server/google";

const config = { clientId: "client-id.apps.googleusercontent.com", clientSecret: "shh" };
const now = new Date("2026-10-02T12:00:00Z");
const params = {
  code: "auth-code",
  verifier: "verifier",
  redirectUri: "https://rehearse.dalan.dev/auth/google/callback",
  nonce: "nonce-1",
};

/** An unsigned JWT-shaped ID token, as the token endpoint returns it. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

const goodClaims = {
  iss: "https://accounts.google.com",
  aud: config.clientId,
  exp: now.getTime() / 1000 + 3600,
  nonce: "nonce-1",
  sub: "google-sub-1",
  email: "cellist@example.test",
  name: "Cel List",
};

function tokenEndpoint(body: unknown, status = 200) {
  const fake = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fake);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google sign-in protocol", () => {
  it("asks only for the basic scopes, with state, nonce and an S256 PKCE challenge", () => {
    const { verifier, challenge } = pkcePair();

    const url = new URL(
      authorizationUrl(config, {
        state: "state-1",
        nonce: "nonce-1",
        challenge,
        redirectUri: params.redirectUri,
      }),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: config.clientId,
      redirect_uri: params.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: "state-1",
      nonce: "nonce-1",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    expect(challenge).not.toBe(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("reports whether Google verified the email", async () => {
    for (const [claim, verified] of [
      [true, true],
      ["true", true],
      [false, false],
      [undefined, false],
    ] as const) {
      tokenEndpoint({ id_token: idToken({ ...goodClaims, email_verified: claim }) });
      const { profile } = await exchangeCode(config, params, now);
      expect(profile.emailVerified).toBe(verified);
    }
  });

  it("exchanges the code with the verifier and returns the identity keyed by sub", async () => {
    const fake = tokenEndpoint({ id_token: idToken(goodClaims) });

    const { profile, tokens } = await exchangeCode(config, params, now);

    expect(profile).toEqual({
      sub: "google-sub-1",
      email: "cellist@example.test",
      name: "Cel List",
      // These claims carry no email_verified, so the email is not treated as verified.
      emailVerified: false,
    });
    // A token answer without Calendar scopes keeps no refresh token.
    expect(tokens).toEqual({ refreshToken: null, scopes: [] });
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      code: "auth-code",
      client_id: config.clientId,
      client_secret: "shh",
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: "verifier",
    });
  });

  it("returns the refresh token and every granted scope of a Calendar consent", async () => {
    tokenEndpoint({
      id_token: idToken(goodClaims),
      refresh_token: "refresh-1",
      scope: "openid https://www.googleapis.com/auth/calendar.freebusy",
    });

    const { tokens } = await exchangeCode(config, params, now);

    expect(tokens).toEqual({
      refreshToken: "refresh-1",
      scopes: ["openid", "https://www.googleapis.com/auth/calendar.freebusy"],
    });
  });

  it("builds Calendar consent with its scopes, offline access and earlier grants kept", () => {
    const url = new URL(
      authorizationUrl(config, {
        state: "s",
        nonce: "n",
        challenge: "c",
        redirectUri: params.redirectUri,
        scopes: ["openid", "https://www.googleapis.com/auth/calendar.events.owned"],
        extra: {
          include_granted_scopes: "true",
          access_type: "offline",
          prompt: "consent",
          login_hint: "cellist@example.test",
        },
      }),
    );

    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      scope: "openid https://www.googleapis.com/auth/calendar.events.owned",
      include_granted_scopes: "true",
      access_type: "offline",
      prompt: "consent",
      login_hint: "cellist@example.test",
    });
  });

  it("accepts the issuer without a scheme too", async () => {
    tokenEndpoint({ id_token: idToken({ ...goodClaims, iss: "accounts.google.com" }) });

    await expect(exchangeCode(config, params, now)).resolves.toMatchObject({
      profile: { sub: "google-sub-1" },
    });
  });

  it.each([
    ["another audience", { aud: "someone-else" }, "wrong audience"],
    ["another issuer", { iss: "https://evil.example" }, "wrong issuer"],
    ["an expired token", { exp: now.getTime() / 1000 - 1 }, "expired ID token"],
    ["another nonce", { nonce: "replayed" }, "nonce mismatch"],
    ["no subject", { sub: "" }, "no subject"],
  ])("refuses a token with %s", async (_label, change, message) => {
    tokenEndpoint({ id_token: idToken({ ...goodClaims, ...change }) });

    await expect(exchangeCode(config, params, now)).rejects.toThrow(message);
  });

  it("refuses when the token endpoint fails or is unreachable", async () => {
    tokenEndpoint({ error: "invalid_grant" }, 400);
    await expect(exchangeCode(config, params, now)).rejects.toBeInstanceOf(GoogleSignInError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    await expect(exchangeCode(config, params, now)).rejects.toThrow("token request failed");

    tokenEndpoint({ id_token: "not-a-jwt" });
    await expect(exchangeCode(config, params, now)).rejects.toThrow("malformed ID token");
  });
});
