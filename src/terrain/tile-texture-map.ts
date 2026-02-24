import type { Vec3 } from "../model";
import { fromKey, toKey } from "./common";
import { createLru } from "./lru";
import type { TextureLoader } from "./texture-loader";
import { createTileCache } from "./tile-cache";
import { createTileMapBuffer } from "./tile-map-buffer";

export type TileTextureMap = ReturnType<typeof createTileTextureMap>;

export const createTileTextureMap = ({
  urlPattern,
  device,
  textureLoader,
  textures,
  mapBuffer,
}: {
  urlPattern: string;
  device: GPUDevice;
  textureLoader: TextureLoader;
  textures: GPUTexture;
  mapBuffer: GPUBuffer;
}) => {
  const cache = createTileCache({ device, textureLoader, urlPattern });
  const open = new Array(256).fill(0).map((_, i) => i);

  const tileMapBuffer = createTileMapBuffer(device, mapBuffer);

  const mapping = createLru<number, { index?: number; texture: GPUTexture }>({
    maxSize: 256,
    onEviction: (key, { index }) => {
      if (index !== undefined) open.push(index);
      tileMapBuffer.clear(fromKey(key));
    },
  });

  const get = (xyz: Vec3) => {
    const key = toKey(xyz);

    const mapped = mapping.get(key);
    if (mapped !== undefined) return mapped.index;

    const { texture, loaded } = cache.get(xyz) ?? {};
    if (!texture || !loaded) return undefined;

    const index = open.shift();
    mapping.set(key, { index, texture });
    if (index === undefined) return undefined;

    const encoder = device.createCommandEncoder();
    encoder.copyTextureToTexture(
      { texture },
      { texture: textures, origin: { z: index } },
      { width: 256, height: 256 },
    );
    device.queue.submit([encoder.finish()]);

    tileMapBuffer.set(xyz, index);

    return index;
  };

  const destroy = () => mapping.clear();

  return { get, destroy };
};
