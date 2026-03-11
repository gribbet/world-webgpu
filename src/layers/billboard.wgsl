@group(0) @binding(0) var<uniform> center: Position;
@group(0) @binding(1) var<uniform> projection: mat4x4<f32>;
@group(0) @binding(2) var<uniform> screen_size: vec2<f32>;
@group(0) @binding(3) var<storage, read> billboards: array<Billboard>;

struct Billboard {
    position: Position,
    color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vertex(
    @builtin(instance_index) instance: u32,
    @builtin(vertex_index) vertex: u32
) -> VertexOutput {
    let billboard = billboards[instance];
    let world = billboard.position;

    let local = transform(world, center, projection);

    let corners = array(
        vec2(-1.0, 1.0),
        vec2(1.0, 1.0),
        vec2(-1.0, -1.0),
        vec2(1.0, -1.0)
    );

    let size = 100.0;
    let aspect = screen_size.x / screen_size.y;
    let offset = corners[vertex] * size * vec2(1.0 / aspect, 1.0);
    let position = projection * vec4(local, 1.0) + vec4(offset, 0.0, 0.0);


    var output: VertexOutput;
    output.position = position;
    output.color = billboard.color;
    return output;
}

@fragment
fn render(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}

@fragment
fn pick(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
