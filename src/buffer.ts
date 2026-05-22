import { onCleanup, signal } from "signals.ts";

export const createBuffer = (
  device: GPUDevice,
  descriptor: GPUBufferDescriptor,
  { cleanup = true }: { cleanup?: boolean } = {},
): GPUBuffer => {
  const buffer = device.createBuffer(descriptor);
  if (cleanup) onCleanup(() => buffer.destroy());
  return buffer;
};

export const createDataBuffer = (
  device: GPUDevice,
  usage: GPUBufferUsageFlags,
  data: ArrayBufferView,
) => {
  const buffer = createBuffer(device, {
    size: (data.byteLength + 3) & ~3,
    usage: usage | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  );
  buffer.unmap();
  return buffer;
};

export const createResizableBuffer = (
  device: GPUDevice,
  usage: GPUBufferUsageFlags,
  initialSize: number,
) => {
  let size = Math.max(4, (initialSize + 3) & ~3);
  let buffer = createBuffer(device, { size, usage }, { cleanup: false });
  const [Signal, setBuffer] = signal(buffer);

  const ensureSize = (requiredSize: number) => {
    const required = Math.max(4, (requiredSize + 3) & ~3);
    if (required <= size) return;

    let next = size;
    while (next < required) next *= 2;

    buffer.destroy();
    buffer = createBuffer(device, { size: next, usage }, { cleanup: false });
    size = next;
    setBuffer(buffer);
  };

  onCleanup(() => buffer.destroy());

  return {
    buffer: Signal,
    ensureSize,
  };
};
