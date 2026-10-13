/**
 * The free times an organizer has ticked but not yet proposed, kept while the
 * request page switches between Calendar and List (plan/phase-37.md). Both
 * views name a time the same way, so a tick in one is restored in the other.
 */

/** A tick box, as far as remembering goes. */
export type TickBox = { value: string; checked: boolean };

/** One box the organizer changed: remembered when ticked, forgotten when unticked. */
export function rememberTick(ticked: Set<string>, box: TickBox): void {
  if (box.checked) ticked.add(box.value);
  else ticked.delete(box.value);
}

/**
 * Ticks every box whose time is remembered, then remembers every ticked box
 * (ticks the browser restored after a reload, or made before the page was
 * interactive, send no change).
 */
export function restoreTicks(ticked: Set<string>, boxes: Iterable<TickBox>): void {
  for (const box of boxes) {
    if (ticked.has(box.value)) box.checked = true;
    else if (box.checked) ticked.add(box.value);
  }
}
