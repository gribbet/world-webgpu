@group(0) @binding(0) var<uniform> center: Position;
@group(0) @binding(1) var<uniform> projection: mat4x4<f32>;
@group(0) @binding(2) var<uniform> screen_size: vec2<f32>;
@group(0) @binding(3) var<storage, read_write> tiles: array<Tile>;
@group(0) @binding(4) var<storage, read_write> count: atomic<u32>;
@group(0) @binding(5) var<storage, read> imagery_map: array<MapEntry>;
@group(0) @binding(6) var<storage, read> elevation_map: array<MapEntry>;
@group(0) @binding(7) var elevation_textures: texture_2d_array<f32>;



fn project_tile(tile: vec3<u32>) -> vec4<f32> {
    let shift = 31u - tile.z;
    let x = tile.x << shift;
    let y = tile.y << shift;
    let index = lookup(tile, &elevation_map);
    let alt = sample_elevation(elevation_textures, tile, vec2<f32>(), index);
    let position = Position(x, y, alt);
    let value = project(position, center, projection);
    return value;
}

fn screen(v: vec4<f32>) -> vec3<f32> {
    return v.xyz / v.w;
}


@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    var stack: array<vec3<u32>, 256>;
    var index = 1u;
    var total = 0u;

    stack[0] = vec3<u32>(0, 0, 0);

    while index > 0u {
        index -= 1u;
        let tile = stack[index];
        let x = tile.x;
        let y = tile.y;
        let z = tile.z;

        let shift = 31u - z;
        let inside = (center.x >> shift) == x && (center.y >> shift) == y;

        let c1 = project_tile(tile);
        let c2 = project_tile(vec3<u32>(x + 1, y, z));
        let c3 = project_tile(vec3<u32>(x, y + 1, z));
        let c4 = project_tile(vec3<u32>(x + 1, y + 1, z));

        let cx = vec4<f32>(c1.x, c2.x, c3.x, c4.x);
        let cy = vec4<f32>(c1.y, c2.y, c3.y, c4.y);
        let cz = vec4<f32>(c1.z, c2.z, c3.z, c4.z);
        let cw = vec4<f32>(c1.w, c2.w, c3.w, c4.w);

        if !inside && (all(cx > cw) || all(cx < -cw) || all(cy > cw) || all(cy < -cw) || all(cz > cw) || all(cz < vec4(0.0)) || all(cw <= vec4(0.0))) {
            continue;
        }

        var subdivide = false;
        if z < 2 || any(cw <= vec4(0.0)) {
            subdivide = true;
        } else {
            let n1 = screen(c1);
            let n2 = screen(c2);
            let n3 = screen(c3);
            let n4 = screen(c4);

            let n_max = max(max(n1, n2), max(n3, n4));
            let n_min = min(min(n1, n2), min(n3, n4));

            let span = n_max - n_min;
            let pixels = span.xy * screen_size / 2.0;
            subdivide = length(pixels) > 384.0;
        }

        if subdivide && z < 24u {
            stack[index] = vec3<u32>(2 * x, 2 * y, z + 1);
            index++;
            stack[index] = vec3<u32>(2 * x + 1, 2 * y, z + 1);
            index++;
            stack[index] = vec3<u32>(2 * x + 1, 2 * y + 1, z + 1);
            index++;
            stack[index] = vec3<u32>(2 * x, 2 * y + 1, z + 1);
            index++;
            continue;
        }

        if total >= arrayLength(&tiles) {
            continue;
        }

        let imagery_texture = lookup(tile, &imagery_map);
        let elevation_texture = lookup(tile, &elevation_map);
        tiles[total] = Tile(tile, imagery_texture, elevation_texture);
        total++;
    }

    atomicStore(&count, total);
}

struct MapEntry {
    key: vec3<u32>,
    value: u32,
}

fn index_hash(v: vec3<u32>, size: u32) -> u32 {
    let p1 = 73856093u;
    let p2 = 19349663u;
    let p3 = 83492791u;
    return ((v.x * p1) ^ (v.y * p2) ^ (v.z * p3)) % size;
}

fn index_lookup(needle: vec3<u32>, map: ptr<storage, array<MapEntry>, read>) -> u32 {
    let size = arrayLength(map);
    var h = index_hash(needle, size);

    for (var i = 0u; i < size; i++) {
        let entry = (*map)[h];
        if entry.key.z == 0xffffffffu {
            return 0xffffffffu;
        }
        if all(entry.key == needle) {
            return entry.value;
        }
        h = (h + 1u) % size;
    }
    return 0xffffffffu;
}

fn downsample_tile(tile: vec3<u32>, n: u32) -> vec3<u32> {
    return vec3<u32>(tile.x >> n, tile.y >> n, select(0u, tile.z - n, tile.z >= n));
}

fn lookup(tile: vec3<u32>, map: ptr<storage, array<MapEntry>, read>) -> vec2<u32> {
    var current = tile;
    for (var downsample = 0u; downsample <= tile.z; downsample++) {
        let index = index_lookup(current, map);
        if index != 0xffffffffu {
            return vec2<u32>(index, downsample);
        }
        current = downsample_tile(current, 1u);
    }
    return vec2<u32>(0xffffffffu, 0u);
}