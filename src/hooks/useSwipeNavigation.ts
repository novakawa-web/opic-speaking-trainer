import { useCallback, useRef } from "react";
import type { PointerEventHandler } from "react";

type SwipeNavigationOptions = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minimumDistance?: number;
  horizontalRatio?: number;
};

type ActivePointer = {
  id: number;
  startX: number;
  startY: number;
};

const INTERACTIVE_SELECTOR = [
  "button",
  "select",
  "input",
  "textarea",
  "label",
  "a",
  "[role='button']",
  "[role='link']",
  "[contenteditable]:not([contenteditable='false'])",
].join(",");

export function getSwipeDirection(
  deltaX: number,
  deltaY: number,
  minimumDistance = 70,
  horizontalRatio = 1.3,
): "left" | "right" | null {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (horizontalDistance < minimumDistance) return null;
  if (horizontalDistance <= verticalDistance * horizontalRatio) return null;
  return deltaX < 0 ? "left" : "right";
}

function startsOnInteractiveElement(target: EventTarget | null) {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  minimumDistance = 70,
  horizontalRatio = 1.3,
}: SwipeNavigationOptions): {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
} {
  const activePointerRef = useRef<ActivePointer | null>(null);

  const onPointerDown = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    if (!event.isPrimary) return;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if (startsOnInteractiveElement(event.target)) return;

    activePointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }, []);

  const onPointerUp = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      const activePointer = activePointerRef.current;
      if (!activePointer || activePointer.id !== event.pointerId) return;

      activePointerRef.current = null;
      const direction = getSwipeDirection(
        event.clientX - activePointer.startX,
        event.clientY - activePointer.startY,
        minimumDistance,
        horizontalRatio,
      );

      if (direction === "left") onSwipeLeft?.();
      if (direction === "right") onSwipeRight?.();
    },
    [horizontalRatio, minimumDistance, onSwipeLeft, onSwipeRight],
  );

  const onPointerCancel = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    if (activePointerRef.current?.id === event.pointerId) {
      activePointerRef.current = null;
    }
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
}
