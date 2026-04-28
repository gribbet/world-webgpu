struct Point {
    position: Position,
    width: f32,
    color: vec4<f32>,
};

struct Node {
    prev: u32,
    current: u32,
    next: u32,
    pickId: u32,
};

struct OutVertex {
    clipPos: vec4<f32>,
    local: vec4<f32>,
    color: vec4<f32>,
    pickInfo: vec4<u32>,
};

@group(1) @binding(0) var<storage, read> points: array<Point>;
@group(1) @binding(1) var<storage, read> nodes: array<Node>;
@group(1) @binding(2) var<storage, read_write> outVertices: array<OutVertex>;
@group(1) @binding(3) var<uniform> nodeCount: u32;

fn pixelsPerUnit(local: vec3<f32>) -> f32 {
    let f = length(vec3(projection[0][1], projection[1][1], projection[2][1]));
    let clipPos = projection * vec4(local, 1.0);
    return f * screenSize.y * 0.5 / max(abs(clipPos.w), 1e-6);
}

fn safeNormalize(v: vec2<f32>) -> vec2<f32> {
    let l = length(v);
    if l > 1e-6 {
        return v / l;
    }
    return vec2<f32>(0.0);
}

fn toScreen(clip: vec4<f32>) -> vec2<f32> {
    let halfScreen = screenSize * 0.5;
    return (clip.xy / max(abs(clip.w), 1e-6)) * halfScreen;
}

fn joinOffset(
    screenPrev: vec2<f32>,
    screenCurrent: vec2<f32>,
    screenNext: vec2<f32>,
    cornerX: f32,
    side: f32,
) -> vec2<f32> {
    let hasPrev = length(screenCurrent - screenPrev) > 1e-6;
    let hasNext = length(screenNext - screenCurrent) > 1e-6;

    if !hasPrev || !hasNext {
        var tangent = vec2<f32>(1.0, 0.0);
        if hasNext {
            tangent = safeNormalize(screenNext - screenCurrent);
        } else if hasPrev {
            tangent = safeNormalize(screenCurrent - screenPrev);
        }
        let normal = vec2<f32>(-tangent.y, tangent.x);
        return normal * side;
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

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let i = globalId.x;
    if i >= nodeCount { return; }

    let node = nodes[i];
    let prev = points[node.prev];
    let current = points[node.current];
    let next = points[node.next];

    let localPrev = transform(prev.position, center, projection);
    let localCurrent = transform(current.position, center, projection);
    let localNext = transform(next.position, center, projection);

    let clipPrev = projection * vec4(localPrev, 1.0);
    let clipCurrent = projection * vec4(localCurrent, 1.0);
    let clipNext = projection * vec4(localNext, 1.0);

    let halfPx = current.width * 0.5 * pixelsPerUnit(localCurrent);

    let halfScreen = screenSize * 0.5;
    let screenPrev = toScreen(clipPrev);
    let screenCurrent = toScreen(clipCurrent);
    let screenNext = toScreen(clipNext);

    let offset0 = joinOffset(screenPrev, screenCurrent, screenNext, -1.0, -1.0);
    let offset1 = joinOffset(screenPrev, screenCurrent, screenNext, -1.0, 1.0);
    let offset2 = joinOffset(screenPrev, screenCurrent, screenNext, 1.0, -1.0);
    let offset3 = joinOffset(screenPrev, screenCurrent, screenNext, 1.0, 1.0);

    let offClip0 = vec4(offset0 * halfPx / halfScreen * clipCurrent.w, 0.0, 0.0);
    let offClip1 = vec4(offset1 * halfPx / halfScreen * clipCurrent.w, 0.0, 0.0);
    let offClip2 = vec4(offset2 * halfPx / halfScreen * clipCurrent.w, 0.0, 0.0);
    let offClip3 = vec4(offset3 * halfPx / halfScreen * clipCurrent.w, 0.0, 0.0);

    let base = i * 4u;
    outVertices[base + 0u] = OutVertex(
        clipCurrent + offClip0,
        vec4(localCurrent, 0.0),
        current.color,
        vec4(node.pickId, 0u, 0u, 0u),
    );
    outVertices[base + 1u] = OutVertex(
        clipCurrent + offClip1,
        vec4(localCurrent, 0.0),
        current.color,
        vec4(node.pickId, 0u, 0u, 0u),
    );
    outVertices[base + 2u] = OutVertex(
        clipCurrent + offClip2,
        vec4(localCurrent, 0.0),
        current.color,
        vec4(node.pickId, 0u, 0u, 0u),
    );
    outVertices[base + 3u] = OutVertex(
        clipCurrent + offClip3,
        vec4(localCurrent, 0.0),
        current.color,
        vec4(node.pickId, 0u, 0u, 0u),
    );
}
