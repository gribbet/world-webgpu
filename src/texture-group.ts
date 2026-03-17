import { mipLevelCount, tileTextureLayers } from "./configuration";
import type { Context } from "./context";
import { createImageLoad } from "./image-load";
import { createLru } from "./lru";
import { createSignal, onCleanup } from "./reactive";

export const createTextureGroup = ({
  context,
  layers = tileTextureLayers,
  onLoad,
  onEvict,
}: {
  context: Context;
  layers?: number;
  onLoad?: (url: string, index: number, width: number, height: number) => void;
  onEvict?: (url: string, index: number) => void;
}) => {
  const { device, textureLoader } = context;

  const createTexture = (width: number, height: number) =>
    device.createTexture({
      size: [width, height, layers],
      format: "rgba8unorm",
      mipLevelCount,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const [texture, setTexture] = createSignal<GPUTexture>(createTexture(8, 8));

  const available = new Array(layers).fill(0).map((_, i) => i);

  type Entry = { index?: number; cancel: (() => void) | undefined };
  const mapping = createLru<string, Entry>({
    maxSize: layers,
    onEvict: (url, { index, cancel }) => {
      cancel?.();
      if (index === undefined) return;
      if (!cancel) available.push(index);
      onEvict?.(url, index);
    },
  });

  const reset = (width: number, height: number) => {
    mapping.clear();
    texture().destroy();
    setTexture(createTexture(width, height));
  };

  const ensureSize = (w: number, h: number) => {
    const { width, height } = texture();
    if (w > width || h > height) {
      reset(Math.max(w, width), Math.max(h, height));
      return true;
    }
    return false;
  };

  const load = async (url: string, index: number, signal: AbortSignal) => {
    try {
      const result = await createImageLoad(url, signal);

      const images = Array.isArray(result) ? result : [result];
      const [first] = images;

      if (!first) return;

      const { width, height } = first;

      if (ensureSize(width, height)) return;

      await Promise.all(
        images.map((_, mip) =>
          textureLoader.load(texture(), _, mip, index, signal),
        ),
      );

      mapping.set(url, { index, cancel: undefined });

      onLoad?.(url, index, width, height);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        available.push(index);
        mapping.delete(url);
        return;
      }
      throw error;
    }
  };

  const ensure = (urls: string[]) => {
    const current = new Set(urls);
    mapping
      .entries()
      .filter(([url]) => !current.has(url))
      .forEach(([, { cancel }]) => cancel?.());
    current.forEach(ensureOne);
  };

  const ensureOne = (url: string) => {
    const current = mapping.get(url);
    if (current) return mapping.set(url, current);

    const index = available.shift();

    const abortController = new AbortController();
    const { signal } = abortController;
    const cancel =
      index !== undefined ? () => abortController.abort() : undefined;

    mapping.set(url, { index, cancel });

    if (index === undefined) return;

    void load(url, index, signal);
  };

  onCleanup(() => {
    mapping.clear();
    texture().destroy();
  });

  return {
    ensure,
    texture,
  };
};
