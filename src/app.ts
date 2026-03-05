import { createContext } from "./context";
import { createControl } from "./control";
import type { View } from "./model";
import {
  createDerived,
  createEffect,
  createRoot,
  createSignal,
} from "./reactive";
import { createTerrain } from "./terrain";
import { createWorld } from "./world";

const imageryUrl = "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}";
const mapboxToken =
  "pk.eyJ1IjoiZ3JhaGFtZ2liYm9uc2tyYXVzIiwiYSI6ImNsOWhjcXl4dDEyNWwzb295MjZhdWh6ejkifQ.1o2-p9zy03ahonJJD1SSow";
const elevationUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.png?access_token=${mapboxToken}`;

export const createApp = () =>
  createRoot(async dispose => {
    const element = document.createElement("canvas");
    document.body.appendChild(element);

    const context = await createContext(element);

    const [view, setView] = createSignal<View>({
      center: [-122.4194, 37.7749, 0], // SF
      distance: 100000,
      orientation: [0, 0, 0],
    });

    const world = createWorld(context, {
      layers: createDerived(() => [
        [createTerrain, { view, imageryUrl, elevationUrl }] as const,
      ]),
    });

    const control = createControl(element, world);
    createEffect(() => setView(control.view()));

    return {
      dispose,
    };
  });
