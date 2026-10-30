function parameterDistance(left, right) {
  if (!left || !right) return 1;
  let max = 0;
  for (const key of Object.keys(left)) {
    const leftValue = Number(left[key]);
    const rightValue = Number(right[key]);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) continue;
    const denominator = Math.max(Math.abs(leftValue), Math.abs(rightValue), 1e-6);
    max = Math.max(max, Math.abs(leftValue - rightValue) / denominator);
  }
  return max;
}

function appendClusterLeaders(leaders, rows, radius, topN) {
  for (const row of rows) {
    if (!row.inputs) continue;
    if (leaders.some((leader) => parameterDistance(leader.inputs, row.inputs) <= radius)) continue;
    leaders.push(row);
    if (leaders.length >= topN) break;
  }
  return leaders;
}

module.exports = { parameterDistance, appendClusterLeaders };
