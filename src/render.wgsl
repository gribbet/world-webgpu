@group(0) @binding(0) var<storage, read> tiles: array<vec3<u32>>;
@group(0) @binding(1) var<uniform> center: vec3<u32>;
@group(0) @binding(2) var<uniform> projection: mat4x4<f32>;

@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let tile = tiles[input.instance];
    let vertex = vec3<u32>(vec3<f32>(input.uv, 0.) * f32(ONE / (1u << tile.z))) + tile_fixed(tile);
    output.position = projection * vec4<f32>(project(vertex, center), 1.);
    return output;
}

@fragment
fn fragment() -> @location(0) vec4<f32> {
    return vec4<f32>(0.5, 0.5, 0.5, 1.);
}
