@group(1) @binding(0) var<storage, read> billboards: array<Billboard>;
@group(1) @binding(1) var textures: texture_2d_array<f32>;
@group(1) @binding(2) var sample: sampler;

struct Billboard {
    position: Position,
    size: f32,
    color: vec4<f32>,
    texture: i32,
    width: u32,
    height: u32,
    minScale: f32,
    maxScale: f32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) @interpolate(flat) texture: i32,
};

@vertex
fn vertex(
    @builtin(instance_index) instanceIndex: u32,
    @builtin(vertex_index) vertexIndex: u32
) -> VertexOutput {
    let billboard = billboards[instanceIndex];

    let local = transform(billboard.position, center, projection);

    let corners = array(
        vec2(-1.0, -1.0),
        vec2(1.0, -1.0),
        vec2(-1.0, 1.0),
        vec2(1.0, 1.0)
    );

    let width = f32(billboard.width);
    let height = f32(billboard.height);
    let uvScale = vec2<f32>(width, height) / vec2<f32>(textureDimensions(textures));
    let uv = (corners[vertexIndex] * 0.5 + 0.5) * uvScale;

    let aspect = width / height;
    let screenAspect = screenSize.x / screenSize.y;

    let clip = projection * vec4(local, 1.0);
    var scale = clamp(billboard.size / clip.w / height * screenSize.y, billboard.minScale, billboard.maxScale);
    let offset = corners[vertexIndex] * vec2(aspect / screenAspect, -1.0) * scale * height / screenSize.y;
    let position = projection * vec4(local, 1.0) + vec4(offset * clip.w, 0.0, 0.0);


    var output: VertexOutput;
    output.position = position;
    output.color = billboard.color;
    output.uv = uv;
    output.texture = billboard.texture;
    return output;
}

@fragment
fn render(input: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSampleBias(textures, sample, input.uv, input.texture, -1.0) * input.color;
    if color.a < 0.1 {
        discard;
    }
    return color;
}

@fragment
fn pick(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
