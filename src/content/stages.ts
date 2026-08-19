import { SOCKETS, WAVES } from '../game/config';
import type { BumperKind, EnemyKind, ObstacleConfig, SocketConfig, StageConfig, StageId, WaveConfig } from '../game/types';

const gates = [
  { id: 'left', position: { x: 145, y: 150 } },
  { id: 'center', position: { x: 360, y: 150 } },
  { id: 'right', position: { x: 575, y: 150 } },
];

const baseObstacles: ObstacleConfig[] = [
  { id: 'lower-left', position: { x: 115, y: 870 }, width: 190, height: 20, angle: .72 },
  { id: 'lower-right', position: { x: 605, y: 870 }, width: 190, height: 20, angle: -.72 },
];

const layouts: SocketConfig[][] = [
  SOCKETS,
  [[180,300],[540,300],[161,480],[559,480],[250,650],[470,650],[161,800],[559,800],[360,880]],
  [[240,285],[480,285],[290,445],[430,445],[260,640],[460,640],[300,810],[420,810]],
  [[161,330],[360,300],[559,330],[235,540],[485,540],[165,720],[360,680],[555,720],[270,860]],
  [[360,250],[205,360],[515,360],[165,560],[555,560],[200,750],[520,750],[290,865],[430,865],[360,600]],
  [[185,280],[505,350],[245,455],[535,580],[190,665],[470,760],[265,850],[550,880]],
  [[210,290],[360,340],[510,290],[165,525],[555,525],[250,690],[470,690],[200,850],[520,850]],
  [[175,285],[360,265],[545,285],[220,470],[500,470],[175,665],[360,640],[545,665],[260,840],[460,840]],
  [[161,300],[550,330],[285,475],[450,550],[170,700],[540,725],[290,855],[455,880]],
  [[190,290],[280,350],[440,350],[530,290],[205,550],[515,550],[185,760],[360,720],[535,760],[360,900]],
].map((points, i) => points.map((point, j) => Array.isArray(point)
  ? { id: `s${i + 1}-${j + 1}`, position: { x: point[0], y: point[1] } }
  : point as SocketConfig));

const waveFromKinds = (id: string, kinds: EnemyKind[], cadence = 540): WaveConfig => ({
  id,
  events: kinds.map((enemy, index) => ({ atMs: 450 + index * cadence + Math.floor(index / 3) * 240, enemy, gate: gates[(index * 2 + id.length) % 3].id })),
});

const patterns: EnemyKind[][] = [
  ['light','grunt','light','grunt'],
  ['grunt','grunt','heavy','light','grunt'],
  ['jet','light','grunt','jet','heavy','grunt'],
  ['splitter','grunt','light','grunt','heavy','jet','light'],
  ['heavy','grunt','jet','light','splitter','grunt','heavy','light'],
  ['jet','light','light','heavy','grunt','splitter','grunt','jet','heavy'],
  ['splitter','grunt','heavy','jet','light','light','grunt','heavy','splitter','jet'],
  ['heavy','jet','grunt','splitter','light','heavy','light','jet','grunt','splitter','heavy'],
  ['splitter','jet','heavy','light','grunt','heavy','jet','splitter','light','light','heavy','grunt','jet'],
  ['heavy','jet','splitter','light','grunt','heavy','jet','splitter','light','heavy','grunt','jet','splitter','heavy'],
];

const authoredWaves = (stage: number, total = 8) => Array.from({ length: total }, (_, wave) => {
  const source = patterns[Math.min(patterns.length - 1, wave + Math.floor((stage - 1) / 2))];
  const length = Math.min(source.length, 4 + wave + Math.floor(stage / 3));
  const rotated = source.map((_, i) => source[(i + stage + wave) % source.length]).slice(0, length);
  return waveFromKinds(`${stage}-${wave + 1}`, rotated, Math.max(330, 570 - stage * 14));
});

const definitions: Array<{
  name: string; subtitle: string; lesson: string; colors: [number, number, number]; rewards: [number,number,number,number];
  recommended: number; unlock?: BumperKind; obstacles: ObstacleConfig[]; builtIn?: BumperKind;
}> = [
  { name:'Ржавый желудок',subtitle:'Голодная классика',lesson:'Ритм флипперов и строительство',colors:[0xb94e43,0xe4b75d,0xff6253],rewards:[15,20,25,4],recommended:1,obstacles:baseObstacles,builtIn:'basic' },
  { name:'Двойной желоб',subtitle:'Выбери сторону',lesson:'Контроль горизонтального направления',colors:[0x318f9a,0xe0bf63,0xff675c],rewards:[18,24,30,5],recommended:1,unlock:'magnet',obstacles:[...baseObstacles,{id:'channel-l',position:{x:245,y:520},width:20,height:450,angle:-.08},{id:'channel-r',position:{x:475,y:520},width:20,height:450,angle:.08}] },
  { name:'Бронепресс',subtitle:'Сталь против стали',lesson:'Сильные удары против брони',colors:[0x6e7683,0xd28b4a,0xff4c47],rewards:[22,29,36,6],recommended:2,obstacles:[...baseObstacles,{id:'press-l',position:{x:235,y:500},width:260,height:22,angle:.62},{id:'press-r',position:{x:485,y:500},width:260,height:22,angle:-.62}] },
  { name:'Ракетная кишка',subtitle:'Смотри наверх',lesson:'Реакция на телеграф ускорения',colors:[0x9b4d37,0xf0a23f,0xffef72],rewards:[26,34,42,7],recommended:2,unlock:'spinner',obstacles:[...baseObstacles,{id:'rocket-l',position:{x:150,y:610},width:170,height:18,angle:.32},{id:'rocket-r',position:{x:570,y:610},width:170,height:18,angle:-.32}] },
  { name:'Маточный цех',subtitle:'Держи толпу',lesson:'Контроль большого количества тел',colors:[0x6e3b69,0x69b97d,0xff6c86],rewards:[30,40,50,8],recommended:3,obstacles:[...baseObstacles,{id:'island',position:{x:360,y:560},width:175,height:115}] },
  { name:'Ледяной слив',subtitle:'Длинные цепочки',lesson:'Планирование маршрутов',colors:[0x3375a0,0x9bdbe8,0xd8ffff],rewards:[35,46,57,9],recommended:3,unlock:'spring',obstacles:[...baseObstacles,{id:'zig-a',position:{x:250,y:420},width:260,height:18,angle:.4},{id:'zig-b',position:{x:470,y:610},width:260,height:18,angle:-.4}] },
  { name:'Токсичный отстойник',subtitle:'Броня плавится',lesson:'Коррозия и урон в обход брони',colors:[0x49662d,0x9dce4d,0xffd848],rewards:[40,53,66,10],recommended:3,obstacles:[...baseObstacles,{id:'funnel-l',position:{x:230,y:300},width:280,height:18,angle:.42},{id:'funnel-r',position:{x:490,y:300},width:280,height:18,angle:-.42}] },
  { name:'Динамо-утроба',subtitle:'Собери кластер',lesson:'Цепной урон по плотной группе',colors:[0x553d8c,0xa67cff,0x6cf8ff],rewards:[46,61,76,12],recommended:4,unlock:'grinder',obstacles:[...baseObstacles,{id:'zone-l',position:{x:245,y:530},width:18,height:480},{id:'zone-r',position:{x:475,y:530},width:18,height:480}],builtIn:'electric' },
  { name:'Собор металлолома',subtitle:'Точность или боль',lesson:'Тайминг кончика флиппера',colors:[0x784532,0xe3aa4e,0xff6154],rewards:[53,70,87,14],recommended:4,obstacles:[...baseObstacles,{id:'spire-l',position:{x:210,y:470},width:210,height:18,angle:1.05},{id:'spire-r',position:{x:510,y:600},width:210,height:18,angle:-1.05}],builtIn:'blast' },
  { name:'Пасть Начальника',subtitle:'Финальная смена',lesson:'Проверка всей машины',colors:[0x7b2330,0xf0b447,0xff3348],rewards:[60,80,100,16],recommended:5,obstacles:baseObstacles },
];

export const STAGES: StageConfig[] = definitions.map((definition, index) => {
  const order = index + 1;
  const waves = order === 1
    ? WAVES.map((wave, waveIndex) => waveFromKinds(`1-${waveIndex + 1}`, wave))
    : authoredWaves(order, order >= 9 ? 10 : 8);
  if (order === 10) waves[waves.length - 1] = {
    id: '10-boss', label: 'ГЛАВШАР', events: [
      { atMs: 700, enemy: 'light', gate: 'left' }, { atMs: 700, enemy: 'light', gate: 'right' },
      { atMs: 1900, enemy: 'boss', gate: 'center', hpMultiplier: 1 },
    ],
  };
  return {
    id: `stage-${String(order).padStart(2, '0')}` as StageId,
    order, name: definition.name, subtitle: definition.subtitle, lesson: definition.lesson,
    theme: { primary: definition.colors[0], secondary: definition.colors[1], danger: definition.colors[2] },
    art: order === 1 ? '/assets/table/rusty-stomach.png' : `/assets/table/stage-${String(order).padStart(2,'0')}.jpg`,
    mapArt: `/assets/map/stage-${String(order).padStart(2,'0')}.jpg`,
    mapAccent: `#${definition.colors[1].toString(16).padStart(6,'0')}`,
    sockets: layouts[index], obstacles: definition.obstacles,
    builtInBumpers: definition.builtIn ? [{ kind: definition.builtIn, socketId: [...layouts[index]].sort((a,b) => Math.hypot(a.position.x-360,a.position.y-640)-Math.hypot(b.position.x-360,b.position.y-640))[0].id, tier: 1 }] : [],
    spawnGates: gates, waves,
    rewards: { starCoins: definition.rewards.slice(0,3) as [number,number,number], defeatCoins: definition.rewards[3], unlockBumper: definition.unlock },
    recommendedAverageLevel: definition.recommended,
    enemyTuning: { hpMultiplier: 1 + Math.max(0, order - 1) * .035, armorBonus: Math.floor((order - 1) / 4) },
  };
});

export const STAGE_BY_ID = Object.fromEntries(STAGES.map(stage => [stage.id, stage])) as Record<StageId, StageConfig>;
export const getStage = (id: StageId) => STAGE_BY_ID[id] ?? STAGES[0];

export function validateStage(stage: StageConfig): string[] {
  const errors: string[] = [];
  if (!stage.waves.length) errors.push('stage requires waves');
  if (!stage.sockets.length) errors.push('stage requires sockets');
  if (!stage.spawnGates.length) errors.push('stage requires spawn gates');
  const gateIds = new Set(stage.spawnGates.map(gate => gate.id));
  for (const wave of stage.waves) for (const event of wave.events) if (!gateIds.has(event.gate)) errors.push(`unknown gate ${event.gate}`);
  if (new Set(stage.sockets.map(socket => socket.id)).size !== stage.sockets.length) errors.push('duplicate socket ids');
  return errors;
}
