export type TextureLoader = ReturnType<typeof createTextureLoader>;

export const createTextureLoader = ({ device }: { device: GPUDevice }) => {
  type Load = {
    texture: GPUTexture;
    source: ImageBitmap;
    resolve: () => void;
    mipLevel: number;
  };
  const loads: Load[] = [];

  const load = (texture: GPUTexture, source: ImageBitmap, mipLevel = 0) =>
    new Promise<void>(resolve =>
      loads.push({ texture, source, resolve, mipLevel }),
    );

  const update = () =>
    loads.splice(0, 16).forEach(({ texture, source, mipLevel, resolve }) => {
      const { width, height } = source;
      device.queue.copyExternalImageToTexture(
        { source },
        { texture, mipLevel },
        { width, height },
      );
      void device.queue.onSubmittedWorkDone().then(resolve);
    });

  return {
    load,
    update,
  };
};
