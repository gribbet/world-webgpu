import { createContext } from "./context";
import { createControl } from "./control";
import { type Billboard, createBillboardLayer } from "./layers/billboard";
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
      distance: 10000,
      orientation: [0, 0, 0],
    });

    const initialBillboards = new Array(10000).fill(0).map(
      () =>
        ({
          position: [
            -122.4194 + (Math.random() - 0.5) * 0.25,
            37.7749 + (Math.random() - 0.5) * 0.25,
            Math.random() * 1000,
          ],
          color: [Math.random(), Math.random(), Math.random(), 1.0],
        }) satisfies Billboard,
    );

    const [billboards, setBillboards] = createSignal(initialBillboards);

    let t = 0;
    setInterval(() => {
      t += 0.1;
      setBillboards(
        initialBillboards.map(({ position: [x, y, z], color }, i) => ({
          position: [
            x + Math.sin(t + i) * 0.001,
            y + Math.cos(t + i) * 0.001,
            z,
          ],
          color,
        })),
      );
    }, 16);

    const world = createWorld(context, {
      view,
      layers: createDerived(() => [
        [createTerrain, { imageryUrl, elevationUrl }],
        [createBillboardLayer, { billboards }],
      ]),
    });

    const control = createControl(element, world);
    createEffect(() => setView(control.view()));

    return {
      dispose,
    };
  });
