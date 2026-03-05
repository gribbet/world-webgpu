import type { Context } from "./context";
import type { Properties } from "./reactive";

export type Layer = {
  update?: (encode: GPUCommandEncoder) => void;
  render: (pass: GPURenderPassEncoder, options?: { pick?: boolean }) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LayerFactory<P extends Record<string, unknown> = any> = (
  context: Context,
  props: Properties<P>,
) => Layer | Promise<Layer>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LayerDefinition<P extends Record<string, unknown> = any> =
  readonly [LayerFactory<P>, P];
