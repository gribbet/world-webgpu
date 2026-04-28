import { createContext } from "./context";
import { createControl } from "./control";
import { fill } from "./layers/fill";
import { type Line, line } from "./layers/line/index";
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
        (Math.random() - 0.5) * 2.0 * 1.0 - 122.4194,
        (Math.random() - 0.5) * 2.0 * 1.0 + 37.7749,
        10000 + Math.random() * 10000,
      ];
      const position = derived<Vec3>(() => [
        x + Math.sin(time() * 0.00001 + i),
        y + Math.cos(time() * 0.00001 + i),
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

    const lineExamples = derived<Line[]>(() => {
      const pulse = 800 + Math.sin(time() * 0.002) * 400;
      const centerLon = -122.4194;
      const centerLat = 37.7749;
      const ringRadius = 0.12;
      const count = 1000;
      const ringPoints = Array.from({ length: count }, (_, i) => {
        const t = (i / (count - 1)) * Math.PI * 2;
        return {
          position: [
            centerLon + Math.cos(t) * ringRadius,
            centerLat + Math.sin(t) * ringRadius,
            3000 + Math.sin(t * 3 + time() * 0.0015) * 1200,
          ] as Vec3,
          color: [0.2, 0.9, 1.0, 0.9] as Vec4,
          width: pulse,
        };
      });

      const count2 = 1000;
      const redOrangePoints = Array.from({ length: count2 }, (_, i) => {
        const t = i / (count2 - 1);
        const lon = -122.58 + t * (-122.16 - -122.58);
        const lat = 37.69 + Math.sin(t * Math.PI) * 0.17;
        const alt = 2000 + Math.sin(t * Math.PI * 4) * 1500 + t * 2000;
        const r = 1.0;
        const g = t < 0.5 ? 0.2 + t * 1.6 : 1.0;
        const b = t < 0.5 ? 0.2 : 0.2 + (t - 0.5) * 1.6;
        const w = 600 + Math.sin(t * Math.PI * 6) * 600 + 600;
        return {
          position: [lon, lat, alt] as Vec3,
          color: [r, g, b, 0.95] as Vec4,
          width: w,
        };
      });

      return [
        {
          points: redOrangePoints,
        },
        {
          points: [
            {
              position: [-122.52, 37.92, 2000],
              color: [0.3, 0.9, 1.0, 0.85],
              width: 1800,
            },
            {
              position: [-122.45, 37.86, 7000],
              color: [0.2, 0.8, 1.0, 0.85],
              width: 1800,
            },
            {
              position: [-122.38, 37.92, 2000],
              color: [0.1, 0.7, 1.0, 0.85],
              width: 1800,
            },
            {
              position: [-122.31, 37.86, 7000],
              color: [0.1, 0.6, 1.0, 0.85],
              width: 1800,
            },
            {
              position: [-122.24, 37.92, 2000],
              color: [0.1, 0.5, 1.0, 0.85],
              width: 1800,
            },
          ],
        },
        {
          points: ringPoints,
        },
      ];
    });

    const world = await createWorld(context, {
      view,
      layers: [
        terrain({ imageryUrl, elevationUrl }),
        text({ entries: textEntries }),
        line({ lines: lineExamples }),
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
