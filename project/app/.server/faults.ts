// Local-only fault mode (plan/phase-35.md): with MUSIC_CHAIRS_FAULTS=1 the app
// talks to a fake Google at a local address instead of Google, so the error-state
// catalogue can make Google refuse, fail or be slow on cue. The pages are the
// real pages. The server refuses to start in this mode unless both its public
// address and the fake are local, so it can never take effect in production,
// where the public address is the real site.

/** Google's hosts, by the part of Google each endpoint lives on. */
export type GoogleHosts = { accounts: string; oauth: string; apis: string; people: string };

const GOOGLE: GoogleHosts = {
  accounts: "https://accounts.google.com",
  oauth: "https://oauth2.googleapis.com",
  apis: "https://www.googleapis.com",
  people: "https://people.googleapis.com",
};

type Env = Record<string, string | undefined>;

export function faultsOn(env: Env = process.env): boolean {
  return env.MUSIC_CHAIRS_FAULTS === "1";
}

function isLocal(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** Why fault mode can't run with this environment, or null when it can (or is off). */
export function faultRefusal(env: Env = process.env): string | null {
  if (!faultsOn(env)) return null;
  if (!isLocal(env.MUSIC_CHAIRS_PUBLIC_URL)) {
    return "fault mode needs MUSIC_CHAIRS_PUBLIC_URL set to a local http address";
  }
  if (!isLocal(env.MUSIC_CHAIRS_FAKE_GOOGLE)) {
    return "fault mode needs MUSIC_CHAIRS_FAKE_GOOGLE set to a local http address";
  }
  return null;
}

// Runs when the server bundle loads (google.ts imports this module), so a
// misconfigured server stops before it answers anything.
const refusal = faultRefusal();
if (refusal) throw new Error(`music-chairs: refusing to start: ${refusal}`);

/** Where the app reaches Google: Google itself, or the local fake in fault mode. */
export function googleBase(env: Env = process.env): GoogleHosts {
  if (!faultsOn(env) || faultRefusal(env)) return GOOGLE;
  const fake = new URL(env.MUSIC_CHAIRS_FAKE_GOOGLE as string).origin;
  return { accounts: fake, oauth: fake, apis: fake, people: fake };
}

/** In fault mode, the `mc_fault=crash` cookie makes the page's server work fail. */
export function crashRequested(request: Request): boolean {
  if (!faultsOn()) return false;
  const cookies = request.headers.get("Cookie") ?? "";
  return cookies.split(";").some((pair) => pair.trim() === "mc_fault=crash");
}
