@group(0) @binding(0) var<storage, read> tiles: array<vec3<u32>>;
@group(0) @binding(1) var<uniform> center: vec3<u32>;
@group(0) @binding(2) var<uniform> projection: mat4x4<f32>;
@group(0) @binding(3) var<storage, read_write> result: array<vec3<u32>>;
@group(0) @binding(4) var<storage, read_write> count: atomic<u32>;

fn clip(tile: vec3<u32>) -> vec4<f32> {
    return projection * vec4<f32>(project(tile_fixed(tile), center), 1.); 
}

fn screen(clip: vec4<f32>) -> vec2<f32> {
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
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let id = global_id.x;

    if (id > arrayLength(&tiles)) {
        return;
    }

    let tile = tiles[id];

    let a = clip(tile);
    let b = clip(vec3<u32>(tile.x + 1, tile.yz));
    let c = clip(vec3<u32>(tile.x + 1, tile.y + 1, tile.z));
    let d = clip(vec3<u32>(tile.x, tile.y+1, tile.z));

    if ((a.x > a.w && b.x > b.w && c.x > c.w && d.x > d.w)
     || (a.x < -a.w && b.x < -b.w && c.x < -c.w && d.x < -d.w)
     || (a.y > a.w && b.y > b.w && c.y > c.w && d.y > d.w)
     || (a.y < -a.w && b.y < -b.w && c.y < -c.w && d.y < -d.w)
     || (a.z > a.w && b.z > b.w && c.z > c.w && d.z > d.w)
     || (a.z < -a.w && b.z < -b.w && c.z < -c.w && d.z < -d.w)) {
        return;
     } else {
        let i = atomicAdd(&count, 1);
        result[i] = tile;
     }
}