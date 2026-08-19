import { useEffect, useMemo, useRef, useState } from 'react';
import { STAGES, getStage } from '../content/stages';
import { ALL_BUMPERS, BUMPERS, ENEMIES, GAME } from '../game/config';
import type { GameEngine } from '../game/GameEngine';
import type { BumperKind, EnemyKind, RunLoadout, RunResult, Snapshot, StageId } from '../game/types';
import { applyLevelToBumperStats, canUpgrade, ProfileStore, type AppliedRunReward, type SaveDataV1, upgradeCost } from '../meta/profile';

type Screen = { name: 'campaign' } | { name: 'details'; stageId: StageId } | { name: 'workshop'; returnStage?: StageId } | { name: 'game'; loadout: RunLoadout } | { name: 'result'; result: RunResult; reward: AppliedRunReward };

const initial: Snapshot = {
  phase:'ready',wave:0,totalWaves:10,baseHp:GAME.maxBaseHp,maxBaseHp:GAME.maxBaseHp,scrap:0,score:0,combo:0,enemiesAlive:0,
  inputLayout:'together',flipperMotion:'auto',draft:[],rerollCost:GAME.firstRerollCost,takeAllCost:GAME.takeAllCost,placed:[],pendingRewards:[],
};

function useCountUp(target: number, duration = 850) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const started = performance.now(); let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

export function App() {
  const store = useMemo(() => new ProfileStore(), []);
  const [profile, setProfile] = useState(() => store.get());
  const [screen, setScreen] = useState<Screen>(() => {
    const requested = import.meta.env.DEV ? new URLSearchParams(location.search).get('playStage') as StageId | null : null;
    if (requested && STAGES.some(stage => stage.id === requested)) return { name:'game', loadout:{
      stageId:requested, seed:0xb055, deck:profile.activeDeck.map(kind=>({kind,level:profile.bumperLevels[kind]??1})),
      inputLayout:profile.settings.inputLayout, flipperMotion:profile.settings.flipperMotion, debug:true,
    } };
    return { name:'campaign' };
  });

  useEffect(() => store.subscribe(setProfile), [store]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === 'bumpers-and-beasts.profile.v1') store.syncExternal(event.newValue); };
    addEventListener('storage', sync); return () => removeEventListener('storage', sync);
  }, [store]);

  const openWorkshop = (returnStage?: StageId) => { setScreen({ name:'workshop', returnStage }); if (!profile.onboarding.workshopSeen) store.markOnboarding('workshopSeen'); };
  const startStage = (stageId: StageId) => {
    const latest = store.get();
    if (!latest.stages[stageId]?.unlocked || latest.activeDeck.length !== 8) return;
    const loadout: RunLoadout = {
      stageId, seed: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
      deck: latest.activeDeck.map(kind => ({ kind, level: latest.bumperLevels[kind] ?? 1 })),
      inputLayout: latest.settings.inputLayout, flipperMotion: latest.settings.flipperMotion,
    };
    store.startRun(stageId); setScreen({ name:'game', loadout });
  };

  if (screen.name === 'campaign') return <CampaignScreen profile={profile} onStage={stageId => setScreen({ name:'details', stageId })} onWorkshop={() => openWorkshop()} store={store} />;
  if (screen.name === 'details') return <StageDetailsScreen profile={profile} stageId={screen.stageId} onBack={() => setScreen({ name:'campaign' })} onWorkshop={() => openWorkshop(screen.stageId)} onPlay={() => startStage(screen.stageId)} />;
  if (screen.name === 'workshop') return <WorkshopScreen profile={profile} store={store} onBack={() => setScreen(screen.returnStage ? { name:'details', stageId:screen.returnStage } : { name:'campaign' })} />;
  if (screen.name === 'result') return <ResultScreen result={screen.result} reward={screen.reward} profile={profile} onMap={() => setScreen({ name:'campaign' })} onWorkshop={() => openWorkshop(screen.result.stageId)} onRetry={() => startStage(screen.result.stageId)} onNext={() => {
    const stage = getStage(screen.result.stageId); const next = STAGES[stage.order]; setScreen(next ? { name:'details', stageId:next.id } : { name:'campaign' });
  }} />;
  return <GameScreen loadout={screen.loadout} store={store} onResult={result => setScreen({ name:'result', result, reward:store.applyRunResult(result) })} />;
}

function TopBar({ profile, onWorkshop, title }: { profile: SaveDataV1; onWorkshop: () => void; title?: string }) {
  const stars = Object.values(profile.stages).reduce((sum, stage) => sum + stage.bestStars, 0);
  return <header className="meta-topbar"><div className="brand-mark"><span>B&B</span><b>{title ?? 'ГАРАЖНАЯ КАМПАНИЯ'}</b></div><div className="meta-resources"><span className="star-total">★ {stars}/30</span><span className="coin-total"><i />{profile.coins}</span><button onClick={onWorkshop}>МАСТЕРСКАЯ</button></div></header>;
}

function CampaignScreen({ profile, onStage, onWorkshop, store }: { profile: SaveDataV1; onStage:(id:StageId)=>void; onWorkshop:()=>void; store:ProfileStore }) {
  const [onboarding, setOnboarding] = useState(!profile.onboarding.campaignSeen);
  const closeOnboarding = () => { setOnboarding(false); store.markOnboarding('campaignSeen'); };
  return <main className="meta-screen campaign-screen">
    <TopBar profile={profile} onWorkshop={onWorkshop} />
    <div className="campaign-atmosphere" />
    <section className="campaign-intro"><small>ДОРОГА ЧЕРЕЗ МЯСО И МЕТАЛЛ</small><h1>Собери машину.<br/>Пережуй всю свалку.</h1><p>Каждая победа открывает следующую арену. Возвращайся за лучшими звёздами и монетами.</p></section>
    <div className="campaign-route">
      <div className="route-line" />
      {STAGES.map((stage, index) => {
        const progress = profile.stages[stage.id]; const locked = !progress.unlocked;
        const hue=[0,0,35,-25,70,0,45,95,-10,0][index];
        return <button key={stage.id} className={`campaign-node ${locked?'locked':''} ${stage.order===10?'boss-node':''} ${index%2?'right':'left'}`} style={{'--node-accent':stage.mapAccent,'--node-hue':`${hue}deg`} as React.CSSProperties} onClick={() => onStage(stage.id)} aria-label={`${stage.order}. ${stage.name}`}>
          <span className="node-orb"><img src={stage.mapArt} alt=""/><b>{String(stage.order).padStart(2,'0')}</b><i className="node-lock" /></span>
          <span className="node-copy"><small>{locked?'ЗАКРЫТО':progress.bestStars?'ПРОЙДЕНО':'ДОСТУПНО'}</small><strong>{stage.name}</strong><span className="mini-stars">{[1,2,3].map(value => <i className={value<=progress.bestStars?'earned':''} key={value}>★</i>)}</span>{stage.rewards.unlockBumper && <em>НОВАЯ ДЕТАЛЬ</em>}</span>
        </button>;
      })}
    </div>
    {onboarding && <div className="onboarding-scrim" onClick={closeOnboarding}><section className="onboarding-card"><small>ПЕРВАЯ СМЕНА</small><h2>Это твоя дорога через свалку</h2><p>Выбирай доступный узел, собирай машину из восьми деталей и защищай базу. Звёзды зависят от оставшегося HP.</p><div className="onboarding-steps"><span><b>01</b>Выбери стейдж</span><span><b>02</b>Строй между волнами</span><span><b>03</b>Усиливай детали</span></div><button onClick={closeOnboarding}>Я ГОТОВ</button></section></div>}
  </main>;
}

function StageDetailsScreen({ profile, stageId, onBack, onWorkshop, onPlay }: { profile:SaveDataV1;stageId:StageId;onBack:()=>void;onWorkshop:()=>void;onPlay:()=>void }) {
  const stage = getStage(stageId); const progress = profile.stages[stage.id];
  const enemies = [...new Set(stage.waves.flatMap(wave => wave.events.map(event => event.enemy)))];
  return <main className="meta-screen details-screen" style={{'--stage-primary':`#${stage.theme.primary.toString(16).padStart(6,'0')}`,'--stage-accent':stage.mapAccent} as React.CSSProperties}>
    <TopBar profile={profile} onWorkshop={onWorkshop} title={`СТЕЙДЖ ${String(stage.order).padStart(2,'0')}`} />
    <button className="back-button" onClick={onBack}>← К КАРТЕ</button>
    <div className="details-layout"><section className="stage-poster"><img src={stage.art} alt=""/><div className="poster-vignette"/><span className="poster-number">{String(stage.order).padStart(2,'0')}</span><div className="poster-title"><small>{stage.subtitle}</small><h1>{stage.name}</h1></div></section>
      <section className="stage-brief"><small className="brief-kicker">ЗАДАЧА МАШИНЫ</small><h2>{stage.lesson}</h2><p>{stage.waves.length} волн · рекомендуемый средний уровень {stage.recommendedAverageLevel}</p>
        <div className="enemy-roster">{enemies.map(kind => <span key={kind}><img src={`/assets/enemies/${kind}.png`} alt=""/><b>{ENEMIES[kind].label}</b></span>)}</div>
        <div className="reward-preview"><small>НАГРАДА ЗА ПРОХОД</small><div>{stage.rewards.starCoins.map((coins,index)=><span key={coins}><i>★</i><b>{coins}</b><em className="coin-dot"/></span>)}</div>{stage.rewards.unlockBumper && <p>Первая победа: <b>{BUMPERS[stage.rewards.unlockBumper].label}</b></p>}</div>
        <div className="best-run"><span><small>ЛУЧШИЕ ЗВЁЗДЫ</small><b>{progress.bestStars}/3</b></span><span><small>ЛУЧШИЙ СЧЁТ</small><b>{progress.bestScore.toLocaleString('ru-RU')}</b></span></div>
        {!progress.unlocked && <div className="locked-message">Победи на предыдущем стейдже, чтобы открыть арену.</div>}
        <div className="details-actions"><button className="secondary" onClick={onWorkshop}>ПРОВЕРИТЬ КОЛОДУ</button><button className="primary" disabled={!progress.unlocked} onClick={onPlay}>{progress.unlocked?'В БОЙ':'ЗАБЛОКИРОВАНО'} <span>▶</span></button></div>
      </section></div>
  </main>;
}

function WorkshopScreen({ profile, store, onBack }: { profile:SaveDataV1;store:ProfileStore;onBack:()=>void }) {
  const [selected, setSelected] = useState<BumperKind>(profile.activeDeck[0]);
  const [incoming, setIncoming] = useState<BumperKind>();
  const config = BUMPERS[selected]; const level = profile.bumperLevels[selected] ?? 1;
  const current = applyLevelToBumperStats(config, level); const next = applyLevelToBumperStats(config, Math.min(20,level+1)); const check = canUpgrade(profile, selected);
  const choose = (kind:BumperKind) => { setSelected(kind); if (profile.unlockedBumpers.includes(kind) && !profile.activeDeck.includes(kind)) setIncoming(kind); };
  const replace = (outgoing:BumperKind) => { if (incoming && store.swapDeck(incoming,outgoing)) { setSelected(incoming); setIncoming(undefined); } };
  return <main className="meta-screen workshop-screen"><TopBar profile={profile} onWorkshop={()=>{}} title="МАСТЕРСКАЯ"/><button className="back-button" onClick={onBack}>← НАЗАД</button>
    <section className="workshop-header"><small>АКТИВНАЯ КОЛОДА · 8 УНИКАЛЬНЫХ ДЕТАЛЕЙ</small><h1>Твоя машина</h1><div className="deck-strip">{profile.activeDeck.map((kind,index)=><button key={kind} className={`${selected===kind?'selected':''} ${incoming?'replace-target':''}`} onClick={()=>incoming?replace(kind):setSelected(kind)}><span>{index+1}</span><img src={`/assets/bumpers/${kind}.png`} alt=""/><b>УР. {profile.bumperLevels[kind]??1}</b></button>)}</div>{incoming && <div className="swap-banner">Выбери слот, который заменит <b>{BUMPERS[incoming].label}</b><button onClick={()=>setIncoming(undefined)}>ОТМЕНА</button></div>}</section>
    <div className="workshop-body"><section className="collection"><small>КОЛЛЕКЦИЯ · {profile.unlockedBumpers.length}/12</small><div className="collection-grid">{ALL_BUMPERS.map(kind=>{const unlocked=profile.unlockedBumpers.includes(kind);const inDeck=profile.activeDeck.includes(kind);return <button key={kind} className={`${selected===kind?'selected':''} ${unlocked?'':'locked'}`} onClick={()=>choose(kind)}><span className="collection-art"><img src={`/assets/bumpers/${kind}.png`} alt=""/><i/></span><strong>{unlocked?BUMPERS[kind].label:'НЕИЗВЕСТНО'}</strong><small>{unlocked?`Ур. ${profile.bumperLevels[kind]??1}`:unlockLabel(kind)}</small>{inDeck&&<em>В КОЛОДЕ</em>}</button>})}</div></section>
      <aside className="part-detail" style={{'--part-color':`#${config.color.toString(16).padStart(6,'0')}`} as React.CSSProperties}><div className="detail-art"><img src={`/assets/bumpers/${selected}.png`} alt=""/><span>УР. {level}</span></div><small>{config.role}</small><h2>{config.label}</h2><p>{config.effectLabel}</p><div className="stats-preview"><span><small>УРОН</small><b>{current.damage.toFixed(1)}</b><i>→ {next.damage.toFixed(1)}</i></span><span><small>ОТСКОК</small><b>{Math.round(current.bounce*100)}</b><i>→ {Math.round(next.bounce*100)}</i></span><span><small>КД</small><b>{Math.round(current.cooldownMs)} мс</b><i>→ {Math.round(next.cooldownMs)} мс</i></span></div>
        {profile.unlockedBumpers.includes(selected)?<><button className="upgrade-button" disabled={!check.ok} onClick={()=>store.upgrade(selected)}>УЛУЧШИТЬ ДО УР. {Math.min(20,level+1)} <span><i className="coin-dot"/>{upgradeCost(selected,level)}</span></button>{!check.ok&&<p className="upgrade-reason">{check.reason}</p>}{!profile.activeDeck.includes(selected)&&<button className="equip-button" onClick={()=>setIncoming(selected)}>ПОСТАВИТЬ В КОЛОДУ</button>}</>:<div className="locked-detail">Деталь откроется по ходу кампании.</div>}
      </aside></div>
  </main>;
}

function unlockLabel(kind:BumperKind) { const stage=STAGES.find(item=>item.rewards.unlockBumper===kind); return stage?`Победа на стейдже ${stage.order}`:'Закрыто'; }

function GameScreen({ loadout, store, onResult }: { loadout:RunLoadout;store:ProfileStore;onResult:(result:RunResult)=>void }) {
  const host=useRef<HTMLDivElement>(null);const engine=useRef<GameEngine|undefined>(undefined);const resultHandler=useRef(onResult);resultHandler.current=onResult;const [snapshot,setSnapshot]=useState({...initial,inputLayout:loadout.inputLayout,flipperMotion:loadout.flipperMotion,totalWaves:getStage(loadout.stageId).waves.length});const [loading,setLoading]=useState(true);
  useEffect(()=>{if(!host.current)return;let instance:GameEngine|undefined;let cancelled=false;void import('../game/GameEngine').then(async module=>{if(cancelled||!host.current)return;instance=new module.GameEngine(setSnapshot,loadout,getStage(loadout.stageId),result=>resultHandler.current(result));engine.current=instance;await instance.mount(host.current);if(cancelled)return;instance.startStage();setLoading(false)});return()=>{cancelled=true;instance?.destroy();engine.current=undefined}},[loadout]);
  const setting=(type:'layout'|'motion',value:string)=>{if(type==='layout'){engine.current?.setInputLayout(value as RunLoadout['inputLayout']);store.saveSettings({inputLayout:value as RunLoadout['inputLayout']})}else{engine.current?.setFlipperMotion(value as RunLoadout['flipperMotion']);store.saveSettings({flipperMotion:value as RunLoadout['flipperMotion']})}};
  return <main className="game-shell"><div className="machine-bezel"><div className="game-host" ref={host}/>{loading&&<div className="game-loading"><i/><b>РАЗОГРЕВАЕМ МАШИНУ</b></div>}<Hud snapshot={snapshot}/><ControlLab snapshot={snapshot} engine={engine.current} onSetting={setting}/>{snapshot.phase==='build'&&<BuildOverlay snapshot={snapshot} engine={engine.current}/>} {snapshot.phase==='countdown'&&<button className="countdown" onClick={()=>engine.current?.cancelCountdown()}><strong>{snapshot.countdown}</strong><span>тап — отменить</span></button>}</div></main>;
}

function Hud({snapshot}:{snapshot:Snapshot}) { const hp=snapshot.baseHp/snapshot.maxBaseHp*100; const boss=snapshot.bossHp!==undefined&&snapshot.bossMaxHp; return <header className="hud"><div className="hud-block health"><span>БАЗА</span><div className="hp-track"><i style={{width:`${hp}%`}}/></div><b>{snapshot.baseHp}/{snapshot.maxBaseHp}</b></div><div className="wave-badge"><small>ВОЛНА</small><b>{Math.max(1,snapshot.wave)}/{snapshot.totalWaves}</b></div><div className="hud-stats"><span>ЛОМ {snapshot.scrap}</span><span>Ц {snapshot.enemiesAlive}</span><span>×{Math.max(1,snapshot.combo)}</span><span>{snapshot.score}</span></div>{boss&&<div className={`boss-bar ${snapshot.bossRage?'rage':''}`}><small>ГЛАВШАР</small><div><i style={{width:`${snapshot.bossHp!/snapshot.bossMaxHp!*100}%`}}/></div><b>{Math.ceil(snapshot.bossHp!)}</b></div>}</header> }

function ControlLab({snapshot,engine,onSetting}:{snapshot:Snapshot;engine?:GameEngine;onSetting:(type:'layout'|'motion',value:string)=>void}) { return <aside className="control-lab"><button className={snapshot.inputLayout==='together'?'active':''} onClick={()=>onSetting('layout','together')}>ОБА</button><button className={snapshot.inputLayout==='split'?'active':''} onClick={()=>onSetting('layout','split')}>Л/П</button><button className={snapshot.flipperMotion==='auto'?'active':''} onClick={()=>onSetting('motion','auto')}>ВЗМАХ</button><button className={snapshot.flipperMotion==='hold'?'active':''} onClick={()=>onSetting('motion','hold')}>ДЕРЖАТЬ</button>{import.meta.env.DEV&&snapshot.phase==='combat'&&<><button className="spawn" onClick={()=>engine?.debugSpawn((['grunt','heavy','light','jet','splitter'] as EnemyKind[])[Math.floor(Math.random()*5)])}>+ ВРАГ</button><button className="spawn" onClick={()=>engine?.debugClearWave()}>✓ ВОЛНА</button><button className="spawn danger" onClick={()=>engine?.debugBreakBase()}>ТЕСТ БАЗЫ</button></>}</aside> }

function BuildOverlay({snapshot,engine}:{snapshot:Snapshot;engine?:GameEngine}) { const canStart=!snapshot.draft.length&&!snapshot.pendingRewards.length; return <section className="build-panel"><div className="build-title"><span>{snapshot.wave===0?'ПЕРВЫЙ МОДУЛЬ':`ВОЛНА ${snapshot.wave} ПЕРЕЖЁВАНА`}</span><b>{snapshot.buildHint??(snapshot.draft.length?'Выбери одну деталь':'Машина готова')}</b></div>{!!snapshot.draft.length&&<div className="draft-row">{snapshot.draft.map(card=>{const repair=card.kind==='repair';const info=repair?{label:'Ремонт',color:0x66d38e,damage:0,bounce:0}:BUMPERS[card.kind as BumperKind];return <button className="draft-card" key={card.id} style={{'--accent':`#${info.color.toString(16).padStart(6,'0')}`} as React.CSSProperties} onClick={()=>engine?.chooseDraft(card.id)}><span className={`card-art ${card.kind}`}>{repair?<i/>:<img src={`/assets/bumpers/${card.kind}.png`} alt=""/>}</span><b>{info.label}</b><small>{repair?'+6 HP базы':`урон ${Math.round(info.damage)} · отскок ${Math.round(info.bounce*100)}`}</small></button>})}</div>}<div className="build-actions">{!!snapshot.pendingRewards.length&&<button onClick={()=>engine?.scrapPending()}>РАЗОБРАТЬ +3</button>}{!!snapshot.draft.length&&<button disabled={snapshot.scrap<snapshot.rerollCost} onClick={()=>engine?.reroll()}>↻ РЕРОЛЛ {snapshot.rerollCost}</button>}{!!snapshot.draft.length&&<button disabled={snapshot.scrap<snapshot.takeAllCost} onClick={()=>engine?.takeAll()}>ВЗЯТЬ ВСЁ {snapshot.takeAllCost}</button>}{canStart&&<button className="launch" onClick={()=>engine?.startNextWave()}>{snapshot.wave===0?'ЗАПУСТИТЬ':'СЛЕДУЮЩАЯ ВОЛНА'} ▶</button>}</div></section> }

function ResultScreen({result,reward,profile,onMap,onWorkshop,onRetry,onNext}:{result:RunResult;reward:AppliedRunReward;profile:SaveDataV1;onMap:()=>void;onWorkshop:()=>void;onRetry:()=>void;onNext:()=>void}) { const victory=result.outcome==='victory';const earned=useCountUp(reward.coinsEarned);const balance=useCountUp(profile.coins);return <main className={`meta-screen result-screen ${victory?'win':'lose'}`}><div className="result-rays"/><section className="result-card"><small>{victory?'МАШИНА СЫТА':'БАЗУ СОЖРАЛИ'}</small><h1>{victory?'СТЕЙДЖ ПРОЙДЕН':'ПЕРЕМОЛОТО НЕ ТО'}</h1><div className="result-stars">{[1,2,3].map((n,index)=><i key={n} className={n<=result.stars?'earned':''} style={{animationDelay:`${.18+index*.16}s`}}>★</i>)}</div>{reward.isNewRecord&&<span className="record-badge">НОВЫЙ РЕКОРД</span>}<div className="result-stats"><span><small>СЧЁТ</small><b>{result.score.toLocaleString('ru-RU')}</b></span><span><small>HP БАЗЫ</small><b>{result.baseHp}/{result.maxBaseHp}</b></span><span><small>ВОЛНА</small><b>{result.reachedWave}/{result.totalWaves}</b></span></div><div className="coin-reward"><small>ЗАРАБОТАНО</small><strong><i className="coin-dot"/>+{earned}</strong><span>Баланс: {balance}</span></div>{reward.bumperUnlocked&&<div className="unlock-reveal"><img src={`/assets/bumpers/${reward.bumperUnlocked}.png`} alt=""/><span><small>НОВАЯ ДЕТАЛЬ</small><b>{BUMPERS[reward.bumperUnlocked].label}</b></span></div>}{!victory&&<p className="defeat-tip">Усиль слабую деталь или перестрой геометрию машины — тайминг флипперов всё ещё решает.</p>}<div className="result-actions"><button onClick={onRetry}>ЕЩЁ РАЗ</button>{victory&&getStage(result.stageId).order<10&&<button className="primary" onClick={onNext}>СЛЕДУЮЩИЙ СТЕЙДЖ</button>}<button onClick={onWorkshop}>В МАСТЕРСКУЮ</button><button onClick={onMap}>НА КАРТУ</button></div></section></main> }
