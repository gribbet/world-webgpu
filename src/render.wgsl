@group(0) @binding(0) var<storage, read> tiles: array<vec3<u32>>;
@group(0) @binding(1) var<uniform> center: vec3<u32>;
@group(0) @binding(2) var<uniform> projection: mat4x4<f32>;

struct f64 { 
    hi: f32,
    lo: f32
}

fn f64_value(a: f64) -> f32 {
    return a.hi + a.lo;
} 

fn f64_add(a: f64, b: f64) -> f64 {
    let hi = a.hi + b.hi;
    let v = hi - a.hi;
    let lo = ((a.hi - (hi - v)) + (b.hi - v)) + a.lo + b.lo;
    return f64(hi, lo);
}

fn f64_sub(a: f64, b: f64) -> f64 {
    let hi = a.hi - b.hi;
    let v = hi - a.hi;
    let lo = ((a.hi - (hi - v)) - (b.hi + v)) + a.lo - b.lo;
    return f64(hi, lo);
}

fn f64_mul(a: f64, b: f64) -> f64 {
    let hi = a.hi * b.hi;
    let lo = fma(a.hi, b.hi, -hi) + (a.hi * b.lo) + (a.lo * b.hi) + (a.lo * b.lo);
    return f64(hi, lo);
}

fn f64_div(a: f64, b: f64) -> f64 {
    let hi = a.hi / b.hi;
    let lo = (fma(-hi, b.hi, a.hi) + a.lo - hi * b.lo) / b.hi;
    return f64(hi, lo);
}

fn f64_cos(a: f64) -> f64 {
    return f64(cos(a.hi), 0); // TODO:
}

fn f64_sin(a: f64) -> f64 {
    return f64(sin(a.hi), 0); // TODO:
}

fn f64_sqrt(a: f64) -> f64 {
    return f64(sqrt(a.hi), 0); // TODO:
}

fn f64_sinh(a: f64) -> f64 {
    return f64(sinh(a.hi), 0); // TODO:
}

fn f64_atan(a: f64) -> f64 {
    return f64(atan(a.hi), 0); // TODO:
}

struct vec3f64 {
    x: f64,
    y: f64,
    z: f64
}

fn vec3f64_value(a: vec3f64) -> vec3<f32> {
    return vec3<f32>(f64_value(a.x), f64_value(a.y), f64_value(a.z));
}

fn vec3f64_sub(a: vec3f64, b: vec3f64) -> vec3f64 {
    return vec3f64(f64_sub(a.x, b.x), f64_sub(a.y, b.y), f64_sub(a.z, b.z));
}

const PI = radians(180.);
const ONE = 4294967295u; // 1 << 32 - 1

struct VertexInput {
    @location(0) uv: vec2<f32>,
    @builtin(instance_index) instance: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

fn fixed_to_mercator(x: vec3<u32>) -> vec3f64 {
    let h = vec3<f32>(x) / f32(ONE);
    let l = vec3<f32>(x - vec3<u32>(h * f32(ONE))) / f32(ONE);
    return vec3f64(f64(h.x, l.x), f64(h.y, l.y), f64(h.z, l.z));
}

fn mercator_to_geographic(mercator: vec3f64) -> vec3f64 {
    return vec3f64(
        f64_mul(f64_add(mercator.x, f64(-0.5, 0)), f64(2. * PI, 0)),
        f64_atan(f64_sinh(f64_mul(f64_add(mercator.y, f64(-0.5, 0)), f64(-2. * PI, 0)))),
        mercator.z
    );
}

fn geographic_to_cartesian(geographic: vec3f64) -> vec3f64 {
    let n = f64(1., 0);
    let x = f64_mul(f64_mul(f64_add(n, geographic.z), f64_cos(geographic.y)), f64_cos(geographic.x));
    let y = f64_mul(f64_mul(f64_add(n, geographic.z), f64_cos(geographic.y)), f64_sin(geographic.x));
    let z = f64_mul(f64_add(n, geographic.z), f64_sin(geographic.y));
    return vec3f64(x, y, z);
}

@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let tile = tiles[input.instance];
    let k = 1u << tile.z;
    let vertex = vec3<u32>(vec3<f32>(input.uv, 0.) * f32(ONE / k)) + vec3<u32>(tile.xy * (ONE / k), 0u);
    let c = geographic_to_cartesian(mercator_to_geographic(fixed_to_mercator(center)));
    let v = geographic_to_cartesian(mercator_to_geographic(fixed_to_mercator(vertex)));

    let z = normalize(vec3f64_value(c));
    let x = normalize(cross(vec3<f32>(0., 0., 1.), z));
    let y = cross(x, z);
    let rotation = transpose(mat3x3<f32>(x, y, z));

    let position = rotation * vec3f64_value(vec3f64_sub(v, c));
    output.position = projection * vec4<f32>(position, 1.);
    return output;
}

@fragment
fn fragment() -> @location(0) vec4<f32> {
    return vec4<f32>(0.5, 0.5, 0.5, 1.);
}
