const worker = new Worker(new URL("./image-load-worker.js", import.meta.url), {
  type: "module",
});

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
  const abortController = new AbortController();
  let complete = false;

  const handler = ({
    data,
  }: MessageEvent<{ url: string; image?: ImageBitmap }>) => {
    if (url !== data.url) return;
    complete = true;
    loads.delete(url);
    abortController.abort();
    if (data.image) resolve(data.image);
    else reject(new Error(`Failed to load image: ${url}`));
  };
  worker.addEventListener("message", handler, {
    signal: abortController.signal,
  });

  const cancel = (signal?: AbortSignal) => {
    complete = true;
    loads.delete(url);
    abortController.abort();
    reject(signal?.reason);
    worker.postMessage(["cancel", url]);
  };

  worker.postMessage(["load", url]);

  let count = 0;
  const acquire = (signal?: AbortSignal) => {
    count++;
    if (!signal) return;

    signal.addEventListener("abort", () => release(signal), {
      once: true,
      signal: abortController.signal,
    });
  };
  const release = (signal?: AbortSignal) => {
    count--;
    if (count === 0 && !complete) cancel(signal);
  };

  return { promise, acquire };
};
