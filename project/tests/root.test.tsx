import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { ErrorBoundary } from "../app/root";

function renderError(error: unknown): string {
  const Stub = createRoutesStub([
    { id: "page", path: "/join/:inviteToken", Component: () => null, ErrorBoundary },
  ]);
  return renderToString(
    <Stub initialEntries={["/join/x"]} hydrationData={{ errors: { page: error } }} />,
  );
}

describe("root error boundary", () => {
  it("renders a readable not-found page for a 404", () => {
    const html = renderError({ status: 404, statusText: "Not Found", internal: false, data: null });

    expect(html).toContain("Page not found");
    expect(html).toContain("whole invite link");
  });

  it("renders a generic message without details for other errors", () => {
    const html = renderError(new Error("database exploded"));

    expect(html).toContain("Something went wrong");
    expect(html).not.toContain("database exploded");
  });
});
