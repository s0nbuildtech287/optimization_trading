const assert = require('assert/strict');
const {
  parameterDistance,
  appendClusterLeaders,
} = require('../utils/optimizationClustering');

function row(id, inputs) {
  return { id, inputs };
}

assert.ok(Math.abs(parameterDistance({ a: 100 }, { a: 110 }) - (10 / 110)) < 1e-12);
assert.equal(parameterDistance({ a: 100, b: 50 }, { a: 110, b: 100 }), 0.5);

const leaders = [];
appendClusterLeaders(
  leaders,
  [
    row(1, { a: 100, b: 100 }),
    row(2, { a: 105, b: 95 }),
    row(3, { a: 150, b: 100 }),
    row(4, null),
  ],
  0.15,
  3,
);
assert.deepEqual(leaders.map((item) => item.id), [1, 3]);

appendClusterLeaders(
  leaders,
  [
    row(5, { a: 300, b: 100 }),
    row(6, { a: 600, b: 100 }),
  ],
  0.15,
  3,
);
assert.deepEqual(leaders.map((item) => item.id), [1, 3, 5]);

console.log('optimization clustering tests passed');
