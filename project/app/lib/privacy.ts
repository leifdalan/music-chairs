// The privacy policy's facts (plan/phase-14.md): what the /privacy page says
// about who runs the app and every Google permission it asks for. Tests check
// these rows against the scopes the app's code requests.

/** One Google permission and, in plain words, what the app does with it. */
export type PolicyScope = { scope: string; name: string; purpose: string };

export const POLICY = {
  operator: "music-chairs is run by Leif Dalan as a personal, non-commercial project.",
  contact: "leifdalan+rtc@gmail.com",
  updated: "3 October 2026",
  googleScopes: [
    {
      scope: "openid",
      name: "Sign in with Google",
      purpose: "Confirms who you are when you choose to sign in with Google.",
    },
    {
      scope: "email",
      name: "Your email address",
      purpose:
        "Shown to you and your groups' organizers, used to find your Gravatar picture, and to match you to a place an organizer added for you.",
    },
    {
      scope: "profile",
      name: "Your name",
      purpose: "Suggested as your name when you join a group.",
    },
    {
      scope: "https://www.googleapis.com/auth/calendar.freebusy",
      name: "When your Google Calendar is busy",
      purpose:
        "Greys out the times you are busy while you enter your availability. Read when you open that page, shown only to you, and never stored.",
    },
    {
      scope: "https://www.googleapis.com/auth/calendar.events.owned",
      name: "Events on calendars you own",
      purpose:
        "Adds your group's confirmed rehearsals to your calendar when you turn that on, and updates or removes only the events music-chairs added.",
    },
    {
      scope: "https://www.googleapis.com/auth/contacts.readonly",
      name: "Your contacts",
      purpose:
        "Suggests people's names and email addresses while an organizer adds members. Only names and email addresses are read.",
    },
    {
      scope: "https://www.googleapis.com/auth/contacts.other.readonly",
      name: "Your other contacts",
      purpose:
        "The same suggestions from the people Google keeps as “other contacts” (for example, people you have emailed).",
    },
  ] satisfies PolicyScope[],
} as const;

/** The sentence Google's API Services User Data Policy asks apps to publish. */
export const LIMITED_USE =
  "music-chairs’ use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";

export const GOOGLE_USER_DATA_POLICY =
  "https://developers.google.com/terms/api-services-user-data-policy";

/** Disconnect Google's "are you sure", shared by the profile menu's dialog and the confirm page. */
export const DISCONNECT_PROMPT = {
  title: "Disconnect Google?",
  body: "music-chairs stops adding rehearsals to your Google Calendar, removes the upcoming ones it added, and gives up its permission to use your Google account. You stay in your groups.",
  label: "Disconnect",
};
