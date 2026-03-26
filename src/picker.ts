import { createLock } from "./common";
import type { Context } from "./context";
import { effect, onCleanup } from "./reactive";

export const createPicker = (context: Context) => {
  const { device, size } = context;

  const createPositionTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      format: "rgba32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

  const createPickTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      format: "r32uint",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

  const createDepthTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

  let positionTexture = createPositionTexture([1, 1]);
  let pickTexture = createPickTexture([1, 1]);
  let depthTexture = createDepthTexture([1, 1]);

  const positionView = () => positionTexture.createView();
  const pickView = () => pickTexture.createView();
  const depthView = () => depthTexture.createView();

  effect(() => {
    const [width, height] = size();
    positionTexture.destroy();
    pickTexture.destroy();
    depthTexture.destroy();
    positionTexture = createPositionTexture([width, height]);
    pickTexture = createPickTexture([width, height]);
    depthTexture = createDepthTexture([width, height]);
  });

  const positionReadBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const pickReadBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const lock = createLock();
  const pick = async (px: number, py: number) => {
    const release = await lock();

    try {
      const origin = [Math.floor(px), Math.floor(py), 0] as const;

      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: positionTexture, origin },
        { buffer: positionReadBuffer, bytesPerRow: 256 },
        [1, 1, 1],
      );
      encoder.copyTextureToBuffer(
        { texture: pickTexture, origin },
        { buffer: pickReadBuffer, bytesPerRow: 256 },
        [1, 1, 1],
      );
      device.queue.submit([encoder.finish()]);

      await Promise.all([
        positionReadBuffer.mapAsync(GPUMapMode.READ),
        pickReadBuffer.mapAsync(GPUMapMode.READ),
      ]);

      const [x = 0, y = 0, z = 0] = new Float32Array(
        positionReadBuffer.getMappedRange(),
      );

      const [id = 0xffffffff] = new Uint32Array(
        pickReadBuffer.getMappedRange(),
      );

      positionReadBuffer.unmap();
      pickReadBuffer.unmap();

      return { position: [x, y, z] as const, id };
    } finally {
      release();
    }
  };

  onCleanup(() => {
    positionTexture.destroy();
    pickTexture.destroy();
    depthTexture.destroy();
    positionReadBuffer.destroy();
    pickReadBuffer.destroy();
  });

  return {
    pick,
    positionView,
    pickView,
    depthView,
  };
};
