import createImageLoadWorker from "./image-load-worker?worker&inline";

const worker = createImageLoadWorker();

type ImageLoad = ReturnType<typeof createImageLoad>;
const loads = new Map<string, ImageLoad>();

export const loadImage = (url: string, signal?: AbortSignal) => {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  if (signal?.aborted) return Promise.reject(signal.reason);

  let load = loads.get(url);
  if (!load) {
    load = createImageLoad(url);
    loads.set(url, load);
  }

  load.acquire(signal);

  return load.promise;
};

const createImageLoad = (url: string) => {
  const { promise, resolve, reject } = Promise.withResolvers<ImageBitmap>();

  const handler = ({
    data,
  }: MessageEvent<{ url: string; image?: ImageBitmap }>) => {
    if (url !== data.url) return;
    loads.delete(url);
    worker.removeEventListener("message", handler);
    if (data.image) resolve(data.image);
    else reject(new Error(`Failed to load image: ${url}`));
  };
  worker.addEventListener("message", handler);

  const cancel = (signal?: AbortSignal) => {
    loads.delete(url);
    worker.removeEventListener("message", handler);
    reject(signal?.reason);
    worker.postMessage(["cancel", url]);
  };

  worker.postMessage(["load", url]);

  let count = 0;
  const acquire = (signal?: AbortSignal) => {
    count++;
    signal?.addEventListener("abort", release, { once: true });
  };
  const release = () => {
    count--;
    if (count === 0) cancel();
  };

  return { promise, acquire };
};
