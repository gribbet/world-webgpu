import { derived } from "signals.ts";

import { createDataBuffer } from "../../buffer";
import type { Context } from "../../context";
import type { Vec4 } from "../../model";
import { buffer, u32, vec4f } from "../../storage";
import { type CommonLayerProps, createLayerRenderer } from "../common";

export const createRenderPipeline = async ({
  context,
  tilesBuffer,
  countBuffer,
  imageryTextures,
  elevationTextures,
  pickId,
  outline,
  depth,
  polygonOffset,
}: {
  context: Context;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  imageryTextures: () => GPUTexture;
  elevationTextures: () => GPUTexture;
  pickId: () => number;
  outline: Vec4;
  depth?: boolean;
  polygonOffset?: CommonLayerProps["polygonOffset"];
}) => {
  const { device, devicePixelRatio } = context;
  const code = await (
    await fetch(new URL("./render.wgsl", import.meta.url))
  ).text();

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { viewDimension: "2d-array" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        texture: { viewDimension: "2d-array" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });

  const pickStorage = buffer(u32(), device, { usage: GPUBufferUsage.UNIFORM });
  const outlineStorage = buffer(vec4f(), device, {
    usage: GPUBufferUsage.UNIFORM,
  });

  const resolution = 21;
  const count = resolution + 2;
  const vertices = new Array(count + 1)
    .fill(0)
    .flatMap((_, x) =>
      new Array(count + 1)
        .fill(0)
        .flatMap((_, y) => [
          ...[x, y].map(
            _ =>
              (Math.min(Math.max(_ - 1, 0), resolution) / resolution) * 2 ** 31,
          ),
          [x, y].some(_ => _ === 0 || _ === count) ? 1 : 0,
        ]),
    );
  const indexCount = count ** 2 * 6;
  const indirectBuffer = createDataBuffer(
    device,
    GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    new Uint32Array([indexCount, 0, 0, 0, 0]),
  );
  const verticesBuffer = createDataBuffer(
    device,
    GPUBufferUsage.VERTEX,
    new Uint32Array(vertices),
  );

  const indices = new Array(count).fill(0).flatMap((_, x) =>
    new Array(count).fill(0).flatMap((_, y) => {
      const i = y * (count + 1) + x;
      return [i, i + (count + 2), i + (count + 1), i, i + 1, i + (count + 2)];
    }),
  );
  const indicesBuffer = createDataBuffer(
    device,
    GPUBufferUsage.INDEX,
    new Uint32Array(indices),
  );

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 4,
  });

  const bindGroup = derived(() =>
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: tilesBuffer } },
        {
          binding: 1,
          resource: imageryTextures().createView({ dimension: "2d-array" }),
        },
        {
          binding: 2,
          resource: elevationTextures().createView({ dimension: "2d-array" }),
        },
        { binding: 3, resource: sampler },
        { binding: 4, resource: { buffer: pickStorage.buffer() } },
        { binding: 5, resource: { buffer: outlineStorage.buffer() } },
      ],
    }),
  );

  const { render, pick } = await createLayerRenderer({
    context,
    bindGroupLayout,
    buffers: [
      {
        arrayStride: 12,
        attributes: [{ shaderLocation: 0, format: "uint32x3", offset: 0 }],
      },
    ],
    topology: "triangle-list",
    code,
    constants: { devicePixelRatio },
    depth,
    polygonOffset,
    bindGroup,
    draw: (pass: GPURenderPassEncoder) => {
      pass.setVertexBuffer(0, verticesBuffer);
      pass.setIndexBuffer(indicesBuffer, "uint32");
      pass.drawIndexedIndirect(indirectBuffer, 0);
    },
  });

  const update = (encoder: GPUCommandEncoder) => {
    encoder.copyBufferToBuffer(countBuffer, 0, indirectBuffer, 4, 4);
    pickStorage.value = pickId();
    outlineStorage.value = outline;
    pickStorage.flush();
    outlineStorage.flush();
  };

  return {
    update,
    render,
    pick,
  };
};
