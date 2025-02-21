import { createCanvas } from "./canvas";
import { createComputer } from "./computer";
import { z } from "./configuration";
import { createBuffer } from "./device";
import { earthRadius } from "./math";
import type { Position } from "./model";
import { createRenderer } from "./renderer";
import { createSignal } from "./signal";

export const createApp = async () => {
  const center = createSignal<Position>([0, 0, 0]);

  const { device, context, format, aspect } = await createCanvas();

  const tiles = new Array(2 ** z)
    .fill(0)
    .flatMap((_, x) =>
      new Array(2 ** z).fill(0).flatMap((_, y) => [x, y, z, 0]),
    );
  const tilesBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE,
    new Uint32Array(tiles),
  );

  const renderer = await createRenderer({
    device,
    context,
    format,
    aspect,
    center,
    tilesBuffer,
  });

  const computer = await createComputer({ device, tilesBuffer });

  const frame = async () => {
    requestAnimationFrame(frame);
    center.set([
      ((performance.now() / 1e3) % 360) - 180,
      Math.sin(performance.now() / 1.1e5) * 85,
      (0.5 + 0.1 * Math.sin(performance.now() / 1e5)) * earthRadius,
    ]);
    renderer.render();
    await computer.compute();
  };

  requestAnimationFrame(frame);
};
