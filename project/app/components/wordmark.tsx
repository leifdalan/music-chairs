import { siteName } from "~/lib/site";

/**
 * The "music·chairs" wordmark (plan/phase-26.md, Rehearsal room): the site's
 * name in the display serif with a middle dot. Screen readers hear the name
 * as written elsewhere ("music-chairs").
 */
export function Wordmark() {
  const [first, second] = siteName.split("-");
  return (
    <span className="wordmark">
      {first}
      <span aria-hidden="true">·</span>
      <span className="visually-hidden">-</span>
      {second}
    </span>
  );
}
