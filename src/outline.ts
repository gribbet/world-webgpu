import { createBuffer } from "./buffer";
import type { Context } from "./context";

const width = 1.5;

export const createOutline = async (context: Context) => {
  const { device, format, devicePixelRatio } = context;

  const code = await (
    await fetch(new URL("./outline.wgsl", import.meta.url))
  ).text();

  const module = device.createShaderModule({ code });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "uint" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });

  const pipeline = await device.createRenderPipelineAsync({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module, entryPoint: "vertex" },
    fragment: {
      module,
      entryPoint: "fragment",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
    multisample: { count: 1 },
  });

  const widthBuffer = createBuffer(device, {
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    widthBuffer,
    0,
    new Float32Array([width * devicePixelRatio]),
  );

  const render = (pass: GPURenderPassEncoder, pickView: GPUTextureView) => {
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: pickView },
        { binding: 1, resource: { buffer: widthBuffer } },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
  };

  return { render };
};
