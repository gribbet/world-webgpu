export type TextureLoader = ReturnType<typeof createTextureLoader>;

export const createTextureLoader = ({ device }: { device: GPUDevice }) => {
  type Load = {
    texture: GPUTexture;
    source: ImageBitmap;
    mipLevel: number;
    layer: number;
    resolve: () => void;
  };
  const loads: Load[] = [];

  const load = (
    texture: GPUTexture,
    source: ImageBitmap,
    mipLevel = 0,
    layer = 0,
    signal?: AbortSignal,
  ) => {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const load = {
      texture,
      source,
      mipLevel,
      layer,
      resolve,
    } as const;
    loads.push(load);
    signal?.addEventListener(
      "abort",
      () => {
        loads.splice(loads.indexOf(load), 1);
        reject(signal.reason);
      },
      { once: true },
    );
    return promise;
  };

  const update = () =>
    loads
      .splice(0, 16)
      .forEach(({ texture, source, mipLevel, layer, resolve }) => {
        const { width, height } = source;
        device.queue.copyExternalImageToTexture(
          { source },
          { texture, mipLevel, origin: { z: layer } },
          { width, height },
        );
        void device.queue.onSubmittedWorkDone().then(resolve);
      });

  return {
    load,
    update,
  };
};
