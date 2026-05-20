struct Point {
    position: Position,
    width: f32,
    color: vec4<f32>,
    minWidthPixels: f32,
    maxWidthPixels: f32,
};

struct Node {
    prev: u32,
    current: u32,
    next: u32,
    pickId: u32,
};

@group(1) @binding(0) var<storage, read> points: array<Point>;
@group(1) @binding(1) var<storage, read> nodes: array<Node>;

fn pixelsPerUnit(local: vec3<f32>) -> f32 {
    let f = length(vec3(view.projection[0][1], view.projection[1][1], view.projection[2][1]));
    let clipPos = view.projection * vec4(local, 1.0);
    return f * view.screenSize.y * 0.5 / max(abs(clipPos.w), 1e-6);
}

fn safeNormalize(v: vec2<f32>) -> vec2<f32> {
    let l = length(v);
    if l > 1e-6 {
        return v / l;
    }
    return vec2<f32>(0.0);
}

fn toScreen(clip: vec4<f32>) -> vec2<f32> {
    let halfScreen = view.screenSize * 0.5;
    return (clip.xy / max(abs(clip.w), 1e-6)) * halfScreen;
}

fn joinOffset(
    screenPrev: vec2<f32>,
    screenCurrent: vec2<f32>,
    screenNext: vec2<f32>,
    hasPrev: bool,
    hasNext: bool,
    cornerX: f32,
    side: f32,
) -> vec2<f32> {
    if !hasPrev || !hasNext {
        var tangent = vec2<f32>(1.0, 0.0);
        if hasNext {
            tangent = safeNormalize(screenNext - screenCurrent);
        } else if hasPrev {
            tangent = safeNormalize(screenCurrent - screenPrev);
        }
        let normal = vec2<f32>(-tangent.y, tangent.x);
        // Build a square cap at line ends so endpoint quads do not collapse.
        return normal * side + tangent * cornerX;
    }

    var a = safeNormalize(screenCurrent - screenPrev);
    var b = safeNormalize(screenNext - screenCurrent);

    if length(a) <= 1e-6 { a = b; }
    if length(b) <= 1e-6 { b = a; }

    var direction = a;
    if length(a + b) > 1e-6 {
        direction = safeNormalize(a + b);
    }

    let point = safeNormalize(a - b);
    let normal = vec2<f32>(-direction.y, direction.x);

    if sign(side * dot(normal, point)) > 0.0 {
        let ap = vec2<f32>(-a.y, a.x);
        let bp = vec2<f32>(-b.y, b.x);
        return 0.5 * side * (cornerX * (bp - ap) + ap + bp);
    }

    let cosine = clamp(dot(a, b), -1.0, 1.0);
    let distance = clamp(1.0 / cos(acos(cosine) * 0.5), 0.0, 1.0);
    return normal * distance * side;
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) local: vec3<f32>,
    @location(2) @interpolate(flat) id: u32,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    let nodeIndex = index / 4u;
    let corner = index % 4u;

    let node = nodes[nodeIndex];
    let prev = points[node.prev];
    let current = points[node.current];
    let next = points[node.next];

    let localPrev = transform(prev.position, view.center, view.projection);
    let localCurrent = transform(current.position, view.center, view.projection);
    let localNext = transform(next.position, view.center, view.projection);

    let clipPrev = view.projection * vec4(localPrev, 1.0);
    let clipCurrent = view.projection * vec4(localCurrent, 1.0);
    let clipNext = view.projection * vec4(localNext, 1.0);

    var widthPx = current.width * pixelsPerUnit(localCurrent);
    widthPx = clamp(widthPx, current.minWidthPixels, current.maxWidthPixels);
    let halfPx = widthPx * 0.5;
    let halfScreen = view.screenSize * 0.5;
    let screenPrev = toScreen(clipPrev);
    let screenCurrent = toScreen(clipCurrent);
    let screenNext = toScreen(clipNext);
    let hasPrev = node.prev != node.current;
    let hasNext = node.next != node.current;

    var cornerX = -1.0;
    var side = -1.0;
    if corner == 1u {
        cornerX = -1.0;
        side = 1.0;
    } else if corner == 2u {
        cornerX = 1.0;
        side = -1.0;
    } else if corner == 3u {
        cornerX = 1.0;
        side = 1.0;
    }

    let offset = joinOffset(
        screenPrev,
        screenCurrent,
        screenNext,
        hasPrev,
        hasNext,
        cornerX,
        side,
    );
    let offClip = vec4(offset * halfPx / halfScreen * clipCurrent.w, 0.0, 0.0);

    var out: VertexOutput;
    out.position = clipCurrent + offClip;
    out.color = current.color;
    out.local = localCurrent;
    out.id = node.pickId;
    return out;
}

@fragment
fn render(in: VertexOutput) -> @location(0) vec4<f32> {
    if in.color.a < 0.01 { discard; }
    return in.color;
}

@fragment
fn pick(in: VertexOutput) -> PickOutput {
    if in.color.a < 0.01 { discard; }
    return pickOutput(in.local, in.id);
}
