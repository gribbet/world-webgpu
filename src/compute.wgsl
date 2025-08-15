@group(0) @binding(0) var<uniform> camera: vec3<f32>;
@group(0) @binding(1) var<uniform> projection: mat4x4<f32>;
@group(0) @binding(2) var<storage, read_write> tiles: array<vec3<u32>>;
@group(0) @binding(3) var<storage, read_write> count: atomic<u32>;

fn clip(v: vec3<f32>) -> vec4<f32> {
    return projection * vec4<f32>(v, 1.);
}

fn world(v: vec3<f32>) -> vec3<f32> {
    return transform(v, camera);
}

fn screen(v: vec4<f32>) -> vec3<f32> {
    return v.xyz / v.w;
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

        let v1 = world(tile_vertex(tile));
        let v2 = world(tile_vertex(vec3<u32>(x + 1, y, z)));
        let v3 = world(tile_vertex(vec3<u32>(x, y + 1, z)));
        let v4 = world(tile_vertex(vec3<u32>(x + 1, y + 1, z)));

        let c1 = clip(v1);
        let c2 = clip(v2);
        let c3 = clip(v3);
        let c4 = clip(v4);

        let outside_frustum = (c1.x > c1.w && c2.x > c2.w && c3.x > c3.w && c4.x > c4.w) || //
            (c1.x < -c1.w && c2.x < -c2.w && c3.x < -c3.w && c4.x < -c4.w) || //
            (c1.y > c1.w && c2.y > c2.w && c3.y > c3.w && c4.y > c4.w) || //
            (c1.y < -c1.w && c2.y < -c2.w && c3.y < -c3.w && c4.y < -c4.w) || //
            (c1.z > c1.w && c2.z > c2.w && c3.z > c3.w && c4.z > c4.w) || //
            (c1.z < -c1.w && c2.z < -c2.w && c3.z < -c3.w && c4.z < -c4.w);

        if outside_frustum {
            continue;
        }

        let backface = dot(vec3<f32>(0, 0, -1), normalize(cross(v2 - v1, v3 - v1))) > 0.0;

        if z > 3 && backface {
            continue;
        }

        let n1 = screen(c1);
        let n2 = screen(c2);
        let n3 = screen(c3);
        let n4 = screen(c4);

        var n_max = n1;
        n_max = max(n_max, n2);
        n_max = max(n_max, n3);
        n_max = max(n_max, n4);

        var n_min = n1;
        n_min = min(n_min, n2);
        n_min = min(n_min, n3);
        n_min = min(n_min, n4);


        let span = n_max - n_min;
        let subdivide = max(span.x, span.y) > 1;

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