/* Metronome UI and audio scheduling. The meter logic is in meter.js (tested in test/). */
(() => {
  "use strict";
  const M = window.Meter;
  const $ = id => document.getElementById(id);
  const MIN = 20, MAX = 300;

  const state = { bpm: 72, meter: "4/4", custom: "3/4 3/4 2/4", sub: "beats", sound: "wood", vol: 0.8, accent: true };
  try { Object.assign(state, JSON.parse(localStorage.getItem("metronome") || "{}")); } catch (e) { /* private mode */ }
  const save = () => { try { localStorage.setItem("metronome", JSON.stringify(state)); } catch (e) { /* ignore */ } };

  let bars = M.parseSequence("4/4"), ref = 4;
  let ctx = null, master = null, running = false, timer = null, wakeLock = null;
  let barIdx = 0, clicks = [], clickIdx = 0, nextTime = 0;
  const queue = [];   // scheduled clicks waiting to be shown: {time, bar, group, level}

  // ---------------------------------------------------------------- meter
  function loadMeter() {
    const text = state.meter === "custom" ? state.custom : state.meter;
    const note = $("customNote"), input = $("custom");
    try {
      bars = M.parseSequence(text);
      input.classList.remove("bad");
      note.classList.remove("error");
      note.innerHTML = 'Examples: <code>5/4 6/4</code>, <code>3/4*3 2/4</code>, <code>7/8(3+2+2)</code>, <code>11/8(3+3+2+3)</code>.';
    } catch (err) {
      input.classList.add("bad");
      note.classList.add("error");
      note.textContent = err.message;
      return false;
    }
    ref = M.referenceNote(bars);
    barIdx = 0;
    renderTempo();
    renderBeats(0);
    return true;
  }

  // ---------------------------------------------------------------- display
  function renderBeats(b) {
    const bar = bars[b % bars.length];
    const box = $("beats");
    box.innerHTML = "";
    const smallest = Math.min(...bar.groups);
    const scale = Math.max(1, 26 / bar.groups.length / 1.6);   // keep long bars on one line
    bar.groups.forEach((len, g) => {
      const d = document.createElement("div");
      d.className = "beat" + (g === 0 && state.accent && bar.groups.length > 1 ? " first" : "");
      d.style.width = `${Math.min(18 * scale, 18) * (len / smallest) + 0}px`;
      box.appendChild(d);
    });
    $("barinfo").textContent = bars.length > 1 ? `${bar.label}  ·  bar ${(b % bars.length) + 1} of ${bars.length}` : bar.label;
  }
  function renderTempo() {
    $("bpm").textContent = state.bpm;
    $("slider").value = state.bpm;
    const svg = noteSVG(ref);
    $("refSymbol").innerHTML = svg;
    $("refSymbol").setAttribute("aria-label", M.noteName(ref));
    $("refSymbol").hidden = $("refSymbol").nextElementSibling.hidden = !svg;
    $("unitLabel").textContent = `${M.noteName(ref)} notes per minute`;
    $("marking").textContent = M.evenBeats(bars) ? M.marking(state.bpm) : "";
  }
  // A note drawn as SVG (font note glyphs vary too much between phones): head, stem, flags, dot.
  function noteSVG(units) {
    const kinds = { 1: [false, 2, false], 2: [false, 1, false], 3: [false, 1, true], 4: [false, 0, false],
                    6: [false, 0, true], 8: [true, 0, false], 12: [true, 0, true] };
    const k = kinds[units];
    if (!k) return "";
    const [hollow, flags, dot] = k;
    let flagPaths = "";
    for (let i = 0; i < flags; i++) {
      const y = 6 + i * 11;
      flagPaths += `<path d="M18 ${y} c2 9 13 12 9 25 c1 -9 -5 -13 -9 -15 z" fill="currentColor"/>`;
    }
    return `<svg viewBox="0 0 34 64" width="34" height="64" aria-hidden="true">
      <ellipse cx="10" cy="54" rx="9" ry="6.2" transform="rotate(-22 10 54)" fill="${hollow ? "none" : "currentColor"}"
        stroke="currentColor" stroke-width="${hollow ? 2.6 : 0}"/>
      <rect x="16.4" y="6" width="2.4" height="47" fill="currentColor"/>${flagPaths}
      ${dot ? '<circle cx="28" cy="54" r="3" fill="currentColor"/>' : ""}</svg>`;
  }
  function renderControls() {
    const opt = [...$("meter").options].some(o => o.value === state.meter);
    $("meter").value = opt ? state.meter : "4/4";
    $("customField").hidden = state.meter !== "custom";
    $("custom").value = state.custom;
    $("sub").value = state.sub;
    $("sound").value = state.sound;
    $("vol").value = Math.round(state.vol * 100);
    $("accent").checked = state.accent;
  }
  function setBpm(v) {
    state.bpm = Math.max(MIN, Math.min(MAX, Math.round(v)));
    renderTempo();
    save();
  }

  // ---------------------------------------------------------------- sound
  function click(time, level) {   // level 2 = bar accent, 1 = beat, 0 = subdivision
    const o = ctx.createOscillator(), g = ctx.createGain();
    let f, len;
    if (state.sound === "wood") { o.type = "triangle"; f = [750, 1000, 1300][level]; len = 0.035; }
    else if (state.sound === "beep") { o.type = "square"; f = [660, 880, 1760][level]; len = 0.05; }
    else { o.type = "sine"; f = [600, 800, 1100][level]; len = 0.06; }
    const peak = [0.35, 0.65, 1.0][level] * state.vol;
    o.frequency.setValueAtTime(f, time);
    if (state.sound === "wood") o.frequency.exponentialRampToValueAtTime(f * 0.6, time + len);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    o.connect(g); g.connect(master);
    o.start(time); o.stop(time + len + 0.02);
  }

  // ---------------------------------------------------------------- scheduler
  // Every 25 ms, schedule the clicks of the next 100 ms on the audio clock, so timing stays
  // exact even when the page is busy. Tempo changes apply from the next click.
  function loadBar() {
    clicks = M.barClicks(bars[barIdx], state.sub, state.accent);
    clickIdx = 0;
  }
  function schedule() {
    while (nextTime < ctx.currentTime + 0.1) {
      const c = clicks[clickIdx];
      if (state.vol > 0) click(nextTime, c.level);
      queue.push({ time: nextTime, bar: barIdx, group: c.group, level: c.level });
      const nextAt = clickIdx + 1 < clicks.length ? clicks[clickIdx + 1].at : M.barUnits(bars[barIdx]);
      nextTime += (nextAt - c.at) * M.unitSeconds(state.bpm, ref);
      clickIdx++;
      if (clickIdx >= clicks.length) { barIdx = (barIdx + 1) % bars.length; loadBar(); }
    }
  }
  let shownBar = -1;
  function draw() {
    if (!running) return;
    let current = null;
    while (queue.length && queue[0].time <= ctx.currentTime) current = queue.shift();
    if (current && current.level > 0) {
      if (current.bar !== shownBar) { renderBeats(current.bar); shownBar = current.bar; }
      [...$("beats").children].forEach((d, i) => d.classList.toggle("on", i === current.group));
    }
    requestAnimationFrame(draw);
  }

  async function start() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") await ctx.resume();
    running = true;
    barIdx = 0; shownBar = -1; queue.length = 0;
    loadBar();
    nextTime = ctx.currentTime + 0.06;
    schedule();
    timer = setInterval(schedule, 25);
    requestAnimationFrame(draw);
    $("start").textContent = "Stop";
    requestWakeLock();
  }
  function stop() {
    running = false;
    clearInterval(timer);
    [...$("beats").children].forEach(d => d.classList.remove("on"));
    renderBeats(0);
    $("start").textContent = "Start";
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ }
    wakeLock = null;
  }
  const toggle = () => (running ? stop() : start());
  const restartIfRunning = () => { if (running) { stop(); start(); } };
  async function requestWakeLock() {   // keep the screen on while it plays, where the browser allows it
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { wakeLock = null; }
  }

  // ---------------------------------------------------------------- tap tempo
  let taps = [];
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      setBpm(60000 / (gaps.reduce((a, b) => a + b) / gaps.length));
    }
  }

  // ---------------------------------------------------------------- wiring
  $("m5").onclick = () => setBpm(state.bpm - 5);
  $("m1").onclick = () => setBpm(state.bpm - 1);
  $("p1").onclick = () => setBpm(state.bpm + 1);
  $("p5").onclick = () => setBpm(state.bpm + 5);
  $("slider").oninput = e => setBpm(+e.target.value);
  $("start").onclick = toggle;
  $("tap").onclick = tap;
  $("slow").onclick = () => setBpm(state.bpm * 0.9);
  $("meter").onchange = e => {
    state.meter = e.target.value;
    $("customField").hidden = state.meter !== "custom";
    save();
    if (loadMeter()) restartIfRunning(); else if (running) stop();
  };
  $("custom").oninput = e => {
    state.custom = e.target.value;
    save();
    if (loadMeter()) restartIfRunning(); else if (running) stop();
  };
  $("sub").onchange = e => { state.sub = e.target.value; save(); restartIfRunning(); };
  $("sound").onchange = e => { state.sound = e.target.value; save(); };
  $("vol").oninput = e => { state.vol = +e.target.value / 100; save(); };
  $("accent").onchange = e => { state.accent = e.target.checked; save(); renderBeats(running ? shownBar : 0); restartIfRunning(); };

  document.addEventListener("keydown", e => {
    const t = e.target;
    if (t.tagName === "SELECT" || (t.tagName === "INPUT" && t.type === "text")) return;
    if (e.code === "Space") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setBpm(state.bpm + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setBpm(state.bpm - 1); }
    else if (e.key === "t" || e.key === "T") tap();
  });
  document.addEventListener("visibilitychange", () => {
    if (running && document.visibilityState === "visible") requestWakeLock();
  });

  renderControls();
  if (!loadMeter()) { state.meter = "4/4"; renderControls(); loadMeter(); }

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline use just won't be available */ });
  }
})();
