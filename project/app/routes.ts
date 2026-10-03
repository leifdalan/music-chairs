import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("healthz", "routes/healthz.ts"),
  route("g/:groupId", "routes/group.tsx"),
  route("g/:groupId/availability", "routes/availability.tsx"),
  route("g/:groupId/availability/import", "routes/availability.import.tsx"),
  route("g/:groupId/schedule", "routes/schedule.tsx"),
  route("join/:inviteToken", "routes/join.tsx"),
  route("auth/google", "routes/auth.google.ts"),
  route("auth/google/callback", "routes/auth.google.callback.ts"),
  route("auth/sign-out", "routes/auth.sign-out.ts"),
  route("auth/google/calendar", "routes/auth.google.calendar.ts"),
  route("calendar/:feedFile", "routes/calendar-feed.ts"),
] satisfies RouteConfig;
