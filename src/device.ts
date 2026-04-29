import { createSignal, onCleanup } from "./reactive";

export const createBuffer = (
  device: GPUDevice,
  usage: GPUBufferUsageFlags,
  data: ArrayBufferView,
) => {
  const buffer = device.createBuffer({
    size: (data.byteLength + 3) & ~3,
    usage: usage | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  );
  buffer.unmap();
  onCleanup(() => buffer.destroy());
  return buffer;
};

export const createResizableBuffer = (
  device: GPUDevice,
  usage: GPUBufferUsageFlags,
  initialSize: number,
) => {
  let size = Math.max(4, (initialSize + 3) & ~3);
  let buffer = device.createBuffer({ size, usage });
  const [accessor, setBuffer] = createSignal(buffer);

  const ensureSize = (requiredSize: number) => {
    const required = Math.max(4, (requiredSize + 3) & ~3);
    if (required <= size) return;

    let next = size;
    while (next < required) next *= 2;

    buffer.destroy();
    buffer = device.createBuffer({ size: next, usage });
    size = next;
    setBuffer(buffer);
  };

  onCleanup(() => buffer.destroy());

  return {
    buffer: accessor,
    ensureSize,
  };
};
