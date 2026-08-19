export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function armorDamage(incoming: number, armor: number) {
  return Math.max(0, incoming - armor);
}

export function tierMultiplier(tier: number) {
  return tier === 1 ? 1 : tier === 2 ? 1.55 : 2.45;
}

export function starsForHp(hp: number, maxHp: number) {
  const ratio = hp / maxHp;
  if (ratio >= .8) return 3;
  if (ratio >= .5) return 2;
  return hp > 0 ? 1 : 0;
}

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shouldRescueStalledBody(
  speed: number,
  movedDistance: number,
  stalledForMs: number,
  rescueAfterMs: number,
  speedThreshold = .85,
  distanceThreshold = 6,
) {
  return speed < speedThreshold && movedDistance < distanceThreshold && stalledForMs >= rescueAfterMs;
}
