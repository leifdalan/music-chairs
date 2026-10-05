import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("healthz", "routes/healthz.ts"),
  route("privacy", "routes/privacy.tsx"),
  route("groups", "routes/groups.tsx"),
  route("g/:groupAddress", "routes/group.tsx"),
  route("g/:groupAddress/availability", "routes/availability.tsx"),
  route("g/:groupAddress/schedule", "routes/schedule.tsx"),
  route("g/:groupAddress/profile", "routes/profile.ts"),
  route("g/:groupAddress/members/add", "routes/members.add.tsx"),
  route("g/:groupAddress/requests/new", "routes/requests.new.tsx"),
  route("g/:groupAddress/requests/:requestId", "routes/request.tsx"),
  route("g/:groupAddress/requests/:requestId/calendar.ics", "routes/request-calendar.ts"),
  route("join/:inviteToken", "routes/join.tsx"),
  route("auth/google", "routes/auth.google.ts"),
  route("auth/google/callback", "routes/auth.google.callback.ts"),
  route("auth/sign-out", "routes/auth.sign-out.ts"),
  route("auth/google/disconnect", "routes/auth.google.disconnect.tsx"),
  route("auth/google/calendar", "routes/auth.google.calendar.ts"),
  route("calendar/:feedFile", "routes/calendar-feed.ts"),
] satisfies RouteConfig;
