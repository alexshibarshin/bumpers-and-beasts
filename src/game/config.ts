import type { BumperConfig, BumperKind, EnemyConfig, EnemyKind, Point } from './types';

export const GAME = {
  width: 720,
  height: 1280,
  gravity: 1.05,
  maxBaseHp: 20,
  totalWaves: 10,
  perfectWindowMs: 135,
  tipBonus: 1.35,
  kineticThreshold: 8,
  kineticScale: 0.22,
  flipperDamage: 8,
  flipperLength: 148,
  flipperThickness: 28,
  comboWindowMs: 1800,
  comboStep: 5,
  perEnemyBumperCooldownMs: 160,
  countdownSeconds: 2,
  baseScrapPerWave: 14,
  firstRerollCost: 8,
  takeAllCost: 34,
  playfieldLeft: 62,
  playfieldRight: 658,
  motionSampleMs: 320,
  stuckSpeedThreshold: .85,
  stuckDistanceThreshold: 6,
  stuckRescueMs: 1600,
  stuckRescueHorizontalSpeed: 7,
  stuckRescueDownwardSpeed: 5.5,
} as const;

export const ENEMIES: Record<EnemyKind, EnemyConfig> = {
  grunt: { kind: 'grunt', label: 'Крикун', radius: 32, mass: 1.2, restitution: .76, frictionAir: .005, hp: 58, armor: 0, baseDamage: 1, reward: 4, color: 0xe95b56 },
  heavy: { kind: 'heavy', label: 'Жиробас', radius: 44, mass: 4.8, restitution: .46, frictionAir: .01, hp: 118, armor: 5, baseDamage: 3, reward: 9, color: 0x9a79d2 },
  light: { kind: 'light', label: 'Пискля', radius: 23, mass: .55, restitution: .92, frictionAir: .003, hp: 34, armor: 0, baseDamage: 1, reward: 3, color: 0xf2cf63 },
  jet: { kind: 'jet', label: 'Ракетчик', radius: 30, mass: 1.35, restitution: .7, frictionAir: .005, hp: 70, armor: 2, baseDamage: 2, reward: 7, color: 0xef914d },
  splitter: { kind: 'splitter', label: 'Мамочка', radius: 36, mass: 1.8, restitution: .68, frictionAir: .007, hp: 82, armor: 1, baseDamage: 2, reward: 7, color: 0x64c981 },
};

export const BUMPERS: Record<BumperKind, BumperConfig> = {
  basic: { kind: 'basic', label: 'Дубина', color: 0xe7cc8e, damage: 16, bounce: 1.14, cooldownMs: 0, radius: 40 },
  fire: { kind: 'fire', label: 'Поджигатель', color: 0xff6a31, damage: 10, bounce: .92, cooldownMs: 220, radius: 40 },
  blast: { kind: 'blast', label: 'Бабах', color: 0xffd64f, damage: 11, bounce: 1.55, cooldownMs: 1100, radius: 42 },
  ice: { kind: 'ice', label: 'Морозилка', color: 0x79d6ff, damage: 8, bounce: .55, cooldownMs: 320, radius: 40 },
  spike: { kind: 'spike', label: 'Точило', color: 0xd9d7cc, damage: 24, bounce: .38, cooldownMs: 180, radius: 42 },
  electric: { kind: 'electric', label: 'Шокер', color: 0xb995ff, damage: 9, bounce: .88, cooldownMs: 620, radius: 40 },
  pit: { kind: 'pit', label: 'Жор-Яма', color: 0x30243e, damage: 999, bounce: .05, cooldownMs: 4200, radius: 43 },
  poison: { kind: 'poison', label: 'Токсик', color: 0x8bea53, damage: 5, bounce: .68, cooldownMs: 360, radius: 40 },
};

export const SOCKETS: Array<{ id: string; position: Point; locked?: boolean }> = [
  { id: 's1', position: { x: 180, y: 310 } },
  { id: 's2', position: { x: 360, y: 270 } },
  { id: 's3', position: { x: 540, y: 310 } },
  { id: 's4', position: { x: 250, y: 485 } },
  { id: 's5', position: { x: 470, y: 485 } },
  { id: 's6', position: { x: 170, y: 660 } },
  { id: 's7', position: { x: 360, y: 625 } },
  { id: 's8', position: { x: 550, y: 660 } },
  { id: 's9', position: { x: 250, y: 820 } },
  { id: 's10', position: { x: 470, y: 820 } },
];

export const DECK: BumperKind[] = ['basic', 'fire', 'blast', 'ice', 'spike', 'electric', 'pit', 'poison'];

export const WAVES: EnemyKind[][] = [
  ['grunt', 'grunt', 'grunt', 'grunt'],
  ['light', 'grunt', 'grunt', 'light', 'grunt'],
  ['heavy', 'grunt', 'light', 'grunt', 'grunt', 'heavy'],
  ['jet', 'grunt', 'light', 'grunt', 'heavy', 'grunt', 'light'],
  ['splitter', 'grunt', 'light', 'jet', 'grunt', 'heavy', 'grunt', 'light'],
  ['heavy', 'light', 'jet', 'grunt', 'splitter', 'grunt', 'light', 'heavy', 'grunt'],
  ['jet', 'light', 'light', 'heavy', 'grunt', 'splitter', 'grunt', 'jet', 'heavy', 'grunt', 'light'],
  ['splitter', 'grunt', 'heavy', 'jet', 'light', 'light', 'grunt', 'heavy', 'splitter', 'jet', 'grunt', 'light'],
  ['heavy', 'jet', 'grunt', 'splitter', 'light', 'heavy', 'light', 'jet', 'grunt', 'splitter', 'heavy', 'grunt', 'light', 'jet'],
  ['splitter', 'jet', 'heavy', 'light', 'grunt', 'heavy', 'jet', 'splitter', 'light', 'light', 'heavy', 'grunt', 'jet', 'splitter', 'heavy', 'grunt', 'light'],
];
