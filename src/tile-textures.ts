import type { Vec3 } from "./model";
import type { TextureLoader } from "./texture-loader";
import { createTextureMap } from "./texture-map";
import { createTileCache } from "./tile-cache";

export const createTileTextures = ({
  urlPattern,
  device,
  textureLoader,
  textureIndicesBuffer,
  textures,
  initialDownsample = 0,
}: {
  urlPattern: string;
  device: GPUDevice;
  textureLoader: TextureLoader;
  textureIndicesBuffer: GPUBuffer;
  textures: GPUTexture;
  initialDownsample?: number;
}) => {
  const cache = createTileCache({ device, textureLoader, urlPattern });
  const map = createTextureMap({ device, textures });

  const get = ([x = 0, y = 0, z = 0]) => {
    for (
      let downsample = Math.min(z, initialDownsample);
      downsample <= z;
      downsample++
    ) {
      const k = 2 ** downsample;
      const xyz: Vec3 = [Math.floor(x / k), Math.floor(y / k), z - downsample];
      const texture = cache.get(xyz);
      if (!texture) continue;
      const index = map.get(texture.texture);
      if (index === undefined) continue;
      return [index, downsample];
    }
  };

  const update = async (tiles: [number, number, number][]) => {
    const data = tiles.flatMap(_ => get(_) ?? [0, 0]);
    const { queue } = device;
    queue.writeBuffer(textureIndicesBuffer, 0, new Uint32Array(data));
    await queue.onSubmittedWorkDone();
  };

  const destroy = () => {
    cache.destroy();
    map.destroy();
  };

  return { update, destroy };
};
