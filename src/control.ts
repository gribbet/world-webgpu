import type { Vec3 } from "./model";
import type { Signal } from "./signal";

export const createControl = (element: HTMLElement, camera: Signal<Vec3>) => {
  let [cx, cy, cz] = [0, 0, 0];

  camera.use(_ => {
    [cx, cy, cz] = _;
  });

  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));

  let dragging: [number, number] | undefined;

  const abortController = new AbortController();
  const { signal } = abortController;

  element.addEventListener(
    "pointerdown",
    ({ clientX: x, clientY: y }) => {
      dragging = [x, y];
    },
    { signal },
  );

  element.addEventListener(
    "pointermove",
    ({ clientX: x, clientY: y }) => {
      if (!dragging) return;
      const [lastX, lastY] = dragging;
      const dx = x - lastX;
      const dy = y - lastY;
      dragging = [x, y];

      const scale = 0.0005 * (cz - 1);
      camera.set([cx - dx * scale, clamp(cy - dy * scale, -1, 1), cz]);
    },
    { signal },
  );

  window.addEventListener(
    "pointerup",
    () => {
      dragging = undefined;
    },
    { signal },
  );

  element.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      camera.set([cx, cy, 1 + (cz - 1) * Math.exp(event.deltaY * 0.001)]);
    },
    { passive: false, signal },
  );

  const destroy = () => abortController.abort();

  return { destroy };
};
