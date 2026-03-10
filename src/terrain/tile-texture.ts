import type { Vec3 } from "../model";
import { createImageLoad } from "./image-load";
import type { TextureLoader } from "./texture-loader";

export type TileTexture = ReturnType<typeof createTileTexture>;

export const createTileTexture = ({
  device,
  urlPattern,
  xyz,
  mipLevelCount = 1,
  textureLoader,
  onLoad,
}: {
  device: GPUDevice;
  urlPattern: string;
  xyz: Vec3;
  mipLevelCount?: number;
  textureLoader: TextureLoader;
  onLoad?: () => void;
}) => {
  let loaded = false;
  const texture = device.createTexture({
    size: [256, 256],
    format: "rgba8unorm",
    mipLevelCount,
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING,
  });

  const [x = 0, y = 0, z = 0] = xyz;

  const getUrl = (x: number, y: number, z: number) =>
    urlPattern
      .replace("{x}", `${x}`)
      .replace("{y}", `${y}`)
      .replace("{z}", `${z}`);

  let loadedMips = 0;
  const mips = new Array(mipLevelCount)
    .fill(0)
    .map((_, i) => i)
    .filter(i => z - i >= 0);

  const imageLoads = mips.map(i => {
    const mz = z - i;
    const k = 1 << i;
    const rx = x % k;
    const ry = y % k;
    const mx = x >> i;
    const my = y >> i;
    const url = getUrl(mx, my, mz);
    const size = 256 >> i;

    return createImageLoad({
      url,
      crop: [rx * size, ry * size, size, size],
      onLoad: async image => {
        if (!image) return;
        await textureLoader.load(texture, image, i);
        loadedMips++;
        if (loadedMips !== mips.length) return;
        loaded = true;
        onLoad?.();
      },
    });
  });

  const destroy = () => {
    imageLoads.forEach(_ => _.cancel());
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
