import type { PickRegistry } from "./pick-registry";
import type { Picker } from "./picker";
import { createSignal, onCleanup } from "signals.ts";

export const createMouse = ({
  element,
  pickRegistry,
  picker,
}: {
  element: HTMLElement;
  pickRegistry: PickRegistry;
  picker: Picker;
}) => {
  const abortController = new AbortController();
  const { signal } = abortController;

  const invalidPickId = 0xffffffff;
  const dragThresholdSquared = 6 ** 2;
  const gestures = new Map<
    number,
    {
      targetId: number;
      startX: number;
      startY: number;
      dragging: boolean;
      allowDrag: boolean;
    }
  >();
  const [draggingId, setDraggingId] = createSignal(0);
  let draggingPointers = 0;

  const setPointerDragging = (active: boolean, targetId: number) => {
    draggingPointers += active ? 1 : -1;
    if (draggingPointers < 0) draggingPointers = 0;
    if (active) setDraggingId(targetId);
    else if (draggingPointers === 0) setDraggingId(0);
  };

  const pointerPosition = (event: { clientX: number; clientY: number }) => {
    const { left, top } = element.getBoundingClientRect();
    return [event.clientX - left, event.clientY - top] as const;
  };

  const readPickEvent = async (x: number, y: number) => ({
    ...(await picker.pick(x, y)),
    x,
    y,
  });

  element.addEventListener(
    "pointerdown",
    event => {
      const [x, y] = pointerPosition(event);
      const { pointerId, button } = event;
      void readPickEvent(x, y).then(picked => {
        if (picked.id === invalidPickId) {
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
      void readPickEvent(x, y).then(picked => {
        if (picked.id !== invalidPickId) pickRegistry.onMouseMove(picked);

        const gesture = gestures.get(pointerId);
        if (!gesture) return;

        const dx = x - gesture.startX;
        const dy = y - gesture.startY;
        const moved = dx ** 2 + dy ** 2 > dragThresholdSquared;

        if (gesture.allowDrag && !gesture.dragging && moved) {
          gesture.dragging = true;
          setPointerDragging(true, gesture.targetId);
          pickRegistry.onDragStart(picked, gesture.targetId);
        }
        if (gesture.dragging) pickRegistry.onDrag(picked, gesture.targetId);
      });
    },
    { signal },
  );

  const endGesture = (event: PointerEvent) => {
    const [x, y] = pointerPosition(event);
    const { pointerId } = event;

    void readPickEvent(x, y).then(picked => {
      if (picked.id !== invalidPickId) pickRegistry.onMouseUp(picked);

      const gesture = gestures.get(pointerId);
      if (!gesture) return;

      const dx = x - gesture.startX;
      const dy = y - gesture.startY;
      const moved = dx ** 2 + dy ** 2 > dragThresholdSquared;

      if (gesture.dragging) {
        setPointerDragging(false, gesture.targetId);
        pickRegistry.onDragEnd(picked, gesture.targetId);
      } else if (!moved && picked.id === gesture.targetId)
        pickRegistry.onClick(picked, gesture.targetId);

      gestures.delete(pointerId);
    });
  };

  element.addEventListener("pointerup", endGesture, { signal });
  element.addEventListener("pointercancel", endGesture, { signal });

  onCleanup(() => abortController.abort());

  return { draggingId };
};
