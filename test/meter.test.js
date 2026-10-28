// Run from the repository root: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../meter.js");

const g = t => M.parseMeter(t).groups;

test("simple and compound time", () => {
  assert.deepEqual(g("4/4"), [4, 4, 4, 4]);
  assert.deepEqual(g("3/4"), [4, 4, 4]);
  assert.deepEqual(g("2/2"), [8, 8]);
  assert.deepEqual(g("3/8"), [6]);
  assert.deepEqual(g("6/8"), [6, 6]);
  assert.deepEqual(g("9/8"), [6, 6, 6]);
  assert.deepEqual(g("12/8"), [6, 6, 6, 6]);
});

test("irregular meters group into twos and threes", () => {
  assert.deepEqual(g("5/8"), [4, 6]);
  assert.deepEqual(g("7/8"), [4, 4, 6]);
  assert.deepEqual(g("7/8(3+2+2)"), [6, 4, 4]);
  assert.deepEqual(g("5/4(3+2)"), [12, 8]);
  assert.deepEqual(g("8/8"), [6, 6, 4]);
});

test("bad input is explained", () => {
  assert.throws(() => M.parseMeter("7/8(2+2)"), /add up to 4, not 7/);
  assert.throws(() => M.parseMeter("3/5"), /bottom number/);
  assert.throws(() => M.parseMeter("waltz"), /not a time signature/);
  assert.throws(() => M.parseSequence(""), /at least one/);
});

test("sequences, repeats and groups with spaces", () => {
  const s = M.parseSequence("3/4*2, 2/4 7/8(2 + 2 + 3)");
  assert.deepEqual(s.map(b => b.label), ["3/4", "3/4", "2/4", "7/8 (2+2+3)"]);
});

test("reference note: the beat when beats are equal, else their common divisor", () => {
  const ref = t => M.noteName(M.referenceNote(M.parseSequence(t)));
  assert.equal(ref("4/4"), "quarter");
  assert.equal(ref("6/8"), "dotted quarter");
  assert.equal(ref("2/2"), "half");
  assert.equal(ref("7/8"), "eighth");
  assert.equal(ref("5/4 6/4"), "quarter");
  assert.equal(ref("3/4 6/8"), "eighth");
  assert.equal(M.evenBeats(M.parseSequence("6/8")), true);
  assert.equal(M.evenBeats(M.parseSequence("7/8")), false);
});

test("clicks: accents on bar and group starts, subdivisions fill each group", () => {
  const bar = M.parseMeter("7/8");
  assert.deepEqual(M.barClicks(bar, "beats", true).map(c => [c.at, c.level]), [[0, 2], [4, 1], [8, 1]]);
  assert.deepEqual(M.barClicks(bar, "eighths", true).map(c => c.at), [0, 2, 4, 6, 8, 10, 12]);
  const six8 = M.parseMeter("6/8");
  assert.deepEqual(M.barClicks(six8, "eighths", true).map(c => c.level), [2, 0, 0, 1, 0, 0]);
  const four4 = M.parseMeter("4/4");
  assert.equal(M.barClicks(four4, "triplets", true).length, 12);
  assert.equal(M.barClicks(four4, "sixteenths", false).length, 16);
  assert.equal(M.barClicks(four4, "beats", false)[0].level, 1, "no accent when switched off");
});

test("timing: 7/8 at eighth = 160 lasts 7 eighths of 0.375 s", () => {
  const bars = M.parseSequence("7/8");
  const u = M.unitSeconds(160, M.referenceNote(bars));
  assert.ok(Math.abs(M.barUnits(bars[0]) * u - 7 * 0.375) < 1e-9);
  const q = M.unitSeconds(60, 4);              // quarter = 60: a 4/4 bar is 4 s
  assert.ok(Math.abs(M.barUnits(M.parseMeter("4/4")) * q - 4) < 1e-9);
});

test("tempo markings", () => {
  assert.equal(M.marking(72), "Adagio");
  assert.equal(M.marking(100), "Andante");
  assert.equal(M.marking(132), "Allegro");
});
