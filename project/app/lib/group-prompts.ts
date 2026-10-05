// What leaving or deleting a group says, shared by the group page, the groups
// page (plan/phase-19.2.md) and the server's confirm panel.

export const LAST_ORGANIZER =
  "A group needs at least one organizer. Make someone else an organizer first.";

export function deletionPrompt(groupName: string) {
  return {
    title: `Delete ${groupName}?`,
    body: "Everything in the group goes now: its members, availability, requests and rehearsals. Rehearsal events this app added to members' Google Calendars are removed and calendar feed links stop working. This can't be undone.",
    label: "Delete group",
  };
}

export function leavePrompt(groupName: string) {
  return {
    title: `Leave ${groupName}?`,
    body: "Your availability, request answers and rehearsal answers in this group are deleted, and rehearsal events this app added to your Google Calendar are removed. You can join again with the invite link.",
    label: "Leave group",
  };
}
