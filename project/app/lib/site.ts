export const siteName = "music-chairs";

export const siteTagline =
  "One place for your ensemble to collect availability, choose rehearsal times and confirm who is coming.";

export type PageMeta = { title: string } | { name: string; content: string };

/** The document title and description for a page, branded consistently. */
export function pageMeta(pageTitle?: string): PageMeta[] {
  const title = pageTitle ? `${pageTitle} · ${siteName}` : siteName;
  return [{ title }, { name: "description", content: siteTagline }];
}
