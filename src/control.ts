import type { Vec3, View } from "./model";
import { createSignal } from "./signal";

export const createControl = (element: HTMLElement) => {
  const view = createSignal<View>({
    target: [0.23, 0.4, 1],
    distance: 3,
    orientation: [0, 0, 0],
  });

  let [x, y, z] = [0, 0, 0];
  let distance = 0;
  let [pitch, yaw, roll] = [0, 0, 0];

  view.use(view => {
    ({ distance } = view);
    [x, y, z] = view.target;
    [pitch, yaw, roll] = view.orientation;
  });

  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));

  let dragging: [number, number] | undefined;

  const abortController = new AbortController();
  const { signal } = abortController;

  element.addEventListener(
    "pointerdown",
    ({ clientX, clientY }) => {
      dragging = [clientX, clientY];
    },
    { signal },
  );

  element.addEventListener(
    "pointermove",
    ({ clientX, clientY, buttons }) => {
      if (!dragging) return;
      const [lastX, lastY] = dragging;
      const tx = clientX - lastX;
      const ty = clientY - lastY;
      const dx = Math.cos(-yaw) * tx + Math.sin(-yaw) * ty;
      const dy = -Math.sin(-yaw) * tx + Math.cos(-yaw) * ty;
      dragging = [clientX, clientY];

      if (buttons === 1) {
        const scale = 0.0002 * distance;
        const target = [
          x - dx * scale,
          clamp(y - dy * scale, -1, 1),
          z,
        ] satisfies Vec3;
        view.set({ target, distance, orientation: [pitch, yaw, roll] });
      } else if (buttons === 2) {
        const orientation = [
          pitch - dy * 0.01,
          yaw + dx * 0.01,
          roll,
        ] satisfies Vec3;
        view.set({ target: [x, y, z], distance, orientation });
      }
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
      view.set({
        target: [x, y, z],
        distance: distance * Math.exp(event.deltaY * 0.001),
        orientation: [pitch, yaw, roll],
      });
    },
    { passive: false, signal },
  );

  element.addEventListener("contextmenu", event => event.preventDefault(), {
    signal,
  });

  const destroy = () => abortController.abort();

  return { view, destroy };
};
