import {
  createLayerType,
  type Layer,
  type LayerDescriptor,
  type LayerFactory,
} from "./common";
import type { Context } from "./context";
import {
  createSignal,
  derived,
  effect,
  map,
  onCleanup,
  type Properties,
  resolve,
} from "./reactive";

export type ContainerProperties = {
  layers: LayerDescriptor[];
};

type Cell = {
  key: object;
  create: () => Layer | Promise<Layer>;
  update: (properties: object) => void;
};

const createCell = <P>(
  context: Context,
  factory: LayerFactory<P>,
  initial: Properties<P>,
): Cell => {
  const [getProps, setProps] = createSignal(initial);
  const reactiveProps = {} as Properties<P>;
  for (const key in initial)
    Object.defineProperty(reactiveProps, key, {
      get: () => getProps()[key as keyof Properties<P>],
      enumerable: true,
    });
  return {
    key: factory,
    create: () => factory(context, reactiveProps),
    update: properties => setProps(properties as Properties<P>),
  };
};

export const createContainerLayer = (
  context: Context,
  { layers }: Properties<ContainerProperties>,
): Layer => {
  const groups = new Map<object, Cell[]>();

  onCleanup(() => groups.clear());

  const stableList = derived(() => {
    const next = resolve(layers);
    const nextGroups = new Map<object, Cell[]>();

    const result = next.map(descriptor =>
      descriptor((factory, properties) => {
        let group = groups.get(factory);
        let cell = group?.shift();

        if (cell) cell.update(properties);
        else cell = createCell(context, factory, properties);

        group = nextGroups.get(cell.key) ?? [];
        group.push(cell);
        nextGroups.set(cell.key, group);
        return cell;
      }),
    );

    groups.clear();
    for (const [key, cells] of nextGroups) groups.set(key, cells);
    return result;
  });

  const [active, setActive] = createSignal<Layer[]>([]);

  const items = map(stableList, _ => _.create());

  effect(() => {
    const list = items();
    let current = true;
    onCleanup(() => {
      current = false;
    });

    void Promise.all(list).then(resolved => {
      if (current) setActive(resolved);
    });
  });

  const compute = (pass: GPUComputePassEncoder) =>
    active().forEach(_ => _.compute?.(pass));

  const update = (encoder: GPUCommandEncoder) =>
    active().forEach(_ => _.update?.(encoder));

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => active().forEach(_ => _.render(pass, { pick }));

  return {
    compute,
    update,
    render,
  };
};

export const container =
  createLayerType<ContainerProperties>(createContainerLayer);
