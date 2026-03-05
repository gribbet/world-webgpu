import type { Context } from "./context";
import {
  createDerived,
  createEffect,
  createSignal,
  map,
  onCleanup,
  type Properties,
  resolve,
} from "./reactive";
import type { Layer, LayerDefinition, LayerFactory } from "./world";

export type ContainerProperties = {
  layers: LayerDefinition[];
};

export const createContainerLayer = (
  context: Context,
  { layers }: Properties<ContainerProperties>,
): Layer => {
  type StableEntry<
    P extends Record<string, unknown> = Record<string, unknown>,
  > = {
    type: LayerFactory<P>;
    properties: P;
    update: (properties: P) => void;
  };
  const groups = new Map<LayerFactory, StableEntry[]>();

  onCleanup(() => groups.clear());

  const stableList = createDerived(() => {
    const next = resolve(layers);
    const nextGroups = new Map<LayerFactory, StableEntry[]>();

    const result = next.map(def => {
      const [type, properties] = def;
      let group = groups.get(type);
      let entry = group?.shift();

      if (entry) entry.update(properties);
      else {
        const [getLatestProps, setLatestProps] = createSignal(properties);
        const reactiveProps = {} as Record<string, unknown>;

        for (const key in properties)
          Object.defineProperty(reactiveProps, key, {
            get: () => getLatestProps()[key],
            enumerable: true,
          });

        entry = {
          type,
          properties: reactiveProps,
          update: setLatestProps,
        };
      }

      group = nextGroups.get(type) ?? [];
      group.push(entry);
      nextGroups.set(type, group);
      return entry;
    });

    groups.clear();
    for (const [type, properties] of nextGroups) groups.set(type, properties);
    return result;
  });

  const [active, setActive] = createSignal<Layer[]>([]);

  const items = map(stableList, (stable: StableEntry) =>
    stable.type(
      context,
      stable.properties as Properties<Record<string, unknown>>,
    ),
  );

  createEffect(() => {
    const list = items();
    let current = true;
    onCleanup(() => {
      current = false;
    });

    void Promise.all(list).then(resolved => {
      if (current) setActive(resolved);
    });
  });

  const update = (encoder: GPUCommandEncoder) =>
    active().forEach(_ => _.update?.(encoder));

  const render = (pass: GPURenderPassEncoder) =>
    active().forEach(_ => _.render(pass));

  return {
    update,
    render,
  };
};
