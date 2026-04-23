struct Instance {
    position: Position,
    orientation: vec4<f32>,
    scale: f32,
    minScalePixels: f32,
    maxScalePixels: f32,
    color: vec4<f32>,
    pickId: u32,
};

@group(1) @binding(0) var<storage, read> instances: array<Instance>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
    @location(3) local: vec3<f32>,
    @location(4) @interpolate(flat) id: u32,
};

fn rotateQuat(v: vec3<f32>, q: vec4<f32>) -> vec3<f32> {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

fn computePixelsPerUnit(origin: vec3<f32>) -> f32 {
    let f = length(vec3(projection[0][1], projection[1][1], projection[2][1]));
    let clipPos = projection * vec4(origin, 1.0);
    return f * screenSize.y * 0.5 / clipPos.w;
}

fn computeScale(instance: Instance, pixelsPerUnit: f32) -> f32 {
    var s = instance.scale;
    s = select(s, max(s, instance.minScalePixels / pixelsPerUnit), instance.minScalePixels > 0.0);
    s = select(s, min(s, instance.maxScalePixels / pixelsPerUnit), instance.maxScalePixels > 0.0);
    return s;
}

@vertex
fn vertex(
    @builtin(instance_index) instanceIndex: u32,
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) normal: vec3<f32>,
) -> VertexOutput {
    let instance = instances[instanceIndex];

    let origin = transform(instance.position, center, projection);
    let pixelsPerUnit = computePixelsPerUnit(origin);
    let s = computeScale(instance, pixelsPerUnit);

    let local = origin + rotateQuat(position * s, instance.orientation);

    var output: VertexOutput;
    output.position = projection * vec4(local, 1.0);
    output.color = color * instance.color;
    output.uv = uv;
    output.normal = rotateQuat(normal, instance.orientation);
    output.local = local;
    output.id = instance.pickId;
    return output;
}

@fragment
fn render(input: VertexOutput) -> @location(0) vec4<f32> {
    if input.color.a < 0.1 {
        discard;
    }
    return input.color;
}

@fragment
fn pick(input: VertexOutput) -> PickOutput {
    if input.color.a < 0.1 {
        discard;
    }
    return packPick(input.local, input.id);
}
