/* Meter engine: time signatures, beat groupings, bar sequences and click schedules.
 *
 * Everything is measured in sixteenth notes ("units"). A bar is a list of groups (beats);
 * 7/8 as 2+2+3 is groups [4, 4, 6]. The tempo always refers to one note value, the
 * "reference note": the beat when every beat in the sequence has the same length, otherwise
 * the largest note that divides every beat (the eighth for 7/8, the quarter for 5/4 + 6/4).
 * Works in the browser (window.Meter) and in Node (module.exports) for the tests.
 */
(function (root) {
  "use strict";

  const UNIT_PER_DEN = { 1: 16, 2: 8, 4: 4, 8: 2, 16: 1 };

  function defaultGroups(num, den) {
    // returned in denominator notes
    if (den === 8 || den === 16) {
      if (num % 3 === 0) return Array(num / 3).fill(3);          // 3/8, 6/8, 9/8, 12/8: compound
      if (num === 1 || num === 2) return Array(num).fill(1);
      if (num === 4) return [2, 2];
      if (num % 2 === 1) return Array((num - 3) / 2).fill(2).concat([3]); // 5 = 2+3, 7 = 2+2+3
      if (num === 8) return [3, 3, 2];
      return Array(num / 2).fill(2);
    }
    return Array(num).fill(1);                                   // simple time: one beat per note
  }

  /** "7/8", "7/8(3+2+2)", "6/4(3+3)" -> {label, num, den, groups (units)} */
  function parseMeter(text) {
    const m = String(text).trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:\(\s*([\d\s+]+)\s*\))?$/);
    if (!m) throw new Error(`"${text}" is not a time signature (write it like 3/4 or 7/8(2+2+3))`);
    const num = +m[1], den = +m[2];
    if (!UNIT_PER_DEN[den]) throw new Error(`${num}/${den}: the bottom number must be 1, 2, 4, 8 or 16`);
    if (num < 1 || num > 16) throw new Error(`${num}/${den}: the top number must be between 1 and 16`);
    let groups = m[3] ? m[3].split("+").map(s => +s.trim()) : defaultGroups(num, den);
    if (groups.some(g => !(g > 0))) throw new Error(`${text}: each group must be a whole number`);
    const sum = groups.reduce((a, b) => a + b, 0);
    if (sum !== num) throw new Error(`${text}: the groups add up to ${sum}, not ${num}`);
    const label = `${num}/${den}` + (m[3] ? ` (${groups.join("+")})` : "");
    return { label, num, den, groups: groups.map(g => g * UNIT_PER_DEN[den]) };
  }

  /** "3/4 3/4 2/4", "5/4, 6/4", "7/8(2+2+3) 3/4*2" -> list of bars */
  function parseSequence(text) {
    const tokens = String(text).trim().split(/[\s,;]+(?![^(]*\))/).filter(Boolean);
    if (!tokens.length) throw new Error("Write at least one time signature, like 4/4");
    const bars = [];
    for (const t of tokens) {
      const rep = t.match(/^(.*?)(?:[*x×](\d+))?$/);
      const meter = parseMeter(rep[1]);
      const n = rep[2] ? +rep[2] : 1;
      if (n < 1 || n > 32) throw new Error(`${t}: repeat between 1 and 32 times`);
      for (let i = 0; i < n; i++) bars.push(meter);
    }
    if (bars.length > 64) throw new Error("At most 64 bars in a sequence");
    return bars;
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  /** The note the tempo refers to, in units. */
  function referenceNote(bars) {
    const lens = bars.flatMap(b => b.groups);
    return lens.reduce(gcd);
  }

  /** True when every beat has the same length (then tempo markings like Andante apply). */
  function evenBeats(bars) {
    const lens = bars.flatMap(b => b.groups);
    return lens.every(l => l === lens[0]);
  }

  const NOTE_NAMES = { 1: "sixteenth", 2: "eighth", 3: "dotted eighth", 4: "quarter", 6: "dotted quarter",
                       8: "half", 12: "dotted half", 16: "whole" };
  const NOTE_SYMBOLS = { 2: "♪", 3: "♪.", 4: "♩", 6: "♩." };
  function noteName(units) { return NOTE_NAMES[units] || `${units} sixteenths`; }
  function noteSymbol(units) { return NOTE_SYMBOLS[units] || null; }

  /** Clicks in one bar: [{at (units from bar start), level 2|1|0, group}].
   *  sub: "beats" | "eighths" | "triplets" | "sixteenths". */
  function barClicks(bar, sub, accentFirst) {
    const out = [];
    let at = 0;
    bar.groups.forEach((len, g) => {
      let n;
      if (sub === "eighths") n = Math.max(1, Math.round(len / 2));
      else if (sub === "triplets") n = 3;
      else if (sub === "sixteenths") n = len;
      else n = 1;
      for (let i = 0; i < n; i++) {
        const level = i > 0 ? 0 : (g === 0 && accentFirst && bar.groups.length > 1 ? 2 : 1);
        out.push({ at: at + (len * i) / n, level, group: g });
      }
      at += len;
    });
    return out;
  }

  /** Seconds per unit for a tempo given on the reference note. */
  function unitSeconds(bpm, refUnits) { return 60 / bpm / refUnits; }

  function barUnits(bar) { return bar.groups.reduce((a, b) => a + b, 0); }

  const MARKINGS = [[40, "Grave"], [60, "Largo"], [66, "Larghetto"], [76, "Adagio"], [108, "Andante"],
                    [120, "Moderato"], [156, "Allegro"], [176, "Vivace"], [200, "Presto"], [Infinity, "Prestissimo"]];
  function marking(bpm) { return MARKINGS.find(([max]) => bpm < max)[1]; }

  const api = { parseMeter, parseSequence, referenceNote, evenBeats, noteName, noteSymbol, barClicks,
                unitSeconds, barUnits, marking, defaultGroups };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Meter = api;
})(typeof window !== "undefined" ? window : globalThis);
