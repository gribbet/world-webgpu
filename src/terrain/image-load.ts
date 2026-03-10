import createImageLoadWorker from "./image-load-worker?worker&inline";

const worker = createImageLoadWorker();

let i = 0;

export type ImageLoad = ReturnType<typeof createImageLoad>;

export const createImageLoad = ({
  url,
  crop,
  onLoad,
}: {
  url: string;
  crop?: [x: number, y: number, width: number, height: number];
  onLoad: (image: ImageBitmap | undefined) => void;
}) => {
  let loaded = false;
  const id = i++;

  const handler = ({ data }: MessageEvent) => {
    if (canceled || id !== data.id) return;
    worker.removeEventListener("message", handler);
    if (!data.image) return;
    loaded = true;
    onLoad(data.image);
  };
  worker.addEventListener("message", handler);

  let canceled = false;
  const cancel = () => {
    if (loaded) return;
    canceled = true;
    worker.postMessage(["cancel", { id }]);
  };

  worker.postMessage(["load", { id, url, crop }]);

  return {
    get loaded() {
      return loaded;
    },
    cancel,
  };
};
