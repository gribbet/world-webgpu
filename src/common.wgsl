

struct f64 {
    hi: f32,
    lo: f32,
};

fn split(a: f32) -> f64 {
    let SPLIT: f32 = 4097.0;
    let t: f32 = a * SPLIT;
    let a_hi: f32 = t - (t - a);
    let a_lo: f32 = a - a_hi;
    return f64(a_hi, a_lo);
}

fn split2(a: f64) -> f64 {
    var b: f64 = split(a.hi);
    b.lo += a.lo;
    return b;
}

fn quickTwoSum(a: f32, b: f32) -> f64 {
    let sum: f32 = a + b;
    let err: f32 = b - (sum - a);
    return f64(sum, err);
}

fn twoSum(a: f32, b: f32) -> f64 {
    let s: f32 = a + b;
    let v: f32 = s - a;
    let err: f32 = (a - (s - v)) + (b - v);
    return f64(s, err);
}

fn twoSub(a: f32, b: f32) -> f64 {
    let s: f32 = a - b;
    let v: f32 = s - a;
    let err: f32 = (a - (s - v)) - (b + v);
    return f64(s, err);
}

fn twoSqr(a: f32) -> f64 {
    let prod: f32 = a * a;
    let a_fp64: f64 = split(a);
    let err: f32 = ((a_fp64.hi * a_fp64.hi - prod) + 2.0 * a_fp64.hi * a_fp64.lo) + a_fp64.lo * a_fp64.lo;
    return f64(prod, err);
}

fn twoProd(a: f32, b: f32) -> f64 {
    let prod: f32 = a * b;
    let a_fp64: f64 = split(a);
    let b_fp64: f64 = split(b);
    let err: f32 = ((a_fp64.hi * b_fp64.hi - prod) + a_fp64.hi * b_fp64.lo + a_fp64.lo * b_fp64.hi) + a_fp64.lo * b_fp64.lo;
    return f64(prod, err);
}

fn f64_add(a: f64, b: f64) -> f64 {
    var s: f64 = twoSum(a.hi, b.hi);
    var t: f64 = twoSum(a.lo, b.lo);
    s.lo += t.hi;
    s = quickTwoSum(s.hi, s.lo);
    s.lo += t.lo;
    s = quickTwoSum(s.hi, s.lo);
    return s;
}

fn f64_sub(a: f64, b: f64) -> f64 {
    var s: f64 = twoSub(a.hi, b.hi);
    var t: f64 = twoSub(a.lo, b.lo);
    s.lo += t.hi;
    s = quickTwoSum(s.hi, s.lo);
    s.lo += t.lo;
    s = quickTwoSum(s.hi, s.lo);
    return s;
}

fn f64_mul(a: f64, b: f64) -> f64 {
    var prod: f64 = twoProd(a.hi, b.hi);
    prod.lo += a.hi * b.lo;
    prod = quickTwoSum(prod.hi, prod.lo);
    prod.lo += a.lo * b.hi;
    prod = quickTwoSum(prod.hi, prod.lo);
    return prod;
}

fn f64_div(a: f64, b: f64) -> f64 {
    let xn: f32 = 1.0 / b.hi;
    var yn: f64 = f64_mul(a, f64(xn, 0.0));
    let diff: f32 = f64_sub(a, f64_mul(b, yn)).hi;
    let prod: f64 = twoProd(xn, diff);
    return f64_add(yn, prod);
}

fn f64_sqrt(a: f64) -> f64 {
    if (a.hi == 0.0 && a.lo == 0.0) {
        return f64(0.0, 0.0);
    }
    if (a.hi < 0.0) {
        return f64(0.0, 0.0); // TODO: NaN
    }

    let x: f32 = 1.0 / sqrt(a.hi);
    let yn: f32 = a.hi * x;
    let yn_sqr: f64 = twoSqr(yn);
    let diff: f32 = f64_sub(a, yn_sqr).hi;
    let prod: f64 = twoProd(x * 0.5, diff);
    return f64_add(f64(yn, 0.0), prod);
}



fn f64_value(a: f64) -> f32 {
    return a.hi + a.lo;
}

fn f64_(a: f32) -> f64 {
    return f64(a, 0);
}



fn two_sum(a: f32, b: f32) -> f64 {
    let s = a + b;
    let e = (a - s) + b;
    return f64(s, e);
}

fn mul_f64(a: f64, b: f64) -> f64 {
    let p = a.hi * b.hi;
    let err = a.hi * b.lo + a.lo * b.hi + a.lo * b.lo;
    return two_sum(p, err);
}

fn sin_f32(x: f32) -> f32 {
    return sin(x);
}

fn f64_sin(x: f64) -> f64 {
    let sin_hi = sin_f32(x.hi);
    let cos_hi = cos(x.hi);
    let prod = mul_f64(f64(cos_hi, 0.0), f64(x.lo, 0.0));
    return two_sum(sin_hi, prod.hi);
}


fn cos_f32(x: f32) -> f32 {
    return cos(x);
}

fn f64_cos(x: f64) -> f64 {
    let cos_hi = cos_f32(x.hi);
    let sin_hi = sin(x.hi);
    let prod = mul_f64(f64(-sin_hi, 0.0), f64(x.lo, 0.0));
    return two_sum(cos_hi, prod.hi);
}

fn f64_sinh(x: f64) -> f64 {
    let exp_hi = exp(x.hi);
    let exp_neg_hi = 1.0 / exp_hi;
    let sinh_hi = 0.5 * (exp_hi - exp_neg_hi);
    
    let exp_lo = mul_f64(f64(exp_hi, 0.0), f64(x.lo, 0.0));
    let exp_neg_lo = mul_f64(f64(exp_neg_hi, 0.0), f64(x.lo, 0.0));
    let sinh_lo = 0.5 * (exp_lo.hi - exp_neg_lo.hi);
    
    return two_sum(sinh_hi, sinh_lo);
}

fn f64_atan(x: f64) -> f64 {
    // Compute the primary value using f32 atan.
    let hi_atan = atan(x.hi);
    
    // The derivative of atan is: 1/(1+x^2).
    // Use the high part to compute the derivative.
    let deriv = 1.0 / (1.0 + x.hi * x.hi);
    
    // Use a first-order correction for the low part.
    let correction = x.lo * deriv;
    
    // Combine the two parts to get an f64 result.
    return two_sum(hi_atan, correction);
}

fn f64_from_u32(a: u32) -> f64 {
    let hi_f = f32(a >> 8) * 256.;
    let lo_f = f32(a & 0xff);
    let s = hi_f + lo_f;
    let v = s - hi_f;
    let t = (hi_f - (s - v)) + (lo_f - v);
    let hi = s + t;
    let lo = t - (hi - s);
    return f64(hi, lo);
}

fn f64_from_u32_fixed(a: u32) -> f64 {
    return f64_div(f64_from_u32(a), f64_from_u32(ONE));
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

fn tile_fixed(tile: vec3<u32>) -> vec3<u32> {
    return vec3<u32>(tile.xy * (ONE / (1u << tile.z)), ONE >> 1u);
}

fn transform(vertex: vec3<u32>, center: vec3<u32>) -> vec3<f32> {
    let c = geographic_from_fixed(center);
    let v = geographic_from_fixed(vertex);

    let z = normalize(vec3f64_value(c));
    let x = normalize(cross(vec3<f32>(0., 0., 1.), z));
    let y = cross(x, z);
    let rotation = transpose(mat3x3<f32>(x, y, z));

    return rotation * vec3f64_value(vec3f64_sub(v, c));
}