@group(0) @binding(0) var<storage, read> tiles: array<vec3<u32>>;
@group(0) @binding(1) var<storage, read> count: u32;
@group(0) @binding(2) var<uniform> camera: vec3<f32>;
@group(0) @binding(3) var<uniform> projection: mat4x4<f32>;
@group(0) @binding(4) var<storage, read> imagery_indices: array<vec2<u32>>;
@group(0) @binding(5) var<storage, read> elevation_indices: array<vec2<u32>>;
@group(0) @binding(6) var imagery_textures: texture_2d_array<f32>;
@group(0) @binding(7) var elevation_textures: texture_2d_array<f32>;
@group(0) @binding(8) var sample: sampler;

struct VertexInput {
    @builtin(instance_index) instance: u32,
    @location(0) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(flat) instance: u32,
    @location(1) uv: vec2<f32>,
};

fn tile_vertex(tile: vec3<u32>) -> vec3<f32> {
    return vec3<f32>(vec2<f32>(tile.xy) / f32(1u << tile.z), 1.);
}

@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let i = input.instance;
    if i >= count {
        return output;
    }
    let tile = tiles[i];
    let index = elevation_indices[i].x;
    let downsample = elevation_indices[i].y;
    let k = u32(pow(2., f32(downsample)));
    let uv = (vec2<f32>(tile.xy % k) + input.uv) / f32(k);
    let size = textureDimensions(elevation_textures, index);
    let ij = vec2<i32>(uv * vec2<f32>(size));
    let e = textureLoad(elevation_textures, ij, index, 0);
    let t = (((256.0 * 256.0 * 255.0 * e.r) + (256.0 * 255.0 * e.g) + (255. * e.b)) / 10.0 - 10000.0) / 6371000.0;
    let vertex = vec3<f32>(input.uv, 0.) / f32(1u << tile.z) + tile_vertex(tile) + vec3(0, 0, t);
    output.position = projection * vec4<f32>(transform(vertex, camera), 1.);
    output.instance = input.instance;
    output.uv = input.uv;
    return output;
}


@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let i = input.instance;
    let tile = tiles[i];
    let index = imagery_indices[i].x;
    let downsample = imagery_indices[i].y;
    let k = u32(pow(2., f32(downsample)));
    let uv = (vec2<f32>(tile.xy % k) + input.uv) / f32(k);
    return textureSample(imagery_textures, sample, uv, index);
}
