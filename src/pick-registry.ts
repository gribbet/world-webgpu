import {
  derived,
  onCleanup,
  type Properties,
  resolve,
  signal,
} from "signals.ts";

import type { Vec3 } from "./model";

export type PickEvent = {
  id: number;
  position: Vec3;
  x: number;
  y: number;
};

export type PickHandlers = {
  pickable?: boolean;
  onMouseDown?: (event: PickEvent) => void;
  onMouseMove?: (event: PickEvent) => void;
  onMouseUp?: (event: PickEvent) => void;
  onClick?: (event: PickEvent) => void;
  onDragStart?: (event: PickEvent) => void;
  onDrag?: (event: PickEvent) => void;
  onDragEnd?: (event: PickEvent) => void;
  onDragFlat?: (event: PickEvent) => void;
};

export type PickEventType = Exclude<keyof PickHandlers, "pickable">;

type PickDispatch = {
  [K in PickEventType]: (event: PickEvent, targetId?: number) => void;
};

export type PickRegistry = ReturnType<typeof createPickRegistry>;

export const createPickRegistry = () => {
  let nextId = 1;
  const freeList: number[] = [];
  const handlers = new Map<number, Properties<PickHandlers>>();
  const [draggingId, setDraggingId] = signal(0);

  const allocate = (entry: Properties<PickHandlers> = {}) => {
    const id = freeList.length > 0 ? freeList.pop()! : nextId++;
    handlers.set(id, entry);
    onCleanup(() => {
      handlers.delete(id);
      freeList.push(id);
    });
    return derived(() =>
      resolve(entry.pickable) !== false && draggingId() !== id ? id : 0,
    );
  };

  const dispatchOne = (
    type: PickEventType,
    event: PickEvent,
    targetId = event.id,
  ) => {
    const callback = resolve(handlers.get(targetId)?.[type]);
    if (type === "onDragStart") setDraggingId(targetId);
    else if (type === "onDragEnd") setDraggingId(0);
    if (!callback) return;
    callback(targetId === event.id ? event : { ...event, id: targetId });
  };

  const createDispatch =
    <K extends PickEventType>(type: K) =>
    (event: PickEvent, targetId?: number) =>
      dispatchOne(type, event, targetId);

  const dispatch: PickDispatch = {
    onMouseDown: createDispatch("onMouseDown"),
    onMouseMove: createDispatch("onMouseMove"),
    onMouseUp: createDispatch("onMouseUp"),
    onClick: createDispatch("onClick"),
    onDragStart: createDispatch("onDragStart"),
    onDrag: createDispatch("onDrag"),
    onDragEnd: createDispatch("onDragEnd"),
    onDragFlat: createDispatch("onDragFlat"),
  };

  const hasHandler = (id: number, type: PickEventType) =>
    resolve(handlers.get(id)?.[type]) !== undefined;

  const isDragging = derived(() => draggingId() !== 0);

  return { allocate, hasHandler, isDragging, ...dispatch };
};
