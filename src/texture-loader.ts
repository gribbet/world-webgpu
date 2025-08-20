export type TextureLoader = ReturnType<typeof createTextureLoader>;

export const createTextureLoader = ({ device }: { device: GPUDevice }) => {
  type Entry = {
    texture: GPUTexture;
    source: ImageBitmap;
    resolve: () => void;
  };
  const queued: Entry[] = [];

  const queue = (texture: GPUTexture, source: ImageBitmap) =>
    new Promise<void>(resolve => queued.push({ texture, source, resolve }));

  const process = async ({ texture, source, resolve }: Entry) => {
    const { width, height } = source;
    device.queue.copyExternalImageToTexture(
      { source },
      { texture },
      { width, height },
    );
    await device.queue.onSubmittedWorkDone();
    resolve();
  };

  const load = () => Promise.all(queued.splice(0, 8).map(process));

  return {
    queue,
    load,
  };
};
