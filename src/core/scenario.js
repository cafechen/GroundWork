export const ENGINE_VERSION = '0.1.0';
export const DEFAULT_CONFIG = Object.freeze({
  seed: 42, speed: 1.6, trailerLength: 3.2, aisleWidth: 6, doorDelay: 0,
  policy: 'fifo', vehicleCount: 2, dt: 0.1, duration: 90,
});

export const PRESETS = {
  baseline: { ...DEFAULT_CONFIG },
  tight: { ...DEFAULT_CONFIG, aisleWidth: 2.8, trailerLength: 4.5 },
  delay: { ...DEFAULT_CONFIG, doorDelay: 18 },
};

export function validateConfig(config) {
  const errors = [];
  const limits = { seed: [1, 1000000], speed: [0.4, 2.5], trailerLength: [2, 5], aisleWidth: [2.4, 8], doorDelay: [0, 60], vehicleCount: [1,2], dt: [0.02,0.2], duration: [10,120] };
  for (const [key, [min,max]] of Object.entries(limits)) {
    if (!Number.isFinite(config[key]) || config[key] < min || config[key] > max) errors.push(`${key}: ${min}–${max}`);
  }
  for (const key of ['seed','vehicleCount']) if (!Number.isInteger(config[key])) errors.push(`${key}: integer required`);
  if (!['fifo', 'none'].includes(config.policy)) errors.push('policy: fifo | none');
  return errors;
}

export function makeScenario(config = {}) {
  const c = { ...DEFAULT_CONFIG, ...config };
  const errors = validateConfig(c);
  if (errors.length) throw new Error(errors.join('; '));
  return {
    schemaVersion: 1, id: 'crossing-yard', config: c, bounds: { w: 40, h: 28 },
    resource: { id: 'J-01', x: 17, y: 5, w: 6, h: 6 },
    obstacles: [
      { id: 'R-01', x: 4, y: 13, w: 9, h: 5 },
      { id: 'R-02', x: 26, y: 12, w: 4, h: 6 },
      { id: 'R-03', x: 7, y: 1, w: 8, h: 3 },
      { id: 'B-01', x: 25, y: 8 + c.aisleWidth / 2, w: 5, h: 0.6 },
      { id: 'B-02', x: 25, y: 8 - c.aisleWidth / 2 - 0.6, w: 5, h: 0.6 },
    ],
    stations: [{ id: 'S-01', x:6,y:8 }, { id:'S-02',x:27,y:24 }, { id:'S-03',x:20,y:2 }, { id:'S-04',x:6,y:23 }],
    routes: [
      [{x:6,y:8},{x:30,y:8},{x:33,y:11},{x:33,y:23},{x:27,y:24}],
      [{x:20,y:2},{x:20,y:20},{x:16,y:23},{x:6,y:23}],
    ],
  };
}

export function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}

export function parseScenario(text) {
  const value = JSON.parse(text);
  if (value.schemaVersion !== 1 || value.id !== 'crossing-yard' || !value.config) throw new Error('Expected GroundWork crossing-yard schemaVersion 1');
  // v0.1 deliberately imports the template configuration, not arbitrary geometry.
  return makeScenario(value.config);
}
