@group(0) @binding(0) var pick: texture_2d<u32>;
@group(0) @binding(1) var<uniform> width: f32;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) i: u32) -> VertexOutput {
    let uv = vec2(f32((i << 1u) & 2u), f32(i & 2u));
    var out: VertexOutput;
    out.position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
    return out;
}

@fragment
fn fragment(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(pos.xy);
    let dims = textureDimensions(pick);
    let maxCoord = vec2(i32(dims.x) - 1, i32(dims.y) - 1);
    let center = textureLoad(pick, coord, 0).r;

    let r = i32(ceil(width / 2.0));
    var minDist = 1e9;
    for (var dy = -r; dy <= r; dy += 1) {
        for (var dx = -r; dx <= r; dx += 1) {
            let c = clamp(coord + vec2(dx, dy), vec2(0), maxCoord);
            let n = textureLoad(pick, c, 0).r;
            if n != center {
                let d = length(vec2(f32(dx), f32(dy)));
                minDist = min(minDist, d);
            }
        }
    }
    let alpha = clamp(width - minDist, 0.0, 1.0);
    return vec4(0.0, 0.0, 0.0, alpha);
}