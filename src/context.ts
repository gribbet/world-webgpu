import { tileTextureLayers } from "./configuration";
import type { Vec2 } from "./model";
import { createPickRegistry } from "./pick-registry";
import { createSignal, onCleanup } from "./reactive";
import { createTextureLoader } from "./texture-loader";

export type Context = Awaited<ReturnType<typeof createContext>>;

export const createContext = async (element: HTMLCanvasElement) => {
  const sampleCount = 4;

  const { gpu } = navigator;
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found");

  const device = await adapter.requestDevice({
    requiredLimits: { maxTextureArrayLayers: tileTextureLayers },
  });

  const devicePixelRatio = window.devicePixelRatio || 1;
  const { width, height } = element;
  const [size, setSize] = createSignal<Vec2>([width, height]);
  const observer = new ResizeObserver(
    ([{ contentRect: { width, height } = {} } = {}]) => {
      if (width === undefined || height === undefined) return;
      element.width = width * devicePixelRatio;
      element.height = height * devicePixelRatio;
      setSize([width, height]);
    },
  );
  observer.observe(element);

  const context = element.getContext("webgpu");
  if (!context) throw new Error();

  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const textureLoader = createTextureLoader({ device });
  const pickRegistry = createPickRegistry();

  onCleanup(() => {
    observer.disconnect();
    device.destroy();
  });

  return {
    element,
    device,
    context,
    format,
    size,
    devicePixelRatio,
    sampleCount,
    textureLoader,
    pickRegistry,
  };
};
