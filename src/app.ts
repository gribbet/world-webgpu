import { createContext } from "./context";
import { createControl } from "./control";
import { createDummyLayer } from "./layers/dummy";
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

    const control = createControl(element);
    const { view } = control;

    const [test, setTest] = createSignal(1);

    createEffect(() => {
      const interval = setInterval(() => {
        setTest(test() + 1);
      }, 1000);
      return () => clearInterval(interval);
    });

    createWorld(context, {
      layers: createDerived(() => [
        [createTerrain, { view, imageryUrl, elevationUrl }] as const,
        ...(test() % 4 !== 0 ? ([[createDummyLayer, { test }]] as const) : []),
      ]),
    });

    return {
      dispose,
    };
  });
