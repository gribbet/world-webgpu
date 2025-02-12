export const createBuffer = (
  device: GPUDevice,
  usage: GPUBufferUsageFlags,
  data: ArrayLike<number> & ArrayBuffer,
) => {
  const buffer = device.createBuffer({
    size: 16 * Math.ceil(data.byteLength / 16),
    usage: usage | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  const Array =
    data instanceof Uint32Array
      ? Uint32Array
      : data instanceof Int32Array
        ? Int32Array
        : data instanceof Float32Array
          ? Float32Array
          : undefined;
  if (!Array) throw "unexpected";
  new Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
};
