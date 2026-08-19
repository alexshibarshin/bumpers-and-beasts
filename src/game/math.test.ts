import { describe, expect, it } from 'vitest';
import { armorDamage, createShuffleBag, magneticPullVelocity, shouldRescueSpatiallyTrappedBody, shouldRescueStalledBody, spinnerLaunchVelocity, starsForHp, tierMultiplier } from './math';

describe('combat math', () => {
  it('uses flat armor subtraction', () => {
    expect(armorDamage(12, 5)).toBe(7);
    expect(armorDamage(4, 5)).toBe(0);
  });
  it('awards stars from remaining base hp', () => {
    expect(starsForHp(16, 20)).toBe(3);
    expect(starsForHp(10, 20)).toBe(2);
    expect(starsForHp(1, 20)).toBe(1);
    expect(starsForHp(0, 20)).toBe(0);
  });
  it('makes run upgrades substantial', () => {
    expect(tierMultiplier(2)).toBeGreaterThanOrEqual(1.5);
    expect(tierMultiplier(3)).toBeGreaterThan(2);
  });

  it('only rescues bodies that have genuinely stalled', () => {
    expect(shouldRescueStalledBody(.2, 2, 1600, 1600)).toBe(true);
    expect(shouldRescueStalledBody(1.2, 2, 1600, 1600)).toBe(false);
    expect(shouldRescueStalledBody(.2, 9, 1600, 1600)).toBe(false);
    expect(shouldRescueStalledBody(.2, 2, 1200, 1600)).toBe(false);
  });

  it('rescues jittering bodies that stay inside a small pocket', () => {
    expect(shouldRescueSpatiallyTrappedBody(18, 2400, 36, 2400)).toBe(true);
    expect(shouldRescueSpatiallyTrappedBody(42, 2400, 36, 2400)).toBe(false);
    expect(shouldRescueSpatiallyTrappedBody(18, 1800, 36, 2400)).toBe(false);
  });

  it('makes the magnet pull nearby moving targets toward its core', () => {
    const pulled = magneticPullVelocity({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 2 }, 250, 16);
    expect(pulled.x).toBeLessThan(-7);
    expect(pulled.y).toBe(2);
    expect(magneticPullVelocity({ x: 260, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 2 }, 250, 16)).toEqual({ x: 3, y: 2 });
  });

  it('gives the spinner a dominant and reversible tangential launch', () => {
    expect(spinnerLaunchVelocity({ x: 0, y: -1 }, 14, 18, 1)).toEqual({ x: 18, y: -14 });
    expect(spinnerLaunchVelocity({ x: 0, y: -1 }, 14, 18, -1)).toEqual({ x: -18, y: -14 });
  });

  it('draws deterministic unique offers from a fair shuffle bag', () => {
    const deck=['a','b','c','d','e','f','g','h'];
    const first=createShuffleBag(deck,42); const second=createShuffleBag(deck,42);
    const sequence=Array.from({length:40},()=>first.drawUnique(3));
    expect(sequence).toEqual(Array.from({length:40},()=>second.drawUnique(3)));
    expect(sequence.every(offer=>new Set(offer).size===3)).toBe(true);
    expect(new Set(sequence.flat())).toEqual(new Set(deck));
  });
});
