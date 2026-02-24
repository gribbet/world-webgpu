export type TextureLoader = ReturnType<typeof createTextureLoader>;

export const createTextureLoader = ({ device }: { device: GPUDevice }) => {
  type Load = {
    texture: GPUTexture;
    source: ImageBitmap;
    resolve: () => void;
  };
  const loads: Load[] = [];

  const load = (texture: GPUTexture, source: ImageBitmap) =>
    new Promise<void>(resolve => loads.push({ texture, source, resolve }));

  const update = () =>
    loads.splice(0, 8).forEach(({ texture, source, resolve }) => {
      const { width, height } = source;
      device.queue.copyExternalImageToTexture(
        { source },
        { texture },
        { width, height },
      );
      void device.queue.onSubmittedWorkDone().then(resolve);
    });

  return {
    load,
    update,
  };
};
