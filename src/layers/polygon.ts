import { createSignal, effect, resolve } from "signals.ts";

import { createLayer, createLayerType } from "../common";
import type { Vec3, Vec4 } from "../model";
import type { PickHandlers } from "../pick-registry";
import { fill } from "./fill";

export type PolygonProps = PickHandlers & {
  vertices: Vec3[];
  color: Vec4;
};

const area = (p: Vec3[]) =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length]!;
    const [, ax, ay] = a;
    const [, bx, by] = b;
    return s + ax * by - bx * ay;
  }, 0);

const cross = (a: Vec3, b: Vec3, c: Vec3) => {
  const [, ax, ay] = a;
  const [, bx, by] = b;
  const [, cx, cy] = c;
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
};

const inside = (a: Vec3, b: Vec3, c: Vec3, p: Vec3) =>
  cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;

const earcut = (vertices: Vec3[]) => {
  const p: Vec3[] = vertices.map(([x, y], i) => [i, x, y] as Vec3);

  if (area(p) < 0) p.reverse();

  const out: number[] = [];
  let guard = p.length * p.length;

  while (p.length > 3 && guard--) {
    let cut = false;

    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length]!;
      const b = p[i]!;
      const c = p[(i + 1) % p.length]!;

      if (cross(a, b, c) <= 0) continue;
      if (p.some(q => q !== a && q !== b && q !== c && inside(a, b, c, q)))
        continue;

      const [ai] = a;
      const [bi] = b;
      const [ci] = c;
      out.push(ai, bi, ci);
      p.splice(i, 1);
      cut = true;
      break;
    }

    if (!cut) break;
  }

  if (p.length === 3) {
    const [va, vb, vc] = p;
    const [ai] = va!;
    const [bi] = vb!;
    const [ci] = vc!;
    out.push(ai, bi, ci);
  }
  return out;
};

export const polygon = createLayerType<PolygonProps>(
  (context, { vertices, color, ...pickHandlers }) => {
    const [fillVertices, setFillVertices] = createSignal<
      { position: Vec3; color: Vec4 }[]
    >([]);
    const [indices, setIndices] = createSignal<number[]>([]);

    effect(() => {
      const _vertices = resolve(vertices);
      const _color = resolve(color);

      setFillVertices(_vertices.map(position => ({ position, color: _color })));
      setIndices(earcut(_vertices));
    });

    return createLayer(
      context,
      fill({ ...pickHandlers, vertices: fillVertices, indices }),
    );
  },
);
