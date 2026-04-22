import { onCleanup } from "./reactive";

export type PickRegistry = {
  allocate: () => number;
};

export const createPickRegistry = (): PickRegistry => {
  let nextId = 1;
  const freeList: number[] = [];

  const allocate = () => {
    const id = freeList.length > 0 ? freeList.pop()! : nextId++;
    onCleanup(() => {
      freeList.push(id);
    });
    return id;
  };

  return { allocate };
};
