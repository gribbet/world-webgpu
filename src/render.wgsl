@group(0) @binding(0) var<storage, read> tiles: array<vec3<u32>>;
@group(0) @binding(1) var<storage, read> count: u32;
@group(0) @binding(2) var<uniform> center: vec3<f32>;
@group(0) @binding(3) var<uniform> projection: mat4x4<f32>;
@group(0) @binding(4) var<storage, read> texture_indices: array<vec2<u32>>;
@group(0) @binding(5) var textures: texture_2d_array<f32>;
@group(0) @binding(6) var sample: sampler;

@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    if input.instance >= count {
        return output;
    }
    let tile = tiles[input.instance];
    let vertex = vec3<f32>(input.uv, 0.) / f32(1u << tile.z) + tile_vertex(tile);
    output.position = projection * vec4<f32>(transform(vertex, center), 1.);
    output.instance = input.instance;
    output.uv = input.uv;
    return output;
}


@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let i = input.instance;
    let tile = tiles[i];
    let index = texture_indices[i].x;
    let downsample = texture_indices[i].y;
    let k = u32(pow(2., f32(downsample)));
    let uv = (vec2<f32>(tile.xy % k) + input.uv) / f32(k);
    return textureSample(textures, sample, uv, index);
}
