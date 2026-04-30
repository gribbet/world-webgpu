import type { Context } from "./context";
import { derived } from "./reactive";
import { createTexture } from "./texture";

export const createRenderer = (context: Context) => {
  const { device, size, devicePixelRatio, format, sampleCount } = context;

  const textureSize = derived(() => {
    const [width, height] = size();
    return [width * devicePixelRatio, height * devicePixelRatio] as const;
  });

  const renderTexture = derived(() =>
    createTexture(device, {
      size: textureSize(),
      sampleCount,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const depthTexture = derived(() =>
    createTexture(device, {
      size: textureSize(),
      sampleCount,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const renderView = () => renderTexture().createView();
  const depthView = () => depthTexture().createView();

  return {
    renderView,
    depthView,
  };
};
