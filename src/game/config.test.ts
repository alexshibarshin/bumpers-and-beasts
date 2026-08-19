import { describe, expect, it } from 'vitest';
import { STAGES, validateStage } from '../content/stages';
import { circleClearOfObstacle, hasRouteToFlippers } from '../content/geometry';
import { ALL_BUMPERS, BUMPERS, ENEMIES, GAME, STARTER_DECK } from './config';

describe('milestone 2 content', () => {
  it('has an eight-piece starter deck inside a twelve-piece catalog', () => {
    expect(STARTER_DECK).toHaveLength(8);
    expect(new Set(STARTER_DECK).size).toBe(8);
    expect(ALL_BUMPERS).toHaveLength(12);
    expect(STARTER_DECK.every(kind => kind in BUMPERS)).toBe(true);
  });

  it('has ten valid authored stages with a boss finale', () => {
    expect(STAGES).toHaveLength(10);
    for (const [index, stage] of STAGES.entries()) {
      expect(stage.order).toBe(index + 1);
      expect(stage.waves.length).toBeGreaterThanOrEqual(7);
      expect(validateStage(stage)).toEqual([]);
      expect(stage.rewards.starCoins[0]).toBeLessThan(stage.rewards.starCoins[1]);
      expect(stage.rewards.starCoins[1]).toBeLessThan(stage.rewards.starCoins[2]);
    }
    expect(STAGES.at(-1)!.waves.flatMap(wave => wave.events).some(event => event.enemy === 'boss')).toBe(true);
  });

  it('keeps every edge socket clear for enemies authored on its stage', () => {
    const biggestBumper = Math.max(...Object.values(BUMPERS).map(bumper => bumper.radius));
    for (const stage of STAGES) {
      const roster = new Set(stage.waves.flatMap(wave => wave.events.map(event => event.enemy)));
      const biggestEnemy = Math.max(...[...roster].map(kind => ENEMIES[kind].radius));
      const clearance = biggestEnemy + biggestBumper + 12;
      for (const socket of stage.sockets) {
        if (socket.position.x < 240) expect(socket.position.x - GAME.playfieldLeft, `${stage.id}:${socket.id}`).toBeGreaterThanOrEqual(clearance);
        if (socket.position.x > 480) expect(GAME.playfieldRight - socket.position.x, `${stage.id}:${socket.id}`).toBeGreaterThanOrEqual(clearance);
      }
    }
  });

  it('authors distinct topology and bounce tradeoffs', () => {
    expect(new Set(STAGES.map(stage => stage.sockets.map(socket => `${socket.position.x}:${socket.position.y}`).join('|'))).size).toBe(10);
    expect(BUMPERS.spike.bounce).toBeLessThan(BUMPERS.basic.bounce);
    expect(BUMPERS.spring.bounce).toBeGreaterThan(BUMPERS.blast.bounce);
  });

  it('keeps a route to the flippers with every socket occupied', () => {
    const biggestBumper = Math.max(...Object.values(BUMPERS).map(bumper => bumper.radius));
    const blockedStages: string[] = [];
    for (const stage of STAGES) {
      const roster = new Set(stage.waves.flatMap(wave => wave.events.map(event => event.enemy)));
      const biggestEnemy = Math.max(...[...roster].map(kind => ENEMIES[kind].radius));
      if (!hasRouteToFlippers(stage, biggestEnemy, biggestBumper)) blockedStages.push(stage.id);
    }
    expect(blockedStages).toEqual([]);
  });

  it('keeps authored sockets clear of bumpers and physical obstacles', () => {
    const biggestBumper = Math.max(...Object.values(BUMPERS).map(bumper => bumper.radius));
    const minimumSocketSpacing = biggestBumper * 2;
    const conflicts: string[] = [];
    for (const stage of STAGES) {
      for (let left = 0; left < stage.sockets.length; left++) {
        const socket = stage.sockets[left];
        for (let right = left + 1; right < stage.sockets.length; right++) {
          const other = stage.sockets[right];
          const requiredSpacing = stage.id === 'stage-05' ? 96 : minimumSocketSpacing;
          if (Math.hypot(socket.position.x - other.position.x, socket.position.y - other.position.y) < requiredSpacing) {
            conflicts.push(`${stage.id}:${socket.id}:${other.id}`);
          }
        }
        if (stage.id === 'stage-05') {
          for (const obstacle of stage.obstacles) {
            if (!circleClearOfObstacle(socket.position, obstacle, biggestBumper, 6)) conflicts.push(`${stage.id}:${socket.id}:${obstacle.id}`);
          }
        }
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('reduces every bumper collider by exactly ten percent', () => {
    const previous: Record<keyof typeof BUMPERS, number> = { basic:40,fire:40,blast:42,ice:40,spike:42,electric:40,pit:43,poison:40,magnet:41,spinner:41,spring:42,grinder:43 };
    for (const kind of ALL_BUMPERS) expect(BUMPERS[kind].radius).toBeCloseTo(previous[kind] * .9, 5);
  });
});
