import createImageLoadWorker from "./image-load-worker?worker&inline";

const worker = createImageLoadWorker();

export type ImageLoad = ReturnType<typeof createImageLoad>;

export const createImageLoad = (url: string, signal?: AbortSignal) => {
  const { promise, resolve, reject } = Promise.withResolvers<ImageBitmap[]>();
  let complete = false;

  const handler = ({ data }: MessageEvent) => {
    if (url !== data.url) return;
    complete = true;
    worker.removeEventListener("message", handler);
    if (data.images) resolve(data.images);
  };
  worker.addEventListener("message", handler);

  const cancel = () => {
    if (complete) return;
    reject(signal?.reason);
    worker.postMessage(["cancel", url]);
  };

  signal?.addEventListener("abort", cancel, { once: true });

  worker.postMessage(["load", url]);

  return promise;
};
