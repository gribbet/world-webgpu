@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var outlineTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    let positions = array(
        vec2(-1.0, -1.0),
        vec2(3.0, -1.0),
        vec2(-1.0, 3.0),
    );
    var output: VertexOutput;
    output.position = vec4(positions[index], 0.0, 1.0);
    return output;
}

fn outlineSample(xy: vec2<i32>) -> vec4<f32> {
    let size = textureDimensions(outlineTexture);
    let clamped = clamp(xy, vec2<i32>(0), vec2<i32>(size) - vec2<i32>(1));
    return textureLoad(outlineTexture, clamped, 0);
}

@fragment
fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let xy = vec2<i32>(position.xy);
    let scene = textureLoad(sceneTexture, xy, 0);
    let center = outlineSample(xy);
    let offsets = array(
        vec2<i32>(-1, 0),
        vec2<i32>(1, 0),
        vec2<i32>(0, -1),
        vec2<i32>(0, 1),
        vec2<i32>(-3, 0),
        vec2<i32>(3, 0),
        vec2<i32>(0, -3),
        vec2<i32>(0, 3)
    );
    let weights = array(
        1.0, 1.0, 1.0, 1.0,
        0.75, 0.75, 0.75, 0.75
    );
    var outline = vec4<f32>(0.0);
    var alpha = 0.0;

    for (var i = 0u; i < 8u; i++) {
        let sample = outlineSample(xy + offsets[i]);
        let diff = center.rgb - sample.rgb;
        let outsideEdge = sample.a * (1.0 - center.a);
        let colorEdge = min(center.a, sample.a) * smoothstep(0.0001, 0.0025, dot(diff, diff));
        var colorWeight = 0.0;
        if i < 4u {
            colorWeight = weights[i] * 0.35;
        }
        let sampleAlpha = max(outsideEdge * weights[i], colorEdge * colorWeight);
        if sampleAlpha > alpha {
            outline = sample;
            alpha = sampleAlpha;
        }
    }

    return vec4(mix(scene.rgb, outline.rgb, alpha), 1.0);
}
