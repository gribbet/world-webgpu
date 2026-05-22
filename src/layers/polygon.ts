import { effect, resolve, signal } from "signals.ts";

import { createLayer, createLayerType } from "../common";
import type { Vec3, Vec4 } from "../model";
import type { PickHandlers } from "../pick-registry";
import { type CommonLayerProps } from "./common";
import { fill } from "./fill";

export type PolygonProps = PickHandlers &
  CommonLayerProps & {
    rings: Vec3[][]; // first ring is the exterior, subsequent rings are holes
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

const bridgeHole = (outer: Vec3[], hole: Vec3[]): Vec3[] => {
  // Find the rightmost vertex of the hole (max x, stored at index 1 in working format)
  let hi = 0;
  for (let i = 1; i < hole.length; i++) if (hole[i]![1] > hole[hi]![1]) hi = i;
  const [, hx, hy] = hole[hi]!;

  // Find the outer edge that crosses y=hy with the smallest x >= hx
  let bridgeI = -1;
  let minX = Infinity;
  for (let i = 0; i < outer.length; i++) {
    const ni = (i + 1) % outer.length;
    const [, ax, ay] = outer[i]!;
    const [, bx, by] = outer[ni]!;
    if ((ay <= hy && hy <= by) || (by <= hy && hy <= ay)) {
      const ix =
        ay === by ? Math.max(ax, bx) : ax + ((hy - ay) * (bx - ax)) / (by - ay);
      if (ix >= hx && ix < minX) {
        minX = ix;
        bridgeI = ax > bx ? i : ni;
      }
    }
  }

  if (bridgeI === -1) {
    // Fallback: nearest outer vertex
    let minDist = Infinity;
    for (let i = 0; i < outer.length; i++) {
      const [, ox, oy] = outer[i]!;
      const d = (ox - hx) ** 2 + (oy - hy) ** 2;
      if (d < minDist) {
        minDist = d;
        bridgeI = i;
      }
    }
    if (bridgeI === -1) bridgeI = 0;
  }

  // Build bridged polygon by inserting the hole at bridgeI.
  // Duplicate the bridge endpoints so the merged ring is self-consistent.
  const holeRotated = [...hole.slice(hi), ...hole.slice(0, hi)];
  return [
    ...outer.slice(0, bridgeI + 1),
    ...holeRotated,
    hole[hi]!, // close bridge back to hole start
    outer[bridgeI]!, // close bridge back to outer
    ...outer.slice(bridgeI + 1),
  ];
};

const earcut = (vertices: Vec3[], holes: Vec3[][] = []): number[] => {
  let p: Vec3[] = vertices.map(([x, y], i) => [i, x, y] as Vec3);
  if (area(p) < 0) p.reverse();

  if (holes.length > 0) {
    // Compute each hole's offset into the combined vertex array
    const holeOffsets: number[] = [];
    let offset = vertices.length;
    for (const hole of holes) {
      holeOffsets.push(offset);
      offset += hole.length;
    }

    // Process holes from rightmost to leftmost to avoid bridge interference
    const order = holes
      .map((_, i) => i)
      .sort(
        (a, b) =>
          Math.max(...holes[b]!.map(v => v[0])) -
          Math.max(...holes[a]!.map(v => v[0])),
      );

    for (const i of order) {
      const h: Vec3[] = holes[i]!.map(
        ([x, y], j) => [holeOffsets[i]! + j, x, y] as Vec3,
      );
      if (area(h) > 0) h.reverse(); // holes must wind opposite to outer
      p = bridgeHole(p, h);
    }
  }

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
  (context, { rings, color, depth, polygonOffset, ...pickHandlers }) => {
    const [fillVertices, setFillVertices] = signal<
      { position: Vec3; color: Vec4 }[]
    >([]);
    const [indices, setIndices] = signal<number[]>([]);

    effect(() => {
      const _rings = resolve(rings);
      const [exterior = [], ...holes] = _rings;
      const _color = resolve(color);

      const allVerts: Vec3[] = [exterior, ...holes].flat();
      setFillVertices(allVerts.map(position => ({ position, color: _color })));
      setIndices(earcut(exterior, holes));
    });

    return createLayer(
      context,
      fill({
        ...pickHandlers,
        vertices: fillVertices,
        indices,
        depth,
        polygonOffset,
      }),
    );
  },
);
