import { limit } from "./common";
import { mipLevelCount } from "./configuration";

export type Data = ["load" | "cancel", string];

const acquire = limit(16);

addEventListener("message", async event => {
  const [action, url] = event.data as Data;
  if (action !== "load") return;

  const abortController = new AbortController();
  const { signal } = abortController;
  addEventListener(
    "message",
    (event: MessageEvent) => {
      const [action, _] = event.data as Data;
      if (action === "cancel" && url === _) abortController.abort();
    },
    { signal },
  );
  const release = await acquire();

  try {
    if (signal.aborted) return postMessage({ url });

    const response = await fetch(url, { mode: "cors", signal });
    if (!response.ok) {
      postMessage({ url });
      return;
    }

    const blob = await response.blob();
    const image = await createImageBitmap(blob);
    const images = await createMipmaps(image);

    // @ts-expect-error Transferable
    postMessage({ url, images }, images);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.name === "AbortError" || error.message === "Failed to fetch")
      return postMessage({ url });
    throw error;
  } finally {
    release();
  }
});

const createMipmaps = (image: ImageBitmap) =>
  Promise.all(
    new Array(mipLevelCount).fill(0).map((_, i) => {
      const width = Math.max(1, Math.floor(image.width / 2 ** i));
      const height = Math.max(1, Math.floor(image.height / 2 ** i));
      return createImageBitmap(image, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
      });
    }),
  );
