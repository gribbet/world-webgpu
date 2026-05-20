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

fn computeLocalBasis(position: Position, center: Position) -> mat3x3<f32> {
    if view.distance < 10000.0 {
        // X→North, Y→West (−East), Z→Up
        return mat3x3<f32>(
            vec3<f32>(0.0, 1.0, 0.0),
            vec3<f32>(-1.0, 0.0, 0.0),
            vec3<f32>(0.0, 0.0, 1.0),
        );
    }
    let di = bitcast<vec2<i32>>(vec2<u32>(position.x, position.y) - vec2<u32>(center.x, center.y));
    let dLon = f32(di.x) / ONE * (2.0 * PI);

    var lat = atan(sinh((vec2<f32>(f32(position.y), f32(center.y)) / ONE - 0.5) * (-2.0 * PI)));
    lat = select(lat, vec2<f32>(PI / 2.0, lat.y), position.y == 0);
    lat = select(lat, vec2<f32>(-PI / 2.0, lat.y), position.y == 1u << 31);

    let cosLat = cos(lat);
    let sinLat = sin(lat);
    let cosDLon = cos(dLon);
    let sinDLon = sin(dLon);

    let east = vec3<f32>(cosDLon, sinLat.y * sinDLon, -cosLat.y * sinDLon);
    let up = vec3<f32>(
        sinDLon * cosLat.x,
        cosLat.y * sinLat.x - sinLat.y * cosLat.x * cosDLon,
        sinLat.y * sinLat.x + cosLat.y * cosLat.x * cosDLon,
    );
    let north = cross(up, east);
    // X→North, Y→West (−East), Z→Up
    return mat3x3<f32>(north, cross(up, north), up);
}

fn computePixelsPerUnit(origin: vec3<f32>) -> f32 {
    let f = length(vec3(view.projection[0][1], view.projection[1][1], view.projection[2][1]));
    let clipPos = view.projection * vec4(origin, 1.0);
    return f * view.screenSize.y * 0.5 / clipPos.w;
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

    let origin = transform(instance.position, view.center, view.projection);
    let pixelsPerUnit = computePixelsPerUnit(origin);
    let s = computeScale(instance, pixelsPerUnit);

    let basis = computeLocalBasis(instance.position, view.center);
    let local = origin + basis * rotateQuat(position * s, instance.orientation);

    var output: VertexOutput;
    output.position = view.projection * vec4(local, 1.0);
    output.color = color * instance.color;
    output.uv = uv;
    output.normal = basis * rotateQuat(normal, instance.orientation);
    output.local = local;
    output.id = instance.pickId;
    return output;
}

@fragment
fn render(input: VertexOutput) -> @location(0) vec4<f32> {
    if input.color.a < 0.01 {
        discard;
    }
    return input.color;
}

@fragment
fn pick(input: VertexOutput) -> PickOutput {
    if input.color.a < 0.01 {
        discard;
    }
    return pickOutput(input.local, input.id);
}
