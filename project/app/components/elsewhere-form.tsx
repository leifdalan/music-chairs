import { Form, useFetcher, type FormProps } from "react-router";

import { ELSEWHERE, isFailure, retrySubmit } from "~/lib/client-failure";

import { FailureAlert } from "./failure-alert";

/**
 * A form that posts to another page's action (plan/phase-34.md), in the
 * background: success redirects as before, but a save that fails in the
 * browser stays on this page, shown over it with Retry. Without JavaScript
 * it is an ordinary post.
 */
export function ElsewhereForm({
  fetcherKey,
  action,
  children,
  ...props
}: Omit<FormProps, "method" | "navigate" | "fetcherKey" | "action" | "replace"> & {
  fetcherKey: string;
  action: string;
}) {
  const key = ELSEWHERE + fetcherKey;
  const fetcher = useFetcher({ key });
  const failure = isFailure(fetcher.data) ? fetcher.data.failure : null;
  return (
    <>
      <Form {...props} method="post" action={action} navigate={false} fetcherKey={key}>
        {children}
      </Form>
      {failure ? (
        <FailureAlert
          failure={failure}
          floating
          busy={fetcher.state !== "idle"}
          onRetry={() =>
            retrySubmit(failure, (form) => {
              void fetcher.submit(form, {
                method: "post",
                action,
                preventScrollReset: props.preventScrollReset,
              });
            })
          }
        />
      ) : null}
    </>
  );
}

/** Whether the form with this key is posting. */
export function useElsewhereBusy(fetcherKey: string): boolean {
  return useFetcher({ key: ELSEWHERE + fetcherKey }).state !== "idle";
}
