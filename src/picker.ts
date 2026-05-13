import { createBuffer } from "./buffer";
import { createLock } from "./common";
import type { Context } from "./context";
import { lonLatFromMercator } from "./math";
import { derived } from "./reactive";
import { createTexture } from "./texture";

export type Picker = ReturnType<typeof createPicker>;

export const createPicker = (
  context: Pick<Context, "device" | "size" | "devicePixelRatio">,
) => {
  const { device, size, devicePixelRatio } = context;
  const textureSize = derived(() => {
    const [width, height] = size();
    return [width * devicePixelRatio, height * devicePixelRatio] as const;
  });

  const xyTexture = derived(() =>
    createTexture(device, {
      size: textureSize(),
      format: "rg32uint",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    }),
  );

  const zTexture = derived(() =>
    createTexture(device, {
      size: textureSize(),
      format: "r32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    }),
  );

  const idTexture = derived(() =>
    createTexture(device, {
      size: textureSize(),
      format: "r32uint",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    }),
  );

  const depthTexture = derived(() =>
    createTexture(device, {
      size: textureSize(),
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const xyView = () => xyTexture().createView();
  const zView = () => zTexture().createView();
  const idView = () => idTexture().createView();
  const depthView = () => depthTexture().createView();

  const xyReadBuffer = createBuffer(device, {
    size: 256,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const zReadBuffer = createBuffer(device, {
    size: 256,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const idReadBuffer = createBuffer(device, {
    size: 256,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const lock = createLock();
  const pick = async (px: number, py: number) => {
    const release = await lock();

    try {
      const [width, height] = size();
      const maxX = Math.max(0, Math.floor(width * devicePixelRatio) - 1);
      const maxY = Math.max(0, Math.floor(height * devicePixelRatio) - 1);

      const origin = [
        Math.min(Math.max(0, Math.floor(px * devicePixelRatio)), maxX),
        Math.min(Math.max(0, Math.floor(py * devicePixelRatio)), maxY),
        0,
      ] as const;

      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: xyTexture(), origin },
        { buffer: xyReadBuffer, bytesPerRow: 256 },
        [1, 1, 1],
      );
      encoder.copyTextureToBuffer(
        { texture: zTexture(), origin },
        { buffer: zReadBuffer, bytesPerRow: 256 },
        [1, 1, 1],
      );
      encoder.copyTextureToBuffer(
        { texture: idTexture(), origin },
        { buffer: idReadBuffer, bytesPerRow: 256 },
        [1, 1, 1],
      );
      device.queue.submit([encoder.finish()]);

      await Promise.all([
        xyReadBuffer.mapAsync(GPUMapMode.READ),
        zReadBuffer.mapAsync(GPUMapMode.READ),
        idReadBuffer.mapAsync(GPUMapMode.READ),
      ]);

      const [x = 0, y = 0] = new Uint32Array(xyReadBuffer.getMappedRange(0, 8));
      const [z = 0] = new Float32Array(zReadBuffer.getMappedRange(0, 4));
      const [id = 0xffffffff] = new Uint32Array(
        idReadBuffer.getMappedRange(0, 4),
      );

      const [lon, lat] = lonLatFromMercator(x, y);

      xyReadBuffer.unmap();
      zReadBuffer.unmap();
      idReadBuffer.unmap();

      return { position: [lon, lat, z] as const, id };
    } finally {
      release();
    }
  };

  return {
    pick,
    xyView,
    zView,
    idView,
    depthView,
  };
};
