import QuickLRU from "quick-lru";

export const createTextureMap = ({
  device,
  textures,
}: {
  device: GPUDevice;
  textures: GPUTexture;
}) => {
  const open = new Array(256).fill(0).map((_, i) => i);
  const mapping = new QuickLRU<GPUTexture, number>({
    maxSize: 256,
    maxAge: 1000,
    onEviction: (_, index) => open.push(index),
  });
  const loading = new Set<GPUTexture>();

  const expire = () => [...mapping.entriesAscending()];
  const interval = setInterval(expire, 100);

  const get = (texture: GPUTexture) => {
    const index = mapping.get(texture);
    if (index !== undefined) {
      mapping.set(texture, index);
      return index;
    }
    if (loading.has(texture)) return undefined;
    const next = open.shift();
    if (next === undefined) return undefined;
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToTexture(
      { texture },
      { texture: textures, origin: { z: next } },
      { width: 256, height: 256 },
    );
    device.queue.submit([encoder.finish()]);
    loading.add(texture);
    void device.queue.onSubmittedWorkDone().then(() => {
      mapping.set(texture, next);
      loading.delete(texture);
    });
  };

  const destroy = () => {
    clearInterval(interval);
    mapping.clear();
  };

  return { get, destroy };
};
