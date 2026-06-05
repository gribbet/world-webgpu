import { onCleanup, signal } from "signals.ts";

import { mipLevelCount, tileTextureLayers } from "./configuration";
import type { Context } from "./context";
import { createMipmaps } from "./image-process";
import { createLru } from "./lru";
import { createTexture } from "./texture";

export const createTextureGroup = ({
  context,
  layers = tileTextureLayers,
  load,
  onLoad,
  onEvict,
}: {
  context: Context;
  layers?: number;
  load: (
    key: string,
    signal: AbortSignal,
  ) => Promise<ImageBitmap | ImageBitmap[]>;
  onLoad?: (key: string, index: number, width: number, height: number) => void;
  onEvict?: (key: string, index: number) => void;
}) => {
  const { device, textureLoader } = context;

  const createGroupTexture = (width: number, height: number) =>
    createTexture(device, {
      size: [width, height, layers],
      format: "rgba8unorm",
      mipLevelCount: Math.min(
        mipLevelCount,
        Math.floor(Math.log2(Math.max(width, height))) + 1,
      ),
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const [texture, setTexture] = signal<GPUTexture>(createGroupTexture(8, 8));

  const available = new Array(layers).fill(0).map((_, i) => i);

  type Entry = { index?: number; cancel: (() => void) | undefined };
  const mapping = createLru<string, Entry>({
    maxSize: layers,
    onEvict: (key, { index, cancel }) => {
      cancel?.();
      if (index === undefined) return;
      if (!cancel) available.push(index);
      onEvict?.(key, index);
    },
  });

  const reset = (width: number, height: number) => {
    mapping.clear();
    setTexture(createGroupTexture(width, height));
  };

  const ensureSize = (w: number, h: number) => {
    const { width, height } = texture();
    if (w > width || h > height) {
      reset(Math.max(w, width), Math.max(h, height));
      return true;
    }
    return false;
  };

  const normalizeImages = async (_: ImageBitmap | ImageBitmap[]) => {
    const images = Array.isArray(_)
      ? _.slice(0, mipLevelCount)
      : await createMipmaps(_);

    const last = images[images.length - 1];
    if (last && images.length < mipLevelCount) {
      const remaining = await createMipmaps(
        last,
        mipLevelCount - images.length + 1,
      );
      return [...images, ...remaining.slice(1)];
    }

    return images;
  };

  const doLoad = async (key: string, index: number, signal: AbortSignal) => {
    try {
      const images = await normalizeImages(await load(key, signal));

      const [first] = images;
      if (!first) return;

      const { width, height } = first;

      if (ensureSize(width, height)) {
        available.push(index);
        return;
      }

      await Promise.all(
        images.map((_, mip) =>
          textureLoader.load(texture(), _, mip, index, signal),
        ),
      );

      mapping.set(key, { index, cancel: undefined });

      onLoad?.(key, index, width, height);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        available.push(index);
        mapping.delete(key);
        return;
      }
      throw error;
    }
  };

  const ensure = (keys: string[]) => {
    const current = new Set(keys);
    mapping
      .entries()
      .filter(([key]) => !current.has(key))
      .forEach(([, { cancel }]) => cancel?.());
    keys.forEach(ensureOne);
  };

  const ensureOne = (key: string) => {
    const current = mapping.get(key);
    if (current?.index !== undefined) return mapping.set(key, current);

    const index = available.shift();

    const abortController = new AbortController();
    const { signal } = abortController;
    const cancel =
      index !== undefined ? () => abortController.abort() : undefined;

    mapping.set(key, { index, cancel });

    if (index === undefined) return;

    void doLoad(key, index, signal);
  };

  onCleanup(() => {
    mapping.clear();
  });

  return {
    ensure,
    texture,
  };
};
