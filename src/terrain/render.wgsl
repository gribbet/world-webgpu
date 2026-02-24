@group(0) @binding(0) var<storage, read> tiles: array<Tile>;
@group(0) @binding(1) var<uniform> center: Position;
@group(0) @binding(2) var<uniform> projection: mat4x4<f32>;
@group(0) @binding(3) var imagery_textures: texture_2d_array<f32>;
@group(0) @binding(4) var elevation_textures: texture_2d_array<f32>;
@group(0) @binding(5) var sample: sampler;


struct VertexInput {
    @builtin(instance_index) instance: u32,
    @location(0) uv: vec2<u32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(flat) instance: u32,
    @location(1) uv: vec2<f32>,
};


@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let i = input.instance;
    let tile = tiles[i].tile;
    let index = tiles[i].elevation_texture;
    let uv = vec2<f32>(input.uv) / ONE;
    let alt = sample_elevation(elevation_textures, tile, uv, index);
    let tile_xy = tile.xy << vec2<u32>(31u - tile.z);
    let tile_size = f32(1u << (31u - tile.z));
    let offset = vec2<u32>(round(uv * tile_size));
    let xy = tile_xy + offset;
    let position = Position(xy.x, xy.y, alt);
    output.position = project(position, center, projection);
    output.instance = input.instance;
    output.uv = uv;
    return output;
}


@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let i = input.instance;
    let tile = tiles[i].tile;
    let index = tiles[i].imagery_texture;
    let k = 1u << index.y;
    let uv = (vec2<f32>(tile.xy % k) + input.uv) / f32(k);
    return textureSample(imagery_textures, sample, uv, index.x);
}
