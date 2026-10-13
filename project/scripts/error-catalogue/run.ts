// The error-state catalogue (plan/phase-35.md): builds the app, starts it in
// local fault mode on a fresh database with a fake Google, seeds a band, drives
// a headless Chrome into every outcome of the Phase 34 inventory, and
// photographs each at phone and desktop widths in light and dark mode.
//
//   node scripts/error-catalogue/run.ts [--out <dir>] [--only "<call key> <outcome id>"]... [--no-build]
//
// Run from project/ (or through ./bin/node from the repository root). Chrome
// comes from CHROME_PATH or its usual install location.
import { spawn, type ChildProcess } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { format, resolveConfig } from "prettier";

import { INVENTORY } from "../../tests/error-states/inventory.ts";
import { startFakeGoogle, type FakeGoogle } from "./fake-google.ts";
import { client, Jar, seed, signIn, type Seeded } from "./seed.ts";
import { catalogueStates, type Driver, type Fault, type Mark, type Role } from "./states.ts";

const PROJECT = join(import.meta.dirname, "..", "..");
const SIZE_LIMIT_BYTES = 30 * 1024 * 1024;
const VARIANTS = [
  { name: "phone-light", width: 390, height: 844, mobile: true, scheme: "light" },
  { name: "phone-dark", width: 390, height: 844, mobile: true, scheme: "dark" },
  { name: "desktop-light", width: 1280, height: 800, mobile: false, scheme: "light" },
  { name: "desktop-dark", width: 1280, height: 800, mobile: false, scheme: "dark" },
] as const;

type Entry = {
  key: string;
  outcome: string;
  when: string;
  sees: string;
  proofs: string[];
  images: Record<(typeof VARIANTS)[number]["name"], string>;
};
export type Manifest = { generated: string; states: Entry[] };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function args(argv: string[]): { out: string; only: string[]; build: boolean } {
  const result = { out: join(PROJECT, "error-catalogue"), only: [] as string[], build: true };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === "--out") result.out = argv[++index];
    else if (flag === "--only") result.only.push(argv[++index]);
    else if (flag === "--no-build") result.build = false;
    else throw new Error(`unknown argument ${flag}`);
  }
  return result;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        address && typeof address !== "string" ? resolve(address.port) : reject(),
      );
    });
  });
}

function run(command: string, argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { cwd: PROJECT, stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

/** The built app in fault mode; `google` false starts it without Google configured. */
async function startApp(
  port: number,
  database: string,
  fake: FakeGoogle,
  google: boolean,
): Promise<ChildProcess> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PORT: String(port),
    HOST: "127.0.0.1",
    MUSIC_CHAIRS_DB: database,
    MUSIC_CHAIRS_FAULTS: "1",
    MUSIC_CHAIRS_PUBLIC_URL: `http://localhost:${port}`,
    MUSIC_CHAIRS_FAKE_GOOGLE: fake.url,
  };
  delete env.MUSIC_CHAIRS_GOOGLE_CLIENT_ID;
  delete env.MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET;
  if (google) {
    env.MUSIC_CHAIRS_GOOGLE_CLIENT_ID = "catalogue-client";
    env.MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET = "catalogue-secret";
  }
  const child = spawn(
    join(PROJECT, "node_modules/.bin/react-router-serve"),
    ["build/server/index.js"],
    {
      cwd: PROJECT,
      env,
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`http://localhost:${port}/healthz`)).ok) return child;
    } catch {
      // Not listening yet.
    }
    if (child.exitCode !== null) throw new Error(`the app exited ${child.exitCode} on start`);
    await sleep(100);
  }
  throw new Error("the app didn't start");
}

/** Stops a process; one still running three seconds after being asked is killed. */
function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const force = setTimeout(() => child.kill("SIGKILL"), 3000);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((path): path is string => Boolean(path));
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("Chrome not found: install Google Chrome or set CHROME_PATH");
  return found;
}

type Cdp = {
  send(method: string, params?: object): Promise<Record<string, unknown>>;
  on(listener: (method: string, params: Record<string, unknown>) => void): void;
  close(): void;
};

/** A headless Chrome and one page's DevTools session. */
async function startChrome(): Promise<{ cdp: Cdp; process: ChildProcess; profile: string }> {
  const profile = mkdtempSync(join(tmpdir(), "catalogue-chrome-"));
  const chrome = spawn(
    chromePath(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const portFile = join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100 && !existsSync(portFile); attempt++) await sleep(100);
  if (!existsSync(portFile)) {
    chrome.kill("SIGTERM");
    rmSync(profile, { recursive: true, force: true });
    throw new Error("Chrome didn't open its DevTools port");
  }
  const [port, path] = readFileSync(portFile, "utf8").trim().split("\n");
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map<number, (message: Record<string, unknown>) => void>();
  const listeners: ((method: string, params: Record<string, unknown>) => void)[] = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else if (message.method)
      for (const listener of listeners) listener(message.method, message.params);
  };
  // Chrome gone: every call still waiting fails rather than hanging the run.
  socket.onclose = () => {
    for (const settle of pending.values()) settle({ error: "the DevTools connection closed" });
    pending.clear();
  };
  const raw = (method: string, params: object = {}, session?: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const n = ++id;
      pending.set(n, (message) =>
        message.error
          ? reject(new Error(`${method}: ${JSON.stringify(message.error)}`))
          : resolve(message.result as Record<string, unknown>),
      );
      socket.send(JSON.stringify({ id: n, method, params, sessionId: session }));
    });
  const target = await raw("Target.createTarget", { url: "about:blank" });
  const attached = await raw("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId as string;
  const cdp: Cdp = {
    send: (method, params) => raw(method, params, sessionId),
    on: (listener) => listeners.push(listener),
    close: () => socket.close(),
  };
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  return { cdp, process: chrome, profile };
}

/** Finds the state's mark on the page and brings it into view; false until it is there. */
function markScript(mark: Mark, path: string | null): string {
  return `(() => {
    const norm = (value) => value.replace(/[’‘]/g, "'").replace(/\\s+/g, " ").toLowerCase();
    if (document.readyState !== "complete") return false;
    const router = window.__reactRouterDataRouter;
    if (router && router.state.navigation.state !== "idle") return false;
    if (${JSON.stringify(path)} !== null && location.pathname !== ${JSON.stringify(path)}) return false;
    let found = null;
    const selector = ${JSON.stringify(mark.selector ?? null)};
    const text = ${JSON.stringify(mark.text ? mark.text : null)};
    const shown = (element) => [...element.getClientRects()].some((r) => r.width > 1 && r.height > 1);
    if (selector) found = [...document.querySelectorAll(selector)].find(shown) ?? null;
    if (text) {
      let best = null;
      for (const element of document.body.querySelectorAll("*")) {
        const inner = norm(element.innerText ?? "");
        if (inner.includes(norm(text)) && shown(element) && (!best || inner.length < norm(best.innerText).length)) best = element;
      }
      if (!best && norm(document.body.innerText).includes(norm(text))) best = document.body;
      found = selector ? (found && best ? found : null) : best;
    }
    if (!selector && !text) found = document.body;
    if (!found) return false;
    if (found === document.body) window.scrollTo(0, 0);
    else found.scrollIntoView({ block: "center" });
    return true;
  })()`;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The flow a state belongs to in the index, in index order. */
const FLOWS = [
  "Page loads",
  "Saves on the start page",
  "Saves on the groups page",
  "Saves on a group's page",
  "Saves on the schedule",
  "Saves on an availability request",
  "Saves on a new availability request",
  "Saves when adding members",
  "Saves when joining",
  "Saves to your profile",
  "Signing out and disconnecting Google",
  "Google sign-in and permissions",
  "Google reads and writes",
  "The server failing",
] as const;

const PAGES: Record<string, (typeof FLOWS)[number]> = {
  home: "Saves on the start page",
  groups: "Saves on the groups page",
  group: "Saves on a group's page",
  schedule: "Saves on the schedule",
  request: "Saves on an availability request",
  "requests.new": "Saves on a new availability request",
  "members.add": "Saves when adding members",
  join: "Saves when joining",
  profile: "Saves to your profile",
};

function flowOf(key: string): (typeof FLOWS)[number] {
  if (key === "server") return "The server failing";
  if (key.startsWith("google ")) return "Google reads and writes";
  const [route, method] = key.split(" ");
  const page = route.replace(/^routes\//, "");
  if (page.startsWith("auth.")) {
    return method === "POST"
      ? "Signing out and disconnecting Google"
      : "Google sign-in and permissions";
  }
  if (method === "GET") return "Page loads";
  return PAGES[page] ?? "Page loads";
}

async function writeCatalogue(out: string, manifest: Manifest): Promise<void> {
  const ordered = [...manifest.states].sort(
    (a, b) =>
      FLOWS.indexOf(flowOf(a.key)) - FLOWS.indexOf(flowOf(b.key)) ||
      a.key.localeCompare(b.key) ||
      a.outcome.localeCompare(b.outcome),
  );
  // Formatted as the project's prettier would, so the format check passes.
  const formatted = async (file: string, text: string) =>
    format(text, { ...(await resolveConfig(join(PROJECT, file))), filepath: join(out, file) });
  writeFileSync(
    join(out, "manifest.json"),
    await formatted("manifest.json", JSON.stringify({ ...manifest, states: ordered })),
  );
  const lines = [
    "# Error-state catalogue",
    "",
    "Every error state in the [Phase 34 inventory](../tests/error-states/inventory.ts), photographed in a headless Chrome on the real app (plan/phase-35.md): at phone and desktop widths, in light and dark mode. Each entry says when it happens, what the person sees, and the test that proves it.",
    "",
    "How the failures are caused: the app runs in local fault mode (`MUSIC_CHAIRS_FAULTS=1`), where it talks to a stand-in for Google that can refuse, grant only part of a permission, fail or be slow, and where a `mc_fault=crash` cookie makes the server fail while building a page. Network failures are made in the browser: a dropped connection (the request never reaches the server), a gateway answering 500, or no answer within 20 seconds.",
    "",
    "The check in `tests/error-catalogue.test.ts` proves every inventory state has its four pictures and an entry here, and the script only photographs a state once its expected text or element is on screen. Whether each picture is right stays with you.",
    "",
    "Regenerate everything, or only some states (from `project/`; see its README). Dates and generated names on the pages change from run to run, so a full regeneration rewrites every picture (about 12 MB in the repository's history); regenerating only the states that changed keeps that small.",
    "",
    "```sh",
    "corepack pnpm run catalogue",
    "```",
    "",
    "```sh",
    'corepack pnpm run catalogue --only "routes/request POST set-date browser-failure" --only "server crash"',
    "```",
    "",
  ];
  for (const flow of FLOWS) {
    const entries = ordered.filter((entry) => flowOf(entry.key) === flow);
    if (entries.length === 0) continue;
    lines.push(`## ${flow}`, "");
    for (const entry of entries) {
      lines.push(
        `### ${entry.key} · ${entry.outcome}`,
        "",
        `- **When:** ${entry.when}`,
        `- **You see:** ${entry.sees}`,
        `- **Proved by:** ${entry.proofs.length > 0 ? entry.proofs.join("; ") : "the probe replayed in tests/error-states.test.tsx (answers every probe as the inventory says)"}`,
        "",
        `<img src="${entry.images["phone-light"]}" width="195" alt="${entry.outcome}, phone, light"> <img src="${entry.images["phone-dark"]}" width="195" alt="${entry.outcome}, phone, dark">`,
        "",
        `Desktop: [light](${entry.images["desktop-light"]}) · [dark](${entry.images["desktop-dark"]})`,
        "",
      );
    }
  }
  writeFileSync(join(out, "README.md"), await formatted("README.md", lines.join("\n")));
}

function sizeOf(dir: string): number {
  return readdirSync(dir).reduce((total, name) => total + statSync(join(dir, name)).size, 0);
}

async function main(): Promise<number> {
  const options = args(process.argv.slice(2));
  const { states: all, unreached } = catalogueStates(INVENTORY);
  if (unreached.length > 0) {
    console.error(`No way to reach these inventory outcomes:\n  ${unreached.join("\n  ")}`);
    return 1;
  }
  const unknown = options.only.filter((name) => !all.some((s) => `${s.key} ${s.outcome}` === name));
  if (unknown.length > 0) throw new Error(`--only names no state: ${unknown.join(", ")}`);
  const states =
    options.only.length > 0
      ? all.filter((s) => options.only.includes(`${s.key} ${s.outcome}`))
      : all;

  if (options.build) await run(join(PROJECT, "node_modules/.bin/react-router"), ["build"]);
  // Pictures go to a staging directory first; the catalogue changes only when every state passed.
  const work = mkdtempSync(join(tmpdir(), "catalogue-"));
  const staging = join(work, "catalogue");
  mkdirSync(join(staging, "images"), { recursive: true });
  const database = join(work, "catalogue.sqlite");
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const failures: string[] = [];
  const entries: Entry[] = [];
  let fake: FakeGoogle | null = null;
  let app: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof startChrome>> | null = null;
  try {
    fake = await startFakeGoogle();
    app = await startApp(port, database, fake, true);
    browser = await startChrome();
    const { cdp } = browser;
    const google = fake;
    let googleOn = true;
    console.log("Seeding the band…");
    const seeded: Seeded = await seed(origin, google);
    const ids = await lookUp(origin, seeded);
    const values: Record<string, string> = {
      group: seeded.group,
      open: seeded.open,
      invite: seeded.invite,
      ...ids,
    };
    const fill = (text: string) =>
      text.replace(/\{([a-z-]+)\}/g, (_, name: string) => values[name] ?? `{${name}}`);

    // Requests failing in the browser.
    let fault: Fault = null;
    let held: string[] = [];
    let fetchOn = false;
    cdp.on(async (method, params) => {
      if (method !== "Fetch.requestPaused") return;
      const requestId = params.requestId as string;
      const request = params.request as { method: string; url: string };
      const post = request.method === "POST";
      try {
        if (post && fault === "drop") {
          await cdp.send("Fetch.failRequest", { requestId, errorReason: "InternetDisconnected" });
        } else if (!post && fault === "drop-data" && request.url.includes(".data")) {
          await cdp.send("Fetch.failRequest", { requestId, errorReason: "InternetDisconnected" });
        } else if (post && fault === "500") {
          await cdp.send("Fetch.fulfillRequest", {
            requestId,
            responseCode: 500,
            body: btoa("Bad gateway"),
          });
        } else if (post && fault === "hold") {
          held.push(requestId);
        } else {
          await cdp.send("Fetch.continueRequest", { requestId });
        }
      } catch {
        // The page moved on; the request is gone.
      }
    });
    const setFault = async (next: Fault) => {
      fault = next;
      if (next && !fetchOn) {
        await cdp.send("Fetch.enable", {
          patterns: [{ urlPattern: "*", requestStage: "Request" }],
        });
        fetchOn = true;
      }
      if (!next) {
        for (const requestId of held) {
          await cdp
            .send("Fetch.failRequest", { requestId, errorReason: "Aborted" })
            .catch(() => {});
        }
        held = [];
        if (fetchOn) await cdp.send("Fetch.disable");
        fetchOn = false;
      }
    };
    const evaluate = async <T>(expression: string): Promise<T> => {
      const result = await cdp.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      const value = result.result as { value?: T };
      if (result.exceptionDetails)
        throw new Error(`in the page: ${JSON.stringify(result.exceptionDetails)}`);
      return value.value as T;
    };
    let loaded = 0;
    cdp.on((method) => {
      if (method === "Page.loadEventFired") loaded += 1;
    });
    const go = async (path: string) => {
      const before = loaded;
      await cdp.send("Page.navigate", { url: new URL(path, origin).href });
      for (let attempt = 0; attempt < 300 && loaded === before; attempt++) await sleep(100);
      await sleep(300);
    };
    const jarOf = (role: Role): Jar | null =>
      role === "visitor"
        ? null
        : role === "signed-in"
          ? seeded.roles.stranger
          : seeded.roles[role as "member" | "organizer" | "google" | "pianist"];
    const routerCall = (body: string) =>
      evaluate(
        `(() => { const router = window.__reactRouterDataRouter; ${body}; return true; })()`,
      );
    const formData = (form: Record<string, string>) =>
      `const data = new FormData(); for (const [name, value] of ${JSON.stringify(Object.entries(form))}) data.append(name, value);`;
    const driver: Driver = {
      google,
      seeded,
      fill,
      async as(role, extra = {}) {
        await cdp.send("Network.clearBrowserCookies");
        const jar = jarOf(role);
        const cookies = new Map([...(jar?.cookies ?? []), ...Object.entries(extra)]);
        for (const [name, value] of cookies)
          await cdp.send("Network.setCookie", { name, value, url: origin });
      },
      go,
      async submit(path, form) {
        await routerCall(
          `${formData(form)} void router.navigate(${JSON.stringify(path)}, { formMethod: "post", formData: data, preventScrollReset: true })`,
        );
      },
      async fetch(key, path, form) {
        await routerCall(
          `${formData(form)} void router.fetch(${JSON.stringify(key)}, router.state.matches.at(-1).route.id, ${JSON.stringify(path)}, { formMethod: "post", formData: data })`,
        );
      },
      async navigate(path) {
        await routerCall(`void router.navigate(${JSON.stringify(path)})`);
      },
      run: evaluate,
      fault: setFault,
      async consent() {
        const before = loaded;
        await evaluate(`document.getElementById("continue").click()`);
        for (let attempt = 0; attempt < 300 && loaded === before; attempt++) await sleep(100);
        await sleep(300);
      },
      async signInAgain(role, scope) {
        const jar = seeded.roles[role];
        await signIn(origin, google, jar, seeded.identities.organizer, seeded.group);
        if (scope === "contacts") {
          google.set({ identity: seeded.identities.organizer });
          await client(origin).follow(
            jar,
            // Back to the start page: the members page would read (and keep) contacts now.
            `/auth/google/calendar?scope=contacts&returnTo=${encodeURIComponent("/")}`,
          );
        }
        google.reset();
      },
      async post(role, path, form) {
        const jar = jarOf(role) ?? new Jar();
        await client(origin).follow(jar, fill(path), form);
      },
      async withoutGoogle() {
        if (app) await stop(app);
        app = await startApp(port, database, google, false);
        googleOn = false;
      },
      sleep,
    };

    for (const state of states) {
      const name = `${state.key} ${state.outcome}`;
      google.reset();
      await setFault(null);
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: "light" }],
      });
      try {
        if (state.withoutGoogle && googleOn) await driver.withoutGoogle();
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          state.drive(driver),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("its drive took over 90 seconds")), 90_000);
          }),
        ]).finally(() => clearTimeout(timer));
        const script = markScript(state.mark, state.mark.path ? fill(state.mark.path) : null);
        let found = false;
        for (let waited = 0; waited < (state.wait ?? 15) * 1000 && !found; waited += 250) {
          found = await evaluate<boolean>(script).catch(() => false);
          if (!found) await sleep(250);
        }
        if (!found) throw new Error(`its mark ${JSON.stringify(state.mark)} never appeared`);
        await sleep(400);
        const file = `${slug(state.key)}--${slug(state.outcome)}`;
        const entry: Entry = {
          key: state.key,
          outcome: state.outcome,
          when: state.when,
          sees: state.sees,
          proofs: state.proofs,
          images: {} as Entry["images"],
        };
        for (const variant of VARIANTS) {
          await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: variant.width,
            height: variant.height,
            deviceScaleFactor: 1,
            mobile: variant.mobile,
          });
          await cdp.send("Emulation.setEmulatedMedia", {
            features: [{ name: "prefers-color-scheme", value: variant.scheme }],
          });
          await sleep(250);
          await evaluate(script).catch(() => false);
          // A confirmation fades after four seconds; hovering it holds it.
          const toast = await evaluate<{ x: number; y: number } | null>(
            `(() => { const t = document.querySelector(".toast"); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4 }; })()`,
          ).catch(() => null);
          if (toast)
            await cdp.send("Input.dispatchMouseEvent", {
              type: "mouseMoved",
              x: toast.x,
              y: toast.y,
            });
          await sleep(150);
          const shot = await cdp.send("Page.captureScreenshot", { format: "webp", quality: 80 });
          const image = `images/${file}--${variant.name}.webp`;
          writeFileSync(join(staging, image), Buffer.from(shot.data as string, "base64"));
          entry.images[variant.name] = image;
        }
        entries.push(entry);
        // Which toast the pictures show, so a change to toasts finds the states to redo.
        const toast = await evaluate<string | null>(
          `document.querySelector(".toast")?.className.replace("toast ", "") ?? null`,
        ).catch(() => null);
        console.log(`✓ ${name}${toast ? ` (${toast})` : ""}`);
      } catch (error) {
        // What was on screen instead, for finding out why.
        const shot = await cdp.send("Page.captureScreenshot", { format: "png" }).catch(() => null);
        if (shot) {
          writeFileSync(
            join(tmpdir(), `catalogue-failed-${slug(name)}.png`),
            Buffer.from(shot.data as string, "base64"),
          );
        }
        failures.push(`${name}: ${(error as Error).message}`);
        console.log(`✗ ${name}: ${(error as Error).message}`);
      }
    }
    await setFault(null);
  } catch (error) {
    failures.push(`the run: ${(error as Error).message}`);
  } finally {
    browser?.cdp.close();
    if (browser) {
      await stop(browser.process);
      rmSync(browser.profile, { recursive: true, force: true, maxRetries: 5 });
    }
    if (app) await stop(app);
    await fake?.close();
  }

  if (failures.length > 0) {
    rmSync(work, { recursive: true, force: true });
    console.error(
      `\n${failures.length} failed; the catalogue is unchanged:\n  ${failures.join("\n  ")}`,
    );
    return 1;
  }
  const images = join(options.out, "images");
  mkdirSync(images, { recursive: true });
  if (options.only.length === 0) {
    for (const name of readdirSync(images)) rmSync(join(images, name));
  }
  for (const name of readdirSync(join(staging, "images"))) {
    cpSync(join(staging, "images", name), join(images, name));
  }
  rmSync(work, { recursive: true, force: true });
  const previous: Manifest | null = existsSync(join(options.out, "manifest.json"))
    ? JSON.parse(readFileSync(join(options.out, "manifest.json"), "utf8"))
    : null;
  const kept =
    options.only.length > 0 && previous
      ? previous.states.filter((entry) => !options.only.includes(`${entry.key} ${entry.outcome}`))
      : [];
  await writeCatalogue(options.out, {
    generated: new Date().toISOString().slice(0, 10),
    states: [...kept, ...entries],
  });
  const size = sizeOf(images);
  console.log(
    `${entries.length} states photographed into ${relative(process.cwd(), options.out) || "."}; images ${(size / 1024 / 1024).toFixed(1)} MB`,
  );
  if (size > SIZE_LIMIT_BYTES) {
    console.error(`The images are ${(size / 1024 / 1024).toFixed(1)} MB, over the 30 MB ruled.`);
    return 1;
  }
  return 0;
}

/** The ids the probes name, read from the organizer's pages. */
async function lookUp(origin: string, seeded: Seeded): Promise<Record<string, string>> {
  const { send } = client(origin);
  const schedule = await (await send(seeded.roles.organizer, `${seeded.group}/schedule`)).text();
  const proposed =
    /name="intent" value="confirm"\/><input type="hidden" name="rehearsalId" value="([A-Za-z0-9_-]{22})"/.exec(
      schedule,
    )?.[1];
  // The confirmed rehearsal comes first on the schedule; its answers carry its id.
  const confirmed =
    /name="intent" value="rsvp"\/><input type="hidden" name="rehearsalId" value="([A-Za-z0-9_-]{22})"/.exec(
      schedule,
    )?.[1];
  const group = await (await send(seeded.roles.organizer, seeded.group)).text();
  // Each member's row: its id, then the text up to the next member's id.
  const rows = [...group.matchAll(/name="memberId" value="([A-Za-z0-9_-]{22})"/g)];
  const memberOf = (name: string) =>
    rows.find((row, index) => group.slice(row.index, rows[index + 1]?.index).includes(name))?.[1];
  const ids = { proposed, confirmed, member: memberOf("Cellist"), organizer: memberOf("Viola") };
  for (const [name, value] of Object.entries(ids)) {
    if (!value) throw new Error(`seed: couldn't find the ${name} id`);
  }
  return ids as Record<string, string>;
}

process.exitCode = await main();
