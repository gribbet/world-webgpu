import { mipLevelCount } from "../../configuration";
import type { Context } from "../../context";
import { loadImage } from "../../image-load";
import { cropImage } from "../../image-process";
import type { Vec3 } from "../../model";
import { createTextureGroup } from "../../texture-group";
import { toKey } from "./common";
import type { TileMapBuffer } from "./tile-map-buffer";

export const createTileTextureGroup = ({
  context,
  map,
  urlPattern,
  initialDownsample = 0,
  maxZ = 22,
  mipmap = false,
}: {
  context: Context;
  map: TileMapBuffer;
  urlPattern: string;
  initialDownsample?: number;
  maxZ?: number;
  mipmap?: boolean;
}) => {
  const tilesByKey = new Map<string, Vec3>();

  const textureGroup = createTextureGroup({
    context,
    load: (key, signal) => {
      const tile = tilesByKey.get(key)!;
      return mipmap
        ? loadTileMipmaps(tile, signal)
        : loadTileImage(tile, signal);
    },
    onLoad: (key, index) => map.set(tilesByKey.get(key)!, index),
    onEvict: key => map.clear(tilesByKey.get(key)!),
  });
  const { texture } = textureGroup;

  const tileUrl = (x: number, y: number, z: number) =>
    urlPattern
      .replace("{z}", z.toString())
      .replace("{x}", x.toString())
      .replace("{y}", y.toString());

  const loadTileImage = ([x, y, z]: Vec3, signal?: AbortSignal) =>
    loadImage(tileUrl(x, y, z), signal);

  type MipSource = {
    url: string;
    crop?: { x: number; y: number; width: number; height: number };
  };
  const computeMipSources = ([x, y, z]: Vec3): MipSource[] =>
    new Array(mipLevelCount).fill(0).flatMap((_, m) => {
      const ancestorZ = z - m;
      if (ancestorZ < 0) return [];
      if (m === 0) return [{ url: tileUrl(x, y, z) }];
      const scale = 2 ** m;
      const tileSize = 256;
      const size = tileSize / scale;
      const url = tileUrl(
        Math.floor(x / scale),
        Math.floor(y / scale),
        ancestorZ,
      );
      return [
        {
          url,
          crop: {
            x: (x % scale) * size,
            y: (y % scale) * size,
            width: size,
            height: size,
          },
        },
      ];
    });

  const loadTileMipmaps = (tile: Vec3, signal: AbortSignal) =>
    Promise.all(
      computeMipSources(tile).map(async ({ url, crop }) =>
        crop
          ? await cropImage(await loadImage(url, signal), crop)
          : await loadImage(url, signal),
      ),
    );

  const ensure = (tiles: Vec3[]) =>
    textureGroup.ensure(
      unique(
        descendants(
          tiles.map(_ => downsample(_, initialDownsample)).filter(_ => !!_),
        ),
      )
        .filter(([, , z]) => z <= maxZ)
        .map(xyz => {
          const key = toKey(xyz).toString();
          tilesByKey.set(key, xyz);
          return key;
        }),
    );

  return { ensure, texture };
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
