import type { Vec3 } from "./model";
import type { Texture } from "./texture";
import { createTexture } from "./texture";
import { createTileIndexCache } from "./tile-index-cache";

export type TileCache = ReturnType<typeof createTileCache>;

export const createTileCache = ({
  device,
  urlPattern,
}: {
  device: GPUDevice;
  urlPattern: string;
}) => {
  const tiles = createTileIndexCache<Texture>({
    maxSize: 2000,
    onEviction: (_, tile) => tile.destroy(),
  });
  const loading = createTileIndexCache<true>({
    maxSize: 10000,
    maxAge: 200,
    onEviction: xyz => {
      const cached = tiles.get(xyz);
      if (cached && !cached.loaded) tiles.delete(xyz);
    },
  });

  const get: (xyz: Vec3) => Texture | undefined = xyz => {
    const cached = tiles.get(xyz);
    if (cached) {
      if (cached.loaded) {
        loading.delete(xyz);
        return cached;
      }
      loading.set(xyz, true);
    } else {
      const [x = 0, y = 0, z = 0] = xyz;
      const url = urlPattern
        .replace("{x}", `${x}`)
        .replace("{y}", `${y}`)
        .replace("{z}", `${z}`);
      const texture = createTexture({
        device,
        url,
        onLoad: () => loading.delete(xyz),
      });
      tiles.set(xyz, texture);
      loading.set(xyz, true);
    }
  };

  const destroy = () => tiles.clear();

  return { get, destroy };
};
