struct Node {
    prev: u32,
    current: u32,
    next: u32,
    pickId: u32,
};
@group(1) @binding(0) var<storage, read> nodes: array<Node>;
@group(1) @binding(1) var<uniform> nodeCount: u32;
@group(1) @binding(2) var<storage, read_write> outIndices: array<u32>;

@compute @workgroup_size(64)
fn generateIndices(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let i = globalId.x;
    if i >= nodeCount { return; }

    let base = i * 4u;
    let indexOffset = i * 12u;

    // Quad for this node.
    outIndices[indexOffset + 0u] = base + 0u;
    outIndices[indexOffset + 1u] = base + 2u;
    outIndices[indexOffset + 2u] = base + 1u;
    outIndices[indexOffset + 3u] = base + 1u;
    outIndices[indexOffset + 4u] = base + 2u;
    outIndices[indexOffset + 5u] = base + 3u;

    // Bridge to next node (degenerate at line end).
    let bridgeA = base + 2u;
    let bridgeB = base + 3u;
    var bridgeC = base + 4u;
    var bridgeD = base + 5u;

    let hasNext = nodes[i].next != nodes[i].current;
    if !hasNext {
        bridgeC = bridgeA;
        bridgeD = bridgeB;
    }

    outIndices[indexOffset + 6u] = bridgeA;
    outIndices[indexOffset + 7u] = bridgeC;
    outIndices[indexOffset + 8u] = bridgeB;
    outIndices[indexOffset + 9u] = bridgeB;
    outIndices[indexOffset + 10u] = bridgeC;
    outIndices[indexOffset + 11u] = bridgeD;
}
