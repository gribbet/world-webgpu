const PI = radians(180.);
const ONE = 2147483648.0;
const RADIUS = 6371000.0;
const CIRCUMFERENCE = 2.0 * PI * RADIUS;

struct Position {
    x: u32, // Mercator [0, 2^31)
    y: u32, // Mercator [0, 2^31)
    z: f32, // Altitude in meters
};

struct View {
    center: Position,
    projection: mat4x4<f32>,
    screenSize: vec2<f32>,
    distance: f32,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<uniform> excludedPickId: u32;

fn transformFlat(position: Position, center: Position) -> vec3<f32> {
    let di = bitcast<vec2<i32>>(vec2<u32>(position.x, position.y) - vec2<u32>(center.x, center.y));
    let d = vec2<f32>(di) / ONE;
    let lat = atan(sinh((f32(center.y) / ONE - 0.5) * (-2.0 * PI)));
    let cosLat = cos(lat);
    let xy = d * CIRCUMFERENCE * cosLat * vec2<f32>(1.0, -1.0);
    let alt = position.z - center.z;
    let drop = dot(xy, xy) / (2.0 * RADIUS);
    return vec3<f32>(xy.x, xy.y, alt - drop);
}


fn transformSpherical(position: Position, center: Position) -> vec3<f32> {
    let di = bitcast<vec2<i32>>(vec2<u32>(position.x, position.y) - vec2<u32>(center.x, center.y));
    let dLon = f32(di.x) / ONE * (2.0 * PI);

    var lat = atan(sinh((vec2<f32>(f32(position.y), f32(center.y)) / ONE - 0.5) * (-2.0 * PI)));
    lat = select(lat, vec2<f32>(PI / 2.0, lat.y), position.y == 0);
    lat = select(lat, vec2<f32>(-PI / 2.0, lat.y), position.y == 1u << 31);

    let cosLat = cos(lat);
    let sinLat = sin(lat);

    let r = RADIUS + position.z;
    let cosDLon = cos(dLon);

    let x = r * cosLat.x * sin(dLon);
    let y = r * (cosLat.y * sinLat.x - sinLat.y * cosLat.x * cosDLon);
    let z = r * (sinLat.y * sinLat.x + cosLat.y * cosLat.x * cosDLon) - RADIUS - center.z;

    return vec3<f32>(x, y, z);
}

fn transform(position: Position, center: Position, projection: mat4x4<f32>) -> vec3<f32> {
    if view.distance < 10000.0 {
        return transformFlat(position, center);
    }
    return transformSpherical(position, center);
}

fn positionFromFlatLocal(local: vec3<f32>, center: Position) -> Position {
    let lat = atan(sinh((f32(center.y) / ONE - 0.5) * (-2.0 * PI)));
    let cosLat = max(1e-6, cos(lat));

    let mercatorDelta = local.xy / (CIRCUMFERENCE * cosLat * vec2<f32>(1.0, -1.0));
    let deltaI = vec2<i32>(round(mercatorDelta * ONE));
    let centerI = bitcast<vec2<i32>>(vec2<u32>(center.x, center.y));
    let xy = bitcast<vec2<u32>>(centerI + deltaI);

    let drop = dot(local.xy, local.xy) / (2.0 * RADIUS);
    let z = local.z + center.z + drop;

    return Position(xy.x, xy.y, z);
}



struct Tile {
    tile: vec3<u32>,
    imageryTexture: vec2<u32>,
    elevationTexture: vec2<u32>,
}

fn sampleElevation(elevationTextures: texture_2d_array<f32>, tile: vec3<u32>, uv: vec2<f32>, index: vec2<u32>) -> f32 {
    if index.x == 0xffffffffu {
        return 0.0;
    }
    let k = 1u << index.y;
    let uvK = (vec2<f32>(tile.xy % k) + uv) / f32(k);
    let size = textureDimensions(elevationTextures);
    let ij = vec2<i32>(clamp(uvK * vec2<f32>(size), vec2<f32>(0.0), vec2<f32>(size) - 1.0));
    let e = textureLoad(elevationTextures, ij, index.x, 0);
    return (((256.0 * 256.0 * 255.0 * e.r) + (256.0 * 255.0 * e.g) + (255. * e.b)) / 10.0 - 10000.0);
}

struct PickOutput {
    @location(0) xy: vec2<u32>,
    @location(1) z: f32,
    @location(2) id: u32,
}

fn packPick(local: vec3<f32>, id: u32) -> PickOutput {
    let p = positionFromFlatLocal(local, view.center);
    let xy = vec2<u32>(clamp(
        vec2<f32>(vec2<u32>(p.x, p.y)),
        vec2<f32>(0.0),
        vec2<f32>(ONE - 1.0),
    ));
    return PickOutput(xy, p.z, id);
}

fn pickOutput(local: vec3<f32>, id: u32) -> PickOutput {
    if id == excludedPickId { discard; }
    return packPick(local, id);
}
