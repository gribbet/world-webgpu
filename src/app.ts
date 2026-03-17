import { createContext } from "./context";
import { createControl } from "./control";
import { createTerrain } from "./layers/terrain";
import { createTextLayer } from "./layers/text";
import type { View } from "./model";
import { createRoot, createSignal, derived, effect } from "./reactive";
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
      distance: 1000000000,
      orientation: [0, 0, 0],
    });

    const [time, setTime] = createSignal(0);
    const animate = (t: number) => {
      setTime(t);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    const textEntries = new Array(10000).fill(0).map((_, i) => {
      const [x, y, z] = [
        (Math.random() - 0.5) * 2.0 * 180.0,
        (Math.random() - 0.5) * 2.0 * 85.0,
        10000 + Math.random() * 100,
      ];
      const position = derived(() => [
        x + Math.sin(time() * 0.001 + i),
        y + Math.cos(time() * 0.001 + i),
        z,
      ]);
      const text = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const color = [Math.random(), Math.random(), Math.random(), 1.0] as const;

      return {
        position,
        size: 1000000,
        text,
        color,
        font: "sans-serif",
        fontSize: 48,
        maxScale: 1,
      };
    });

    const world = createWorld(context, {
      view,
      layers: [
        [createTerrain, { imageryUrl, elevationUrl }],
        [createTextLayer, { entries: textEntries }],
      ],
    });

    const control = createControl(element, world);
    effect(() => setView(control.view()));

    return {
      dispose,
    };
  });
