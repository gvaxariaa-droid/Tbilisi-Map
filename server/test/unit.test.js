// Pure-logic tests (no database needed): `npm test`
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImageType } from '../src/images.js';
import { landSchema, projectSchema, reconcilePrices } from '../src/validation.js';

const square = {
  type: 'Polygon',
  coordinates: [[[44.79, 41.71], [44.791, 41.71], [44.791, 41.711], [44.79, 41.711], [44.79, 41.71]]],
};

test('reconcilePrices derives per-m² from total', () => {
  assert.deepEqual(reconcilePrices(1000, 250000, null), { total: 250000, perM2: 250 });
});

test('reconcilePrices derives total from per-m²', () => {
  assert.deepEqual(reconcilePrices(1234.5, null, 200), { total: 246900, perM2: 200 });
});

test('reconcilePrices keeps both when both are given, and ignores zero area', () => {
  assert.deepEqual(reconcilePrices(1000, 5, 7), { total: 5, perM2: 7 });
  assert.deepEqual(reconcilePrices(0, 100, null), { total: 100, perM2: null });
});

test('projectSchema accepts a valid project and normalises empty optionals', () => {
  const p = projectSchema.parse({
    name: ' Vake Residence ', developer: 'Acme', architect: '', construction_stage: 'facade',
    prices: [{ frame: 'white', min: 1400 }, { frame: 'black', min: 900, max: 1100 }],
    handover_date: '', latitude: 41.71, longitude: 44.75, description: '',
  });
  assert.deepEqual(p.prices, [{ frame: 'white', min: 1400, max: null }, { frame: 'black', min: 900, max: 1100 }]);
  assert.equal(p.area, null);
  assert.equal(p.name, 'Vake Residence');
  assert.equal(p.architect, null);
  assert.equal(p.handover_date, null);
  assert.equal(p.description, null);
});

test('projectSchema rejects bad stage, coordinates and negative price', () => {
  const base = { name: 'x', developer: 'y', construction_stage: 'planning', latitude: 41, longitude: 44 };
  assert.throws(() => projectSchema.parse({ ...base, construction_stage: 'demolished' }));
  assert.throws(() => projectSchema.parse({ ...base, latitude: 91 }));
  assert.throws(() => projectSchema.parse({ ...base, prices: [{ frame: 'white', min: -1 }] }));
  assert.throws(() => projectSchema.parse({ ...base, prices: [{ frame: 'white', min: 1500, max: 1000 }] }));
  assert.throws(() => projectSchema.parse({ ...base, prices: [{ frame: 'white', min: 1 }, { frame: 'white', min: 2 }] }));
  assert.throws(() => projectSchema.parse({ ...base, prices: [{ frame: 'grey', min: 1 }] }));
  // equal bounds collapse to a single price
  assert.equal(projectSchema.parse({ ...base, prices: [{ frame: 'green', min: 1200, max: 1200 }] }).prices[0].max, null);
});

test('landSchema accepts colour and cadastral code', () => {
  const l = landSchema.parse({ name: 'P', geometry: square, color: 'green', cadastral_code: ' 01.72.14.009.012 ' });
  assert.equal(l.color, 'green');
  assert.equal(l.cadastral_code, '01.72.14.009.012');
  assert.equal(landSchema.parse({ name: 'P', geometry: square }).color, 'orange');
  assert.throws(() => landSchema.parse({ name: 'P', geometry: square, color: 'purple' }));
  assert.throws(() => landSchema.parse({ name: 'P', geometry: square, cadastral_code: '<b>' }));
});

test('landSchema requires a closed single-ring polygon', () => {
  assert.ok(landSchema.parse({ name: 'Plot', geometry: square }));
  const open = { type: 'Polygon', coordinates: [square.coordinates[0].slice(0, 4)] };
  assert.throws(() => landSchema.parse({ name: 'Plot', geometry: open }));
  const holes = { type: 'Polygon', coordinates: [square.coordinates[0], square.coordinates[0]] };
  assert.throws(() => landSchema.parse({ name: 'Plot', geometry: holes }));
});

test('landSchema validates phones and manual area', () => {
  assert.throws(() => landSchema.parse({ name: 'P', geometry: square, owner_phone: '<script>' }));
  assert.equal(landSchema.parse({ name: 'P', geometry: square, owner_phone: '+995 599 12-34-56' }).owner_phone, '+995 599 12-34-56');
  assert.throws(() => landSchema.parse({ name: 'P', geometry: square, area_is_manual: true }));
  assert.equal(landSchema.parse({ name: 'P', geometry: square, area_is_manual: true, area_m2: 950 }).area_m2, 950);
});

test('detectImageType trusts magic bytes, not names', () => {
  const pad = Buffer.alloc(16);
  assert.equal(detectImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad])).contentType, 'image/jpeg');
  assert.equal(detectImageType(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad])).contentType, 'image/png');
  assert.equal(detectImageType(Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP'), pad])).contentType, 'image/webp');
  assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectImageType(Buffer.from('GIF89a...........')), null);
});
