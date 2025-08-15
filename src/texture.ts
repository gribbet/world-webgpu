export type Texture = ReturnType<typeof createTexture>;

export const createTexture = ({
  device,
  url,
  onLoad,
}: {
  device: GPUDevice;
  url: string;
  onLoad?: () => void;
}) => {
  let loaded = false;
  let destroyed = false;

  const texture = device.createTexture({
    size: [256, 256],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const load = async () => {
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    if (destroyed) return;

    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      {
        texture,
        origin: { x: 0, y: 0, z: 0 },
      },
      { width: 256, height: 256 },
    );

    await device.queue.onSubmittedWorkDone();

    onLoad?.();

    loaded = true;
  };

  void load();

  const destroy = () => {
    destroyed = true;
    texture.destroy();
  };

  return {
    get loaded() {
      return loaded;
    },
    get texture() {
      return texture;
    },
    destroy,
  };
};
