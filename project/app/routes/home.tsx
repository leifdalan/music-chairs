import { pageMeta, siteName, siteTagline } from "~/lib/site";

export function meta() {
  return pageMeta();
}

export default function Home() {
  return (
    <main>
      <h1>{siteName}</h1>
      <p>{siteTagline}</p>
    </main>
  );
}
