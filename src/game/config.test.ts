import { describe, expect, it } from 'vitest';
import { BUMPERS, DECK, ENEMIES, GAME, SOCKETS, WAVES } from './config';

describe('prototype content configuration', () => {
  it('has exactly eight unique deck pieces', () => {
    expect(DECK).toHaveLength(8);
    expect(new Set(DECK).size).toBe(8);
    expect(Object.keys(BUMPERS).sort()).toEqual([...DECK].sort());
  });

  it('has ten authored waves and introduces every enemy', () => {
    expect(WAVES).toHaveLength(10);
    const roster = new Set(WAVES.flat());
    expect([...roster].sort()).toEqual(Object.keys(ENEMIES).sort());
    expect(WAVES.at(-1)!.length).toBeGreaterThan(WAVES[0].length);
  });

  it('keeps bounce strength authored per bumper', () => {
    expect(BUMPERS.spike.bounce).toBeLessThan(BUMPERS.basic.bounce);
    expect(BUMPERS.blast.bounce).toBeGreaterThan(BUMPERS.basic.bounce);
  });

  it('keeps edge sockets clear of the side walls for the largest pieces', () => {
    const largestEnemy = Math.max(...Object.values(ENEMIES).map(enemy => enemy.radius));
    const largestBumper = Math.max(...Object.values(BUMPERS).map(bumper => bumper.radius));
    const requiredClearance = largestEnemy + largestBumper + 12;
    const leftSocket = SOCKETS.find(socket => socket.id === 's6')!;
    const rightSocket = SOCKETS.find(socket => socket.id === 's8')!;

    expect(leftSocket.position.x - GAME.playfieldLeft).toBeGreaterThanOrEqual(requiredClearance);
    expect(GAME.playfieldRight - rightSocket.position.x).toBeGreaterThanOrEqual(requiredClearance);
  });
});
