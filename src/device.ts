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
  return buffer;
};
