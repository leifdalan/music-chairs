import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Home from "../app/routes/home";

describe("home route", () => {
  it("renders the product name and tagline without a browser", () => {
    const Stub = createRoutesStub([{ path: "/", Component: Home }]);

    const html = renderToString(<Stub initialEntries={["/"]} />);

    expect(html).toContain("<h1>music-chairs</h1>");
    expect(html).toContain("collect availability");
  });
});
