import { enuFromPosition, move } from "./math";
import type { Vec3, View } from "./model";
import { type Accessor, onCleanup } from "./reactive";
import type { World } from "./world";

export const createControl = ({
  element,
  world,
  view,
  setView,
}: {
  element: HTMLElement;
  world: World;
  view: Accessor<View>;
  setView: (_: View) => void;
}) => {
  const abortController = new AbortController();
  const { signal } = abortController;

  const recenter = async () => {
    const { width, height } = element.getBoundingClientRect();
    const { position } = await world.pick(width / 2, height / 2);

    const { center, distance, orientation } = view();
    const [x, y, z] = enuFromPosition(center, position);
    const d = Math.sqrt(x ** 2 + y ** 2 + z ** 2);

    setView({
      orientation,
      center: position,
      distance: distance - d * (z > 0 ? 1 : -1),
    });
  };

  element.addEventListener(
    "pointerdown",
    () => {
      if (world.isDragging()) return;
      void recenter();
    },
    { signal },
  );

  element.addEventListener(
    "pointermove",
    event => {
      if (world.isDragging()) return;
      const { buttons, movementX, movementY } = event;
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
    event => {
      if (world.isDragging()) return;
      event.preventDefault();
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
};
