struct Vertex {
    position: Position,
    width: f32,
    color: vec4<f32>,
    minWidthPixels: f32,
    maxWidthPixels: f32,
    flags: u32,
    pickId: u32,
    outline: vec4<f32>,
};

@group(1) @binding(0) var<storage, read> vertices: array<Vertex>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) local: vec3<f32>,
    @location(2) @interpolate(flat) id: u32,
    @location(3) outline: vec4<f32>,
};

fn pixelsPerUnit(local: vec3<f32>) -> f32 {
    let f = length(vec3(view.projection[0][1], view.projection[1][1], view.projection[2][1]));
    let clipPos = view.projection * vec4(local, 1.0);
    return f * view.screenSize.y * 0.5 / max(abs(clipPos.w), 1e-6);
}

fn safeNormalize(v: vec2<f32>) -> vec2<f32> {
    let l = length(v);
    if l > 1e-6 { return v / l; }
    return vec2<f32>(0.0);
}

fn toScreen(clip: vec4<f32>) -> vec2<f32> {
    return (clip.xy / max(abs(clip.w), 1e-6)) * view.screenSize * 0.5;
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
        return normal * side + tangent * cornerX;
    }

    var a = safeNormalize(screenCurrent - screenPrev);
    var b = safeNormalize(screenNext - screenCurrent);

    if length(a) <= 1e-6 { a = b; }
    if length(b) <= 1e-6 { b = a; }

    var direction = a;
    if length(a + b) > 1e-6 { direction = safeNormalize(a + b); }

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

// Computes the 4 clip-space corners and view-space local position for vertex[idx].
// Corner layout: 0=(-1,-1), 1=(-1,+1), 2=(+1,-1), 3=(+1,+1)
struct Corners {
    clips: array<vec4<f32>, 4>,
    local: vec3<f32>,
};

fn computeCorners(idx: u32) -> Corners {
    let v = vertices[idx];
    let isFirst = (v.flags & 1u) != 0u;
    let isLast = (v.flags & 2u) != 0u;

    let localCurr = transform(v.position, view.center, view.projection);
    var localPrev = localCurr;
    if !isFirst { localPrev = transform(vertices[idx - 1u].position, view.center, view.projection); }
    var localNext = localCurr;
    if !isLast { localNext = transform(vertices[idx + 1u].position, view.center, view.projection); }

    let clipCurr = view.projection * vec4(localCurr, 1.0);
    let screenPrev = toScreen(view.projection * vec4(localPrev, 1.0));
    let screenCurr = toScreen(clipCurr);
    let screenNext = toScreen(view.projection * vec4(localNext, 1.0));

    var widthPx = v.width * pixelsPerUnit(localCurr);
    widthPx = clamp(widthPx, v.minWidthPixels, v.maxWidthPixels);
    let halfPx = widthPx * 0.5;
    let halfScreen = view.screenSize * 0.5;

    var cornerXs = array<f32, 4>(-1.0, -1.0, 1.0, 1.0);
    var sides = array<f32, 4>(-1.0, 1.0, -1.0, 1.0);

    var out: Corners;
    out.local = localCurr;
    for (var i = 0u; i < 4u; i++) {
        let offset = joinOffset(
            screenPrev, screenCurr, screenNext,
            !isFirst, !isLast,
            cornerXs[i], sides[i],
        );
        out.clips[i] = clipCurr + vec4(offset * halfPx / halfScreen * clipCurr.w, 0.0, 0.0);
    }
    return out;
}

@vertex
fn vertex(
    @builtin(instance_index) inst: u32,
    @builtin(vertex_index) vert: u32,
) -> VertexOutput {
    // Vertices 0-5:  own quad,    corners [0,2,1, 1,2,3]
    // Vertices 6-11: bridge quad, [curr2,next0,curr3, curr3,next0,next1]
    //                Degenerate when isLast: [curr2,curr2,curr3, curr3,curr2,curr3]
    let isLast = (vertices[inst].flags & 2u) != 0u;
    let curr = computeCorners(inst);

    var ownSeq = array<u32, 6>(0u, 2u, 1u, 1u, 2u, 3u);
    var degenSeq = array<u32, 6>(2u, 2u, 3u, 3u, 2u, 3u);
    var currSeq = array<u32, 6>(2u, 0u, 3u, 3u, 0u, 0u);
    var nextSeq = array<u32, 6>(0u, 0u, 0u, 0u, 0u, 1u);
    var fromNext = array<bool, 6>(false, true, false, false, true, true);

    var clipPos = curr.clips[0];
    var localPos = curr.local;
    var color = vertices[inst].color;
    var pickId = vertices[inst].pickId;
    var outline = vertices[inst].outline;

    if vert < 6u {
        clipPos = curr.clips[ownSeq[vert]];
    } else {
        let bi = vert - 6u;
        if isLast {
            clipPos = curr.clips[degenSeq[bi]];
        } else {
            let next = computeCorners(inst + 1u);
            if fromNext[bi] {
                clipPos = next.clips[nextSeq[bi]];
                localPos = next.local;
                color = vertices[inst + 1u].color;
                pickId = vertices[inst + 1u].pickId;
                outline = vertices[inst + 1u].outline;
            } else {
                clipPos = curr.clips[currSeq[bi]];
            }
        }
    }

    var out: VertexOutput;
    out.position = clipPos;
    out.color = color;
    out.local = localPos;
    out.id = pickId;
    out.outline = outline;
    return out;
}

@fragment
fn render(in: VertexOutput) -> RenderOutput {
    if in.color.a < 0.01 { discard; }
    return RenderOutput(in.color, in.outline);
}

@fragment
fn pick(in: VertexOutput) -> PickOutput {
    if in.color.a < 0.01 { discard; }
    return pickOutput(in.local, in.id);
}
