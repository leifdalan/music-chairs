import { Fragment } from "react";

import { siteName } from "~/lib/site";

/** The site's name as written in text: one way, never broken across lines (plan/phase-40.md). */
export function Brand() {
  return <span className="brand">{siteName}</span>;
}

/** `text` with every mention of the site's name kept on one line. */
export function BrandText({ text }: { text: string }) {
  const parts = text.split(siteName);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <Brand /> : null}
      {part}
    </Fragment>
  ));
}
