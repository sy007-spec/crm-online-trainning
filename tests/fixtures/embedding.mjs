// Deterministic encoder for authorization/UI tests; real model is checked separately.
export const testEmbedding=async texts=>texts.map(()=>[1,...Array(383).fill(0)]);
