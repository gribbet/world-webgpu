import type { Vec2, Vec3, Vec4 } from "./model";
import type { Accessor } from "./reactive";
import { createSignal, onCleanup } from "./reactive";

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

const createItemFactory = <S extends Shape>(
  shape: S,
  store: ItemWriterStore,
) => {
  const { offsets } = struct(shape);

  return (baseOffset = 0): ItemView<S> => {
    const item = {} as ItemView<S>;
    for (const k in shape) {
      const { write, size } = shape[k]!;
      const abs = baseOffset + offsets[k]!;
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
  let gpuBuffer = device.createBuffer({
    size: bytes.byteLength,
    usage: bufferUsage,
  });
  const [buffer, setBuffer] = createSignal(gpuBuffer);
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
    gpuBuffer.destroy();
    gpuBuffer = device.createBuffer({
      size: nextBytes.byteLength,
      usage: bufferUsage,
    });
    bytes = nextBytes;
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    setBuffer(gpuBuffer);
  };

  const flush = () => {
    if (dirtyFrom >= dirtyTo) return;
    device.queue.writeBuffer(
      gpuBuffer,
      dirtyFrom,
      bytes,
      dirtyFrom,
      dirtyTo - dirtyFrom,
    );
    dirtyFrom = Infinity;
    dirtyTo = 0;
  };

  onCleanup(() => gpuBuffer.destroy());

  return {
    view: () => view,
    buffer,
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
    for (let i = 0; i < 16; i++) v.setFloat32(o + i * 4, x[i]!, true);
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
    const latRad = (lat * Math.PI) / 180;
    const mx = (lon + 180) / 360;
    const my =
      0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);
    view.setUint32(offset, Math.floor(mx * 2 ** 31), true);
    view.setUint32(offset + 4, Math.floor(my * 2 ** 31), true);
    view.setFloat32(offset + 8, alt, true);
  },
});

export type StructDef<S extends Shape> = {
  readonly stride: number;
  readonly shape: S;
  readonly offsets: Record<string, number>;
};

export const struct = <S extends Shape>(shape: S): StructDef<S> => {
  const offsets: Record<string, number> = {};
  let cursor = 0;
  let maxAlign = 1;

  for (const k in shape) {
    const { align, size } = shape[k]!;
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
  const { stride } = struct(shape);
  const store = createBackingStore(device, options.usage, stride);
  const { buffer: gpuBuffer, flush, markDirty, view } = store;
  const makeItem = createItemFactory(shape, { markDirty, view });
  const item = makeItem();

  return { item, buffer: gpuBuffer, flush };
};

export type StructArray<S extends Shape> = {
  readonly stride: number;
  readonly items: ItemView<S>[];
  readonly buffer: Accessor<GPUBuffer>;
  resize(n: number): void;
  flush(): void;
};

export const array = <S extends Shape>(
  def: StructDef<S>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): StructArray<S> => {
  const { stride, shape } = def;
  let capacity = Math.max(1, options.initialCapacity ?? 1);
  let count = 0;
  const store = createBackingStore(device, options.usage, capacity * stride);
  const items: ItemView<S>[] = [];
  const makeItem = createItemFactory(shape, store);

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
    while (items.length < count) items.push(makeItem(items.length * stride));
  };

  return { stride, items, buffer: store.buffer, resize, flush: store.flush };
};
