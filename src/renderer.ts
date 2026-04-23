import type { Context } from "./context";
import type { Vec2 } from "./model";
import { effect, onCleanup } from "./reactive";

export const createRenderer = (context: Context) => {
  const { device, size, devicePixelRatio, format, sampleCount } = context;

  const createRenderTexture = (size: Vec2) =>
    device.createTexture({
      size,
      sampleCount,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const createDepthTexture = (size: Vec2) =>
    device.createTexture({
      size,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      sampleCount,
    });

  let renderTexture = createRenderTexture([1, 1]);
  let depthTexture = createDepthTexture([1, 1]);

  effect(() => {
    const [width, height] = size();
    const w = width * devicePixelRatio;
    const h = height * devicePixelRatio;
    renderTexture.destroy();
    depthTexture.destroy();
    renderTexture = createRenderTexture([w, h]);
    depthTexture = createDepthTexture([w, h]);
  });

  const renderView = () => renderTexture.createView();
  const depthView = () => depthTexture.createView();

  onCleanup(() => {
    renderTexture.destroy();
    depthTexture.destroy();
  });

  return {
    renderView,
    depthView,
  };
};
