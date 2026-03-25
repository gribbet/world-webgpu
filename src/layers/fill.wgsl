struct Vertex {
    position: Position,
    color: vec4<f32>,
};

@group(1) @binding(0) var<storage, read> vertices: array<Vertex>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    let v = vertices[index];
    let local = transform(v.position, center, projection);
    var out: VertexOutput;
    out.position = projection * vec4(local, 1.0);
    out.color = v.color;
    return out;
}

@fragment
fn render(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}

@fragment
fn pick(in: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
