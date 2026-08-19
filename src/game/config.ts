import type { BumperConfig, BumperKind, EnemyConfig, EnemyKind } from './types';

export const GAME = {
  width: 720,
  height: 1280,
  gravity: 1.05,
  maxBaseHp: 20,
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
  boss: { kind: 'boss', label: 'Главшар', radius: 68, mass: 12, restitution: .42, frictionAir: .008, hp: 920, armor: 7, baseDamage: 8, reward: 44, color: 0xff4e52 },
};

export const BUMPERS: Record<BumperKind, BumperConfig> = {
  basic: { kind:'basic',label:'Дубина',role:'Надёжный ударник',color:0xe7cc8e,damage:16,bounce:1.14,cooldownMs:0,radius:40,baseUpgradeCost:25,effectLabel:'чистый урон' },
  fire: { kind:'fire',label:'Поджигатель',role:'Долгий огонь',color:0xff6a31,damage:10,bounce:.92,cooldownMs:220,radius:40,baseUpgradeCost:30,effectLabel:'горение 3,2 с' },
  blast: { kind:'blast',label:'Бабах',role:'Взрыв по толпе',color:0xffd64f,damage:11,bounce:1.55,cooldownMs:1100,radius:42,baseUpgradeCost:38,effectLabel:'радиус 168' },
  ice: { kind:'ice',label:'Морозилка',role:'Контроль скорости',color:0x79d6ff,damage:8,bounce:.55,cooldownMs:320,radius:40,baseUpgradeCost:30,effectLabel:'заморозка 2,2 с' },
  spike: { kind:'spike',label:'Точило',role:'Пробой брони',color:0xd9d7cc,damage:24,bounce:.38,cooldownMs:180,radius:42,baseUpgradeCost:35,effectLabel:'тяжёлый контакт' },
  electric: { kind:'electric',label:'Шокер',role:'Цепной разряд',color:0xb995ff,damage:9,bounce:.88,cooldownMs:620,radius:40,baseUpgradeCost:38,effectLabel:'до 3 целей' },
  pit: { kind:'pit',label:'Жор-Яма',role:'Редкое поглощение',color:0x6e4d88,damage:999,bounce:.05,cooldownMs:4200,radius:43,baseUpgradeCost:50,effectLabel:'пожирает цель' },
  poison: { kind:'poison',label:'Токсик',role:'Коррозия брони',color:0x8bea53,damage:5,bounce:.68,cooldownMs:360,radius:40,baseUpgradeCost:35,effectLabel:'яд 4,5 с' },
  magnet: { kind:'magnet',label:'Притягатель',role:'Группировка целей',color:0x4de0db,damage:7,bounce:.64,cooldownMs:720,radius:41,baseUpgradeCost:42,effectLabel:'стяжка 185' },
  spinner: { kind:'spinner',label:'Карусель',role:'Закручивает маршрут',color:0xff7db8,damage:12,bounce:1.02,cooldownMs:420,radius:41,baseUpgradeCost:38,effectLabel:'боковой импульс' },
  spring: { kind:'spring',label:'Пружинный псих',role:'Максимальный бросок',color:0x70f29a,damage:6,bounce:2.08,cooldownMs:1250,radius:42,baseUpgradeCost:42,effectLabel:'сверхотскок' },
  grinder: { kind:'grinder',label:'Мясорубка',role:'Удержание и тики',color:0xff765b,damage:4,bounce:.22,cooldownMs:260,radius:43,baseUpgradeCost:45,effectLabel:'серия порезов' },
};

export const SOCKETS = [
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

export const STARTER_DECK: BumperKind[] = ['basic', 'fire', 'blast', 'ice', 'spike', 'electric', 'pit', 'poison'];
export const DECK = STARTER_DECK;
export const ALL_BUMPERS = Object.keys(BUMPERS) as BumperKind[];

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
