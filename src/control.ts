import { type Accessor, onCleanup } from "signals.ts";

import { enuFromPosition, move, wrapDegDelta } from "./math";
import type { View } from "./model";
import type { World } from "./world";

const MAX_LAT = (Math.atan(Math.sinh(Math.PI)) * 180) / Math.PI;

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

    const { center, distance, orientation, fieldOfView } = view();
    const [yaw, pitch] = orientation;
    const [x, y, z] = enuFromPosition(center, position);
    const fov = (fieldOfView / 180) * Math.PI;
    const fieldScale = Math.tan(Math.PI / 8) / Math.tan(fov / 2);
    const zCam =
      z * Math.cos(pitch) -
      (x * Math.sin(yaw) + y * Math.cos(yaw)) * Math.sin(pitch);

    setView({
      orientation,
      center: position,
      distance: distance - zCam / fieldScale,
      fieldOfView,
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
      const { center, distance, orientation, fieldOfView } = view();
      const [yaw, pitch, roll] = orientation;
      const [lon, lat, alt] = center;

      if (buttons === 1) {
        const metersPerPixel = distance / 1000;

        const cos = Math.cos(-yaw);
        const sin = Math.sin(-yaw);
        const dx = cos * movementX - sin * movementY;
        const dy = sin * movementX + cos * movementY;

        const [movedLon, movedLat, movedAlt] = move(
          [lon, lat, alt],
          [-dx * metersPerPixel, dy * metersPerPixel, 0],
        );

        // Wrap longitude to [-180, 180] and clamp latitude to Mercator limits
        const wrappedLon = wrapDegDelta(movedLon);
        const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, movedLat));
        const newCenter = [wrappedLon, clampedLat, movedAlt] as const;

        setView({ center: newCenter, distance, orientation, fieldOfView });
      } else if (buttons === 2) {
        const newPitch = Math.max(
          -Math.PI / 2,
          Math.min(0, pitch + movementY * 0.01),
        );
        const newYaw = yaw - movementX * 0.01;
        setView({
          center,
          distance,
          orientation: [newYaw, newPitch, roll],
          fieldOfView,
        });
      }
    },
    { signal },
  );

  element.addEventListener(
    "wheel",
    event => {
      if (world.isDragging()) return;
      event.preventDefault();
      const { center, distance, orientation, fieldOfView } = view();
      setView({
        center,
        distance: distance * Math.exp(event.deltaY * 0.001),
        orientation,
        fieldOfView,
      });
    },
    { passive: false, signal },
  );

  element.addEventListener("contextmenu", event => event.preventDefault(), {
    signal,
  });

  onCleanup(() => abortController.abort());
};
