const PI = radians(180.);
const ONE = 2147483648.0;
const RADIUS = 6371000.0;
const CIRCUMFERENCE = 2.0 * PI * RADIUS;

struct Position {
    x: u32, // Mercator [0, 2^31)
    y: u32, // Mercator [0, 2^31)
    z: f32, // Altitude in meters
};

fn transform_flat(position: Position, center: Position) -> vec3<f32> {
    let d_i = bitcast<vec2<i32>>(vec2<u32>(position.x, position.y) - vec2<u32>(center.x, center.y));
    let d = vec2<f32>(d_i) / ONE;
    let lat = atan(sinh((f32(center.y) / ONE - 0.5) * (-2.0 * PI)));
    let cos_lat = cos(lat);
    let xy = d * CIRCUMFERENCE * cos(lat) * vec2<f32>(1.0, -1.0);
    let alt = position.z - center.z;
    let drop = dot(xy, xy) / (2.0 * RADIUS);
    return vec3<f32>(xy.x, xy.y, alt - drop);
}


fn transform_spherical(position: Position, center: Position) -> vec3<f32> {
    let d_i = bitcast<vec2<i32>>(vec2<u32>(position.x, position.y) - vec2<u32>(center.x, center.y));
    let d_lon = f32(d_i.x) / ONE * (2.0 * PI);

    var lat = atan(sinh((vec2<f32>(f32(position.y), f32(center.y)) / ONE - 0.5) * (-2.0 * PI)));
    lat = select(lat, vec2<f32>(PI / 2.0, lat.y), position.y == 0);
    lat = select(lat, vec2<f32>(-PI / 2.0, lat.y), position.y == 1u << 31);

    let cos_lat = cos(lat);
    let sin_lat = sin(lat);

    let r = RADIUS + position.z;
    let cos_d_lon = cos(d_lon);

    let x = r * cos_lat.x * sin(d_lon);
    let y = r * (cos_lat.y * sin_lat.x - sin_lat.y * cos_lat.x * cos_d_lon);
    let z = r * (sin_lat.y * sin_lat.x + cos_lat.y * cos_lat.x * cos_d_lon) - RADIUS - center.z;

    return vec3<f32>(x, y, z);
}

fn transform(position: Position, center: Position, projection: mat4x4<f32>) -> vec3<f32> {
    if abs(projection[3][3]) < 10000.0 {
        return transform_flat(position, center);
    }
    return transform_spherical(position, center);
}



struct Tile {
    tile: vec3<u32>,
    imagery_texture: vec2<u32>,
    elevation_texture: vec2<u32>,
}

fn sample_elevation(elevation_textures: texture_2d_array<f32>, tile: vec3<u32>, uv: vec2<f32>, index: vec2<u32>) -> f32 {
    if index.x == 0xffffffffu {
        return 0.0;
    }
    let k = 1u << index.y;
    let uv_k = (vec2<f32>(tile.xy % k) + uv) / f32(k);
    let size = textureDimensions(elevation_textures);
    let ij = vec2<i32>(clamp(uv_k * vec2<f32>(size), vec2<f32>(0.0), vec2<f32>(size) - 1.0));
    let e = textureLoad(elevation_textures, ij, index.x, 0);
    return (((256.0 * 256.0 * 255.0 * e.r) + (256.0 * 255.0 * e.g) + (255. * e.b)) / 10.0 - 10000.0);
}