import { useEffect, useRef, useState } from 'react';
import { BUMPERS, ENEMIES, GAME } from '../game/config';
import type { GameEngine } from '../game/GameEngine';
import type { BumperKind, EnemyKind, Snapshot } from '../game/types';

const initial: Snapshot = {
  phase: 'ready', wave: 0, totalWaves: GAME.totalWaves, baseHp: GAME.maxBaseHp, maxBaseHp: GAME.maxBaseHp,
  scrap: 0, score: 0, combo: 0, enemiesAlive: 0, inputLayout: 'together', flipperMotion: 'auto',
  draft: [], rerollCost: GAME.firstRerollCost, takeAllCost: GAME.takeAllCost, placed: [], pendingRewards: [],
};

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<GameEngine | undefined>(undefined);
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [snapshot, setSnapshot] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (screen !== 'game' || !host.current) return;
    let instance: GameEngine | undefined;
    let cancelled = false;
    setLoading(true);
    void import('../game/GameEngine').then(async module => {
      if (cancelled || !host.current) return;
      instance = new module.GameEngine(setSnapshot);
      engine.current = instance;
      await instance.mount(host.current);
      if (cancelled) return;
      instance.startStage();
      setLoading(false);
    });
    return () => { cancelled = true; instance?.destroy(); engine.current = undefined; };
  }, [screen]);

  if (screen === 'menu') return <StartScreen onStart={() => setScreen('game')} />;

  return (
    <main className="game-shell">
      <div className="machine-bezel">
        <div className="game-host" ref={host} />
        {loading && <div className="game-loading"><i/><b>РАЗОГРЕВАЕМ МАШИНУ</b></div>}
        <Hud snapshot={snapshot} />
        <ControlLab snapshot={snapshot} engine={engine.current} />
        {snapshot.phase === 'build' && <BuildOverlay snapshot={snapshot} engine={engine.current} />}
        {snapshot.phase === 'countdown' && (
          <button className="countdown" onClick={() => engine.current?.cancelCountdown()}>
            <strong>{snapshot.countdown}</strong><span>тап — отменить</span>
          </button>
        )}
        {(snapshot.phase === 'victory' || snapshot.phase === 'defeat') && (
          <Result snapshot={snapshot} onRetry={() => engine.current?.startStage()} onExit={() => setScreen('menu')} />
        )}
      </div>
    </main>
  );
}

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="start-screen">
      <div className="start-grit" />
      <img className="menu-beast beast-a" src="/assets/enemies/grunt.png" alt="" />
      <img className="menu-beast beast-b" src="/assets/enemies/light.png" alt="" />
      <section className="logo-lockup">
        <div className="eyebrow">СВАЛОЧНАЯ ОБОРОНА № 01</div>
        <h1>БАМПЕРЫ<br/><i>&</i> БЕСТИИ</h1>
        <p>Построй машину. Заряди флипперы. Не дай орущим шарам сожрать базу.</p>
      </section>
      <button className="stage-card" onClick={onStart}>
        <span className="stage-number">01</span>
        <span className="stage-copy"><b>РЖАВЫЙ ЖЕЛУДОК</b><small>10 волн · 5 видов врагов</small></span>
        <span className="play-arrow">▶</span>
      </button>
      <div className="start-footer">ПРОТОТИП · TAP TO FLIP · PORTRAIT MAYHEM</div>
    </main>
  );
}

function Hud({ snapshot }: { snapshot: Snapshot }) {
  const hp = snapshot.baseHp / snapshot.maxBaseHp * 100;
  return (
    <header className="hud">
      <div className="hud-block health"><span>БАЗА</span><div className="hp-track"><i style={{ width: `${hp}%` }} /></div><b>{snapshot.baseHp}/{snapshot.maxBaseHp}</b></div>
      <div className="wave-badge"><small>ВОЛНА</small><b>{Math.max(1, snapshot.wave)}/{snapshot.totalWaves}</b></div>
      <div className="hud-stats"><span>ЛОМ {snapshot.scrap}</span><span>Ц {snapshot.enemiesAlive}</span><span>×{Math.max(1, snapshot.combo)}</span><span>{snapshot.score}</span></div>
    </header>
  );
}

function ControlLab({ snapshot, engine }: { snapshot: Snapshot; engine?: GameEngine }) {
  return (
    <aside className="control-lab">
      <button className={snapshot.inputLayout === 'together' ? 'active' : ''} onClick={() => engine?.setInputLayout('together')}>ОБА</button>
      <button className={snapshot.inputLayout === 'split' ? 'active' : ''} onClick={() => engine?.setInputLayout('split')}>Л/П</button>
      <button className={snapshot.flipperMotion === 'auto' ? 'active' : ''} onClick={() => engine?.setFlipperMotion('auto')}>ВЗМАХ</button>
      <button className={snapshot.flipperMotion === 'hold' ? 'active' : ''} onClick={() => engine?.setFlipperMotion('hold')}>ДЕРЖАТЬ</button>
      {snapshot.phase === 'combat' && <button className="spawn" onClick={() => engine?.debugSpawn((['grunt','heavy','light','jet','splitter'] as EnemyKind[])[Math.floor(Math.random() * 5)])}>+ ВРАГ</button>}
      {snapshot.phase === 'combat' && <button className="spawn" onClick={() => engine?.debugClearWave()}>✓ ВОЛНА</button>}
      {snapshot.phase === 'combat' && <button className="spawn danger" onClick={() => engine?.debugBreakBase()}>ТЕСТ БАЗЫ</button>}
    </aside>
  );
}

function BuildOverlay({ snapshot, engine }: { snapshot: Snapshot; engine?: GameEngine }) {
  const canStart = !snapshot.draft.length && !snapshot.pendingRewards.length;
  return (
    <section className="build-panel">
      <div className="build-title"><span>{snapshot.wave === 0 ? 'ПЕРВЫЙ МОДУЛЬ' : `ВОЛНА ${snapshot.wave} ПЕРЕЖЁВАНА`}</span><b>{snapshot.buildHint ?? (snapshot.draft.length ? 'Выбери одну деталь' : 'Машина готова')}</b></div>
      {!!snapshot.draft.length && (
        <div className="draft-row">
          {snapshot.draft.map(card => {
            const isRepair = card.kind === 'repair';
            const info = isRepair ? { label: 'Ремонт', color: 0x66d38e, damage: 0, bounce: 0 } : BUMPERS[card.kind as BumperKind];
            return (
              <button className="draft-card" key={card.id} style={{ '--accent': `#${info.color.toString(16).padStart(6,'0')}` } as React.CSSProperties} onClick={() => engine?.chooseDraft(card.id)}>
                <span className={`card-art ${card.kind}`}>{isRepair ? <i /> : <img src={`/assets/bumpers/${card.kind}.png`} alt="" />}</span>
                <b>{info.label}</b>
                <small>{isRepair ? '+6 HP базы' : `урон ${info.damage} · отскок ${Math.round(info.bounce * 100)}`}</small>
              </button>
            );
          })}
        </div>
      )}
      <div className="build-actions">
        {!!snapshot.pendingRewards.length && <button onClick={() => engine?.scrapPending()}>РАЗОБРАТЬ +3</button>}
        {!!snapshot.draft.length && <button disabled={snapshot.scrap < snapshot.rerollCost} onClick={() => engine?.reroll()}>↻ РЕРОЛЛ {snapshot.rerollCost}</button>}
        {!!snapshot.draft.length && <button disabled={snapshot.scrap < snapshot.takeAllCost} onClick={() => engine?.takeAll()}>ВЗЯТЬ ВСЁ {snapshot.takeAllCost}</button>}
        {canStart && <button className="launch" onClick={() => engine?.startNextWave()}>{snapshot.wave === 0 ? 'ЗАПУСТИТЬ' : 'СЛЕДУЮЩАЯ ВОЛНА'} ▶</button>}
      </div>
    </section>
  );
}

function Result({ snapshot, onRetry, onExit }: { snapshot: Snapshot; onRetry: () => void; onExit: () => void }) {
  const victory = snapshot.phase === 'victory';
  return (
    <section className={`result ${victory ? 'win' : 'lose'}`}>
      <small>{victory ? 'МАШИНА СЫТА' : 'БАЗУ СОЖРАЛИ'}</small>
      <h2>{victory ? 'СТЕЙДЖ ПРОЙДЕН' : 'ПЕРЕМОЛОТО НЕ ТО'}</h2>
      <div className="stars">{[1,2,3].map(n => <i key={n} className={n <= (snapshot.resultStars ?? 0) ? 'earned' : ''}>★</i>)}</div>
      <p>Счёт <b>{snapshot.score}</b> · HP базы <b>{snapshot.baseHp}/{snapshot.maxBaseHp}</b></p>
      <div><button onClick={onRetry}>ЕЩЁ РАЗ</button><button onClick={onExit}>В МЕНЮ</button></div>
    </section>
  );
}
