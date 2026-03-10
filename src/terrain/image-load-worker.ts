export type Data =
  | [
      "load",
      {
        id: number;
        url: string;
        crop?: [x: number, y: number, width: number, height: number];
      },
    ]
  | ["cancel", { id: number }];

addEventListener("message", async event => {
  const [action, parameters] = event.data as Data;
  const { id } = parameters;
  if (action !== "load") return;
  const abortController = new AbortController();
  const { signal } = abortController;
  addEventListener(
    "message",
    (event: MessageEvent) => {
      const [action, { id }] = event.data as Data;
      if (action === "cancel" && id === parameters.id) abortController.abort();
    },
    { signal },
  );
  try {
    const { url, crop } = parameters;
    const response = await fetch(url, { mode: "cors", signal });
    if (!response.ok) {
      postMessage({ url, id, image: undefined });
      return;
    }
    const blob = await response.blob();

    const image = await (crop
      ? createImageBitmap(blob, ...crop)
      : createImageBitmap(blob));

    // @ts-expect-error Transferable
    postMessage({ url, id, image }, [image]);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (
      error.message === "The user aborted a request." ||
      error.message.startsWith("signal is aborted without reason")
    )
      // Ignore
      return;
    else if (error.message === "Failed to fetch") {
      // Network error (eg. CORS issue)
      postMessage({ id, image: undefined });
      return;
    }
    throw error;
  }
});
