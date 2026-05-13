import { createResizableBuffer } from "./buffer";
import { mercatorFromLonLat } from "./math";
import type { Vec2, Vec3, Vec4 } from "./model";
import { type Accessor, createSignal } from "./reactive";

type Field<T> = {
  readonly align: number;
  readonly size: number;
  write(view: DataView, offset: number, value: T): void;
};

type Shape = Record<string, Field<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
type ValueOfField<F> = F extends Field<infer T> ? T : never;
export type ItemView<S extends Shape> = { [K in keyof S]: ValueOfField<S[K]> };

const alignTo = (n: number, a: number) => Math.ceil(n / a) * a;

type BackingStore = {
  readonly view: () => DataView;
  readonly buffer: Accessor<GPUBuffer>;
  markDirty(from: number, to: number): void;
  ensureCapacity(minByteLength: number): void;
  flush(): void;
};

type ItemWriterStore = Pick<BackingStore, "view" | "markDirty">;

export type StructDef<S extends Shape> = {
  readonly stride: number;
  readonly shape: S;
  readonly offsets: Record<string, number>;
};

const createStructItemFactory = <S extends Shape>(
  def: StructDef<S>,
  store: ItemWriterStore,
) => {
  const entries = Object.entries(def.shape).map(([k, field]) => ({
    k,
    field,
    offset: def.offsets[k] ?? 0,
  }));

  return (baseOffset = 0): ItemView<S> => {
    const item = {} as ItemView<S>;
    for (const {
      k,
      field: { write, size },
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

export const f32 = (): Field<number> => ({
  align: 4,
  size: 4,
  write: (v, o, x) => v.setFloat32(o, x, true),
});

export const i32 = (): Field<number> => ({
  align: 4,
  size: 4,
  write: (v, o, x) => v.setInt32(o, x, true),
});

export const u32 = (): Field<number> => ({
  align: 4,
  size: 4,
  write: (v, o, x) => v.setUint32(o, x, true),
});

export const vec2f = (): Field<Vec2> => ({
  align: 8,
  size: 8,
  write: (v, o, [x, y]) => {
    v.setFloat32(o, x, true);
    v.setFloat32(o + 4, y, true);
  },
});

export const mat4f = (): Field<Float32Array> => ({
  align: 16,
  size: 64,
  write: (v, o, x) => {
    for (let i = 0; i < 16; i++) v.setFloat32(o + i * 4, x[i] ?? 0, true);
  },
});

export const vec4f = (): Field<Vec4> => ({
  align: 16,
  size: 16,
  write: (v, o, [r, g, b, a]) => {
    v.setFloat32(o, r, true);
    v.setFloat32(o + 4, g, true);
    v.setFloat32(o + 8, b, true);
    v.setFloat32(o + 12, a, true);
  },
});

export const position = (): Field<Vec3> => ({
  align: 4,
  size: 12,
  write: (view, offset, [lon, lat, alt]) => {
    const [x, y] = mercatorFromLonLat(lon, lat);
    view.setUint32(offset, x, true);
    view.setUint32(offset + 4, y, true);
    view.setFloat32(offset + 8, alt, true);
  },
});

export const struct = <S extends Shape>(shape: S): StructDef<S> => {
  const offsets: Record<string, number> = {};
  let cursor = 0;
  let maxAlign = 1;

  for (const [k, { align, size }] of Object.entries(shape)) {
    cursor = alignTo(cursor, align);
    offsets[k] = cursor;
    cursor += size;
    maxAlign = Math.max(maxAlign, align);
  }

  return { stride: alignTo(cursor, maxAlign), shape, offsets };
};

export type StructBuffer<S extends Shape> = {
  readonly item: ItemView<S>;
  readonly buffer: Accessor<GPUBuffer>;
  flush(): void;
};

export const buffer = <S extends Shape>(
  shape: S,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags },
): StructBuffer<S> => {
  const def = struct(shape);
  const { stride } = def;
  const store = createBackingStore(device, options.usage, stride);
  const { buffer: gpuBuffer, flush, markDirty, view } = store;
  const makeItem = createStructItemFactory(def, { markDirty, view });
  const item = makeItem();

  return { item, buffer: gpuBuffer, flush };
};

type ArrayResult<TItem> = {
  readonly stride: number;
  readonly items: TItem[];
  readonly buffer: Accessor<GPUBuffer>;
  resize(n: number): void;
  flush(): void;
};

export type StructArray<S extends Shape> = ArrayResult<ItemView<S>>;
export type ScalarArray<T> = ArrayResult<T>;

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

const createStructArray = <S extends Shape>(
  def: StructDef<S>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): StructArray<S> => {
  const { stride } = def;
  const store = createBackingStore(
    device,
    options.usage,
    (options.initialCapacity ?? 1) * stride,
  );
  const makeItem = createStructItemFactory(def, store);

  return createArrayCore<ItemView<S>>(
    stride,
    store,
    options.initialCapacity ?? 1,
    (items, index) => {
      items.push(makeItem(index * stride));
    },
  );
};

export const structArray = createStructArray;

export type SlotAllocator<S extends Shape> = {
  readonly count: Accessor<number>;
  readonly buffer: Accessor<GPUBuffer>;
  allocate(): [item: ItemView<S>, release: () => void];
  flush(): void;
};

export const createSlotAllocator = <S extends Shape>(
  def: StructDef<S>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): SlotAllocator<S> => {
  const { stride } = def;
  const store = createBackingStore(
    device,
    options.usage,
    (options.initialCapacity ?? 16) * stride,
  );

  const [count, setCount] = createSignal(0);
  let liveCount = 0;
  const movers = new Map<number, (slot: number) => void>();

  const entries = Object.entries(def.shape).map(([k, field]) => ({
    k,
    field,
    offset: def.offsets[k] ?? 0,
  }));

  const allocate = (): [ItemView<S>, () => void] => {
    const slot = liveCount;
    const [getSlot, setSlot] = createSignal(slot);
    movers.set(slot, setSlot);
    liveCount++;
    setCount(liveCount);
    store.ensureCapacity(liveCount * stride);

    const item = {} as ItemView<S>;
    for (const {
      k,
      field: { write, size },
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

export const array = <T>(
  field: Field<T>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): ScalarArray<T> => {
  const { align, size, write } = field;
  const stride = alignTo(size, align);
  const store = createBackingStore(
    device,
    options.usage,
    (options.initialCapacity ?? 1) * stride,
  );

  return createArrayCore<T>(
    stride,
    store,
    options.initialCapacity ?? 1,
    (items, index) => {
      const abs = index * stride;
      Object.defineProperty(items, index, {
        enumerable: true,
        set(value: T) {
          write(store.view(), abs, value);
          store.markDirty(abs, abs + size);
        },
      });
    },
  );
};
