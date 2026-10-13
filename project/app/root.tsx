import { useEffect, type ReactNode } from "react";
import {
  data,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useMatches,
  useRevalidator,
} from "react-router";

import { crashRequested } from "~/.server/faults";
import { readToast } from "~/.server/flash";
import { headerProfile } from "~/.server/profile";
import { ProfileMenu } from "~/components/profile-menu";
import { FeedbackProvider } from "~/components/submit-button";
import { buttonVariants } from "~/components/ui/button";
import { Toaster } from "~/components/toast";
import { Wordmark } from "~/components/wordmark";
import { isFailure, rememberSubmits } from "~/lib/client-failure";
import { noticeKeys, NOTICES, type NoticeHandle } from "~/lib/notices";
import { siteName } from "~/lib/site";

import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: stylesheet }];

/**
 * The confirmation a change left for this page, if any, and the header's
 * profile menu. React Router reloads this loader after every action, so the
 * toast arrives with the redirected page.
 */
export async function loader({ request }: Route.LoaderArgs) {
  // The server failing, on cue, in local fault mode only (plan/phase-35.md).
  if (crashRequested(request)) throw new Error("music-chairs: fault mode crash");
  const { toast, clear } = await readToast(request);
  return data(
    { toast, profile: await headerProfile(request) },
    clear ? { headers: { "Set-Cookie": clear } } : undefined,
  );
}

/**
 * The profile menu depends on the group in the URL, so every navigation reloads
 * it; but not after a failed save, whose page stays as it was (plan/phase-34.md).
 */
export function shouldRevalidate({ actionResult }: { actionResult?: unknown }) {
  return !isFailure(actionResult);
}

export function Layout({ children }: { children: ReactNode }) {
  // Retry sends a failed form again as it now is (plan/phase-34.md).
  useEffect(() => rememberSubmits(document), []);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <FeedbackProvider>
          <header className="site-header">
            <Link to="/" aria-label={`${siteName}, home`}>
              <Wordmark />
            </Link>
            <nav className="header-nav" aria-label="Site">
              <NavLink to="/groups">Groups</NavLink>
              <ProfileMenu />
            </nav>
          </header>
          <RouteNotices />
          {children}
          <footer className="site-footer">
            <Link to="/privacy">Privacy policy</Link>
          </footer>
          {/* Failures (plan/phase-34.md) stack above the toast, never under it. */}
          <div className="float-stack">
            <div id="failure-slot" />
            <Toaster />
          </div>
        </FeedbackProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Notices the page doesn't show itself (plan/phase-34.md): every known
 * `notice` in the address that no route on the page lists in its `handle`.
 */
function RouteNotices() {
  const location = useLocation();
  const handled = new Set(
    useMatches().flatMap((match) => (match.handle as NoticeHandle | undefined)?.notices ?? []),
  );
  const keys = noticeKeys(location.pathname + location.search).filter((key) => !handled.has(key));
  if (keys.length === 0) return null;
  return (
    <div className="route-notices">
      {keys.map((key) => (
        <p key={key} className="notice" role="status">
          {NOTICES[key]}
        </p>
      ))}
    </div>
  );
}

export default function App() {
  return <Outlet />;
}

/** What the error page says for a failure (plan/phase-34.md). */
export function errorPage(error: unknown): {
  title: string;
  body: string;
  /** Reloading could help. */
  retry: boolean;
  /** Point back to the group named in the address. */
  toGroup: boolean;
} {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        title: "Page not found",
        body: "This link doesn't match anything here. Check that you copied the whole link, or ask an organizer for a new one.",
        retry: false,
        toGroup: false,
      };
    }
    if (error.status === 403) {
      return {
        title: "Only organizers can see this",
        body: "Ask an organizer of the group if you need it.",
        retry: false,
        toGroup: true,
      };
    }
    return {
      title: "Something went wrong on our side",
      body: "Nothing you did caused this. Please try again in a moment.",
      retry: true,
      toGroup: false,
    };
  }
  // A page fetched in the app whose request never got an answer; not any
  // TypeError, which is also how a bug in the page shows.
  if (isFetchFailure(error)) {
    return {
      title: "Couldn't reach music-chairs",
      body: "Check your connection, then try again.",
      retry: true,
      toGroup: true,
    };
  }
  return {
    title: "Something went wrong",
    body: "Please try again in a moment.",
    retry: true,
    toGroup: false,
  };
}

/** A fetch that never got an answer, as Chrome, Safari and Firefox word it, or while offline. */
function isFetchFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return /Failed to fetch|Load failed|NetworkError|fetch failed/i.test(error.message);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const page = errorPage(error);
  const revalidator = useRevalidator();
  const group = /^\/g\/[^/]+/.exec(useLocation().pathname)?.[0];
  return (
    <main>
      <h1>{page.title}</h1>
      <p>{page.body}</p>
      {page.retry ? (
        <p>
          <button
            type="button"
            className={buttonVariants({ variant: "outline" })}
            aria-disabled={revalidator.state !== "idle" || undefined}
            onClick={() => {
              if (revalidator.state === "idle") void revalidator.revalidate();
            }}
          >
            Try again
          </button>
        </p>
      ) : null}
      <p className="error-links">
        {page.toGroup && group ? <Link to={group}>Go to the group&apos;s page</Link> : null}
        <Link to="/">Go to the start page</Link>
      </p>
    </main>
  );
}
