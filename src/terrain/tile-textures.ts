import { tileTextureLayers } from "../configuration";
import type { Vec3 } from "../model";
import { fromKey, toKey } from "./common";
import { createLru } from "./lru";
import type { TextureLoader } from "./texture-loader";
import { createTileCache } from "./tile-cache";
import { createTileMapBuffer } from "./tile-map-buffer";

export type TileTextures = ReturnType<typeof createTileTextures>;

export const createTileTextures = ({
  urlPattern,
  device,
  textureLoader,
  textures,
  mapBuffer,
  initialDownsample = 0,
  maxZ = 22,
  mipLevelCount = 1,
}: {
  urlPattern: string;
  device: GPUDevice;
  textureLoader: TextureLoader;
  textures: GPUTexture;
  mapBuffer: GPUBuffer;
  initialDownsample?: number;
  maxZ?: number;
  mipLevelCount?: number;
}) => {
  const cache = createTileCache({
    device,
    textureLoader,
    urlPattern,
    mipLevelCount,
  });
  const open = new Array(tileTextureLayers).fill(0).map((_, i) => i);

  const tileMapBuffer = createTileMapBuffer(device, mapBuffer);

  const pending: Vec3[] = [];

  const mapping = createLru<number, { index?: number; texture: GPUTexture }>({
    maxSize: tileTextureLayers,
    onEviction: (key, { index }) => {
      if (index !== undefined) open.push(index);
      tileMapBuffer.clear(fromKey(key));
    },
  });

  const load = (tiles: Vec3[]) => {
    pending.push(
      ...unique(
        descendants(
          tiles.map(_ => downsample(_, initialDownsample)).filter(_ => !!_),
        ),
      ).filter(([, , z]) => z <= maxZ),
    );
  };

  const update = (encoder: GPUCommandEncoder) => {
    pending.splice(0).forEach(xyz => {
      const key = toKey(xyz);

      if (mapping.get(key)) return;

      const { texture, loaded } = cache.get(xyz) ?? {};
      if (!texture || !loaded) return;

      const index = open.shift();
      mapping.set(key, { index, texture });
      if (index === undefined) return;

      new Array(mipLevelCount).fill(0).forEach((_, i) => {
        const size = 256 >> i;
        encoder.copyTextureToTexture(
          { texture, mipLevel: i },
          {
            texture: textures,
            origin: { x: 0, y: 0, z: index },
            mipLevel: i,
          },
          { width: size, height: size },
        );
      });

      tileMapBuffer.set(xyz, index);
    });
    tileMapBuffer.update();
  };

  const destroy = () => mapping.clear();

  return { load, update, destroy };
};

const downsample = ([x, y, z]: Vec3, downsample: number) => {
  if (downsample > z) return undefined;
  const k = 2 ** downsample;
  return [Math.floor(x / k), Math.floor(y / k), z - downsample] satisfies Vec3;
};

const unique = (tiles: Vec3[]) => [
  ...new Map(tiles.map(tile => [toKey(tile), tile])).values(),
];

const parents = (tiles: Vec3[]) =>
  unique(tiles.map(_ => downsample(_, 1)).filter(_ => !!_));

const descendants: (tiles: Vec3[]) => Vec3[] = tiles =>
  tiles.length > 0 ? unique([...descendants(parents(tiles)), ...tiles]) : [];
