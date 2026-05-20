struct Vertex {
    position: Position,
    color: vec4<f32>,
    pickId: u32,
};

@group(1) @binding(0) var<storage, read> vertices: array<Vertex>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) local: vec3<f32>,
    @location(2) @interpolate(flat) id: u32,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    let v = vertices[index];
    let local = transform(v.position, view.center, view.projection);
    var out: VertexOutput;
    out.position = view.projection * vec4(local, 1.0);
    out.color = v.color;
    out.local = local;
    out.id = v.pickId;
    return out;
}

@fragment
fn render(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}

@fragment
fn pick(in: VertexOutput) -> PickOutput {
    if in.color.a < 0.01 {
        discard;
    }
    return pickOutput(in.local, in.id);
}
