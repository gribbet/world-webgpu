import { slerp } from "./math";
import type { Vec3, View } from "./model";
import { type Accessor, createSignal, derived } from "./reactive";

let defaultNowSignal: Accessor<number> | undefined = undefined;

const createDefaultNowSignal = (): Accessor<number> => {
  const initialNow =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const [now, setNow] = createSignal(initialNow);

  if (typeof requestAnimationFrame === "function") {
    const tick = (t: number) => {
      setNow(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  return now;
};

const getNowSignal = () => {
  if (!defaultNowSignal) defaultNowSignal = createDefaultNowSignal();
  return defaultNowSignal;
};

const TRANSITION_K = 10;

// Per-frame stateful transition. `step` is invoked each animation frame with
// the elapsed `time` (seconds), the current value, and the latest target
// value, and returns the next current value.
export const transition =
  <T>(step: (_: { time: number; current: T; target: T }) => T) =>
  (target: () => T): Accessor<T> => {
    const now = getNowSignal();
    let current: T | undefined;
    let last: number | undefined;
    return derived(() => {
      const t = now();
      const time = (t - (last ?? t)) / 1000;
      last = t;
      if (time > 1) current = undefined; // long gap (tab inactive): restart
      const next = target();
      current = step({ time, current: current ?? next, target: next });
      return current;
    });
  };

export const vec4Transition = transition<
  readonly [number, number, number, number]
>(({ time, current, target }) => {
  const q = 1 - Math.exp(-TRANSITION_K * time);
  return [
    current[0] + (target[0] - current[0]) * q,
    current[1] + (target[1] - current[1]) * q,
    current[2] + (target[2] - current[2]) * q,
    current[3] + (target[3] - current[3]) * q,
  ];
});

export const vec3Transition = transition<readonly [number, number, number]>(
  ({ time, current, target }) => {
    const q = 1 - Math.exp(-TRANSITION_K * time);
    return [
      current[0] + (target[0] - current[0]) * q,
      current[1] + (target[1] - current[1]) * q,
      current[2] + (target[2] - current[2]) * q,
    ];
  },
);

export const numberTransition = transition<number>(
  ({ time, current, target }) =>
    current + (target - current) * (1 - Math.exp(-TRANSITION_K * time)),
);

export const quaternionTransition = transition<
  readonly [number, number, number, number]
>(({ time, current, target }) =>
  slerp(current, target, 1 - Math.exp(-TRANSITION_K * time)),
);

// Approximate distance in meters between two [lon, lat, alt] points.
const EARTH_RADIUS = 6378137;
const distance = (a: Vec3, b: Vec3) => {
  const lat = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  const dx = (((b[0] - a[0]) * Math.PI) / 180) * EARTH_RADIUS * Math.cos(lat);
  const dy = (((b[1] - a[1]) * Math.PI) / 180) * EARTH_RADIUS;
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

// Long-distance moves zoom out during travel (so we don't load a wall of
// high-zoom tiles) and slow horizontal motion while zoomed out, then ease
// back in near the target.
const VIEW_TRANSITION_K = 8;
const FLY_MIN_DISTANCE = 1000;

export const createViewTransition = transition<View>(
  ({ time, current, target }) => {
    let flyDistance = distance(current.center, target.center);
    if (flyDistance < FLY_MIN_DISTANCE) flyDistance = 0;

    const targetDistance = Math.max(target.distance, flyDistance);
    const q = 1 - Math.exp(-VIEW_TRANSITION_K * time);
    const slowdown =
      flyDistance === 0 || current.distance > flyDistance
        ? 1
        : current.distance / flyDistance;

    return {
      center: lerpVec3(current.center, target.center, q * slowdown),
      distance: Math.exp(
        lerp(Math.log(current.distance), Math.log(targetDistance), q),
      ),
      orientation: lerpOrientation(current.orientation, target.orientation, q),
    };
  },
);

// Shortest-path interpolation of [yaw, pitch, roll] euler angles. Yaw and
// roll wrap around 2π so we take the short way around; pitch is clamped in
// (-π/2, π/2) and just lerps directly.
const TAU = Math.PI * 2;
const lerpAngle = (a: number, b: number, t: number) => {
  let d = (((b - a) % TAU) + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  return a + d * t;
};
const lerpOrientation = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerpAngle(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerpAngle(a[2], b[2], t),
];
