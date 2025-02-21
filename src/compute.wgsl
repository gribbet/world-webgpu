@group(0) @binding(0) var<storage, read> tiles: array<vec3<u32>>;
@group(0) @binding(1) var<storage, read_write> areas: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    let uv = tiles[id.x];
    areas[id.x] = f32(id.x);
}
