import { earthRadius } from "./math";
import type { Vec3 } from "./model";
import type { Signal } from "./signal";

export const createControl = (element: HTMLElement, center: Signal<Vec3>) => {
  const Z_MIN = 0.001 * earthRadius;
  const Z_MAX = earthRadius;

  let [cx, cy, cz] = [0, 0, 0];

  center.use(_ => {
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

      center.set([
        cx - dx * 0.1 * (cz / earthRadius),
        clamp(cy + dy * 0.1 * (cz / earthRadius), -85, 85),
        cz,
      ]);
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
      center.set([
        cx,
        cy,
        clamp(cz * Math.exp(event.deltaY * 0.001), Z_MIN, Z_MAX),
      ]);
    },
    { passive: false, signal },
  );

  const destroy = () => abortController.abort();

  return { destroy };
};
