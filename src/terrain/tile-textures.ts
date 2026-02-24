import type { Vec3 } from "../model";
import type { TextureLoader } from "./texture-loader";
import { createTileTextureMap } from "./tile-texture-map";

export type TileTextures = ReturnType<typeof createTileTextures>;

export const createTileTextures = ({
  urlPattern,
  device,
  textureLoader,
  mapBuffer,
  textures,
  initialDownsample = 0,
}: {
  urlPattern: string;
  device: GPUDevice;
  textureLoader: TextureLoader;
  mapBuffer: GPUBuffer;
  textures: GPUTexture;
  initialDownsample?: number;
}) => {
  const map = createTileTextureMap({
    urlPattern,
    device,
    textureLoader,
    textures,
    mapBuffer,
  });

  const get = ([x, y, z]: Vec3) => {
    for (
      let downsample = Math.min(z, initialDownsample);
      downsample <= z;
      downsample++
    ) {
      const k = 2 ** downsample;
      const xyz: Vec3 = [Math.floor(x / k), Math.floor(y / k), z - downsample];
      map.get(xyz);
    }
  };

  const update = (tiles: Vec3[]) => tiles.forEach(get);

  const destroy = () => {
    map.destroy();
  };

  return { update, destroy };
};
