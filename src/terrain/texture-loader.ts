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

  const process = ({ texture, source, resolve }: Entry) => {
    const { width, height } = source;
    device.queue.copyExternalImageToTexture(
      { source },
      { texture },
      { width, height },
    );
    void device.queue.onSubmittedWorkDone().then(resolve);
  };

  const load = () => queued.splice(0, 8).map(process);

  return {
    queue,
    load,
  };
};
