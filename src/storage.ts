import { type Signal, signal } from "signals.ts";

import { createResizableBuffer } from "./buffer";
import { mercatorFromLonLat } from "./math";
import type { Vec2, Vec3, Vec4 } from "./model";

export type Value<T> = {
  readonly kind: "value";
  readonly align: number;
  readonly size: number;
  readonly stride: number;
  write(view: DataView, offset: number, value: T): void;
};

type AnyValue = Value<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type StructFields = Record<string, AnyValue>;
type ValueOf<V> = V extends Value<infer T> ? T : never;
export type StructView<S extends StructFields> = {
  [K in keyof S]: ValueOf<S[K]>;
};

export type Struct<S extends StructFields> = {
  readonly kind: "struct";
  readonly align: number;
  readonly size: number;
  readonly stride: number;
  readonly fields: S;
  readonly offsets: Record<string, number>;
};

type ElementShape = AnyValue | Struct<StructFields>;

export type ArrayShape<S extends ElementShape> = {
  readonly kind: "array";
  readonly align: number;
  readonly size: number;
  readonly stride: number;
  readonly element: S;
};

export type Shape = ElementShape | ArrayShape<ElementShape>;

export type ArrayItemOf<S extends ElementShape> =
  S extends Value<infer T>
    ? T
    : S extends Struct<infer F>
      ? StructView<F>
      : never;

export type ArrayView<S extends ElementShape> = {
  readonly stride: number;
  readonly items: ArrayItemOf<S>[];
  resize(n: number): void;
};

export type ViewOf<S extends Shape> =
  S extends Value<infer T>
    ? T
    : S extends Struct<infer F>
      ? StructView<F>
      : S extends ArrayShape<infer E>
        ? ArrayView<E>
        : never;

const alignTo = (n: number, a: number) => Math.ceil(n / a) * a;

type BackingStore = {
  readonly view: () => DataView;
  readonly buffer: Signal<GPUBuffer>;
  markDirty(from: number, to: number): void;
  ensureCapacity(minByteLength: number): void;
  flush(): void;
};

type ItemWriterStore = Pick<BackingStore, "view" | "markDirty">;

const createValue = <T>(
  align: number,
  size: number,
  write: Value<T>["write"],
): Value<T> => ({
  kind: "value",
  align,
  size,
  stride: alignTo(size, align),
  write,
});

const defineValueProperty = <T>(
  item: { value: T },
  value: Value<T>,
  store: ItemWriterStore,
  baseOffset = 0,
) => {
  Object.defineProperty(item, "value", {
    enumerable: true,
    set(next: T) {
      value.write(store.view(), baseOffset, next);
      store.markDirty(baseOffset, baseOffset + value.size);
    },
  });
};

const createStructItemFactory = <S extends StructFields>(
  shape: Struct<S>,
  store: ItemWriterStore,
) => {
  const entries = Object.entries(shape.fields).map(([k, value]) => ({
    k,
    value,
    offset: shape.offsets[k] ?? 0,
  }));

  return (baseOffset = 0): StructView<S> => {
    const item = {} as StructView<S>;
    for (const {
      k,
      value: { write, size },
      offset,
    } of entries) {
      const abs = baseOffset + offset;
      Object.defineProperty(item, k, {
        enumerable: true,
        set(value: unknown) {
          write(store.view(), abs, value);
          store.markDirty(abs, abs + size);
        },
      });
    }
    return item;
  };
};

const createBackingStore = (
  device: GPUDevice,
  usage: GPUBufferUsageFlags,
  initialByteLength: number,
): BackingStore => {
  const bufferUsage = usage | GPUBufferUsage.COPY_DST;
  let bytes = new Uint8Array(initialByteLength);
  let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const gpu = createResizableBuffer(device, bufferUsage, bytes.byteLength);
  let dirtyFrom = Infinity;
  let dirtyTo = 0;

  const markDirty = (from: number, to: number) => {
    dirtyFrom = Math.min(dirtyFrom, from);
    dirtyTo = Math.max(dirtyTo, to);
  };

  const ensureCapacity = (minByteLength: number) => {
    if (bytes.byteLength >= minByteLength) return;
    const nextBytes = new Uint8Array(minByteLength);
    nextBytes.set(bytes);
    bytes = nextBytes;
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    gpu.ensureSize(nextBytes.byteLength);
  };

  const flush = () => {
    if (dirtyFrom >= dirtyTo) return;
    device.queue.writeBuffer(
      gpu.buffer(),
      dirtyFrom,
      bytes,
      dirtyFrom,
      dirtyTo - dirtyFrom,
    );
    dirtyFrom = Infinity;
    dirtyTo = 0;
  };

  return {
    view: () => view,
    buffer: gpu.buffer,
    markDirty,
    ensureCapacity,
    flush,
  };
};

export const f32 = (): Value<number> =>
  createValue(4, 4, (v, o, x) => v.setFloat32(o, x, true));

export const i32 = (): Value<number> =>
  createValue(4, 4, (v, o, x) => v.setInt32(o, x, true));

export const u32 = (): Value<number> =>
  createValue(4, 4, (v, o, x) => v.setUint32(o, x, true));

export const vec2f = (): Value<Vec2> =>
  createValue(8, 8, (v, o, [x, y]) => {
    v.setFloat32(o, x, true);
    v.setFloat32(o + 4, y, true);
  });

export const mat4f = (): Value<Float32Array> =>
  createValue(16, 64, (v, o, x) => {
    for (let i = 0; i < 16; i++) v.setFloat32(o + i * 4, x[i] ?? 0, true);
  });

export const vec4f = (): Value<Vec4> =>
  createValue(16, 16, (v, o, [r, g, b, a]) => {
    v.setFloat32(o, r, true);
    v.setFloat32(o + 4, g, true);
    v.setFloat32(o + 8, b, true);
    v.setFloat32(o + 12, a, true);
  });

export const position = (): Value<Vec3> =>
  createValue(4, 12, (view, offset, [lon, lat, alt]) => {
    const [x, y] = mercatorFromLonLat(lon, lat);
    view.setUint32(offset, x, true);
    view.setUint32(offset + 4, y, true);
    view.setFloat32(offset + 8, alt, true);
  });

export const struct = <S extends StructFields>(fields: S): Struct<S> => {
  const offsets: Record<string, number> = {};
  let cursor = 0;
  let maxAlign = 1;

  for (const [k, { align, size }] of Object.entries(fields)) {
    cursor = alignTo(cursor, align);
    offsets[k] = cursor;
    cursor += size;
    maxAlign = Math.max(maxAlign, align);
  }

  const size = alignTo(cursor, maxAlign);
  return {
    kind: "struct",
    align: maxAlign,
    size,
    stride: size,
    fields,
    offsets,
  };
};

export const array = <S extends ElementShape>(element: S): ArrayShape<S> => ({
  kind: "array",
  align: element.align,
  size: element.stride,
  stride: element.stride,
  element,
});

type BufferBase = {
  readonly buffer: Signal<GPUBuffer>;
  flush(): void;
};

export type ValueBuffer<T> = BufferBase & {
  value: T;
};

export type ShapeBuffer<S extends Shape> = BufferBase & {
  readonly value: ViewOf<S>;
};

export type BufferOf<S extends Shape> =
  S extends Value<infer T> ? ValueBuffer<T> : ShapeBuffer<S>;

const createValueBuffer = <T>(
  shape: Value<T>,
  store: BackingStore,
): ValueBuffer<T> => {
  const result = {
    value: undefined!,
    buffer: store.buffer,
    flush: store.flush,
  };
  defineValueProperty(result, shape, store);
  return result;
};

export function buffer<T>(
  shape: Value<T>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): ValueBuffer<T>;
export function buffer<S extends StructFields>(
  shape: Struct<S>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): ShapeBuffer<Struct<S>>;
export function buffer<S extends ElementShape>(
  shape: ArrayShape<S>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): ShapeBuffer<ArrayShape<S>>;
export function buffer(
  shape: Shape,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
):
  | ValueBuffer<unknown>
  | ShapeBuffer<Struct<StructFields> | ArrayShape<ElementShape>> {
  if (shape.kind === "array") {
    const result = createArrayView(shape, device, options);
    return {
      value: result,
      buffer: result.buffer,
      flush: result.flush,
    };
  }

  const store = createBackingStore(device, options.usage, shape.stride);

  if (shape.kind === "value") return createValueBuffer(shape, store);

  return {
    value: createStructItemFactory(shape, store)(),
    buffer: store.buffer,
    flush: store.flush,
  };
}

type ArrayResult<TItem> = {
  readonly stride: number;
  readonly items: TItem[];
  readonly buffer: Signal<GPUBuffer>;
  resize(n: number): void;
  flush(): void;
};

const createArrayCore = <TItem>(
  stride: number,
  store: BackingStore,
  initialCapacity: number,
  installItem: (items: TItem[], index: number) => void,
): ArrayResult<TItem> => {
  let capacity = Math.max(1, initialCapacity);
  let count = 0;
  const items: TItem[] = [];

  const grow = (required: number) => {
    let next = capacity;
    while (next < required) next *= 2;
    store.ensureCapacity(next * stride);
    capacity = next;
    store.markDirty(0, count * stride);
  };

  const resize = (n: number) => {
    const next = Math.max(0, n);
    if (next > capacity) grow(next);
    count = next;
    while (items.length < count) installItem(items, items.length);
  };

  return { stride, items, buffer: store.buffer, resize, flush: store.flush };
};

const createValueArrayView = <T>(
  element: Value<T>,
  stride: number,
  store: BackingStore,
  initialCapacity: number,
): ArrayResult<T> =>
  createArrayCore<T>(stride, store, initialCapacity, (items, index) => {
    const abs = index * stride;
    Object.defineProperty(items, index, {
      enumerable: true,
      set(value: T) {
        element.write(store.view(), abs, value);
        store.markDirty(abs, abs + element.size);
      },
    });
  });

const createStructArrayView = <S extends StructFields>(
  element: Struct<S>,
  stride: number,
  store: BackingStore,
  initialCapacity: number,
): ArrayResult<StructView<S>> => {
  const makeItem = createStructItemFactory(element, store);

  return createArrayCore<StructView<S>>(
    stride,
    store,
    initialCapacity,
    (items, index) => {
      items.push(makeItem(index * stride));
    },
  );
};

function createArrayView<T>(
  shape: ArrayShape<Value<T>>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): ArrayResult<T>;
function createArrayView<S extends StructFields>(
  shape: ArrayShape<Struct<S>>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): ArrayResult<StructView<S>>;
function createArrayView(
  shape: ArrayShape<ElementShape>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): ArrayResult<unknown>;
function createArrayView(
  shape: ArrayShape<ElementShape>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): ArrayResult<unknown> {
  const { element, stride } = shape;
  const initialCapacity = options.initialCapacity ?? 1;
  const store = createBackingStore(
    device,
    options.usage,
    initialCapacity * stride,
  );

  if (element.kind === "value")
    return createValueArrayView(element, stride, store, initialCapacity);

  return createStructArrayView(element, stride, store, initialCapacity);
}

export type SlotAllocator<S extends StructFields> = {
  readonly count: Signal<number>;
  readonly buffer: Signal<GPUBuffer>;
  allocate(): [item: StructView<S>, release: () => void];
  flush(): void;
};

export const createSlotAllocator = <S extends StructFields>(
  shape: Struct<S>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): SlotAllocator<S> => {
  const { stride } = shape;
  const store = createBackingStore(
    device,
    options.usage,
    (options.initialCapacity ?? 16) * stride,
  );

  const [count, setCount] = signal(0);
  let liveCount = 0;
  const movers = new Map<number, (slot: number) => void>();

  const entries = Object.entries(shape.fields).map(([k, value]) => ({
    k,
    value,
    offset: shape.offsets[k] ?? 0,
  }));

  const allocate = (): [StructView<S>, () => void] => {
    const slot = liveCount;
    const [getSlot, setSlot] = signal(slot);
    movers.set(slot, setSlot);
    liveCount++;
    setCount(liveCount);
    store.ensureCapacity(liveCount * stride);

    const item = {} as StructView<S>;
    for (const {
      k,
      value: { write, size },
      offset,
    } of entries)
      Object.defineProperty(item, k, {
        enumerable: true,
        set(value: unknown) {
          const abs = getSlot() * stride + offset;
          write(store.view(), abs, value);
          store.markDirty(abs, abs + size);
        },
      });

    const release = () => {
      const slot = getSlot();
      liveCount--;
      setCount(liveCount);

      if (slot !== liveCount) {
        const view = store.view();
        const bytes = new Uint8Array(
          view.buffer,
          view.byteOffset,
          view.byteLength,
        );
        bytes.copyWithin(
          slot * stride,
          liveCount * stride,
          (liveCount + 1) * stride,
        );
        store.markDirty(slot * stride, (slot + 1) * stride);

        const mover = movers.get(liveCount);
        if (mover) {
          mover(slot);
          movers.set(slot, mover);
        }
      }

      movers.delete(liveCount);
    };

    return [item, release];
  };

  return { count, buffer: store.buffer, allocate, flush: store.flush };
};
