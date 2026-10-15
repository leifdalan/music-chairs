import { gravatarPicture } from "~/.server/gravatar";
import { pictureOwner } from "~/.server/profile";

import type { Route } from "./+types/avatar";

/**
 * The header's Gravatar picture, served from the site (plan/phase-40.md): the
 * picture of whoever the header shows for this request — never one named in
 * the address — fetched by the server and cached; a transparent image when
 * there is none.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { email } = await pictureOwner(request, new URL(request.url).searchParams.get("g"));
  const picture = await gravatarPicture(email);
  return new Response(picture.body, {
    headers: {
      "Content-Type": picture.type,
      "Cache-Control": `private, max-age=${picture.maxAge}`,
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
