import type { Vec3, View } from "./model";
import { createSignal } from "./signal";

export const createControl = (element: HTMLElement) => {
  const view = createSignal<View>({
    center: [-122.4194, 37.7749, 0], // SF
    distance: 10000000,
    orientation: [0, 0, 0],
  });

  let _view: View = {
    center: [0, 0, 0],
    distance: 0,
    orientation: [0, 0, 0],
  };

  view.use(_ => {
    _view = _;
  });

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
      const { center, distance, orientation } = _view;
      const [lon, lat, hae] = center;
      const [pitch, yaw, roll] = orientation;
      dragging = [clientX, clientY];

      if (buttons === 1) {
        const metersPerPixel = distance / 1000;

        const cos = Math.cos(-yaw);
        const sin = Math.sin(-yaw);
        const dx = cos * tx - sin * ty;
        const dy = sin * tx + cos * ty;

        const metersPerDegree = (2 * Math.PI * 6371000) / 360;
        const lonDelta =
          -(dx * metersPerPixel) /
          (metersPerDegree * Math.cos((lat * Math.PI) / 180));
        const latDelta = (dy * metersPerPixel) / metersPerDegree;

        const latLimit = 85;
        const center = [
          lon + lonDelta,
          Math.min(latLimit, Math.max(-latLimit, lat + latDelta)),
          hae,
        ] satisfies Vec3;
        view.set({ ..._view, center });
      } else if (buttons === 2) {
        const orientation = [
          pitch + ty * 0.01,
          yaw - tx * 0.01,
          roll,
        ] satisfies Vec3;
        view.set({ ..._view, orientation });
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
        ..._view,
        distance: _view.distance * Math.exp(event.deltaY * 0.001),
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
