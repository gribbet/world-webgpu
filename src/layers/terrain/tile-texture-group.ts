import type { Context } from "../../context";
import { createLru } from "../../lru";
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
}: {
  context: Context;
  map: TileMapBuffer;
  urlPattern: string;
  initialDownsample?: number;
  maxZ?: number;
}) => {
  const tileIndices = createLru<string, Vec3>({ maxSize: 4096 });
  const textureGroup = createTextureGroup({
    context,
    onLoad: (url, index) => map.set(tileIndices.get(url)!, index),
    onEvict: url => map.clear(tileIndices.get(url)!),
  });
  const { texture } = textureGroup;

  const ensure = (tiles: Vec3[]) =>
    textureGroup.ensure(
      unique(
        descendants(
          tiles.map(_ => downsample(_, initialDownsample)).filter(_ => !!_),
        ),
      )
        .filter(([, , z]) => z <= maxZ)
        .map(xyz => {
          const [x, y, z] = xyz;
          const url = urlPattern
            .replace("{z}", z.toString())
            .replace("{x}", x.toString())
            .replace("{y}", y.toString());
          tileIndices.set(url, xyz);
          return url;
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
