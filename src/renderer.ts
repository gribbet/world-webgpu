import type { Context } from "./context";
import { effect, onCleanup } from "./reactive";

export const createRenderer = (context: Context) => {
  const { device, size, format, sampleCount } = context;

  const createRenderTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      sampleCount,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const createDepthTexture = (size: [number, number]) =>
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
    renderTexture.destroy();
    depthTexture.destroy();
    renderTexture = createRenderTexture([width, height]);
    depthTexture = createDepthTexture([width, height]);
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
