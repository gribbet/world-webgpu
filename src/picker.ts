import { createLock } from "./common";
import type { Context } from "./context";
import { lonLatFromMercator } from "./math";
import type { Vec2 } from "./model";
import { effect, onCleanup } from "./reactive";

export const createPicker = (context: Context) => {
  const { device, size, devicePixelRatio } = context;

  const createXyTexture = (size: Vec2) =>
    device.createTexture({
      size,
      format: "rg32uint",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

  const createZTexture = (size: Vec2) =>
    device.createTexture({
      size,
      format: "r32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

  const createIdTexture = (size: Vec2) =>
    device.createTexture({
      size,
      format: "r32uint",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    });

  const createDepthTexture = (size: Vec2) =>
    device.createTexture({
      size,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

  let xyTexture = createXyTexture([1, 1]);
  let zTexture = createZTexture([1, 1]);
  let idTexture = createIdTexture([1, 1]);
  let depthTexture = createDepthTexture([1, 1]);

  const xyView = () => xyTexture.createView();
  const zView = () => zTexture.createView();
  const idView = () => idTexture.createView();
  const depthView = () => depthTexture.createView();

  effect(() => {
    const [width, height] = size();
    const w = width * devicePixelRatio;
    const h = height * devicePixelRatio;
    xyTexture.destroy();
    zTexture.destroy();
    idTexture.destroy();
    depthTexture.destroy();
    xyTexture = createXyTexture([w, h]);
    zTexture = createZTexture([w, h]);
    idTexture = createIdTexture([w, h]);
    depthTexture = createDepthTexture([w, h]);
  });

  const xyReadBuffer = device.createBuffer({
    size: 256,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const zReadBuffer = device.createBuffer({
    size: 256,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const idReadBuffer = device.createBuffer({
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
        { texture: xyTexture, origin },
        { buffer: xyReadBuffer, bytesPerRow: 256 },
        [1, 1, 1],
      );
      encoder.copyTextureToBuffer(
        { texture: zTexture, origin },
        { buffer: zReadBuffer, bytesPerRow: 256 },
        [1, 1, 1],
      );
      encoder.copyTextureToBuffer(
        { texture: idTexture, origin },
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

  onCleanup(() => {
    xyTexture.destroy();
    zTexture.destroy();
    idTexture.destroy();
    depthTexture.destroy();
    xyReadBuffer.destroy();
    zReadBuffer.destroy();
    idReadBuffer.destroy();
  });

  return {
    pick,
    xyView,
    zView,
    idView,
    depthView,
  };
};
