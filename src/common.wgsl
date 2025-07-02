const PI = radians(180.);
const ONE = 0xffffffff;
const ONEF = 4294967295.;

fn from_fixed(a: vec3<u32>) -> vec3<f32> {
    return vec3<f32>(a) * (1.0 / ONEF);
} 

fn to_fixed(a: vec3<f32>) -> vec3<u32> {
    return vec3<u32>(a * ONEF);
} 

struct VertexInput {
    @builtin(instance_index) instance: u32,
    @location(0) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn geographic_from_mercator(v: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        (v.x - 0.5) * (2. * PI),
        atan(sinh((v.y - 0.5) * (-2. * PI))),
        (v.z * 2. - 1.)
    );
}

fn cartesian_from_geographic(v: vec3<f32>) -> vec3<f32> {
    let n = v.z + 1.;
    let x = n * cos(v.y) * cos(v.x);
    let y = n * cos(v.y) * sin(v.x);
    let z = n * sin(v.y);
    return vec3<f32>(x, y, z);
}

fn geographic_from_fixed(a: vec3<u32>) -> vec3<f32> {
    return cartesian_from_geographic(geographic_from_mercator(from_fixed(a)));
}

fn tile_fixed(tile: vec3<u32>) -> vec3<u32> {
    return vec3<u32>(tile.xy * (ONE / (1u << tile.z)), ONE >> 1u);
}

fn transform(vertex: vec3<u32>, center: vec3<u32>) -> vec3<f32> {
    let c = geographic_from_fixed(center);
    let v = geographic_from_fixed(vertex);

    let z = normalize(c);
    let x = normalize(cross(vec3<f32>(0., 0., 1.), z));
    let y = cross(x, z);
    let rotation = transpose(mat3x3<f32>(x, y, z));

    return rotation * (v - c);
}