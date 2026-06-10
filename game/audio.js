// Synthesized game audio — no asset files. Everything is built from
// oscillators and filtered noise so it works offline and loads instantly.
// The AudioContext can only start after a user gesture; call resume() from
// input handlers.

export function createGameAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let slideGain = null;
  let noiseBuffer = null;
  let muted = false;
  let lastBoostTimer = 0;
  let lastCoins = 0;

  function ensure() {
    if (ctx) return true;
    if (typeof window === "undefined") return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    // engine: detuned saw + sub square through a lowpass
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 850;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc = ctx.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 55;
    engineSub = ctx.createOscillator();
    engineSub.type = "square";
    engineSub.frequency.value = 27;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    engineOsc.connect(engineGain);
    engineSub.connect(subGain);
    subGain.connect(engineGain);
    engineGain.connect(engineFilter);
    engineFilter.connect(master);
    engineOsc.start();
    engineSub.start();

    // tyre slide: looped noise through a bandpass, gated by drift/scrape
    const slideSource = ctx.createBufferSource();
    slideSource.buffer = noiseBuffer;
    slideSource.loop = true;
    const slideFilter = ctx.createBiquadFilter();
    slideFilter.type = "bandpass";
    slideFilter.frequency.value = 2300;
    slideFilter.Q.value = 0.7;
    slideGain = ctx.createGain();
    slideGain.gain.value = 0;
    slideSource.connect(slideFilter);
    slideFilter.connect(slideGain);
    slideGain.connect(master);
    slideSource.start();

    return true;
  }

  function resume() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
  }

  function update(car) {
    if (!ensure() || !car) return;
    const t = ctx.currentTime;
    const speedT = Math.min(1, Math.abs(car.forwardSpeed) / 52);
    const revs = 50 + speedT * 175 + (car.boostTimer > 0 ? 35 : 0) + car.throttle * 14;
    engineOsc.frequency.setTargetAtTime(revs, t, 0.06);
    engineSub.frequency.setTargetAtTime(revs / 2, t, 0.06);
    engineGain.gain.setTargetAtTime(0.035 + speedT * 0.085 + car.throttle * 0.03, t, 0.1);

    const sliding = (car.drifting || car.railContact) && Math.abs(car.forwardSpeed) > 8;
    slideGain.gain.setTargetAtTime(sliding ? 0.1 : 0, t, 0.07);

    if (car.boostTimer > lastBoostTimer + 0.5) boostWhoosh();
    lastBoostTimer = car.boostTimer;
    if (car.coins.size > lastCoins) coinBlip();
    lastCoins = car.coins.size;
    if (car.impact > 0.45) thud(car.impact);
  }

  function boostWhoosh() {
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(5200, t + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.32, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + 1.2);
  }

  function coinBlip() {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(988, t);
    osc.frequency.setValueAtTime(1319, t + 0.07);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  let lastThudAt = 0;
  function thud(strength) {
    const t = ctx.currentTime;
    if (t - lastThudAt < 0.25) return;
    lastThudAt = t;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.4, strength * 0.5), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
  }

  function dispose() {
    if (ctx) ctx.close();
    ctx = null;
  }

  return { resume, update, setMuted, dispose };
}
