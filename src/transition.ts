import { type Accessor, createSignal, effect, resolve } from "./reactive";

const TRANSITION_DURATION = 200;
const exponential = (t: number) => 1 - Math.pow(2, -10 * t);

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

export const transition = <T>(
  value: T | Accessor<T>,
  interpolate: (from: T, to: T, t: number) => T,
  equals: (a: T, b: T) => boolean = Object.is,
): Accessor<T> => {
  const now = getNowSignal();
  const initial = resolve(value);
  const [current, setCurrent] = createSignal(initial);
  const [from, setFrom] = createSignal(initial);
  const [to, setTo] = createSignal(initial);
  const [start, setStart] = createSignal(0);

  effect(() => {
    const next = resolve(value);
    const target = to();
    if (equals(next, target)) return;

    setFrom(current());
    setTo(next);
    setStart(now());
  });

  effect(() => {
    const source = from();
    const target = to();
    if (equals(source, target)) {
      if (!equals(current(), target)) setCurrent(target);
      return;
    }

    const elapsed = Math.max(0, now() - start());
    const t = Math.min(1, elapsed / TRANSITION_DURATION);
    const eased = exponential(t);

    if (t >= 1) {
      setCurrent(target);
      return;
    }

    setCurrent(interpolate(source, target, eased));
  });

  return current;
};

const equalVec4 = (
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

export const vec4Transition = (
  value:
    | readonly [number, number, number, number]
    | Accessor<readonly [number, number, number, number]>,
): Accessor<readonly [number, number, number, number]> =>
  transition(
    value,
    (from, to, t) => [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
      from[3] + (to[3] - from[3]) * t,
    ],
    equalVec4,
  );
