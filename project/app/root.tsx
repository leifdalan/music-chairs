import type { ReactNode } from "react";
import {
  data,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { readToast } from "~/.server/flash";
import { headerProfile } from "~/.server/profile";
import { ProfileMenu } from "~/components/profile-menu";
import { FeedbackProvider } from "~/components/submit-button";
import { Toaster } from "~/components/toast";
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
  const { toast, clear } = await readToast(request);
  return data(
    { toast, profile: await headerProfile(request) },
    clear ? { headers: { "Set-Cookie": clear } } : undefined,
  );
}

/** The profile menu depends on the group in the URL, so every navigation reloads it. */
export function shouldRevalidate() {
  return true;
}

export function Layout({ children }: { children: ReactNode }) {
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
            <Link to="/">{siteName}</Link>
            <ProfileMenu />
          </header>
          {children}
          <footer className="site-footer">
            <Link to="/privacy">Privacy policy</Link>
          </footer>
          <Toaster />
        </FeedbackProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main>
      <h1>{notFound ? "Page not found" : "Something went wrong"}</h1>
      <p>
        {notFound
          ? "This link doesn't match any group. Check that you copied the whole invite link, or ask an organizer for a new one."
          : "Please try again in a moment."}
      </p>
      <p>
        <Link to="/">Go to the start page</Link>
      </p>
    </main>
  );
}
