const PI = radians(180.);






fn geographic_from_mercator(v: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        (v.x - 0.5) * (2. * PI),
        atan(sinh((v.y - 0.5) * (-2. * PI))),
        (v  .z * 2. - 1.)
    );
}

fn cartesian_from_geographic(v: vec3<f32>) -> vec3<f32> {
    let n = v.z + 1.;
    let x = n * cos(v.y) * cos(v.x);
    let y = n * cos(v.y) * sin(v.x);
    let z = n * sin(v.y);
    return vec3<f32>(x, y, z);
}

fn cartesian_from_mercator(v: vec3<f32>) -> vec3<f32> {
    return cartesian_from_geographic(geographic_from_mercator(v));
}

fn transform(vertex: vec3<f32>, camera: vec3<f32>) -> vec3<f32> {
    let v = cartesian_from_mercator(vertex);
    let c = cartesian_from_mercator(camera);

    let z = normalize(c);
    let x = normalize(cross(vec3<f32>(0., 0., 1.), z));
    let y = cross(x, z);
    let rotation = transpose(mat3x3<f32>(x, y, z));

    return rotation * (v - c);
}