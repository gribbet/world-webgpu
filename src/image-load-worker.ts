import { limit } from "./common";

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
      const [evAction, _] = event.data as Data;
      if (evAction === "cancel" && _ === url) abortController.abort();
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

    // @ts-expect-error Transferable
    postMessage({ url, image }, [image]);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.name === "AbortError" || error.message === "Failed to fetch")
      return postMessage({ url });
    throw error;
  } finally {
    release();
  }
});
