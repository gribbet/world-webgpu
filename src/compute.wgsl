@group(0) @binding(0) var<storage, read> tiles: array<vec3<u32>>;
@group(0) @binding(1) var<uniform> center: vec3<u32>;
@group(0) @binding(2) var<uniform> projection: mat4x4<f32>;
@group(0) @binding(3) var<storage, read_write> areas: array<f32>;

fn screen(tile: vec3<u32>) -> vec2<f32> {
    let clip = projection * vec4<f32>(project(tile_fixed(tile), center), 1.); 
    return clip.xy / clip.w;
}

fn area(points: array<vec2<f32>, 4>) -> f32 {
    var area = 0.0;
    for (var i = 0; i < 4; i = i + 1) {
        let j = (i + 1) % 4;
        area += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return 0.5 * abs(area);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    let tile = tiles[id.x];
    let a = screen(tile);
    let b = screen(vec3<u32>(tile.x + 1, tile.yz));
    let c = screen(vec3<u32>(tile.x + 1, tile.y + 1, tile.z));
    let d = screen(vec3<u32>(tile.x, tile.y+1, tile.z));
    areas[id.x] = area(array(a, b, c, d));
}
