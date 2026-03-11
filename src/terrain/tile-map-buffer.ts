import type { Vec3 } from "../model";

export const createTileMapBuffer = (device: GPUDevice, buffer: GPUBuffer) => {
  const size = Math.floor(buffer.size / 16);
  const data = new Uint32Array(size * 4).fill(0xffffffff);

  const equals = ([ax, ay, az]: Vec3, [bx, by, bz]: Vec3) =>
    ax === bx && ay === by && az === bz;

  const getEntry = (i: number) => {
    const [x = 0, y = 0, z = 0, index = 0] = data.subarray(i * 4, i * 4 + 4);
    return x === 0xffffffff ? undefined : { xyz: [x, y, z] as Vec3, index };
  };

  const clearEntry = (i: number) => {
    data.set([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff], i * 4);
  };

  const setEntry = (i: number, xyz: Vec3, index: number) => {
    data.set([...xyz, index], i * 4);
  };

  const stagingBuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  const update = (encoder: GPUCommandEncoder) => {
    device.queue.writeBuffer(stagingBuffer, 0, data);
    encoder.copyBufferToBuffer(stagingBuffer, 0, buffer, 0, buffer.size);
  };

  const clear = (xyz: Vec3) => set(xyz, -1);

  const set = (xyz: Vec3, index: number) => {
    let i = hash(xyz);
    for (; ; i = (i + 1) % size) {
      const { xyz: next } = getEntry(i) ?? {};
      if (!next || equals(xyz, next)) break;
    }

    if (index >= 0) setEntry(i, xyz, index);
    else if (getEntry(i)) {
      clearEntry(i);
      for (let j = (i + 1) % size; getEntry(j); j = (j + 1) % size) {
        const { xyz, index = 0 } = getEntry(j) ?? {};
        clearEntry(j);
        if (xyz) set(xyz, index);
      }
    }
  };

  const hash = ([x, y, z]: Vec3) => {
    const p1 = 73856093;
    const p2 = 19349663;
    const p3 = 83492791;
    const h = (Math.imul(x, p1) ^ Math.imul(y, p2) ^ Math.imul(z, p3)) >>> 0;
    return h % size;
  };

  return { set, clear, update };
};
