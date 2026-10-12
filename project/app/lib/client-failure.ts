// What a failed action becomes in the browser (plan/phase-34.md): instead of
// the error page replacing what the person was doing, the page gets the
// failure as data, with a short reason and, where it is safe, a way to retry.
// Without JavaScript the browser posts to the server as before.

import { useState } from "react";
import { data, isRouteErrorResponse } from "react-router";

export type FailureKind = "offline" | "timeout" | "server" | "gone" | "forbidden";

export type Failure = {
  kind: FailureKind;
  message: string;
  /** It certainly wasn't saved; otherwise it may have been ("Maybe not saved"). */
  certain: boolean;
  /** Sending the same thing again is safe; otherwise the person reloads to check first. */
  retry: boolean;
  /** What was sent, so a failed in-page save can keep showing it. */
  entries: [string, string][];
};

/** Fetcher keys of forms posted to another page's action; their saves show on buttons. */
export const ELSEWHERE = "elsewhere:";

/** How long a save waits for the server before saying so. */
export const ACTION_TIMEOUT_MS = 20_000;
/**
 * Disconnect Google waits up to 20 s for the calendar's events to go, then up
 * to 10 s for Google to revoke access; the browser waits longer than both.
 */
export const DISCONNECT_TIMEOUT_MS = 45_000;

class ActionTimeout extends Error {}

/** The failure an error from `serverAction` means, or null for one to rethrow (a redirect). */
export function describeFailure(
  error: unknown,
  { offlineBefore, creates }: { offlineBefore: boolean; creates: boolean },
): (Omit<Failure, "entries"> & { status: number }) | null {
  if (error instanceof Response) return null;
  // Shown after "Not saved." or "Maybe not saved."; a create isn't sent blind again.
  const check = creates ? " Reload to check before trying again." : "";
  if (error instanceof ActionTimeout) {
    return {
      kind: "timeout",
      message: `The server didn't answer in time.${check}`,
      certain: false,
      retry: !creates,
      status: 503,
    };
  }
  if (isRouteErrorResponse(error)) {
    if (error.status === 403) {
      return {
        kind: "forbidden",
        message: "Only organizers can do that.",
        certain: true,
        retry: false,
        status: 403,
      };
    }
    if (error.status === 404) {
      return {
        kind: "gone",
        message: "This was deleted or changed while you were looking. Reload the page.",
        certain: true,
        retry: false,
        status: 404,
      };
    }
    return serverFailure(error.status >= 500 ? error.status : 500, creates);
  }
  if (error instanceof TypeError) {
    return offlineBefore
      ? { kind: "offline", message: "You're offline.", certain: true, retry: true, status: 503 }
      : {
          kind: "offline",
          message: `The connection dropped.${check}`,
          certain: false,
          retry: !creates,
          status: 503,
        };
  }
  return serverFailure(500, creates);
}

function serverFailure(status: number, creates: boolean) {
  // A gateway's 502-504 may come after the app saved.
  const gateway = status >= 502 && status <= 504;
  return {
    kind: "server" as const,
    message: creates
      ? "Something went wrong on our side. Reload to check before trying again."
      : "Something went wrong on our side.",
    certain: !creates && !gateway,
    retry: !creates,
    status,
  };
}

/**
 * A route's `clientAction`: runs the server action and turns anything but a
 * result or a redirect into `{ failure }` with an error status, so loaders
 * don't reload behind it (plan/phase-34.md). `creates` names the intents
 * (`"(default)"` for a form without one) that make something new, where a
 * blind retry could make it twice.
 */
export async function withFailures<T>(
  { request, serverAction }: { request: Request; serverAction: () => Promise<T> },
  {
    creates = [],
    timeoutMs = ACTION_TIMEOUT_MS,
  }: {
    creates?: string[];
    /** For an action whose own worst case is longer than the usual wait. */
    timeoutMs?: number;
  } = {},
) {
  const entries = await submittedEntries(request.clone());
  const intent = entries.find(([name]) => name === "intent")?.[1] ?? "(default)";
  const offlineBefore = typeof navigator !== "undefined" && navigator.onLine === false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      serverAction(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ActionTimeout()), timeoutMs);
      }),
    ]);
  } catch (error) {
    const failure = describeFailure(error, { offlineBefore, creates: creates.includes(intent) });
    if (!failure) throw error;
    const { status, ...rest } = failure;
    return data({ failure: { ...rest, entries } satisfies Failure }, { status });
  } finally {
    clearTimeout(timer);
  }
}

async function submittedEntries(request: Request): Promise<[string, string][]> {
  try {
    const form = await request.formData();
    return [...form.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
  } catch {
    return [];
  }
}

/** A failure's submitted entries as form data, to send them again. */
export function entriesForm(entries: [string, string][]): FormData {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

export function isFailure(value: unknown): value is { failure: Failure } {
  return typeof value === "object" && value !== null && "failure" in value;
}

/** What `useActionResult` remembers: the last action data seen and the last that wasn't a failure. */
export type KeptResult<T> = { seen: T | { failure: Failure } | undefined; kept: T | undefined };

/** The next memory after `actionData` arrives: a failure keeps the earlier result. */
export function keepResult<T>(
  memory: KeptResult<T>,
  actionData: T | { failure: Failure } | undefined,
): KeptResult<T> {
  if (actionData === memory.seen) return memory;
  return {
    seen: actionData,
    kept: isFailure(actionData) ? memory.kept : (actionData as T | undefined),
  };
}

/**
 * The page's action result and failure (plan/phase-34.md): while a failure
 * shows, the last result that wasn't one stays in force, so form keys, values,
 * errors and open sections don't reset under the person.
 */
export function useActionResult<T>(actionData: T | { failure: Failure } | undefined): {
  result: T | undefined;
  failure: Failure | null;
} {
  const [memory, setMemory] = useState<KeptResult<T>>(() =>
    keepResult<T>({ seen: undefined, kept: undefined }, actionData),
  );
  const next = keepResult(memory, actionData);
  if (next !== memory) setMemory(next);
  return isFailure(actionData)
    ? { result: next.kept, failure: actionData.failure }
    : { result: actionData as T | undefined, failure: null };
}

/** The last form submitted on the page, to send again as it now is. */
let lastSubmit: { form: HTMLFormElement; submitter: HTMLElement | null; entries: string } | null =
  null;

const entriesKey = (entries: [string, string][]) => JSON.stringify(entries);

/** Remembers each form submission; installed once by the root layout. */
export function rememberSubmits(document: Document): () => void {
  const listener = (event: SubmitEvent) => {
    const form = event.target as HTMLFormElement;
    const data = new FormData(form, event.submitter);
    const entries = [...data.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    lastSubmit = { form, submitter: event.submitter, entries: entriesKey(entries) };
  };
  document.addEventListener("submit", listener, true);
  return () => document.removeEventListener("submit", listener, true);
}

/**
 * Sends a failed form again as it is on screen now (plan/phase-34.md, R6):
 * the form that failed, through the same button, when it is still on the
 * page; otherwise what was sent, through `fallback`.
 */
export function retrySubmit(failure: Failure, fallback: (form: FormData) => void): void {
  const last = lastSubmit;
  if (last && last.form.isConnected && last.entries === entriesKey(failure.entries)) {
    const submitter = last.submitter?.isConnected ? last.submitter : null;
    last.form.requestSubmit(submitter && last.form.contains(submitter) ? submitter : undefined);
    return;
  }
  fallback(entriesForm(failure.entries));
}
