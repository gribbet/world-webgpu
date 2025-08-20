import { createBuffers } from "./buffers";
import { createCanvas } from "./canvas";
import { createComputer } from "./computer";
import { createControl } from "./control";
import { createRenderer } from "./renderer";
import { createTextureLoader } from "./texture-loader";
import { createTileTextures } from "./tile-textures";

const urlPattern = "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}";

export const createApp = async () => {
  const canvas = await createCanvas();

  const { element, device, context, format, size } = canvas;

  const control = createControl(element);

  const { camera } = control;

  const {
    cameraBuffer,
    projectionBuffer,
    tilesBuffer,
    countBuffer,
    textureIndicesBuffer,
    textures,
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
    textures,
  });

  const computer = await createComputer({
    device,
    tilesBuffer,
    countBuffer,
    cameraBuffer,
    projectionBuffer,
  });

  const textureLoader = createTextureLoader({ device });

  const tileTextures = createTileTextures({
    urlPattern,
    device,
    textureLoader,
    textureIndicesBuffer,
    textures,
  });

  let running = true;
  const frame = async () => {
    if (!running) return;

    const tiles = await computer.compute();
    await tileTextures.update(tiles);
    await renderer.render(tiles.length);
    await textureLoader.load();

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const destroy = () => {
    running = false;
    tileTextures.destroy();
    computer.destroy();
    renderer.destroy();
    control.destroy();
    canvas.destroy();
  };

  return { destroy };
};
