struct OutVertex {
    clipPos: vec4<f32>,
    local: vec4<f32>,
    color: vec4<f32>,
    pickInfo: vec4<u32>,
};

@group(1) @binding(0) var<storage, read> vertices: array<OutVertex>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) local: vec3<f32>,
    @location(2) @interpolate(flat) id: u32,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    let v = vertices[index];
    var out: VertexOutput;
    out.position = v.clipPos;
    out.color = v.color;
    out.local = v.local.xyz;
    out.id = v.pickInfo.x;
    return out;
}

@fragment
fn render(in: VertexOutput) -> @location(0) vec4<f32> {
    if in.color.a < 0.01 { discard; }
    return vec4(in.color.rgb * in.color.a, in.color.a);
}

@fragment
fn pick(in: VertexOutput) -> PickOutput {
    if in.color.a < 0.1 { discard; }
    return packPick(in.local, in.id);
}
