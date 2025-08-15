import { createImageLoad } from "./image-load";

export type TileTexture = ReturnType<typeof createTileTexture>;

export const createTileTexture = ({
  device,
  url,
  onLoad,
}: {
  device: GPUDevice;
  url: string;
  onLoad?: () => void;
}) => {
  const texture = device.createTexture({
    size: [256, 256],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const imageLoad = createImageLoad({
    url,
    onLoad: async image => {
      if (!image) return;
      device.queue.copyExternalImageToTexture(
        { source: image },
        { texture, origin: { x: 0, y: 0, z: 0 } },
        { width: 256, height: 256 },
      );
      await device.queue.onSubmittedWorkDone();

      onLoad?.();
    },
  });

  const destroy = () => {
    imageLoad.cancel();
    texture.destroy();
  };

  return {
    get loaded() {
      return imageLoad.loaded;
    },
    get texture() {
      return texture;
    },
    destroy,
  };
};
