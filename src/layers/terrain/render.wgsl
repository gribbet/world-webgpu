@group(1) @binding(0) var<storage, read> tiles: array<Tile>;
@group(1) @binding(1) var imageryTextures: texture_2d_array<f32>;
@group(1) @binding(2) var elevationTextures: texture_2d_array<f32>;
@group(1) @binding(3) var sample: sampler;


struct VertexInput {
    @builtin(instance_index) instanceIndex: u32,
    @location(0) uvw: vec3<u32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(flat) instanceIndex: u32,
    @location(1) uv: vec2<f32>,
    @location(2) local: vec3<f32>,
};


@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let i = input.instanceIndex;
    let tile = tiles[i].tile;
    let index = tiles[i].elevationTexture;
    let uv = vec2<f32>(input.uvw.xy) / ONE;
    let alt = sampleElevation(elevationTextures, tile, uv, index);
    let tileXY = tile.xy << vec2<u32>(31u - tile.z);
    let tileSize = f32(1u << (31u - tile.z));
    let offset = vec2<u32>(round(uv * tileSize));
    let xy = tileXY + offset;
    let skirt = select(0.0, -0.1 * tileSize * CIRCUMFERENCE / ONE, input.uvw.z > 0);
    let world = Position(xy.x, xy.y, alt + skirt);
    let local = transform(world, center, projection);
    output.position = projection * vec4<f32>(local, 1.0);
    output.instanceIndex = input.instanceIndex;
    output.uv = uv;
    output.local = local;

    return output;
}


@fragment
fn render(input: VertexOutput) -> @location(0) vec4<f32> {
    let i = input.instanceIndex;
    let tile = tiles[i].tile;
    let index = tiles[i].imageryTexture;
    let k = 1u << index.y;
    let uv = (vec2<f32>(tile.xy % k) + input.uv) / f32(k);
    return textureSample(imageryTextures, sample, uv, index.x);
}

@fragment
fn pick(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.local, 1.0);
}
