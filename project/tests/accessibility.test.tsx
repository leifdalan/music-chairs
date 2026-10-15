// The audit's accessibility fixes and the smaller observations (plan/phase-40.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { BrandText } from "../app/components/brand";
import { FreeCalendar } from "../app/components/free-calendar";
import { cn } from "../app/lib/utils";
import { ErrorBoundary, Layout } from "../app/root";

const css = readFileSync(join(__dirname, "../app/app.css"), "utf8");
const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("pages", () => {
  it("give every error page a title", () => {
    const Stub = createRoutesStub([
      { id: "page", path: "/*", Component: () => null, ErrorBoundary },
    ]);
    const html = renderToString(
      <Stub
        initialEntries={["/nowhere"]}
        hydrationData={{ errors: { page: new Error("boom") } }}
      />,
    );
    expect(html).toContain("<title>Something went wrong · music-chairs</title>");
  });

  it("start with a skip link to the content, which takes focus", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <Layout>
            <main>Page</main>
          </Layout>
        ),
      },
    ]);
    const html = renderToString(<Stub initialEntries={["/"]} />);
    const body = html.slice(html.indexOf("<body>"));
    expect(body).toMatch(/^<body><a class="skip-link" href="#content">Skip to content<\/a>/);
    expect(html).toContain('<div id="content" tabindex="-1">');
    expect(rule(".skip-link")).toContain("focus:translate-y-0");
  });

  it("let the header wrap at large text, the wordmark never breaking", () => {
    expect(rule(".site-header")).toContain("flex-wrap");
    expect(rule(".wordmark")).toContain("whitespace-nowrap");
    expect(rule(".brand")).toContain("white-space: nowrap");
  });
});

describe("controls and text", () => {
  it("draw a control's edge in the 3:1 border token, light and dark", () => {
    expect(css.match(/--control-border: oklch\(/g)).toHaveLength(2);
    expect(css).toContain("--color-control-border: var(--control-border);");
    expect(css).toMatch(/textarea \{\s*@apply min-h-11 [^;]*border border-control-border/);
    expect(rule(".chip")).toContain("border-control-border");
    expect(rule(".more-menu > summary")).toContain("border-control-border");
    expect(read("app/components/ui/button.tsx")).toContain(
      "border border-control-border bg-background",
    );
  });

  it("keep calendar and hour-bar text at 12px or more, and no all-caps", () => {
    expect(css).not.toMatch(/text-\[0\.(5|6)\d*rem\]|text-\[1[01]px\]/);
    expect(css).not.toContain("uppercase");
    expect(rule(".time-bar-meridiem")).toContain("text-xs");
    // Narrow screens, or large text, label every third hour.
    expect(css).toMatch(
      /@media \(max-width: 30em\) \{\s*\.time-bar-labels \.minor-hour \{\s*display: none;/,
    );
  });

  it("give error-page and standalone text links a 44px tap area", () => {
    expect(css).toMatch(
      /\.eyebrow a,\s*\.error-links a,\s*\.your-groups a,\s*\.request-group h3 a,[\s\S]*?\{\s*@apply inline-flex min-h-11 items-center;/,
    );
  });

  it("let buttons and form fields wrap or shrink at large text", () => {
    // A long label wraps rather than pushing the page wider than the screen.
    expect(read("app/components/ui/button.tsx")).not.toContain("whitespace-nowrap");
    expect(rule(".field")).toContain("min-w-0");
    expect(rule(".stack > *")).toContain("min-w-0");
  });

  it("set placeholders apart from typed values", () => {
    expect(css).toMatch(/textarea::placeholder \{\s*@apply text-muted-foreground italic;/);
  });

  it("describe the heat map so it reads true in light and dark", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <FreeCalendar
            from="2026-10-05"
            to="2026-10-05"
            days={[]}
            total={2}
            legend=""
            renderStretch={() => null}
          />
        ),
      },
    ]);
    const html = renderToString(<Stub initialEntries={["/"]} />).replaceAll("<!-- -->", "");
    expect(html).toContain("Fainter: fewer free");
    expect(html).toContain("Stronger: more free");
    expect(html).not.toMatch(/Paler|Deeper/);
  });
});

describe("the brand and the build", () => {
  it("keeps the written name on one line wherever it appears in a sentence", () => {
    const html = renderToString(
      <p>
        <BrandText text="Couldn't reach music-chairs today" />
      </p>,
    );
    expect(html).toBe('<p>Couldn&#x27;t reach <span class="brand">music-chairs</span> today</p>');
    expect(
      renderToString(
        <p>
          <BrandText text="Saved" />
        </p>,
      ),
    ).toBe("<p>Saved</p>");
  });

  it("joins class names without tailwind-merge, which the app no longer ships", () => {
    expect(cn("a", false, "b")).toBe("a b");
    expect(read("app/lib/utils.ts")).not.toContain("tailwind-merge");
    expect(read("package.json")).not.toContain("tailwind-merge");
    // The saved look wins over any variant by a state rule, not class merging.
    expect(css).toMatch(/button\[data-state="saved"\],\s*button\[data-state="saved"\]:hover \{/);
  });
});
