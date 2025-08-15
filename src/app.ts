import { createBuffers } from "./buffers";
import { createCanvas } from "./canvas";
import { createComputer } from "./computer";
import { createControl } from "./control";
import type { Vec3 } from "./model";
import { createRenderer } from "./renderer";
import { createSignal } from "./signal";
import { createTileTextures } from "./tile-textures";

export const createApp = async () => {
  const camera = createSignal<Vec3>([0.25, 0.5, 10]);

  const { canvas, device, context, format, size } = await createCanvas();

  createControl(canvas, camera);

  const {
    cameraBuffer,
    projectionBuffer,
    tilesBuffer,
    countBuffer,
    textureIndicesBuffer,
    texturesTexture,
  } = createBuffers(device);

  const renderer = await createRenderer({
    device,
    context,
    format,
    size,
    camera,
    tilesBuffer,
    countBuffer,
    cameraBuffer,
    projectionBuffer,
    textureIndicesBuffer,
    texturesTexture,
  });

  const computer = await createComputer({
    device,
    tilesBuffer,
    countBuffer,
    cameraBuffer,
    projectionBuffer,
  });

  const tileTextures = createTileTextures({
    urlPattern: "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
    device,
    textureIndicesBuffer,
    texturesTexture,
  });

  let running = false;
  const frame = async () => {
    requestAnimationFrame(frame);
    if (running) return;
    running = true;

    const tiles = await computer.compute();
    await tileTextures.update(tiles);
    await renderer.render(tiles.length);

    running = false;
  };
  requestAnimationFrame(frame);
};
