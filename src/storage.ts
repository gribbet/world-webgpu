import type { Vec3, Vec4 } from "./model";
import type { Accessor } from "./reactive";
import { createSignal } from "./reactive";

type Field<T> = {
  readonly align: number;
  readonly size: number;
  write(view: DataView, offset: number, value: T): void;
};

type Shape = Record<string, Field<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
type ValueOfField<F> = F extends Field<infer T> ? T : never;
export type ItemView<S extends Shape> = { [K in keyof S]: ValueOfField<S[K]> };

const alignTo = (n: number, a: number) => Math.ceil(n / a) * a;

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

export type StructArray<S extends Shape> = {
  readonly stride: number;
  readonly items: ItemView<S>[];
  readonly buffer: Accessor<GPUBuffer>;
  setCount(n: number): void;
  flush(): void;
  destroy(): void;
};

export const array = <S extends Shape>(
  def: StructDef<S>,
  device: GPUDevice,
  options: { usage: GPUBufferUsageFlags; initialCapacity?: number },
): StructArray<S> => {
  const { stride, shape, offsets } = def;
  const usage = options.usage | GPUBufferUsage.COPY_DST;
  let capacity = Math.max(1, options.initialCapacity ?? 1);
  let count = 0;
  let dirtyFrom = Infinity;
  let dirtyTo = 0;
  let bytes = new Uint8Array(capacity * stride);
  let gpuBuffer = device.createBuffer({ size: bytes.byteLength, usage });

  const [buffer, setBuffer] = createSignal(gpuBuffer);
  const items: ItemView<S>[] = [];

  const makeItem = (baseOffset: number): ItemView<S> => {
    const item = {} as ItemView<S>;
    for (const k in shape) {
      const { write } = shape[k]!;
      const abs = baseOffset + offsets[k]!;
      Object.defineProperty(item, k, {
        enumerable: true,
        set(value: unknown) {
          write(
            new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            abs,
            value,
          );
          dirtyFrom = Math.min(dirtyFrom, baseOffset);
          dirtyTo = Math.max(dirtyTo, baseOffset + stride);
        },
      });
    }
    return item;
  };

  const grow = (required: number) => {
    let next = capacity;
    while (next < required) next *= 2;
    const nextBytes = new Uint8Array(next * stride);
    nextBytes.set(bytes);
    gpuBuffer.destroy();
    gpuBuffer = device.createBuffer({ size: nextBytes.byteLength, usage });
    bytes = nextBytes;
    capacity = next;
    setBuffer(gpuBuffer);
    dirtyFrom = 0;
    dirtyTo = count * stride;
  };

  const setCount = (n: number) => {
    const next = Math.max(0, n);
    if (next > capacity) grow(next);
    count = next;
    while (items.length < count) items.push(makeItem(items.length * stride));
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

  const destroy = () => {
    gpuBuffer.destroy();
  };

  return { stride, items, buffer, setCount, flush, destroy };
};
