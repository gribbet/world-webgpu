import { createImageLoad } from "./image-load";
import type { TextureLoader } from "./texture-loader";

export type TileTexture = ReturnType<typeof createTileTexture>;

export const createTileTexture = ({
  device,
  url,
  textureLoader,
  onLoad,
}: {
  device: GPUDevice;
  url: string;
  textureLoader: TextureLoader;
  onLoad?: () => void;
}) => {
  let loaded = false;
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
      await textureLoader.queue(texture, image);
      image.close();
      onLoad?.();
      loaded = true;
    },
  });

  const destroy = () => {
    imageLoad.cancel();
    texture.destroy();
  };

  return {
    get loaded() {
      return loaded;
    },
    get texture() {
      return texture;
    },
    destroy,
  };
};
