@group(0) @binding(0) var<uniform> center: vec3<u32>;
@group(0) @binding(1) var<uniform> projection: mat4x4<f32>;
@group(0) @binding(2) var<storage, read_write> tiles: array<vec3<u32>>;
@group(0) @binding(3) var<storage, read_write> count: atomic<u32>;

fn clip(tile: vec3<u32>) -> vec4<f32> {
    return projection * vec4<f32>(transform(tile_fixed(tile), center), 1.);
}

fn screen(clip: vec4<f32>) -> vec3<f32> {
    return clip.xyz / clip.w;
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    var stack: array<vec3<u32>, 1024>;
    var index = 1u;

    stack[0] = vec3<u32>(0, 0, 0);

    while index > 0u {
        index -= 1u;
        let tile = stack[index];
        let x = tile.x;
        let y = tile.y;
        let z = tile.z;

        let a = clip(tile);
        let b = clip(vec3<u32>(x + 1, y, z));
        let c = clip(vec3<u32>(x + 1, y + 1, z));
        let d = clip(vec3<u32>(x, y + 1, z));

        let outside_frustum = (a.x > a.w && b.x > b.w && c.x > c.w && d.x > d.w) || //
            (a.x < -a.w && b.x < -b.w && c.x < -c.w && d.x < -d.w) || //
            (a.y > a.w && b.y > b.w && c.y > c.w && d.y > d.w) || //
            (a.y < -a.w && b.y < -b.w && c.y < -c.w && d.y < -d.w) || //
            (a.z > a.w && b.z > b.w && c.z > c.w && d.z > d.w) || //
            (a.z < -a.w && b.z < -b.w && c.z < -c.w && d.z < -d.w);

        if outside_frustum {
            continue;
        }

        let v0 = transform(tile_fixed(tile), center);
        let v1 = transform(tile_fixed(vec3<u32>(x + 1, y, z)), center);
        let v2 = transform(tile_fixed(vec3<u32>(x, y + 1, z)), center);

        let backface = dot(vec3<f32>(0, 0, -1), normalize(cross(v1 - v0, v2 - v0))) > 0.0;

        if z > 3 && backface {
            continue;
        }

        let na = screen(a);
        let nb = screen(b);
        let nc = screen(c);
        let nd = screen(d);

        var minv = na;
        var maxv = na;

        minv = min(minv, nb);
        maxv = max(maxv, nb);
        minv = min(minv, nc);
        maxv = max(maxv, nc);
        minv = min(minv, nd);
        maxv = max(maxv, nd);

        let span = maxv - minv;
        let subdivide = max(span.x, span.y) > 0.75;

        if z < 2 || subdivide {
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

        tiles[atomicAdd(&count, 1u)] = tile;
    }
}