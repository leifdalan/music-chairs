import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * False during the server render and hydration, true once the page is
 * interactive: the parts that need JavaScript render only then, and a page
 * without it keeps its plain form.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
