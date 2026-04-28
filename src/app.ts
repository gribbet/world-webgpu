import { createContext } from "./context";
import { createControl } from "./control";
import { fill } from "./layers/fill";
import { type Mesh, mesh, type Vertex } from "./layers/mesh";
import { terrain } from "./layers/terrain";
import { text } from "./layers/text";
import type { Vec2, Vec3, Vec4, View } from "./model";
import { createRoot, createSignal, derived, effect } from "./reactive";
import { createWorld } from "./world";

const createCubeMesh = (): Mesh => {
  const faces: {
    corners: [number, number, number][];
    normal: [number, number, number];
    color: Vec4;
  }[] = [
    {
      corners: [
        [1, -1, 1],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
      ],
      normal: [1, 0, 0],
      color: [1, 0, 0, 1],
    },
    {
      corners: [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
      normal: [-1, 0, 0],
      color: [0, 1, 1, 1],
    },
    {
      corners: [
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1],
      ],
      normal: [0, 1, 0],
      color: [0, 1, 0, 1],
    },
    {
      corners: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
      normal: [0, -1, 0],
      color: [1, 0, 1, 1],
    },
    {
      corners: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
      normal: [0, 0, 1],
      color: [0, 0, 1, 1],
    },
    {
      corners: [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
      normal: [0, 0, -1],
      color: [1, 1, 0, 1],
    },
  ];

  const vertices: Vertex[] = [];
  const indices: Vec3[] = [];
  const faceUvs: Vec2[] = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];

  faces.forEach((face, f) => {
    face.corners.forEach((corner, c) => {
      vertices.push({
        position: corner,
        color: face.color,
        uv: faceUvs[c],
        normal: face.normal,
      });
    });
    const base = f * 4;
    indices.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
  });

  return { vertices, indices };
};

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

    const textEntries = new Array(100).fill(0).map((_, i) => {
      const [x, y, z] = [
        (Math.random() - 0.5) * 2.0 * 180.0,
        (Math.random() - 0.5) * 2.0 * 85.0,
        10000 + Math.random() * 10000,
      ];
      const position = derived<Vec3>(() => [
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
        minScale: 0,
        maxScale: 1,
      };
    });

    const cubeMesh = createCubeMesh();
    const cubeSize = 1000; // 50 km half-extent
    const spin = derived<Vec4>(() => {
      const a = time() * 0.0005;
      return [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
    });

    const world = await createWorld(context, {
      view,
      layers: [
        terrain({ imageryUrl, elevationUrl }),
        text({ entries: textEntries }),
        fill({
          vertices: [
            { position: [-122.5, 37.7, 10000], color: [1, 0, 0, 0.5] },
            { position: [-122.3, 37.7, 10000], color: [0, 1, 0, 0.5] },
            { position: [-122.3, 37.9, 10000], color: [0, 0, 1, 0.5] },
            { position: [-122.5, 37.9, 10000], color: [1, 1, 0, 0.5] },
          ],
          indices: [0, 1, 2, 0, 2, 3],
        }),
        mesh({
          mesh: cubeMesh,
          instances: [
            {
              position: [-122.4194, 37.7749, 10000],
              scale: cubeSize,
              minScalePixels: 24,
              maxScalePixels: 96,
              orientation: spin,
            },
          ],
        }),
      ],
    });

    document.addEventListener("click", async ({ x, y }) =>
      console.log(await world.pick(x, y)),
    );

    const control = createControl(element, world);
    effect(() => setView(control.view()));

    return {
      dispose,
    };
  });
