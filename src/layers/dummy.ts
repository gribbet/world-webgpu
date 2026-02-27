import type { Context } from "../context";
import { type Properties, resolve } from "../reactive";
import { createEffect, onCleanup } from "../reactive";

export type DummyProps = {
  test: number;
};

export const createDummyLayer = (
  context: Context,
  props: Properties<DummyProps>,
) => {
  const { device } = context;

  const buffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });

  console.log("Create");

  createEffect(() => {
    const value = resolve(props.test);
    console.log("Update", value);

    const data = new Float32Array([value]);
    device.queue.writeBuffer(buffer, 0, data);
    return () => console.log("Undo", value);
  });

  onCleanup(() => {
    console.log("Destroy");
    buffer.destroy();
  });

  const render = () => {
    //
  };

  return Promise.resolve({ render });
};
