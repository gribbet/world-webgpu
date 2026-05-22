import { type Accessor, createSignal, derived, untrack } from "signals.ts";

import {
  lerp,
  lerpOrientation,
  lerpPosition,
  lerpVec3,
  lerpVec4,
  lngLatDistance,
  slerp,
} from "./math";
import type { Vec3, Vec4, View } from "./model";

export const [now, setNow] = createSignal(performance.now());

const tick = (t: number) => {
  setNow(t);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

export const atFrame = <T>(source: Accessor<T>) =>
  derived(() => {
    now();
    return untrack(source);
  });

// Per-frame stateful transition. `step` is invoked each animation frame with
// the elapsed `time` (seconds), the current value, and the latest target
// value, and returns the next current value.
export const transition =
  <T>(step: (_: { time: number; current: T; target: T }) => T) =>
  (target: Accessor<T>): Accessor<T> => {
    let current: T | undefined;
    let last: number | undefined;
    return derived(() => {
      const t = now();
      const time = (t - (last ?? t)) / 1000;
      last = t;
      if (time > 1) current = undefined; // long gap (tab inactive): restart
      const next = untrack(target);
      current = step({ time, current: current ?? next, target: next });
      return current;
    });
  };

const expQ = (time: number) => 1 - Math.exp((-time * 1000) / 100);

export const vec4Transition = transition<Vec4>(({ time, current, target }) =>
  lerpVec4(current, target, expQ(time)),
);
export const vec3Transition = transition<Vec3>(({ time, current, target }) =>
  lerpVec3(current, target, expQ(time)),
);

export const positionTransition = transition<Vec3>(
  ({ time, current, target }) => {
    if (lngLatDistance(current, target) > 1000) return target;
    return lerpPosition(current, target, expQ(time));
  },
);

export const numberTransition = transition<number>(
  ({ time, current, target }) => lerp(current, target, expQ(time)),
);
export const quaternionTransition = transition<Vec4>(
  ({ time, current, target }) => slerp(current, target, expQ(time)),
);

export const createViewTransition = transition<View>(
  ({ time, current, target }) => {
    let flyDistance = lngLatDistance(current.center, target.center);
    if (flyDistance < 1000) flyDistance = 0;

    const targetDistance = Math.max(target.distance, flyDistance);
    const q = expQ(time);
    const ratio = current.distance / targetDistance;
    const factor = Math.min(1, q * ratio * ratio);

    return {
      center: lerpPosition(current.center, target.center, factor),
      distance: Math.exp(
        lerp(Math.log(current.distance), Math.log(targetDistance), q),
      ),
      orientation: lerpOrientation(current.orientation, target.orientation, q),
      fieldOfView: lerp(current.fieldOfView, target.fieldOfView, q),
    };
  },
);
