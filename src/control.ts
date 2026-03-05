import type { Vec3, View } from "./model";
import { createSignal, onCleanup } from "./reactive";
import type { World } from "./world";

export const createControl = (element: HTMLElement, world: World) => {
  const [view, setView] = createSignal<View>({
    center: [-122.4194, 37.7749, 0], // SF
    distance: 100000,
    orientation: [0, 0, 0],
  });

  const abortController = new AbortController();
  const { signal } = abortController;

  const recenter = async () => {
    const { width, height } = element.getBoundingClientRect();
    const [x, y, z] = await world.pick(width / 2, height / 2);

    const d = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
    const { center, distance, orientation } = view();

    setView({
      orientation,
      center: move(center, [x, y, z]),
      distance: distance - d * (z > 0 ? 1 : -1),
    });
  };

  element.addEventListener("pointerdown", recenter, { signal });

  element.addEventListener(
    "pointermove",
    ({ buttons, movementX, movementY }) => {
      if (buttons === 0) return;
      const { center, distance, orientation } = view();
      const [lon, lat, alt] = center;
      const [pitch, yaw, roll] = orientation;

      if (buttons === 1) {
        const metersPerPixel = distance / 1000;

        const cos = Math.cos(-yaw);
        const sin = Math.sin(-yaw);
        const dx = cos * movementX - sin * movementY;
        const dy = sin * movementX + cos * movementY;

        const center = move(
          [lon, lat, alt],
          [-dx * metersPerPixel, dy * metersPerPixel, 0],
        );

        setView({ center, distance, orientation });
      } else if (buttons === 2) {
        const orientation = [
          pitch + movementY * 0.01,
          yaw - movementX * 0.01,
          roll,
        ] satisfies Vec3;
        setView({ center, distance, orientation });
      }
    },
    { signal },
  );

  element.addEventListener(
    "wheel",
    async event => {
      event.preventDefault();
      await recenter();
      const { center, distance, orientation } = view();
      setView({
        center,
        distance: distance * Math.exp(event.deltaY * 0.001),
        orientation,
      });
    },
    { passive: false, signal },
  );

  element.addEventListener("contextmenu", event => event.preventDefault(), {
    signal,
  });

  onCleanup(() => abortController.abort());

  return { view };
};

const move = (center: Vec3, enu: readonly [number, number, number]): Vec3 => {
  const [lon, lat, alt] = center;
  const [x, y, z] = enu;

  const radius = 6378137.0;
  const r = radius + alt;
  const latRad = (lat * Math.PI) / 180;

  const lonDelta = (x / (r * Math.cos(latRad))) * (180 / Math.PI);
  const latDelta = (y / r) * (180 / Math.PI);

  return [lon + lonDelta, lat + latDelta, alt + z];
};
