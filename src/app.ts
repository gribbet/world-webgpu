import { derived, map, root, signal } from "signals.ts";

import { createContext } from "./context";
import { createControl } from "./control";
import { fill } from "./layers/fill";
import { type Vertex as LineVertex } from "./layers/line";
import { line } from "./layers/line";
import { type Mesh, object, type Vertex as MeshVertex } from "./layers/object";
import { terrain } from "./layers/terrain";
import { text } from "./layers/text";
import type { Vec2, Vec3, Vec4, View } from "./model";
import type { PickEvent } from "./pick-registry";
import { vec4Transition } from "./transition";
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

  const vertices: MeshVertex[] = [];
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
  root(async dispose => {
    const element = document.createElement("canvas");
    document.body.appendChild(element);

    const context = await createContext(element);

    const [view, setView] = signal<View>({
      center: [-122.4194, 37.7749, 0],
      distance: 10000000,
      orientation: [0, 0, 0],
      fieldOfView: 45,
    });

    const [time, setTime] = signal(0);
    const animate = (t: number) => {
      setTime(t);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    const [items, setItems] = signal<
      { id: string; position: Vec3; test: boolean }[]
    >([]);

    const appendItem = (position: Vec3) => {
      const id = Math.random().toString();
      setItems([...items(), { id, position, test: false }]);
      setTimeout(() => {
        setItems(items().filter(i => i.id !== id));
      }, 50000);
    };

    const cubeMesh = createCubeMesh();
    const cubeSize = 1000; // 50 km half-extent
    const spin = derived<Vec4>(() => {
      const a = time() * 0.0005;
      return [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
    });

    // Static lines that don't animate
    const redOrangeLine = Array.from({ length: 1000 }, (_, i) => {
      const t = i / 999;
      const lon = -122.58 + t * (-122.16 - -122.58);
      const lat = 37.69 + Math.sin(t * Math.PI) * 0.17;
      const alt = 2000 + Math.sin(t * Math.PI * 4) * 1500 + t * 2000;
      const r = 1.0;
      const g = t < 0.5 ? 0.2 + t * 1.6 : 1.0;
      const b = t < 0.5 ? 0.2 : 0.2 + (t - 0.5) * 1.6;
      const w = 600 + Math.sin(t * Math.PI * 6) * 600 + 600;
      return {
        position: [lon, lat, alt],
        color: [r, g, b, 0.95],
        width: w,
      } satisfies LineVertex;
    });

    const waypointsLine = [
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
    ] satisfies LineVertex[];

    // Animated ring line that depends on time
    const animatedRingLine = derived(() => {
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
          ],
          color: [0.2, 0.9, 1.0, 0.9],
          width: pulse,
        } satisfies LineVertex;
      });
      return ringPoints;
    });

    const lineExamples = derived(() => [animatedRingLine()]);

    const staticLineExamples = [redOrangeLine, waypointsLine];

    const onTerrainClick = ({ position }: PickEvent) => appendItem(position);

    const textEntries = map(
      items,
      item => {
        const targetColor = derived(
          (): Vec4 =>
            item().test ? [1.0, 0.35, 0.35, 1.0] : [1.0, 1.0, 1.0, 1.0],
        );
        const position = derived(() => item().position);
        const color = vec4Transition(targetColor);
        const updatePosition = (nextPosition: Vec3) => {
          const { id } = item();
          setItems(
            items().map(entry =>
              entry.id === id ? { ...entry, position: nextPosition } : entry,
            ),
          );
        };

        return {
          text: "■",
          position,
          size: 6000,
          font: "sans-serif",
          fontSize: 128,
          color,
          minScale: 0.25,
          maxScale: 1.0,
          onDrag: (event: PickEvent) => updatePosition(event.position),
        };
      },
      { key: _ => _.id },
    );

    const layers = derived(() => [
      terrain({ imageryUrl, elevationUrl, onClick: onTerrainClick }),
      text({ entries: textEntries }),
      line({ vertices: staticLineExamples }),
      line({ vertices: lineExamples }),
      fill({
        vertices: [
          { position: [-122.5, 37.7, 10000], color: [1, 0, 0, 0.5] },
          { position: [-122.3, 37.7, 10000], color: [0, 1, 0, 0.5] },
          { position: [-122.3, 37.9, 10000], color: [0, 0, 1, 0.5] },
          { position: [-122.5, 37.9, 10000], color: [1, 1, 0, 0.5] },
        ],
        indices: [0, 1, 2, 0, 2, 3],
      }),
      object({
        mesh: cubeMesh,
        polygonOffset: -100000,
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
    ]);

    const world = await createWorld(context, {
      view,
      layers,
    });

    createControl({ element, world, view, setView });

    return {
      dispose,
    };
  });
