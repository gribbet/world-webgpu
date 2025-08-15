const PI = radians(180.);

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

fn geographic_from_mercator(v: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        (v.x - 0.5) * (2. * PI),
        atan(sinh((v.y - 0.5) * (-2. * PI))),
        (v  .z * 2. - 1.)
    );
}

fn cartesian_from_geographic(v: vec3<f32>) -> vec3<f32> {
    let n = v.z + 1.;
    let x = n * cos(v.y) * cos(v.x);
    let y = n * cos(v.y) * sin(v.x);
    let z = n * sin(v.y);
    return vec3<f32>(x, y, z);
}

fn cartesian_from_mercator(v: vec3<f32>) -> vec3<f32> {
    return cartesian_from_geographic(geographic_from_mercator(v));
}

fn transform(vertex: vec3<f32>, center: vec3<f32>) -> vec3<f32> {
    let v = cartesian_from_mercator(vertex);
    let c = cartesian_from_mercator(center);

    let z = normalize(c);
    let x = normalize(cross(vec3<f32>(0., 0., 1.), z));
    let y = cross(x, z);
    let rotation = transpose(mat3x3<f32>(x, y, z));

    return rotation * (v - c);
}