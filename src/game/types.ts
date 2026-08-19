export type EnemyKind = 'grunt' | 'heavy' | 'light' | 'jet' | 'splitter' | 'boss';
export type BumperKind = 'basic' | 'fire' | 'blast' | 'ice' | 'spike' | 'electric' | 'pit' | 'poison' | 'magnet' | 'spinner' | 'spring' | 'grinder';
export type StageId = `stage-${string}`;
export type Stars = 0 | 1 | 2 | 3;
export type InputLayout = 'together' | 'split';
export type FlipperMotion = 'auto' | 'hold';
export type GamePhase = 'ready' | 'countdown' | 'combat' | 'build' | 'victory' | 'defeat';

export interface Point { x: number; y: number }

export interface EnemyConfig {
  kind: EnemyKind;
  label: string;
  radius: number;
  mass: number;
  restitution: number;
  frictionAir: number;
  hp: number;
  armor: number;
  baseDamage: number;
  reward: number;
  color: number;
}

export interface BumperConfig {
  kind: BumperKind;
  label: string;
  role: string;
  color: number;
  damage: number;
  bounce: number;
  cooldownMs: number;
  radius: number;
  baseUpgradeCost: number;
  effectLabel: string;
}

export interface SpawnEventConfig { atMs: number; enemy: EnemyKind; gate: string; count?: number; intervalMs?: number; velocity?: Point; hpMultiplier?: number }
export interface WaveConfig { id: string; label?: string; events: SpawnEventConfig[]; clearDelayMs?: number }
export interface SocketConfig { id: string; position: Point; locked?: boolean }
export interface ObstacleConfig { id: string; position: Point; width: number; height: number; angle?: number }
export interface SpawnGateConfig { id: string; position: Point }
export interface BuiltInBumperConfig { kind: BumperKind; socketId: string; tier: 1 | 2 | 3 }

export interface StageConfig {
  id: StageId; order: number; name: string; subtitle: string; theme: { primary: number; secondary: number; danger: number };
  art: string; mapArt: string; mapAccent: string; lesson: string; sockets: SocketConfig[]; obstacles: ObstacleConfig[];
  builtInBumpers: BuiltInBumperConfig[]; spawnGates: SpawnGateConfig[]; waves: WaveConfig[];
  rewards: { starCoins: [number, number, number]; defeatCoins: number; unlockBumper?: BumperKind };
  recommendedAverageLevel: number; enemyTuning?: { hpMultiplier?: number; armorBonus?: number; spawnIntervalMultiplier?: number };
}

export interface RunLoadout { stageId: StageId; seed: number; deck: Array<{ kind: BumperKind; level: number }>; inputLayout: InputLayout; flipperMotion: FlipperMotion; debug?: boolean }
export interface RunResult {
  runId: string; stageId: StageId; outcome: 'victory' | 'defeat' | 'abandoned'; stars: Stars; baseHp: number; maxBaseHp: number;
  score: number; reachedWave: number; totalWaves: number; durationMs: number; seed: number; deckSnapshot: Array<{ kind: BumperKind; level: number }>;
}

export interface PlacedBumper {
  id: string;
  kind: BumperKind;
  socketId: string;
  tier: 1 | 2 | 3;
  locked?: boolean;
}

export interface DraftCard {
  id: string;
  kind: BumperKind | 'repair';
}

export interface Snapshot {
  phase: GamePhase;
  wave: number;
  totalWaves: number;
  baseHp: number;
  maxBaseHp: number;
  scrap: number;
  score: number;
  combo: number;
  enemiesAlive: number;
  inputLayout: InputLayout;
  flipperMotion: FlipperMotion;
  draft: DraftCard[];
  rerollCost: number;
  takeAllCost: number;
  placed: PlacedBumper[];
  selectedBumperId?: string;
  countdown?: number;
  resultStars?: number;
  pendingRewards: Array<BumperKind | 'repair'>;
  buildHint?: string;
  bossHp?: number;
  bossMaxHp?: number;
  bossRage?: boolean;
}
