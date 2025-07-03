import { mat4 } from "wgpu-matrix";

import { createCanvas } from "./canvas";
import { createComputer } from "./computer";
import { createBuffer } from "./device";
import { earthRadius, fixed, mercator } from "./math";
import type { Position } from "./model";
import { createRenderer } from "./renderer";
import { createSignal } from "./signal";

export const createApp = async () => {
  const center = createSignal<Position>([0, 0, 0]);

  const { device, context, format, size } = await createCanvas();

  let tiles: [number, number, number][] = [[0, 0, 0]];
  const tilesBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    new Uint32Array(new Array(256).fill(0).flatMap(() => [0, 0, 0, 0])),
  );

  const countBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    new Uint32Array([0]),
  );

  const centerBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Uint32Array([0, 0, 0]),
  );

  const projectionBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Float32Array(mat4.identity()),
  );

  center.use(center =>
    device.queue.writeBuffer(
      centerBuffer,
      0,
      new Uint32Array(fixed(mercator(center))),
    ),
  );

  const renderer = await createRenderer({
    device,
    context,
    format,
    size,
    tilesBuffer,
    countBuffer,
    centerBuffer,
    projectionBuffer,
  });

  const computer = await createComputer({
    device,
    tilesBuffer,
    countBuffer,
    centerBuffer,
    projectionBuffer,
  });

  let running = false;
  const frame = async () => {
    requestAnimationFrame(frame);
    if (running) return;
    running = true;
    center.set([
      (performance.now() / 1e2) % 360,
      -Math.sin(performance.now() / 1.1e4) * 85,
      (0.5 - 0.4 * Math.sin(performance.now() / 1.2e3)) * earthRadius,
    ]);
    renderer.render(tiles.length);
    tiles = await computer.compute();
    running = false;
  };

  requestAnimationFrame(frame);
};
