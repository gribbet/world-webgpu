import type { Context } from "./context";
import { derived, onCleanup } from "./reactive";

export const createRenderer = (context: Context) => {
  const { device, size, devicePixelRatio, format, sampleCount } = context;

  const createTexture = (
    format: GPUTextureFormat,
    usage: GPUTextureUsageFlags,
  ) =>
    derived(() => {
      const [width, height] = size();
      const texture = device.createTexture({
        size: [width * devicePixelRatio, height * devicePixelRatio],
        sampleCount,
        format,
        usage,
      });
      onCleanup(() => texture.destroy());
      return texture;
    });

  const renderTexture = createTexture(
    format,
    GPUTextureUsage.RENDER_ATTACHMENT,
  );
  const depthTexture = createTexture(
    "depth24plus",
    GPUTextureUsage.RENDER_ATTACHMENT,
  );

  const renderView = () => renderTexture().createView();
  const depthView = () => depthTexture().createView();

  return {
    renderView,
    depthView,
  };
};
