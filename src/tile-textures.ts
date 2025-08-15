import QuickLRU from "quick-lru";

import { createTileCache } from "./tile-cache";
import { createTileDownsampler } from "./tile-downsampler";
import type { TileTexture } from "./tile-texture";

export const createTileTextures = ({
  urlPattern,
  device,
  textureIndicesBuffer,
  texturesTexture,
}: {
  urlPattern: string;
  device: GPUDevice;
  textureIndicesBuffer: GPUBuffer;
  texturesTexture: GPUTexture;
}) => {
  const tileCache = createTileCache({ device, urlPattern });
  const downsampler = createTileDownsampler(tileCache);
  const open = new Array(256).fill(0).map((_, i) => i);
  const mapping = new QuickLRU<TileTexture, number>({
    maxSize: 256,
    maxAge: 1000,
    onEviction: (_, index) => open.push(index),
  });

  const update = async (tiles: [number, number, number][]) => {
    const encoder = device.createCommandEncoder();

    const data = tiles.flatMap(xyz => {
      const { texture, downsample = 0 } = downsampler.get(xyz) ?? {};
      if (!texture) return [0, 0];
      const index = mapping.get(texture);
      if (index !== undefined) return [index, downsample];
      const next = open.shift();
      if (!next) return [0, 0];
      mapping.set(texture, next);
      encoder.copyTextureToTexture(
        { texture: texture.texture },
        { texture: texturesTexture, origin: [0, 0, next] },
        { width: 256, height: 256 },
      );
      return [next, downsample];
    });
    [...mapping.entriesDescending()].length;

    const { queue } = device;
    queue.submit([encoder.finish()]);
    queue.writeBuffer(textureIndicesBuffer, 0, new Uint32Array(data));
    await queue.onSubmittedWorkDone();
  };

  return { update };
};
