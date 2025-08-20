import { createContext } from "./context";
import { createControl } from "./control";
import { createTerrain } from "./terrain";
import { createWorld } from "./world";

export const createApp = async () => {
  const element = document.createElement("canvas");
  document.body.appendChild(element);

  const context = await createContext(element);

  const control = createControl(element);

  const { camera } = control;

  const urlPattern = "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}";
  const terrain = await createTerrain(context, {
    camera,
    urlPattern,
  });

  const renderer = createWorld(context, {
    layers: [terrain],
  });

  const destroy = () => {
    renderer.destroy();
    terrain.destroy();
    control.destroy();
    context.destroy();
  };

  return { destroy };
};
