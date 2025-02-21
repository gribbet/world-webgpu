import { mat4 } from "wgpu-matrix";

import { createCanvas } from "./canvas";
import { createComputer } from "./computer";
import { z } from "./configuration";
import { createBuffer } from "./device";
import { earthRadius, fixed, mercator } from "./math";
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

  aspect.use(aspect => {
    const fov = 60;
    const near = 1e-9;
    const far = 10;
    const projection = mat4.perspective(
      (fov / 180) * Math.PI,
      aspect,
      near,
      far,
    );
    device.queue.writeBuffer(projectionBuffer, 0, new Float32Array(projection));
  });

  const renderer = await createRenderer({
    device,
    context,
    format,
    tilesBuffer,
    centerBuffer,
    projectionBuffer,
  });

  const computer = await createComputer({
    device,
    tilesBuffer,
    centerBuffer,
    projectionBuffer,
  });

  let running = false;
  const frame = async () => {
    requestAnimationFrame(frame);
    if (running) return;
    running = true;
    center.set([
      ((performance.now() / 1e3) % 360) - 180,
      Math.sin(performance.now() / 1.1e5) * 85,
      (0.5 + 0.1 * Math.sin(performance.now() / 1e5)) * earthRadius,
    ]);
    renderer.render();
    await computer.compute();
    running = false;
  };

  requestAnimationFrame(frame);
};
