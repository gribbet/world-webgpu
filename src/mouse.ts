import type { MaybeSignal } from "@gribbet/signal.ts";
import { onCleanup, resolve } from "@gribbet/signal.ts";

import { pickFlat } from "./math";
import type { Vec2, Vec3, View } from "./model";
import type { PickRegistry } from "./pick-registry";

export const createMouse = ({
  element,
  pickRegistry,
  pick,
  view,
}: {
  element: HTMLElement;
  pickRegistry: PickRegistry;
  pick: (xy: Vec2) => Promise<{
    position: Vec3;
    id: number;
  }>;
  view: MaybeSignal<View>;
}) => {
  const abortController = new AbortController();
  const { signal } = abortController;

  const dragThresholdSquared = 6 ** 2;
  const gestures = new Map<
    number,
    {
      targetId: number;
      startX: number;
      startY: number;
      dragging: boolean;
      allowDrag: boolean;
      allowDragFlat: boolean;
      flatAltitude: number;
    }
  >();

  const pointerPosition = (event: { clientX: number; clientY: number }) => {
    const { left, top } = element.getBoundingClientRect();
    return [event.clientX - left, event.clientY - top] as const;
  };

  const readPickEvent = async ([x, y]: Vec2) => ({
    ...(await pick([x, y])),
    x,
    y,
  });

  element.addEventListener(
    "pointerdown",
    event => {
      const [x, y] = pointerPosition(event);
      const { pointerId, button } = event;
      void readPickEvent([x, y]).then(picked => {
        if (!picked.id) {
          gestures.delete(pointerId);
          return;
        }

        pickRegistry.onMouseDown(picked);
        gestures.set(pointerId, {
          targetId: picked.id,
          startX: x,
          startY: y,
          dragging: false,
          allowDrag:
            button === 0 &&
            (pickRegistry.hasHandler(picked.id, "onDragStart") ||
              pickRegistry.hasHandler(picked.id, "onDrag")),
          allowDragFlat:
            button === 0 && pickRegistry.hasHandler(picked.id, "onDragFlat"),
          flatAltitude: picked.position[2],
        });
      });
    },
    { signal },
  );

  element.addEventListener(
    "pointermove",
    event => {
      const [x, y] = pointerPosition(event);
      const { pointerId } = event;
      void readPickEvent([x, y]).then(picked => {
        if (picked.id) pickRegistry.onMouseMove(picked);

        const gesture = gestures.get(pointerId);
        if (!gesture) return;

        const dx = x - gesture.startX;
        const dy = y - gesture.startY;
        const moved = dx ** 2 + dy ** 2 > dragThresholdSquared;

        if (
          !gesture.dragging &&
          moved &&
          (gesture.allowDrag || gesture.allowDragFlat)
        ) {
          gesture.dragging = true;
          if (gesture.allowDrag)
            pickRegistry.onDragStart(picked, gesture.targetId);
          else if (gesture.allowDragFlat) {
            const { width, height } = element.getBoundingClientRect();
            const flatPos = pickFlat(
              x,
              y,
              gesture.flatAltitude,
              resolve(view),
              [width, height],
            );
            if (flatPos)
              pickRegistry.onDragStart(
                { position: flatPos, id: gesture.targetId, x, y },
                gesture.targetId,
              );
          }
        }
        if (gesture.dragging) {
          if (gesture.allowDrag) pickRegistry.onDrag(picked, gesture.targetId);
          if (gesture.allowDragFlat) {
            const { width, height } = element.getBoundingClientRect();
            const flatPos = pickFlat(
              x,
              y,
              gesture.flatAltitude,
              resolve(view),
              [width, height],
            );
            if (flatPos)
              pickRegistry.onDragFlat(
                { position: flatPos, id: gesture.targetId, x, y },
                gesture.targetId,
              );
          }
        }
      });
    },
    { signal },
  );

  const endGesture = (event: PointerEvent) => {
    const [x, y] = pointerPosition(event);
    const { pointerId } = event;

    void readPickEvent([x, y]).then(picked => {
      if (picked.id) pickRegistry.onMouseUp(picked);

      const gesture = gestures.get(pointerId);
      if (!gesture) return;

      const dx = x - gesture.startX;
      const dy = y - gesture.startY;
      const moved = dx ** 2 + dy ** 2 > dragThresholdSquared;

      if (gesture.dragging) {
        if (gesture.allowDrag) pickRegistry.onDragEnd(picked, gesture.targetId);
        else if (gesture.allowDragFlat) {
          const { width, height } = element.getBoundingClientRect();
          const flatPos = pickFlat(x, y, gesture.flatAltitude, resolve(view), [
            width,
            height,
          ]);
          if (flatPos)
            pickRegistry.onDragEnd(
              { position: flatPos, id: gesture.targetId, x, y },
              gesture.targetId,
            );
        }
      } else if (!moved && picked.id === gesture.targetId)
        pickRegistry.onClick(picked, gesture.targetId);

      gestures.delete(pointerId);
    });
  };

  element.addEventListener("pointerup", endGesture, { signal });
  element.addEventListener("pointercancel", endGesture, { signal });

  onCleanup(() => abortController.abort());
};
