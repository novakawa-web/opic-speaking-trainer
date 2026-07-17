import type { MouseEvent } from "react";

export function activateButton(
  event: MouseEvent<HTMLButtonElement>,
  action: () => void,
) {
  action();

  // Keyboard-triggered clicks have detail 0, so Tab navigation keeps its focus.
  if (event.detail > 0) {
    event.currentTarget.blur();
  }
}
