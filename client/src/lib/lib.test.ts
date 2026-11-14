// Run: npm test   (node --experimental-strip-types --test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePrices, fromPolygon, ringArea, selfIntersects, toPolygon } from './geo.ts';
import { formatArea, formatCoords, formatDate, formatUsd, formatUsdPerM2, parseAmount } from './format.ts';
import { emptyLandFilters, emptyProjectFilters, filterLands, filterProjects } from './filters.ts';
import type { Frame, LandPlot, LngLat, PriceEntry, Project } from './types.ts';
import { circleRing, currentPrices, distanceM, frameTrend, priceSpan, radiusStats, stepChange } from './prices.ts';
import { formatPriceRange, formatUsdShort } from './format.ts';

test('ringArea: 100 m × 100 m square in Tbilisi ≈ 10,000 m²', () => {
  const lat0 = 41.7151;
  const dLat = 100 / 111_132.95; // metres per degree latitude at 41.7° (ellipsoidal)
  const dLng = 100 / (111_412.84 * Math.cos((lat0 * Math.PI) / 180));
  const sq: LngLat[] = [
    [44.79, lat0],
    [44.79 + dLng, lat0],
    [44.79 + dLng, lat0 + dLat],
    [44.79, lat0 + dLat],
  ];
  const a = ringArea(sq);
  // Spherical model vs ellipsoidal metre conversion: allow 0.5%.
  assert.ok(Math.abs(a - 10_000) / 10_000 < 0.005, `area was ${a}`);
  // Winding and closing point do not change the result
  assert.ok(Math.abs(ringArea([...sq].reverse()) - a) < 1e-6);
  assert.ok(Math.abs(ringArea([...sq, sq[0]]) - a) < 1e-6);
});

test('ringArea: triangle is half the square, degenerate rings are 0', () => {
  const sq: LngLat[] = [[44.8, 41.7], [44.801, 41.7], [44.801, 41.701], [44.8, 41.701]];
  const tri: LngLat[] = [sq[0], sq[1], sq[2]];
  assert.ok(Math.abs(ringArea(tri) * 2 - ringArea(sq)) / ringArea(sq) < 0.001);
  assert.equal(ringArea([[44.8, 41.7], [44.81, 41.7]]), 0);
});

test('toPolygon / fromPolygon round-trip', () => {
  const v: LngLat[] = [[1, 1], [2, 1], [2, 2]];
  const g = toPolygon(v);
  assert.deepEqual(g.coordinates[0], [[1, 1], [2, 1], [2, 2], [1, 1]]);
  assert.deepEqual(fromPolygon(g), v);
});

test('selfIntersects detects a bow-tie but not a simple polygon', () => {
  assert.equal(selfIntersects([[0, 0], [2, 0], [2, 2], [0, 2]]), false);
  assert.equal(selfIntersects([[0, 0], [2, 2], [2, 0], [0, 2]]), true);
  assert.equal(selfIntersects([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]]), false); // concave is fine
});

test('derivePrices follows the field the user typed last', () => {
  assert.deepEqual(derivePrices(1000, 250_000, null, 'total'), { total: 250_000, perM2: 250 });
  assert.deepEqual(derivePrices(1000, null, 320, 'perM2'), { total: 320_000, perM2: 320 });
  // area changed: keep the anchor, recompute the other
  assert.deepEqual(derivePrices(1250, 250_000, 250, 'total'), { total: 250_000, perM2: 200 });
  assert.deepEqual(derivePrices(1250, 250_000, 250, 'perM2'), { total: 312_500, perM2: 250 });
  // no area: nothing derived
  assert.deepEqual(derivePrices(null, 5, null, 'total'), { total: 5, perM2: null });
  assert.deepEqual(derivePrices(3, 100, null, 'total'), { total: 100, perM2: 33.33 });
});

test('USD formatting', () => {
  assert.equal(formatUsd(1400), '$1,400');
  assert.equal(formatUsd(1400.5), '$1,400.50');
  assert.equal(formatUsd(2_350_000), '$2,350,000');
  assert.equal(formatUsdPerM2(1400), '$1,400 / m²');
  assert.equal(formatUsd(null), '—');
  assert.ok(!formatUsd(1).includes('£') && !formatUsd(1).includes('₾'));
});

test('area, coordinate and date formatting', () => {
  assert.equal(formatArea(850), '850 m²');
  assert.equal(formatArea(12_400), '12,400 m² (1.24 ha)');
  assert.equal(formatArea(42.456), '42.46 m²');
  assert.equal(formatCoords(41.715134, 44.8271), '41.715134° N, 44.827100° E');
  assert.equal(formatDate('2027-03-15'), '15 Mar 2027');
});

test('parseAmount accepts common typing and rejects junk', () => {
  assert.equal(parseAmount('1,400'), 1400);
  assert.equal(parseAmount('$2 500.75'), 2500.75);
  assert.equal(parseAmount(''), null);
  assert.ok(Number.isNaN(parseAmount('12abc') as number));
  assert.ok(Number.isNaN(parseAmount('-5') as number));
});

const pe = (frame: Frame, min: number, max: number | null = null, date = '2026-01-01', id = `${frame}${min}`): PriceEntry =>
  ({ id, frame, min, max, date, created_at: `${date}T00:00:00Z` });

const proj = (o: Partial<Project>): Project => ({
  id: 'x', name: 'P', developer: 'D', architect: null, construction_stage: 'design', color: 'blue', price_history: [], area: null, area_m2: null,
  handover_date: null, latitude: 41.7, longitude: 44.8, description: null, photo_id: null,
  created_at: '2026-01-01', updated_at: '2026-01-01', ...o,
});

test('filterProjects: search, stage, developer and price range', () => {
  const list = [
    proj({ id: 'a', name: 'Vake Park Residence', developer: 'Archi', construction_stage: 'facade_works', price_history: [pe('white', 1400)] }),
    proj({ id: 'b', name: 'Saburtalo Tower', developer: 'Alliance', construction_stage: 'completed', price_history: [pe('black', 800, 950)] }),
    proj({ id: 'c', name: 'Old Town Lofts', developer: 'Archi', construction_stage: 'design' }),
  ];
  const ids = (l: Project[]) => l.map((p) => p.id);
  assert.deepEqual(ids(filterProjects(list, 'vake', emptyProjectFilters)), ['a']);
  assert.deepEqual(ids(filterProjects(list, 'alliance', emptyProjectFilters)), ['b']);
  assert.deepEqual(ids(filterProjects(list, '', { ...emptyProjectFilters, developer: 'Archi' })), ['a', 'c']);
  assert.deepEqual(ids(filterProjects(list, '', { ...emptyProjectFilters, stages: ['completed'] })), ['b']);
  assert.deepEqual(ids(filterProjects(list, '', { ...emptyProjectFilters, minPrice: '1000' })), ['a']);
  // a range overlapping the filter counts
  assert.deepEqual(ids(filterProjects(list, '', { ...emptyProjectFilters, minPrice: '900', maxPrice: '1000' })), ['b']);
});

const land = (o: Partial<LandPlot>): LandPlot => ({
  id: 'x', name: 'L', geometry: toPolygon([[0, 0], [1, 0], [1, 1]]), area_m2: 1000, area_is_manual: false,
  computed_area_m2: 1000, total_price_usd: null, price_per_m2_usd: null, k2_coefficient: null, notes: null,
  color: 'orange', cadastral_code: null,
  photo_ids: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...o,
});

test('filterLands: owner/agent search, ranges and sorting', () => {
  const list = [
    land({ id: 'a', name: 'Digomi plot', owner_name: 'Nino', area_m2: 5000, total_price_usd: 500_000, price_per_m2_usd: 100, k2_coefficient: 2.5, created_at: '2026-03-01' }),
    land({ id: 'b', name: 'Krtsanisi plot', agent_name: 'Giorgi', area_m2: 1200, total_price_usd: 360_000, price_per_m2_usd: 300, k2_coefficient: 1.2, created_at: '2026-05-01' }),
    land({ id: 'c', name: 'Lisi slope', area_m2: 9000, created_at: '2026-04-01' }),
  ];
  const ids = (l: LandPlot[]) => l.map((p) => p.id);
  assert.deepEqual(ids(filterLands(list, '', emptyLandFilters)), ['b', 'c', 'a']); // newest first
  assert.deepEqual(ids(filterLands(list, 'nino', emptyLandFilters)), ['a']);
  assert.deepEqual(ids(filterLands(list, '', { ...emptyLandFilters, field: 'agent', query: 'giorgi' })), ['b']);
  assert.deepEqual(ids(filterLands(list, '', { ...emptyLandFilters, field: 'name', query: 'giorgi' })), []);
  assert.deepEqual(ids(filterLands(list, '', { ...emptyLandFilters, minArea: '2000' })), ['c', 'a']);
  assert.deepEqual(ids(filterLands(list, '', { ...emptyLandFilters, minK2: '2' })), ['a']);
  assert.deepEqual(ids(filterLands(list, '', { ...emptyLandFilters, sort: 'price_desc' })), ['a', 'b', 'c']);
  assert.deepEqual(ids(filterLands(list, '', { ...emptyLandFilters, sort: 'area_asc' })), ['b', 'a', 'c']);
  const withCode = [land({ id: 'k', cadastral_code: '01.72.14.009.012' })];
  assert.deepEqual(ids(filterLands(withCode, '72.14', emptyLandFilters)), ['k']);
});

test('price history: newest entry per frame is current; old entries kept', () => {
  const p = proj({
    price_history: [
      pe('white', 1500, null, '2026-10-01', 'w2'),
      pe('white', 1200, null, '2025-06-01', 'w1'),
      pe('black', 900, 1100, '2026-02-01', 'b1'),
    ],
  });
  const cur = currentPrices(p);
  assert.equal(cur.white?.id, 'w2');
  assert.equal(cur.black?.id, 'b1');
  assert.equal(cur.green, undefined);
  assert.deepEqual(priceSpan(p), { lo: 900, hi: 1500 });
  assert.equal(formatPriceRange(1000, 1500), '$1,000–1,500 / m²');
  assert.equal(formatPriceRange(1200, null), '$1,200 / m²');
  assert.equal(formatUsdShort(550_000), '$550K');
  assert.equal(formatUsdShort(1_250_000), '$1.25M');
});

test('radius: distances, circle ring and per-frame averages', () => {
  const c: LngLat = [44.79, 41.715];
  assert.ok(Math.abs(distanceM(c, [44.79, 41.715 + 0.009]) - 1000) < 5); // 0.009° lat ≈ 1 km
  const ring = circleRing(c, 500);
  ring.slice(0, -1).forEach((pt) => assert.ok(Math.abs(distanceM(c, pt) - 500) < 1));
  const near = proj({ id: 'n', latitude: 41.716, longitude: 44.79, price_history: [pe('white', 1000), pe('black', 600, 800)] });
  const mid = proj({ id: 'm', latitude: 41.7215, longitude: 44.79, price_history: [pe('white', 1400)] });
  const far = proj({ id: 'f', latitude: 41.75, longitude: 44.79, price_history: [pe('white', 3000)] });
  const r500 = radiusStats(c, 500, [near, mid, far]);
  assert.equal(r500.projectCount, 1);
  assert.equal(r500.byFrame.white.avg, 1000);
  assert.equal(r500.byFrame.black.avg, 700); // range counts as its midpoint
  assert.equal(r500.byFrame.green.avg, null);
  assert.equal(r500.overall, 850);
  const r1k = radiusStats(c, 1000, [near, mid, far]);
  assert.equal(r1k.projectCount, 2);
  assert.equal(r1k.byFrame.white.avg, 1200);
  assert.equal(r1k.byFrame.white.n, 2);
});

test('radius overall average uses only the chosen frames', () => {
  const c: LngLat = [44.79, 41.715];
  const p = proj({ latitude: 41.715, longitude: 44.79, price_history: [pe('white', 1000), pe('green', 2000)] });
  assert.equal(radiusStats(c, 500, [p]).overall, 1500);
  assert.equal(radiusStats(c, 500, [p], ['green']).overall, 2000);
  assert.equal(radiusStats(c, 500, [p], []).overall, null);
});

test('price trend: total change, step change and yearly rate', () => {
  const p = proj({
    price_history: [
      pe('white', 1210, null, '2026-01-01', 'w3'),
      pe('white', 1100, null, '2025-01-01', 'w2'),
      pe('white', 1000, null, '2024-01-01', 'w1'),
    ],
  });
  const tr = frameTrend(p, 'white')!;
  assert.equal(tr.first.id, 'w1');
  assert.equal(tr.last.id, 'w3');
  assert.equal(tr.change, 210);
  assert.ok(Math.abs(tr.pct! - 21) < 1e-9);
  assert.ok(Math.abs(tr.perYear! - 10) < 0.1); // 1000 -> 1210 over two years is 10% a year
  assert.deepEqual(stepChange(p, p.price_history[0]), { change: 110, pct: 10 });
  assert.equal(stepChange(p, p.price_history[2]), null);
  assert.equal(frameTrend(p, 'green'), null);
});
