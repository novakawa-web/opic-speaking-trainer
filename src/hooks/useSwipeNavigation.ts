import { useCallback, useRef } from "react";
import type { PointerEventHandler, TouchEventHandler } from "react";

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

type ActiveTouch = {
  id: number;
  startX: number;
  startY: number;
};

type TouchPointLike = {
  identifier: number;
  clientX: number;
  clientY: number;
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

export function resolveTouchSwipeEnd(
  activeTouch: ActiveTouch,
  changedTouches: ArrayLike<TouchPointLike>,
  minimumDistance = 70,
  horizontalRatio = 1.3,
): { matched: boolean; direction: "left" | "right" | null } {
  for (let index = 0; index < changedTouches.length; index += 1) {
    const touch = changedTouches[index];
    if (touch.identifier !== activeTouch.id) continue;
    return {
      matched: true,
      direction: getSwipeDirection(
        touch.clientX - activeTouch.startX,
        touch.clientY - activeTouch.startY,
        minimumDistance,
        horizontalRatio,
      ),
    };
  }
  return { matched: false, direction: null };
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
  onTouchStart: TouchEventHandler<HTMLElement>;
  onTouchEnd: TouchEventHandler<HTMLElement>;
  onTouchCancel: TouchEventHandler<HTMLElement>;
} {
  const activePointerRef = useRef<ActivePointer | null>(null);
  const activeTouchRef = useRef<ActiveTouch | null>(null);

  const onPointerDown = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    if (!event.isPrimary) return;
    if (event.pointerType !== "pen") return;
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

  const onTouchStart = useCallback<TouchEventHandler<HTMLElement>>((event) => {
    if (event.touches.length !== 1) return;
    if (startsOnInteractiveElement(event.target)) return;

    const touch = event.touches[0];
    activeTouchRef.current = {
      id: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
    };
  }, []);

  const onTouchEnd = useCallback<TouchEventHandler<HTMLElement>>(
    (event) => {
      const activeTouch = activeTouchRef.current;
      if (!activeTouch) return;

      const result = resolveTouchSwipeEnd(
        activeTouch,
        event.changedTouches,
        minimumDistance,
        horizontalRatio,
      );
      if (!result.matched) return;

      activeTouchRef.current = null;
      if (result.direction === "left") onSwipeLeft?.();
      if (result.direction === "right") onSwipeRight?.();
    },
    [horizontalRatio, minimumDistance, onSwipeLeft, onSwipeRight],
  );

  const onTouchCancel = useCallback<TouchEventHandler<HTMLElement>>(() => {
    activeTouchRef.current = null;
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onTouchStart,
    onTouchEnd,
    onTouchCancel,
  };
}
