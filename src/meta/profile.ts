import { BUMPERS, STARTER_DECK } from '../game/config';
import { STAGES, getStage } from '../content/stages';
import type { BumperConfig, BumperKind, InputLayout, FlipperMotion, RunResult, StageId, Stars } from '../game/types';

export const PROFILE_KEY = 'bumpers-and-beasts.profile.v1';
export const MAX_BUMPER_LEVEL = 20;

export interface StageProgress { unlocked: boolean; bestStars: Stars; bestBaseHp: number; bestScore: number; completions: number; attempts: number }
export interface SaveDataV1 {
  schemaVersion: 1; revision: number; createdAt: string; updatedAt: string; coins: number;
  unlockedBumpers: BumperKind[]; bumperLevels: Partial<Record<BumperKind, number>>; activeDeck: BumperKind[];
  stages: Record<StageId, StageProgress>; appliedRunIds: string[];
  settings: { inputLayout: InputLayout; flipperMotion: FlipperMotion; haptics: boolean };
  onboarding: { campaignSeen: boolean; workshopSeen: boolean; firstUpgradeBought: boolean };
  lifetimeStats: { runsStarted: number; victories: number; defeats: number; coinsEarned: number; coinsSpent: number; totalPlayTimeMs: number };
}

export interface AppliedRunReward {
  runId: string; coinsEarned: number; newBalance: number; previousBestStars: Stars; newBestStars: Stars;
  isNewRecord: boolean; nextStageUnlocked?: StageId; bumperUnlocked?: BumperKind; duplicate?: boolean;
}

const emptyProgress = (unlocked = false): StageProgress => ({ unlocked, bestStars: 0, bestBaseHp: 0, bestScore: 0, completions: 0, attempts: 0 });

export function createDefaultProfile(now = new Date().toISOString()): SaveDataV1 {
  return {
    schemaVersion: 1, revision: 0, createdAt: now, updatedAt: now, coins: 0,
    unlockedBumpers: [...STARTER_DECK], bumperLevels: Object.fromEntries(STARTER_DECK.map(kind => [kind, 1])), activeDeck: [...STARTER_DECK],
    stages: Object.fromEntries(STAGES.map(stage => [stage.id, emptyProgress(stage.order === 1)])) as Record<StageId, StageProgress>,
    appliedRunIds: [], settings: { inputLayout: 'together', flipperMotion: 'auto', haptics: true },
    onboarding: { campaignSeen: false, workshopSeen: false, firstUpgradeBought: false },
    lifetimeStats: { runsStarted: 0, victories: 0, defeats: 0, coinsEarned: 0, coinsSpent: 0, totalPlayTimeMs: 0 },
  };
}

const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const validKind = (value: unknown): value is BumperKind => typeof value === 'string' && value in BUMPERS;

export function repairProfile(raw: unknown): SaveDataV1 {
  const defaults = createDefaultProfile();
  if (!raw || typeof raw !== 'object') return defaults;
  const data = raw as Partial<SaveDataV1>;
  const unlocked = Array.isArray(data.unlockedBumpers)
    ? [...new Set(data.unlockedBumpers.filter(validKind))]
    : [...STARTER_DECK];
  for (const kind of STARTER_DECK) if (!unlocked.includes(kind)) unlocked.push(kind);
  const levels: Partial<Record<BumperKind, number>> = {};
  for (const kind of unlocked) levels[kind] = Math.max(1, Math.min(MAX_BUMPER_LEVEL, Math.floor(finite(data.bumperLevels?.[kind], 1))));
  const deck = Array.isArray(data.activeDeck) ? [...new Set(data.activeDeck.filter((kind): kind is BumperKind => validKind(kind) && unlocked.includes(kind)))] : [];
  for (const kind of unlocked) if (deck.length < 8 && !deck.includes(kind)) deck.push(kind);
  for (const kind of STARTER_DECK) if (deck.length < 8 && !deck.includes(kind)) deck.push(kind);
  const stages = Object.fromEntries(STAGES.map(stage => {
    const value = data.stages?.[stage.id];
    const bestStars = Math.max(0, Math.min(3, Math.floor(finite(value?.bestStars, 0)))) as Stars;
    return [stage.id, {
      unlocked: stage.order === 1 || Boolean(value?.unlocked), bestStars,
      bestBaseHp: Math.max(0, finite(value?.bestBaseHp, 0)), bestScore: Math.max(0, finite(value?.bestScore, 0)),
      completions: Math.max(0, Math.floor(finite(value?.completions, 0))), attempts: Math.max(0, Math.floor(finite(value?.attempts, 0))),
    }];
  })) as Record<StageId, StageProgress>;
  return {
    ...defaults, schemaVersion: 1, revision: Math.max(0, Math.floor(finite(data.revision, 0))),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : defaults.createdAt,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : defaults.updatedAt,
    coins: Math.max(0, Math.floor(finite(data.coins, 0))), unlockedBumpers: unlocked,
    bumperLevels: levels, activeDeck: deck.slice(0, 8), stages,
    appliedRunIds: Array.isArray(data.appliedRunIds) ? data.appliedRunIds.filter((id): id is string => typeof id === 'string').slice(-100) : [],
    settings: {
      inputLayout: data.settings?.inputLayout === 'split' ? 'split' : 'together',
      flipperMotion: data.settings?.flipperMotion === 'hold' ? 'hold' : 'auto', haptics: data.settings?.haptics !== false,
    },
    onboarding: { ...defaults.onboarding, ...(data.onboarding ?? {}) },
    lifetimeStats: {
      runsStarted: Math.max(0, finite(data.lifetimeStats?.runsStarted, 0)), victories: Math.max(0, finite(data.lifetimeStats?.victories, 0)),
      defeats: Math.max(0, finite(data.lifetimeStats?.defeats, 0)), coinsEarned: Math.max(0, finite(data.lifetimeStats?.coinsEarned, 0)),
      coinsSpent: Math.max(0, finite(data.lifetimeStats?.coinsSpent, 0)), totalPlayTimeMs: Math.max(0, finite(data.lifetimeStats?.totalPlayTimeMs, 0)),
    },
  };
}

export function upgradeCost(kind: BumperKind, currentLevel: number) {
  return Math.round(BUMPERS[kind].baseUpgradeCost * 1.38 ** (currentLevel - 1) / 5) * 5;
}

export function minimumUnlockedLevel(profile: SaveDataV1) {
  return Math.min(...profile.unlockedBumpers.map(kind => profile.bumperLevels[kind] ?? 1));
}

export function canUpgrade(profile: SaveDataV1, kind: BumperKind) {
  const level = profile.bumperLevels[kind] ?? 1;
  const cost = upgradeCost(kind, level);
  if (!profile.unlockedBumpers.includes(kind)) return { ok: false, cost, reason: 'Деталь ещё закрыта' };
  if (level >= MAX_BUMPER_LEVEL) return { ok: false, cost, reason: 'Достигнут максимальный уровень' };
  if (level + 1 > minimumUnlockedLevel(profile) + 5) return { ok: false, cost, reason: `Сначала подтяни отстающие детали до Ур. ${level - 4}` };
  if (profile.coins < cost) return { ok: false, cost, reason: `Не хватает ${cost - profile.coins} монет` };
  return { ok: true, cost } as const;
}

export function applyLevelToBumperStats(config: BumperConfig, level: number): BumperConfig {
  const n = Math.max(0, level - 1);
  return { ...config, damage: config.damage * (1 + n * .1), bounce: config.bounce * Math.min(1.2, 1 + n * .0125), cooldownMs: config.cooldownMs * Math.max(.75, 1 - n * .015) };
}

export function calculateRunReward(result: RunResult) {
  const stage = getStage(result.stageId);
  if (result.outcome === 'abandoned') return 0;
  if (result.outcome === 'defeat') return stage.rewards.defeatCoins;
  return stage.rewards.starCoins.slice(0, result.stars).reduce((sum, value) => sum + value, 0);
}

export class ProfileStore {
  private value: SaveDataV1;
  private listeners = new Set<(profile: SaveDataV1) => void>();
  private upgradeLockUntil = 0;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
    const raw = storage.getItem(PROFILE_KEY);
    let parsed: unknown;
    try { parsed = raw ? JSON.parse(raw) : undefined; }
    catch {
      parsed = undefined;
      if (raw) storage.setItem(`bumpers-and-beasts.profile.corrupt.${Date.now()}`, raw);
    }
    this.value = repairProfile(parsed);
    this.persist(false);
  }

  get() { return structuredClone(this.value); }
  subscribe(listener: (profile: SaveDataV1) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  syncExternal(raw: string | null) {
    if (!raw) return;
    try {
      const incoming = repairProfile(JSON.parse(raw));
      if (incoming.revision <= this.value.revision) return;
      this.value = incoming;
      const snapshot = this.get(); for (const listener of this.listeners) listener(snapshot);
    } catch { /* the originating tab owns corrupt-save recovery */ }
  }
  private persist(increment = true) {
    if (increment) this.value.revision += 1;
    this.value.updatedAt = new Date().toISOString();
    this.storage.setItem(PROFILE_KEY, JSON.stringify(this.value));
    const snapshot = this.get();
    for (const listener of this.listeners) listener(snapshot);
  }
  markOnboarding(key: keyof SaveDataV1['onboarding']) { this.value.onboarding[key] = true; this.persist(); }
  saveSettings(settings: Partial<SaveDataV1['settings']>) { this.value.settings = { ...this.value.settings, ...settings }; this.persist(); }
  startRun(stageId: StageId) { this.value.stages[stageId].attempts += 1; this.value.lifetimeStats.runsStarted += 1; this.persist(); }
  upgrade(kind: BumperKind) {
    if (performance.now() < this.upgradeLockUntil) return false;
    const check = canUpgrade(this.value, kind); if (!check.ok) return false;
    this.upgradeLockUntil = performance.now() + 300;
    this.value.coins -= check.cost; this.value.bumperLevels[kind] = (this.value.bumperLevels[kind] ?? 1) + 1;
    this.value.lifetimeStats.coinsSpent += check.cost; this.value.onboarding.firstUpgradeBought = true; this.persist(); return true;
  }
  swapDeck(incoming: BumperKind, outgoing: BumperKind) {
    if (!this.value.unlockedBumpers.includes(incoming) || this.value.activeDeck.includes(incoming)) return false;
    const index = this.value.activeDeck.indexOf(outgoing); if (index < 0) return false;
    this.value.activeDeck[index] = incoming; this.persist(); return true;
  }
  applyRunResult(result: RunResult): AppliedRunReward {
    const progress = this.value.stages[result.stageId];
    if (this.value.appliedRunIds.includes(result.runId)) return { runId: result.runId, coinsEarned: 0, newBalance: this.value.coins, previousBestStars: progress.bestStars, newBestStars: progress.bestStars, isNewRecord: false, duplicate: true };
    if (result.outcome === 'abandoned') {
      this.value.appliedRunIds = [...this.value.appliedRunIds, result.runId].slice(-100);
      this.persist();
      return { runId: result.runId, coinsEarned: 0, newBalance: this.value.coins, previousBestStars: progress.bestStars, newBestStars: progress.bestStars, isNewRecord: false };
    }
    const previousBestStars = progress.bestStars;
    const reward = calculateRunReward(result);
    const isNewRecord = result.stars > progress.bestStars || result.baseHp > progress.bestBaseHp || result.score > progress.bestScore;
    progress.bestStars = Math.max(progress.bestStars, result.stars) as Stars;
    progress.bestBaseHp = Math.max(progress.bestBaseHp, result.baseHp); progress.bestScore = Math.max(progress.bestScore, result.score);
    if (result.outcome === 'victory') { progress.completions += 1; this.value.lifetimeStats.victories += 1; }
    if (result.outcome === 'defeat') this.value.lifetimeStats.defeats += 1;
    this.value.lifetimeStats.totalPlayTimeMs += result.durationMs; this.value.coins += reward;
    this.value.lifetimeStats.coinsEarned += reward; this.value.appliedRunIds = [...this.value.appliedRunIds, result.runId].slice(-100);
    let nextStageUnlocked: StageId | undefined; let bumperUnlocked: BumperKind | undefined;
    if (result.outcome === 'victory') {
      const stage = getStage(result.stageId); const next = STAGES[stage.order];
      if (next && !this.value.stages[next.id].unlocked) { this.value.stages[next.id].unlocked = true; nextStageUnlocked = next.id; }
      const unlock = stage.rewards.unlockBumper;
      if (unlock && !this.value.unlockedBumpers.includes(unlock)) {
        const inheritedLevel = minimumUnlockedLevel(this.value);
        this.value.unlockedBumpers.push(unlock); this.value.bumperLevels[unlock] = inheritedLevel; bumperUnlocked = unlock;
      }
    }
    this.persist();
    return { runId: result.runId, coinsEarned: reward, newBalance: this.value.coins, previousBestStars, newBestStars: progress.bestStars, isNewRecord, nextStageUnlocked, bumperUnlocked };
  }
}
