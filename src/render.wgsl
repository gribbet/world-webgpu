@group(0) @binding(0) var<storage, read> tiles: array<vec3<u32>>;
@group(0) @binding(1) var<uniform> camera: vec3<i32>;
@group(0) @binding(2) var<uniform> projection: mat4x4<f32>;

const ECCENTRICITY = 0.0818191908426;

struct VertexInput {
    @location(0) uv: vec2<f32>,
    @builtin(instance_index) instance: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

fn tileToMercator(tile: vec3<u32>) -> vec3<f32> {
    return vec3<f32>(vec2<f32>(tile.xy) / pow(2.0, f32(tile.z)), 0.0);
}


fn mercatorToGeographic(mercator: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        (mercator.x - 0.5) * 360.0,
        degrees(atan(sinh(-2.0 * radians(180) * (mercator.y - 0.5)))),
        mercator.z
    );
}

fn geographicToCartesian(geographic: vec3<f32>) -> vec3<f32> {
    let lng = radians(geographic.x);
    let lat = radians(geographic.y);
    let n = 1.0 / sqrt(1.0 - (ECCENTRICITY * ECCENTRICITY * sin(lat) * sin(lat)));
    let x = n * cos(lat) * cos(lng);
    let y = n * cos(lat) * sin(lng);
    let z = n * (1.0 - ECCENTRICITY * ECCENTRICITY) * sin(lat);
    return vec3<f32>(x, y, z);
}

@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let tile = tiles[input.instance];
    let mercator = tileToMercator(tile) + vec3<f32>(input.uv / f32(1 << tile.z), 0.0);
    let geographic = mercatorToGeographic(mercator);
    let cartesian = geographicToCartesian(geographic);
    let relative = cartesian - vec3<f32>(camera) / f32((1 << 31) - 1) * 2.0;
    output.position = projection * vec4<f32>(relative, 1.0);
    return output;
}

@fragment
fn fragment() -> @location(0) vec4<f32> {
    return vec4<f32>(0.5, 0.5, 0.5, 1.0);
}
