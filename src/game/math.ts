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

export interface ShuffleBag<T> { drawUnique(count: number): T[] }

export function createShuffleBag<T>(items: readonly T[], seed: number): ShuffleBag<T> {
  const random = seededRandom(seed);
  let bag: T[] = [];
  const refill = () => {
    bag = [...items];
    for (let index = bag.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [bag[index], bag[swap]] = [bag[swap], bag[index]];
    }
  };
  return { drawUnique(count: number) {
    const result: T[] = [];
    while (result.length < Math.min(count, new Set(items).size)) {
      if (!bag.length) refill();
      const next = bag.shift()!;
      if (!result.includes(next)) result.push(next);
    }
    return result;
  } };
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

export function shouldRescueSpatiallyTrappedBody(
  distanceFromAnchor: number,
  trappedForMs: number,
  travelRadius: number,
  rescueAfterMs: number,
) {
  return distanceFromAnchor < travelRadius && trappedForMs >= rescueAfterMs;
}

export function magneticPullVelocity(
  position: { x: number; y: number },
  target: { x: number; y: number },
  velocity: { x: number; y: number },
  radius: number,
  strength: number,
) {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 1 || distance >= radius) return { ...velocity };
  const falloff = .55 + .45 * (1 - distance / radius);
  const impulse = strength * falloff;
  return { x: velocity.x + dx / distance * impulse, y: velocity.y + dy / distance * impulse };
}

export function spinnerLaunchVelocity(
  radial: { x: number; y: number },
  outwardSpeed: number,
  tangentialSpeed: number,
  direction: 1 | -1,
) {
  const length = Math.hypot(radial.x, radial.y) || 1;
  const x = radial.x / length;
  const y = radial.y / length;
  return {
    x: x * outwardSpeed - y * tangentialSpeed * direction,
    y: y * outwardSpeed + x * tangentialSpeed * direction,
  };
}
