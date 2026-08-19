export type EnemyKind = 'grunt' | 'heavy' | 'light' | 'jet' | 'splitter';
export type BumperKind = 'basic' | 'fire' | 'blast' | 'ice' | 'spike' | 'electric' | 'pit' | 'poison';
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
  color: number;
  damage: number;
  bounce: number;
  cooldownMs: number;
  radius: number;
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
}
