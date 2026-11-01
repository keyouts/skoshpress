'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sheets } = require('../lib/booklet');
test('four-page folded booklet places last and first on front', () => {
  assert.deepEqual(sheets(4), [[3,0],[1,2]]);
});
test('eight-page booklet lays out two duplex printer sheets', () => {
  assert.deepEqual(sheets(8), [[7,0],[1,6],[5,2],[3,4]]);
});
test('booklet pads with blanks to next multiple of four', () => {
  assert.deepEqual(sheets(3), [[null,0],[1,2]]);
  assert.deepEqual(sheets(5), [[null,0],[1,null],[null,2],[3,4]]);
});
test('invalid booklet sizes cannot consume unreasonable resources', () => {
  assert.throws(() => sheets(0));
  assert.throws(() => sheets(701));
});
