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

fn f64_(a: f32) -> f64 {
    return f64(a, 0);
}

fn f64_add(a: f64, b: f64) -> f64 {
    let s = a.hi + b.hi;
    let v = s - a.hi;
    let t = (a.hi - (s - v)) + (b.hi - v) + a.lo + b.lo;
    let hi = s + t;
    let lo = t - (hi - s);
    return f64(hi, lo);
}

fn f64_sub(a: f64, b: f64) -> f64 {
    let nb = f64(-b.hi, -b.lo);
    return f64_add(a, nb);
}

fn f64_mul(a: f64, b: f64) -> f64 {
    let p = a.hi * b.hi;
    let e = fma(a.hi, b.hi, -p);
    let f = fma(a.hi, b.lo, 0.0) + fma(a.lo, b.hi, 0.0);
    let hi = p + f;
    let c = hi - p;
    let lo = (p - (hi - c)) + (f - c) + e + (a.lo * b.lo);
    return f64(hi, lo);
}

fn f64_div(a: f64, b: f64) -> f64 {
    let q = a.hi / b.hi;
    let p = f64_mul(f64(q, 0.0), b);
    let r = f64_sub(a, p);
    let c = r.hi / b.hi;
    return f64_add(f64(q, 0.0), f64(c, 0.0));
}


fn f64_sqrt(a: f64) -> f64 {
    var x = f64(1.0 / sqrt(a.hi), 0.0);
    for(var i = 0; i < 2; i = i + 1) {
        let t = f64_sub(f64_mul(x, x), a);
        let d = f64_mul(f64(2.0, 0.0), x);
        let r = f64_div(t, d);
        x = f64_sub(x, r);
    }
    return x;
}

fn f64_sin(a: f64) -> f64 {
    let x = a.hi + a.lo;
    let hi = sin(x);
    return f64(hi, 0.0);
}

fn f64_cos(a: f64) -> f64 {
    let x = a.hi + a.lo;
    let hi = cos(x);
    return f64(hi, 0.0);
}

fn f64_sinh(a: f64) -> f64 {
    let x = a.hi + a.lo;
    let hi = sinh(x);
    return f64(hi, 0.0);
}

fn f64_atan(a: f64) -> f64 {
    let x = a.hi + a.lo;
    let hi = atan(x);
    return f64(hi, 0.0);
}

fn f64_from_u32(a: u32) -> f64 {
    let hi_f = f32(a >> 8) * 256.0;
    let lo_f = f32(a & 0xFF);
    let s = hi_f + lo_f;
    let v = s - hi_f;
    let t = (hi_f - (s - v)) + (lo_f - v);
    let hi = s + t;
    let lo = t - (hi - s);
    return f64(hi, lo);
}

fn f64_from_u32_fixed(a: u32) -> f64 {
    return f64_div(f64_from_u32(a), f64_from_u32(0xffffffffu));
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

fn vec3f64_from_vecu32_fixed(a: vec3<u32>) -> vec3f64 {
    return vec3f64(
        f64_from_u32_fixed(a.x), 
        f64_from_u32_fixed(a.y), 
        f64_from_u32_fixed(a.z));
} 

const PI = radians(180.);
const ONE = 0xffffffff;

struct VertexInput {
    @location(0) uv: vec2<f32>,
    @builtin(instance_index) instance: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

fn geographic_from_mercator(v: vec3f64) -> vec3f64 {
    return vec3f64(
        f64_mul(f64_add(v.x, f64_(-0.5)), f64_(2. * PI)),
        f64_atan(f64_sinh(f64_mul(f64_add(v.y, f64_(-0.5)), f64_(-2. * PI)))),
        f64_sub(f64_mul(v.z, f64_(2.)), f64_(1.))
    );
}

fn cartesian_from_geographic(v: vec3f64) -> vec3f64 {
    let n = f64_add(v.z, f64_(1.));
    let x = f64_mul(f64_mul(n, f64_cos(v.y)), f64_cos(v.x));
    let y = f64_mul(f64_mul(n, f64_cos(v.y)), f64_sin(v.x));
    let z = f64_mul(n, f64_sin(v.y));
    return vec3f64(x, y, z);
}

fn geographic_from_fixed(a: vec3<u32>) -> vec3f64 {
    return cartesian_from_geographic(geographic_from_mercator(vec3f64_from_vecu32_fixed(a)));
}

@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let tile = tiles[input.instance];
    let k = 1u << tile.z;
    let vertex = vec3<u32>(vec3<f32>(input.uv, 0.) * f32(ONE / k)) + vec3<u32>(tile.xy * (ONE / k), ONE >> 1u);

    let c = geographic_from_fixed(center);
    let v = geographic_from_fixed(vertex);

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
