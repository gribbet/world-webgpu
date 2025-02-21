import { createCanvas } from "./canvas";
import { earthRadius } from "./math";
import type { Position } from "./model";
import { createRenderer } from "./renderer";
import { createSignal } from "./signal";

export const createApp = async () => {
  const center = createSignal<Position>([0, 0, 0]);

  const { device, context, format, aspect } = await createCanvas();

  const renderer = await createRenderer({
    device,
    context,
    format,
    aspect,
    center,
  });

  const frame = () => {
    requestAnimationFrame(frame);
    center.set([
      ((performance.now() / 1e3) % 360) - 180,
      Math.sin(performance.now() / 1.1e5) * 85,
      (0.5 + 0.1 * Math.sin(performance.now() / 1e5)) * earthRadius,
    ]);
    renderer.render();
  };

  requestAnimationFrame(frame);
};
