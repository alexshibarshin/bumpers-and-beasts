import { describe, expect, it } from 'vitest';
import type { RunResult } from '../game/types';
import { STARTER_DECK } from '../game/config';
import { canUpgrade, createDefaultProfile, ProfileStore, PROFILE_KEY, repairProfile, upgradeCost } from './profile';

function memoryStorage(initial?: string) {
  const values = new Map<string,string>(); if (initial) values.set(PROFILE_KEY, initial);
  return { values, getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>{ values.set(key,value); } };
}

const victory = (id='run-1'): RunResult => ({ runId:id,stageId:'stage-01',outcome:'victory',stars:2,baseHp:12,maxBaseHp:20,score:1200,reachedWave:10,totalWaves:10,durationMs:1000,seed:1,deckSnapshot:STARTER_DECK.map(kind=>({kind,level:1})) });

describe('profile and economy', () => {
  it('creates a valid fresh profile', () => {
    const profile=createDefaultProfile('2026-01-01');
    expect(profile.coins).toBe(0); expect(profile.activeDeck).toEqual(STARTER_DECK);
    expect(profile.stages['stage-01'].unlocked).toBe(true); expect(profile.stages['stage-02'].unlocked).toBe(false);
  });

  it('keeps upgrade prices strictly increasing through level 20', () => {
    for (const kind of STARTER_DECK) for (let level=1;level<20;level++) expect(upgradeCost(kind,level+1)).toBeGreaterThan(upgradeCost(kind,level));
  });

  it('enforces money, max level and the five-level gap', () => {
    const profile=createDefaultProfile(); profile.coins=100000; profile.bumperLevels.basic=6;
    expect(canUpgrade(profile,'basic').ok).toBe(false);
    profile.bumperLevels.basic=5; expect(canUpgrade(profile,'basic').ok).toBe(true);
    profile.bumperLevels.basic=20; expect(canUpgrade(profile,'basic').ok).toBe(false);
  });

  it('repairs negative balances, duplicate deck entries and invalid levels', () => {
    const repaired=repairProfile({ coins:-50,unlockedBumpers:['basic','basic','bogus'],activeDeck:['basic','basic'],bumperLevels:{basic:999} });
    expect(repaired.coins).toBe(0); expect(repaired.activeDeck).toHaveLength(8); expect(new Set(repaired.activeDeck).size).toBe(8); expect(repaired.bumperLevels.basic).toBe(20);
  });

  it('applies a run once and unlocks the next stage', () => {
    const storage=memoryStorage(); const store=new ProfileStore(storage); const first=store.applyRunResult(victory()); const second=store.applyRunResult(victory());
    expect(first.coinsEarned).toBe(35); expect(first.nextStageUnlocked).toBe('stage-02'); expect(store.get().coins).toBe(35);
    expect(second.duplicate).toBe(true); expect(second.coinsEarned).toBe(0); expect(store.get().coins).toBe(35);
  });

  it('backs up malformed JSON and starts safely', () => {
    const storage=memoryStorage('{definitely broken'); const store=new ProfileStore(storage);
    expect(store.get().activeDeck).toHaveLength(8); expect([...storage.values.keys()].some(key=>key.startsWith('bumpers-and-beasts.profile.corrupt.'))).toBe(true);
  });

  it('does not let abandoned debug runs change records or balance', () => {
    const storage=memoryStorage(); const store=new ProfileStore(storage); const run={...victory('debug-run'),outcome:'abandoned' as const,score:999999};
    const reward=store.applyRunResult(run); expect(reward.isNewRecord).toBe(false); expect(store.get().coins).toBe(0); expect(store.get().stages['stage-01'].bestScore).toBe(0);
  });

  it('debounces an accidental upgrade double click', () => {
    const profile=createDefaultProfile(); profile.coins=1000; const storage=memoryStorage(JSON.stringify(profile)); const store=new ProfileStore(storage);
    expect(store.upgrade('basic')).toBe(true); expect(store.upgrade('basic')).toBe(false);
    expect(store.get().bumperLevels.basic).toBe(2); expect(store.get().coins).toBe(975);
  });

  it('keeps the best stars while paying honest replay rewards', () => {
    const storage=memoryStorage(); const store=new ProfileStore(storage);
    store.applyRunResult({...victory('three-star'),stars:3,baseHp:18});
    const replay=store.applyRunResult({...victory('one-star'),stars:1,baseHp:4,score:100});
    expect(replay.coinsEarned).toBe(15); expect(store.get().stages['stage-01'].bestStars).toBe(3); expect(store.get().coins).toBe(75);
  });

  it('unlocks a new part at the current collection minimum level', () => {
    const profile=createDefaultProfile(); for(const kind of profile.unlockedBumpers) profile.bumperLevels[kind]=3;
    const storage=memoryStorage(JSON.stringify(profile)); const store=new ProfileStore(storage);
    const result={...victory('stage-two'),stageId:'stage-02' as const}; const reward=store.applyRunResult(result);
    expect(reward.bumperUnlocked).toBe('magnet'); expect(store.get().bumperLevels.magnet).toBe(3); expect(store.get().activeDeck).not.toContain('magnet');
  });
});
