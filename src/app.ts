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

  const imageryUrl = "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}";
  const mapboxToken =
    "pk.eyJ1IjoiZ3JhaGFtZ2liYm9uc2tyYXVzIiwiYSI6ImNsOWhjcXl4dDEyNWwzb295MjZhdWh6ejkifQ.1o2-p9zy03ahonJJD1SSow"; // TODO: Change
  const elevationUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.png?access_token=${mapboxToken}`;

  const terrain = await createTerrain(context, {
    camera,
    imageryUrl,
    elevationUrl,
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
