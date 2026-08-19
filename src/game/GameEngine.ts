import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import Matter from 'matter-js';
import { BUMPERS, ENEMIES, GAME } from './config';
import { armorDamage, clamp, createShuffleBag, seededRandom, shouldRescueStalledBody, starsForHp, tierMultiplier, type ShuffleBag } from './math';
import { applyLevelToBumperStats } from '../meta/profile';
import type { BumperKind, DraftCard, EnemyKind, FlipperMotion, GamePhase, InputLayout, PlacedBumper, RunLoadout, RunResult, Snapshot, StageConfig } from './types';

const { Bodies, Body, Composite, Engine, Events, Vector } = Matter;
const WALL = 0x0001;
const ENEMY = 0x0002;
const DEVICE = 0x0004;
const FLIPPER = 0x0008;

interface EnemyEntity {
  id: string;
  kind: EnemyKind;
  body: Matter.Body;
  view: Container;
  hp: number;
  maxHp: number;
  armor: number;
  baseDamage: number;
  reward: number;
  radius: number;
  alive: boolean;
  jetAt: number;
  jetWarnAt: number;
  burnUntil: number;
  burnNext: number;
  iceUntil: number;
  poisonUntil: number;
  poisonNext: number;
  motionAnchor: { x: number; y: number };
  motionSampleAt: number;
  stalledForMs: number;
  rescueCount: number;
  bossNextAbilityAt: number;
  bossWarnAt: number;
  bossRage: boolean;
  hpBar: Graphics;
  face: Text;
}

interface DeviceEntity {
  placement: PlacedBumper;
  body: Matter.Body;
  view: Container;
  readyAt: number;
}

interface FlipperEntity {
  side: 'left' | 'right';
  body: Matter.Body;
  view: Container;
  pivot: { x: number; y: number };
  amount: number;
  target: number;
  pressedAt: number;
  autoReleaseAt: number;
}

interface Particle {
  view: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export class GameEngine {
  private app = new Application();
  private engine = Engine.create({ gravity: { x: 0, y: GAME.gravity, scale: 0.001 } });
  private root = new Container();
  private worldLayer = new Container();
  private fxLayer = new Container();
  private uiLayer = new Container();
  private enemies = new Map<number, EnemyEntity>();
  private devices = new Map<number, DeviceEntity>();
  private flippers: FlipperEntity[] = [];
  private particles: Particle[] = [];
  private placement: PlacedBumper[] = [];
  private onSnapshot: (snapshot: Snapshot) => void;
  private phase: GamePhase = 'ready';
  private wave = 0;
  private baseHp: number = GAME.maxBaseHp;
  private scrap = 0;
  private score = 0;
  private combo = 0;
  private comboAt = 0;
  private draft: DraftCard[] = [];
  private pendingRewards: Array<BumperKind | 'repair'> = [];
  private selectedBumperId?: string;
  private rerollsThisBuild = 0;
  private inputLayout: InputLayout = 'together';
  private flipperMotion: FlipperMotion = 'auto';
  private spawnQueue: Array<{ at: number; kind: EnemyKind; gate: string; warned?: boolean; hpMultiplier?: number; velocity?: { x: number; y: number } }> = [];
  private waveStartedAt = 0;
  private enemiesRemainingToSpawn = 0;
  private lastTime = 0;
  private snapshotAt = 0;
  private random: () => number;
  private hitCooldown = new Map<string, number>();
  private resizeObserver?: ResizeObserver;
  private destroyed = false;
  private countdownTimer?: number;
  private pointerSides = new Map<number, 'left' | 'right' | 'both'>();
  private shakePower = 0;
  private runStartedAt = 0;
  private resultSent = false;
  private draftBag: ShuffleBag<BumperKind>;
  private debugUsed = false;

  constructor(
    onSnapshot: (snapshot: Snapshot) => void,
    private readonly loadout: RunLoadout,
    private readonly stage: StageConfig,
    private readonly onResult: (result: RunResult) => void,
  ) {
    this.onSnapshot = onSnapshot;
    this.inputLayout = loadout.inputLayout;
    this.flipperMotion = loadout.flipperMotion;
    this.random = seededRandom(loadout.seed);
    this.draftBag = createShuffleBag(loadout.deck.map(item => item.kind), loadout.seed ^ 0xd4af7);
  }

  async mount(host: HTMLElement) {
    await this.app.init({
      width: GAME.width,
      height: GAME.height,
      background: '#100d16',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) return;
    await Assets.load([
      this.stage.art, '/assets/table/flipper.png',
      ...(['grunt', 'heavy', 'light', 'jet', 'splitter', 'boss'] as EnemyKind[]).map(kind => `/assets/enemies/${kind}.png`),
      ...this.loadout.deck.map(item => `/assets/bumpers/${item.kind}.png`),
    ]);
    if (this.destroyed) return;
    host.replaceChildren(this.app.canvas);
    this.app.canvas.className = 'game-canvas';
    this.app.stage.addChild(this.root);
    this.root.addChild(this.worldLayer, this.fxLayer, this.uiLayer);
    this.buildTable();
    this.bindInput();
    Events.on(this.engine, 'collisionStart', this.onCollision);
    Events.on(this.engine, 'collisionActive', this.onCollisionActive);
    this.app.ticker.add(this.tick);
    this.resizeObserver = new ResizeObserver(() => this.fit(host));
    this.resizeObserver.observe(host);
    this.fit(host);
    this.publish(true);
  }

  destroy() {
    this.destroyed = true;
    if (this.countdownTimer) window.clearInterval(this.countdownTimer);
    this.resizeObserver?.disconnect();
    Events.off(this.engine, 'collisionStart', this.onCollision);
    Events.off(this.engine, 'collisionActive', this.onCollisionActive);
    this.app.ticker.remove(this.tick);
    Engine.clear(this.engine);
    Composite.clear(this.engine.world, false, true);
    this.app.destroy(true, { children: true });
  }

  startStage() {
    this.resetRun();
    this.runStartedAt = performance.now();
    this.resultSent = false;
    this.phase = 'build';
    this.wave = 0;
    this.draft = this.rollDraft();
    this.publish(true);
  }

  setInputLayout(value: InputLayout) {
    this.inputLayout = value;
    this.publish(true);
  }

  setFlipperMotion(value: FlipperMotion) {
    this.flipperMotion = value;
    this.releaseFlippers();
    this.publish(true);
  }

  chooseDraft(cardId: string) {
    if (this.phase !== 'build' || this.pendingRewards.length) return;
    const card = this.draft.find(item => item.id === cardId);
    if (!card) return;
    this.draft = [];
    this.pendingRewards = [card.kind];
    this.resolveAutomaticRewards();
    this.publish(true);
  }

  reroll() {
    if (this.phase !== 'build' || this.pendingRewards.length) return;
    const cost = this.rerollCost;
    if (this.scrap < cost) return;
    this.scrap -= cost;
    this.rerollsThisBuild += 1;
    this.draft = this.rollDraft();
    this.publish(true);
  }

  takeAll() {
    if (this.phase !== 'build' || this.pendingRewards.length || this.scrap < GAME.takeAllCost) return;
    this.scrap -= GAME.takeAllCost;
    this.pendingRewards = this.draft.map(card => card.kind);
    this.draft = [];
    this.resolveAutomaticRewards();
    this.publish(true);
  }

  scrapPending() {
    if (!this.pendingRewards.length) return;
    this.pendingRewards.shift();
    this.scrap += 3;
    this.resolveAutomaticRewards();
    this.publish(true);
  }

  startNextWave() {
    if (this.phase !== 'build' || this.draft.length || this.pendingRewards.length) return;
    this.phase = 'countdown';
    let count = GAME.countdownSeconds;
    this.publish(true, count);
    this.countdownTimer = window.setInterval(() => {
      count -= 1;
      if (count <= 0) {
        if (this.countdownTimer) window.clearInterval(this.countdownTimer);
        this.countdownTimer = undefined;
        this.beginCombat();
      } else this.publish(true, count);
    }, 700);
  }

  cancelCountdown() {
    if (this.phase !== 'countdown') return;
    if (this.countdownTimer) window.clearInterval(this.countdownTimer);
    this.countdownTimer = undefined;
    this.phase = 'build';
    this.publish(true);
  }

  debugSpawn(kind: EnemyKind = 'grunt') {
    if (this.phase !== 'combat') return;
    this.debugUsed = true;
    this.spawnEnemy(kind, Math.floor(this.random() * 3));
  }

  debugClearWave() {
    if (this.phase !== 'combat') return;
    this.debugUsed = true;
    this.spawnQueue = [];
    this.enemiesRemainingToSpawn = 0;
    for (const enemy of [...this.enemies.values()]) this.removeEnemy(enemy, false);
    this.publish(true);
  }

  debugBreakBase() {
    if (this.phase !== 'combat') return;
    this.debugUsed = true;
    this.baseHp = 0;
    this.phase = 'defeat';
    this.spawnQueue = [];
    this.enemiesRemainingToSpawn = 0;
    for (const enemy of [...this.enemies.values()]) this.removeEnemy(enemy, false);
    this.shakePower = 18;
    navigator.vibrate?.([60, 30, 100]);
    this.publish(true);
  }

  private get rerollCost() {
    return GAME.firstRerollCost * (this.rerollsThisBuild + 1);
  }

  private fit(host: HTMLElement) {
    const ratio = GAME.width / GAME.height;
    const bounds = host.getBoundingClientRect();
    let width = bounds.width;
    let height = width / ratio;
    if (height > bounds.height) {
      height = bounds.height;
      width = height * ratio;
    }
    Object.assign(this.app.canvas.style, { width: `${width}px`, height: `${height}px` });
  }

  private resetRun() {
    if (this.countdownTimer) window.clearInterval(this.countdownTimer);
    this.countdownTimer = undefined;
    for (const enemy of this.enemies.values()) this.removeEnemy(enemy, false);
    this.enemies.clear();
    for (const particle of this.particles) if (!particle.view.destroyed) particle.view.destroy();
    this.particles = [];
    this.hitCooldown.clear();
    this.shakePower = 0;
    this.root.position.set(0, 0);
    this.placement = this.stage.builtInBumpers.map((bumper, index) => ({ id: `built-${index}`, ...bumper, locked: true }));
    this.refreshDevices();
    this.wave = 0;
    this.baseHp = GAME.maxBaseHp;
    this.scrap = 24;
    this.score = 0;
    this.combo = 0;
    this.draft = [];
    this.pendingRewards = [];
    this.selectedBumperId = undefined;
    this.spawnQueue = [];
    this.enemiesRemainingToSpawn = 0;
    this.draftBag = createShuffleBag(this.loadout.deck.map(item => item.kind), this.loadout.seed ^ 0xd4af7);
    this.debugUsed = false;
  }

  private buildTable() {
    const tableArt = new Sprite(Texture.from(this.stage.art));
    tableArt.width = GAME.width;
    tableArt.height = GAME.height;
    if (this.stage.order > 1) {
      const color = this.stage.theme.primary;
      const lighten = (channel: number) => Math.round((channel + 510) / 3);
      tableArt.tint = (lighten((color >> 16) & 255) << 16) | (lighten((color >> 8) & 255) << 8) | lighten(color & 255);
    }
    this.worldLayer.addChild(tableArt);
    const innerShade = new Graphics().roundRect(49, 115, 622, 1058, 34)
      .fill({ color: this.stage.theme.primary, alpha: .12 })
      .stroke({ color: this.stage.theme.secondary, width: 4, alpha: .4 });
    this.worldLayer.addChild(innerShade);

    const wallStyle = { isStatic: true, friction: 0, restitution: .72, collisionFilter: { category: WALL, mask: ENEMY } };
    const walls = [
      Bodies.rectangle(45, 610, 34, 1040, wallStyle),
      Bodies.rectangle(675, 610, 34, 1040, wallStyle),
      Bodies.rectangle(360, 112, 620, 24, wallStyle),
      Bodies.rectangle(150, 1112, 240, 28, { ...wallStyle, angle: .22 }),
      Bodies.rectangle(570, 1112, 240, 28, { ...wallStyle, angle: -.22 }),
      ...this.stage.obstacles.map(obstacle => Bodies.rectangle(obstacle.position.x, obstacle.position.y, obstacle.width, obstacle.height, { ...wallStyle, angle: obstacle.angle ?? 0, label: `obstacle:${obstacle.id}` })),
    ];
    Composite.add(this.engine.world, walls);
    for (const body of walls.slice(3)) {
      const g = new Graphics().roundRect(-body.bounds.max.x + body.position.x, -10, body.bounds.max.x - body.bounds.min.x, 20, 10).fill({ color: 0x84664b });
      g.position.set(body.position.x, body.position.y);
      g.rotation = body.angle;
      g.tint = this.stage.theme.secondary;
      this.worldLayer.addChild(g);
    }

    for (const socket of this.stage.sockets) {
      const ring = new Graphics()
        .circle(0, 0, 48)
        .fill({ color: 0x0d1117, alpha: .75 })
        .stroke({ color: this.stage.theme.secondary, width: 5, alpha: .85 });
      ring.position.set(socket.position.x, socket.position.y);
      ring.label = `socket:${socket.id}`;
      this.worldLayer.addChild(ring);
    }

    this.createFlipper('left', { x: 180, y: 1050 });
    this.createFlipper('right', { x: 540, y: 1050 });
    this.refreshDevices();
  }

  private createFlipper(side: 'left' | 'right', pivot: { x: number; y: number }) {
    const body = Bodies.rectangle(pivot.x, pivot.y, GAME.flipperLength, GAME.flipperThickness, {
      isStatic: true,
      chamfer: { radius: 14 },
      restitution: .2,
      collisionFilter: { category: FLIPPER, mask: ENEMY },
      label: `flipper:${side}`,
    });
    const view = new Container();
    const flipperArt = new Sprite(Texture.from('/assets/table/flipper.png'));
    flipperArt.anchor.set(.5);
    flipperArt.width = GAME.flipperLength * 1.18;
    flipperArt.height = GAME.flipperThickness * 2.25;
    view.addChild(flipperArt);
    this.worldLayer.addChild(view);
    Composite.add(this.engine.world, body);
    const entity: FlipperEntity = { side, body, view, pivot, amount: 0, target: 0, pressedAt: 0, autoReleaseAt: 0 };
    this.flippers.push(entity);
    this.positionFlipper(entity);
  }

  private positionFlipper(flipper: FlipperEntity) {
    const rest = flipper.side === 'left' ? .24 : Math.PI - .24;
    const active = flipper.side === 'left' ? -.48 : Math.PI + .48;
    const angle = rest + (active - rest) * flipper.amount;
    const center = {
      x: flipper.pivot.x + Math.cos(angle) * GAME.flipperLength * .43,
      y: flipper.pivot.y + Math.sin(angle) * GAME.flipperLength * .43,
    };
    const bodyAngle = angle;
    Body.setPosition(flipper.body, center);
    Body.setAngle(flipper.body, bodyAngle);
    flipper.view.position.set(center.x, center.y);
    flipper.view.rotation = bodyAngle;
  }

  private refreshDevices() {
    for (const device of this.devices.values()) {
      Composite.remove(this.engine.world, device.body);
      device.view.destroy({ children: true });
    }
    this.devices.clear();
    for (const placed of this.placement) {
      const socket = this.stage.sockets.find(item => item.id === placed.socketId);
      if (!socket) continue;
      const config = this.bumperStats(placed.kind);
      const body = Bodies.circle(socket.position.x, socket.position.y, config.radius, {
        isStatic: true,
        restitution: config.bounce,
        friction: 0,
        collisionFilter: { category: DEVICE, mask: ENEMY },
        label: `device:${placed.kind}`,
      });
      const view = this.makeDeviceView(placed.kind, placed.tier, config.radius);
      view.position.set(socket.position.x, socket.position.y);
      this.worldLayer.addChild(view);
      Composite.add(this.engine.world, body);
      this.devices.set(body.id, { placement: placed, body, view, readyAt: 0 });
    }
  }

  private makeDeviceView(kind: BumperKind, tier: number, radius: number) {
    const config = this.bumperStats(kind);
    const c = new Container();
    const glow = new Graphics().circle(0, 0, radius + 10).fill({ color: config.color, alpha: .12 });
    const art = new Sprite(Texture.from(`/assets/bumpers/${kind}.png`));
    art.anchor.set(.5);
    art.width = radius * 2.52;
    art.height = radius * 2.52;
    const badge = new Text({ text: `T${tier}`, style: { fill: 0x17121c, fontSize: 14, fontWeight: '900', fontFamily: 'Arial' } });
    badge.anchor.set(.5);
    const badgeBg = new Graphics().circle(radius * .68, radius * .68, 15).fill({ color: 0xffdd78 });
    badge.position.set(radius * .68, radius * .68);
    c.addChild(glow, art, badgeBg, badge);
    return c;
  }

  private bindInput() {
    const canvas = this.app.canvas;
    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * GAME.width / rect.width, y: (event.clientY - rect.top) * GAME.height / rect.height };
    };
    canvas.addEventListener('pointerdown', event => {
      event.preventDefault();
      const p = point(event);
      if (this.phase === 'build') {
        this.handleBuildTap(p.x, p.y);
        return;
      }
      if (this.phase !== 'combat') return;
      const side = this.inputLayout === 'together' ? 'both' : p.x < GAME.width / 2 ? 'left' : 'right';
      this.pointerSides.set(event.pointerId, side);
      if (side === 'both') this.pressFlippers(['left', 'right']);
      else this.pressFlippers([side]);
      canvas.setPointerCapture(event.pointerId);
    });
    const release = (event: PointerEvent) => {
      const side = this.pointerSides.get(event.pointerId);
      if (!side) return;
      this.pointerSides.delete(event.pointerId);
      if (this.flipperMotion === 'hold') {
        if (side === 'both') this.setFlipperTargets(['left', 'right'], 0);
        else this.setFlipperTargets([side], 0);
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  private handleBuildTap(x: number, y: number) {
    const socket = this.stage.sockets.map(item => ({ ...item, d: Vector.magnitude(Vector.sub(item.position, { x, y })) })).sort((a, b) => a.d - b.d)[0];
    if (!socket || socket.d > 68) return;
    if (this.pendingRewards.length) {
      const reward = this.pendingRewards[0];
      if (reward === 'repair') return;
      const existing = this.placement.find(item => item.socketId === socket.id);
      if (existing?.kind === reward && existing.tier < 3) {
        existing.tier = (existing.tier + 1) as 2 | 3;
      } else {
        if (existing?.locked) {
          this.popup(socket.position.x, socket.position.y - 58, 'ВСТРОЕНО!', 0xff8b75);
          this.burst(socket.position.x, socket.position.y, 0xff5b64, 8, 3);
          return;
        }
        if (existing) {
          this.placement = this.placement.filter(item => item.id !== existing.id);
          this.scrap += 3;
        }
        this.placement.push({ id: `${reward}-${Date.now()}-${Math.round(this.random() * 1000)}`, kind: reward, socketId: socket.id, tier: 1 });
      }
      this.pendingRewards.shift();
      this.refreshDevices();
      this.burst(socket.position.x, socket.position.y, BUMPERS[reward].color, 18, 8);
      this.resolveAutomaticRewards();
      this.publish(true);
      return;
    }
    const existing = this.placement.find(item => item.socketId === socket.id && !item.locked);
    if (!this.selectedBumperId) {
      if (existing) this.selectedBumperId = existing.id;
    } else {
      const selected = this.placement.find(item => item.id === this.selectedBumperId);
      if (!selected) this.selectedBumperId = undefined;
      else if (existing && existing.id !== selected.id) {
        const oldSocket = selected.socketId;
        selected.socketId = existing.socketId;
        existing.socketId = oldSocket;
        this.selectedBumperId = undefined;
        this.refreshDevices();
      } else {
        selected.socketId = socket.id;
        this.selectedBumperId = undefined;
        this.refreshDevices();
      }
    }
    this.publish(true);
  }

  private resolveAutomaticRewards() {
    while (this.pendingRewards[0] === 'repair') {
      this.pendingRewards.shift();
      this.baseHp = Math.min(GAME.maxBaseHp, this.baseHp + 6);
    }
  }

  private rollDraft(): DraftCard[] {
    const result: DraftCard[] = this.draftBag.drawUnique(3).map((kind,index) => ({ id: `${kind}-${this.wave}-${index}`, kind }));
    if (this.baseHp <= GAME.maxBaseHp * .5 && this.random() < .35) result[2] = { id: `repair-${this.wave}`, kind: 'repair' };
    return result;
  }

  private bumperStats(kind: BumperKind) {
    const level = this.loadout.deck.find(item => item.kind === kind)?.level ?? 1;
    return applyLevelToBumperStats(BUMPERS[kind], level);
  }

  private beginCombat() {
    this.phase = 'combat';
    this.wave += 1;
    this.combo = 0;
    this.rerollsThisBuild = 0;
    this.spawnQueue = this.makeWave(this.wave);
    this.enemiesRemainingToSpawn = this.spawnQueue.length;
    this.waveStartedAt = performance.now();
    this.publish(true);
  }

  private makeWave(wave: number) {
    const config = this.stage.waves[wave - 1] ?? this.stage.waves.at(-1)!;
    const queue: Array<{ at: number; kind: EnemyKind; gate: string; warned?: boolean; hpMultiplier?: number; velocity?: { x: number; y: number } }> = [];
    for (const event of config.events) {
      const count = event.count ?? 1;
      for (let index = 0; index < count; index++) queue.push({ at: event.atMs + index * (event.intervalMs ?? 240), kind: event.enemy, gate: event.gate, hpMultiplier: event.hpMultiplier, velocity: event.velocity });
    }
    queue.sort((a, b) => a.at - b.at);
    return queue;
  }

  private spawnEnemy(kind: EnemyKind, gate: string | number, mini = false, hpMultiplier = 1, velocity?: { x: number; y: number }) {
    const config = ENEMIES[kind];
    const radius = mini ? config.radius * .7 : config.radius;
    const gateConfig = typeof gate === 'number' ? this.stage.spawnGates[gate] : this.stage.spawnGates.find(item => item.id === gate);
    const origin = gateConfig?.position ?? { x: 360, y: 150 };
    const x = origin.x + (this.random() - .5) * 56;
    const body = Bodies.circle(x, origin.y, radius, {
      restitution: config.restitution,
      friction: .002,
      frictionAir: config.frictionAir,
      density: .001 * config.mass,
      collisionFilter: { category: ENEMY, mask: WALL | ENEMY | DEVICE | FLIPPER },
      label: `enemy:${kind}`,
    });
    Body.setVelocity(body, velocity ?? { x: (this.random() - .5) * 3, y: 1.5 + this.random() * 2 });
    const view = this.makeEnemyView(kind, radius);
    view.position.set(x, origin.y);
    this.worldLayer.addChild(view);
    Composite.add(this.engine.world, body);
    const now = performance.now();
    const stageHp = this.stage.enemyTuning?.hpMultiplier ?? 1;
    const hp = (mini ? config.hp * .42 : config.hp) * stageHp * hpMultiplier;
    const entity: EnemyEntity = {
      id: `${kind}-${body.id}`,
      kind, body, view, hp, maxHp: hp,
      armor: mini ? 0 : config.armor + (this.stage.enemyTuning?.armorBonus ?? 0),
      baseDamage: mini ? 1 : config.baseDamage,
      reward: mini ? 1 : config.reward,
      radius, alive: true,
      jetAt: now + 2300 + this.random() * 800,
      jetWarnAt: 0,
      burnUntil: 0, burnNext: 0, iceUntil: 0, poisonUntil: 0, poisonNext: 0,
      motionAnchor: { x, y: origin.y }, motionSampleAt: now, stalledForMs: 0, rescueCount: 0,
      bossNextAbilityAt: now + 5600, bossWarnAt: 0, bossRage: false,
      hpBar: view.getChildByLabel('hpbar') as Graphics,
      face: view.getChildByLabel('face') as Text,
    };
    this.enemies.set(body.id, entity);
    this.burst(x, origin.y, config.color, 14, 5);
  }

  private makeEnemyView(kind: EnemyKind, radius: number) {
    const config = ENEMIES[kind];
    const c = new Container();
    const shadow = new Graphics().ellipse(5, radius * .72, radius * .9, radius * .42).fill({ color: 0x000000, alpha: .3 });
    const art = new Sprite(Texture.from(`/assets/enemies/${kind}.png`));
    art.anchor.set(.5);
    art.width = radius * 2.55;
    art.height = radius * 2.55;
    const face = new Text({ text: '', style: { fontSize: 1 }, label: 'face' });
    face.visible = false;
    const hpBg = new Graphics().roundRect(-radius, -radius - 14, radius * 2, 6, 3).fill({ color: 0x1a1117, alpha: .9 });
    hpBg.label = 'hpbg';
    const hpBar = new Graphics({ label: 'hpbar' });
    hpBar.position.set(-radius, -radius - 14);
    c.addChild(shadow, art, face, hpBg, hpBar);
    hpBg.visible = false;
    hpBar.visible = false;
    return c;
  }

  private updateHpBar(enemy: EnemyEntity) {
    const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    enemy.hpBar.clear().roundRect(0, 0, enemy.radius * 2 * ratio, 6, 3).fill({ color: ratio > .5 ? 0x7cf06a : ratio > .25 ? 0xffc44d : 0xff4f58 });
    enemy.hpBar.visible = ratio < .999;
    const bg = enemy.hpBar.parent?.getChildByLabel('hpbg');
    if (bg) bg.visible = ratio < .999;
  }

  private onCollision = (event: Matter.IEventCollision<Matter.Engine>) => {
    const now = performance.now();
    for (const pair of event.pairs) {
      const enemyBody = this.enemies.has(pair.bodyA.id) ? pair.bodyA : this.enemies.has(pair.bodyB.id) ? pair.bodyB : undefined;
      if (!enemyBody) continue;
      const enemy = this.enemies.get(enemyBody.id)!;
      const other = enemyBody === pair.bodyA ? pair.bodyB : pair.bodyA;
      const device = this.devices.get(other.id);
      if (device) this.hitDevice(enemy, device, now);
      else if (other.label.startsWith('flipper:')) this.hitFlipper(enemy, other.label.endsWith('left') ? 'left' : 'right', now);
      else if (this.enemies.has(other.id)) {
        const relative = Vector.magnitude(Vector.sub(enemyBody.velocity, other.velocity));
        if (relative > GAME.kineticThreshold) this.damageEnemy(enemy, (relative - GAME.kineticThreshold) * GAME.kineticScale, 'kinetic', false);
      } else if (other.collisionFilter.category === WALL) {
        const speed = enemyBody.speed;
        if (speed > GAME.kineticThreshold + 2) this.damageEnemy(enemy, (speed - GAME.kineticThreshold) * GAME.kineticScale * .7, 'wall', false);
      }
    }
  };

  private onCollisionActive = (event: Matter.IEventCollision<Matter.Engine>) => {
    const now = performance.now();
    for (const pair of event.pairs) {
      const enemyBody = this.enemies.has(pair.bodyA.id) ? pair.bodyA : this.enemies.has(pair.bodyB.id) ? pair.bodyB : undefined;
      if (!enemyBody) continue;
      const other = enemyBody === pair.bodyA ? pair.bodyB : pair.bodyA;
      const device = this.devices.get(other.id);
      if (device?.placement.kind === 'grinder') this.hitDevice(this.enemies.get(enemyBody.id)!, device, now);
    }
  };

  private hitFlipper(enemy: EnemyEntity, side: 'left' | 'right', now: number) {
    const flipper = this.flippers.find(item => item.side === side)!;
    const key = `${enemy.id}:flipper:${side}`;
    if ((this.hitCooldown.get(key) ?? 0) > now) return;
    this.hitCooldown.set(key, now + 160);
    const perfect = now - flipper.pressedAt <= GAME.perfectWindowMs;
    const tipDistance = Math.abs(enemy.body.position.x - flipper.pivot.x);
    const tip = tipDistance > GAME.flipperLength * .6;
    const multiplier = (perfect ? 1.8 : 1) * (tip ? GAME.tipBonus : 1);
    this.damageEnemy(enemy, GAME.flipperDamage * multiplier, 'flipper', true);
    const horizontal = side === 'left' ? 4.5 : -4.5;
    Body.setVelocity(enemy.body, { x: enemy.body.velocity.x + horizontal, y: -16 - (perfect ? 5 : 0) });
    this.burst(enemy.body.position.x, enemy.body.position.y, perfect ? 0xffef83 : 0xef605b, perfect ? 24 : 10, perfect ? 12 : 6);
    if (perfect) {
      this.popup(enemy.body.position.x, enemy.body.position.y - 42, tip ? 'ИДЕАЛЬНЫЙ КОНЧИК!' : 'ИДЕАЛЬНО!', 0xffef83);
      this.shakePower = Math.max(this.shakePower, 4);
      navigator.vibrate?.(18);
    }
  }

  private hitDevice(enemy: EnemyEntity, device: DeviceEntity, now: number) {
    const pairKey = `${enemy.id}:${device.placement.id}`;
    const config = this.bumperStats(device.placement.kind);
    const lock = Math.max(GAME.perEnemyBumperCooldownMs, config.cooldownMs);
    if ((this.hitCooldown.get(pairKey) ?? 0) > now || device.readyAt > now) return;
    this.hitCooldown.set(pairKey, now + lock);
    const multi = tierMultiplier(device.placement.tier);
    let dealt = device.placement.kind === 'pit'
      ? 0
      : this.damageEnemy(enemy, config.damage * multi, device.placement.kind, device.placement.kind === 'poison');
    const p = enemy.body.position;
    switch (device.placement.kind) {
      case 'fire':
        if (dealt > 0) { enemy.burnUntil = now + 3200 * multi; enemy.burnNext = now + 450; }
        this.burst(p.x, p.y, 0xff6b31, 18, 7);
        break;
      case 'blast':
        device.readyAt = now + config.cooldownMs;
        this.explode(p.x, p.y, 150 + device.placement.tier * 18, 9 * multi, enemy.body.id);
        this.shakePower = Math.max(this.shakePower, 8);
        break;
      case 'ice':
        if (dealt > 0) enemy.iceUntil = now + 2200 * multi * (enemy.kind === 'boss' ? .42 : 1);
        this.burst(p.x, p.y, 0x8de5ff, 22, 6);
        break;
      case 'spike':
        this.burst(p.x, p.y, 0xeae3d2, 14, 10);
        break;
      case 'electric':
        device.readyAt = now + config.cooldownMs;
        this.chainLightning(enemy, 3, 7 * multi);
        break;
      case 'pit':
        device.readyAt = now + config.cooldownMs;
        if (enemy.kind === 'boss') this.damageEnemy(enemy, enemy.maxHp * .18, 'pit', true);
        else if (enemy.kind === 'heavy') this.damageEnemy(enemy, enemy.maxHp * .6, 'pit', true);
        else this.killEnemy(enemy);
        this.ring(p.x, p.y, 0x9e65d8, 90);
        this.shakePower = Math.max(this.shakePower, 5);
        break;
      case 'poison':
        enemy.poisonUntil = now + 4500 * multi;
        enemy.poisonNext = now + 520;
        this.burst(p.x, p.y, 0x8bea53, 20, 5);
        break;
      case 'magnet':
        device.readyAt = now + config.cooldownMs;
        for (const target of this.enemies.values()) {
          if (!target.alive || target.id === enemy.id) continue;
          const delta = Vector.sub(device.body.position, target.body.position);
          const distance = Vector.magnitude(delta);
          if (distance < 185 && distance > 5) {
            const n = Vector.normalise(delta);
            Body.setVelocity(target.body, { x: target.body.velocity.x + n.x * 7 * multi, y: target.body.velocity.y + n.y * 7 * multi });
          }
        }
        this.ring(p.x, p.y, 0x4de0db, 185);
        break;
      case 'spinner': {
        const radial = Vector.normalise(Vector.sub(enemy.body.position, device.body.position));
        Body.setVelocity(enemy.body, { x: enemy.body.velocity.x - radial.y * 9 * multi, y: enemy.body.velocity.y + radial.x * 9 * multi });
        this.ring(p.x, p.y, 0xff7db8, 76);
        break;
      }
      case 'spring':
        device.readyAt = now + config.cooldownMs;
        this.burst(p.x, p.y, 0x70f29a, 28, 12);
        this.popup(p.x, p.y - 52, 'ПРУЖИНА!', 0xbaffc8);
        break;
      case 'grinder':
        this.burst(p.x, p.y, 0xff765b, 9, 4);
        device.view.rotation += .3;
        break;
      default:
        this.burst(p.x, p.y, config.color, 12, 5);
    }
    this.addCombo(1 + Math.floor(device.placement.tier / 2));
    const direction = Vector.normalise(Vector.sub(enemy.body.position, device.body.position));
    const jitter = (this.random() - .5) * Math.PI / 36;
    const rotated = Vector.rotate(direction, jitter);
    const strength = 10 + config.bounce * 8;
    if (device.placement.kind === 'spinner') Body.setVelocity(enemy.body, { x: rotated.x * strength - rotated.y * 9 * multi, y: rotated.y * strength + rotated.x * 9 * multi });
    else Body.setVelocity(enemy.body, { x: rotated.x * strength, y: rotated.y * strength });
    device.view.scale.set(1.16);
  }

  private damageEnemy(enemy: EnemyEntity, incoming: number, source: string, bypassArmor: boolean) {
    if (!enemy.alive) return 0;
    const dealt = bypassArmor ? incoming : armorDamage(incoming, enemy.armor);
    if (dealt <= 0) {
      this.popup(enemy.body.position.x, enemy.body.position.y - enemy.radius, 'БРЯК!', 0xb8b5c1);
      return 0;
    }
    enemy.hp -= dealt;
    this.score += Math.round(dealt * (1 + this.combo * .04));
    enemy.face.text = enemy.hp <= enemy.maxHp * .25 ? '×皿×' : enemy.hp <= enemy.maxHp * .6 ? 'Ò﹏Ó' : 'ÓДÒ';
    this.updateHpBar(enemy);
    enemy.view.scale.set(1.14, .88);
    if (source !== 'burn' && source !== 'poison') this.popup(enemy.body.position.x, enemy.body.position.y - enemy.radius, `${Math.round(dealt)}`, 0xffffff);
    if (enemy.hp <= 0) this.killEnemy(enemy);
    return dealt;
  }

  private killEnemy(enemy: EnemyEntity) {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.scrap += enemy.reward;
    this.score += enemy.reward * 12;
    this.addCombo(2);
    const p = { ...enemy.body.position };
    this.burst(p.x, p.y, ENEMIES[enemy.kind].color, 28, 11);
    this.ring(p.x, p.y, 0xffffff, enemy.radius * 1.7);
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 3; i++) {
        this.spawnEnemy('light', 1, true);
        const child = [...this.enemies.values()].at(-1)!;
        Body.setPosition(child.body, { x: p.x + (i - 1) * 22, y: p.y });
        Body.setVelocity(child.body, { x: (i - 1) * 7, y: -7 - this.random() * 4 });
      }
    }
    this.removeEnemy(enemy, true);
  }

  private removeEnemy(enemy: EnemyEntity, delayed: boolean) {
    this.enemies.delete(enemy.body.id);
    Composite.remove(this.engine.world, enemy.body);
    if (delayed) {
      enemy.view.alpha = .75;
      setTimeout(() => { if (!enemy.view.destroyed) enemy.view.destroy({ children: true }); }, 180);
    } else enemy.view.destroy({ children: true });
  }

  private explode(x: number, y: number, radius: number, damage: number, ignoreId: number) {
    for (const enemy of this.enemies.values()) {
      if (!enemy.alive || enemy.body.id === ignoreId) continue;
      const delta = Vector.sub(enemy.body.position, { x, y });
      const distance = Vector.magnitude(delta);
      if (distance > radius) continue;
      const factor = 1 - distance / radius;
      this.damageEnemy(enemy, damage * (.5 + factor), 'blast', false);
      const n = Vector.normalise(delta);
      Body.setVelocity(enemy.body, { x: enemy.body.velocity.x + n.x * 12 * factor, y: enemy.body.velocity.y + n.y * 12 * factor });
    }
    this.burst(x, y, 0xffb834, 52, 15);
    this.ring(x, y, 0xffefad, radius);
  }

  private chainLightning(origin: EnemyEntity, count: number, damage: number) {
    const candidates = [...this.enemies.values()].filter(e => e.alive && e.id !== origin.id)
      .sort((a, b) => Vector.magnitudeSquared(Vector.sub(a.body.position, origin.body.position)) - Vector.magnitudeSquared(Vector.sub(b.body.position, origin.body.position)))
      .slice(0, count);
    let from = origin.body.position;
    for (const target of candidates) {
      if (Vector.magnitude(Vector.sub(target.body.position, from)) > 230) break;
      this.lightning(from, target.body.position);
      this.damageEnemy(target, damage, 'electric', false);
      from = target.body.position;
    }
  }

  private addCombo(amount: number) {
    this.combo += amount;
    this.comboAt = performance.now();
  }

  private pressFlippers(sides: Array<'left' | 'right'>) {
    const now = performance.now();
    for (const flipper of this.flippers) if (sides.includes(flipper.side)) {
      flipper.target = 1;
      flipper.pressedAt = now;
      if (this.flipperMotion === 'auto') flipper.autoReleaseAt = now + 135;
    }
  }

  private setFlipperTargets(sides: Array<'left' | 'right'>, target: number) {
    for (const flipper of this.flippers) if (sides.includes(flipper.side)) flipper.target = target;
  }

  private releaseFlippers() {
    this.setFlipperTargets(['left', 'right'], 0);
    this.pointerSides.clear();
  }

  private tick = () => {
    const now = performance.now();
    const delta = clamp(this.app.ticker.deltaMS || 16.67, 5, 33);
    this.lastTime = now;
    const steps = Math.max(1, Math.ceil(delta / 16.667));
    for (let step = 0; step < steps; step++) Engine.update(this.engine, delta / steps);

    for (const flipper of this.flippers) {
      if (this.flipperMotion === 'auto' && flipper.autoReleaseAt && now >= flipper.autoReleaseAt) flipper.target = 0;
      const speed = flipper.target > flipper.amount ? .34 : .2;
      flipper.amount += (flipper.target - flipper.amount) * speed;
      this.positionFlipper(flipper);
    }
    for (const device of this.devices.values()) {
      device.view.scale.x += (1 - device.view.scale.x) * .18;
      device.view.scale.y += (1 - device.view.scale.y) * .18;
      device.view.rotation += device.placement.kind === 'electric' ? .004 : 0;
      device.view.alpha += (((device.readyAt > now) ? .58 : 1) - device.view.alpha) * .15;
    }
    if (this.shakePower > .1) {
      this.root.position.set((this.random() - .5) * this.shakePower, (this.random() - .5) * this.shakePower);
      this.shakePower *= .84;
    } else this.root.position.set(0, 0);

    if (this.phase === 'combat') {
      const elapsed = now - this.waveStartedAt;
      const nextSpawn = this.spawnQueue[0];
      if (nextSpawn && !nextSpawn.warned && nextSpawn.at <= elapsed + 480) {
        nextSpawn.warned = true;
        const gate = this.stage.spawnGates.find(item => item.id === nextSpawn.gate)?.position ?? { x: 360, y: 150 };
        this.ring(gate.x, gate.y, ENEMIES[nextSpawn.kind].color, 55);
      }
      while (this.spawnQueue.length && this.spawnQueue[0].at <= elapsed) {
        const next = this.spawnQueue.shift()!;
        this.spawnEnemy(next.kind, next.gate, false, next.hpMultiplier, next.velocity);
        this.enemiesRemainingToSpawn -= 1;
      }
      if (this.combo && now - this.comboAt > GAME.comboWindowMs && this.enemies.size) this.combo = 0;
    }

    for (const enemy of [...this.enemies.values()]) {
      if (!enemy.alive) continue;
      const p = enemy.body.position;
      enemy.view.position.set(p.x, p.y);
      enemy.view.rotation = enemy.body.angle;
      const speed = enemy.body.speed;
      const stretch = clamp(speed / 35, 0, .22);
      enemy.view.scale.x += ((1 + stretch) - enemy.view.scale.x) * .12;
      enemy.view.scale.y += ((1 - stretch * .65) - enemy.view.scale.y) * .12;
      if (enemy.iceUntil > now) {
        Body.setVelocity(enemy.body, { x: enemy.body.velocity.x * .986, y: enemy.body.velocity.y * .986 });
        enemy.view.tint = 0xb9efff;
      } else enemy.view.tint = 0xffffff;
      if (enemy.burnUntil > now && enemy.burnNext <= now) {
        enemy.burnNext = now + 500;
        this.damageEnemy(enemy, 3.5, 'burn', true);
        this.burst(p.x, p.y, 0xff612e, 5, 4);
      }
      if (enemy.poisonUntil > now && enemy.poisonNext <= now) {
        enemy.poisonNext = now + 600;
        this.damageEnemy(enemy, 3.2, 'poison', true);
        enemy.armor = Math.max(0, enemy.armor - .55);
        this.burst(p.x, p.y, 0x89f45c, 5, 3);
      }
      if (enemy.kind === 'jet' && now >= enemy.jetAt) {
        if (!enemy.jetWarnAt) {
          enemy.jetWarnAt = now;
          enemy.face.text = '◉△◉';
          this.ring(p.x, p.y, 0xff8b36, enemy.radius * 1.6);
        } else if (now - enemy.jetWarnAt > 520) {
          Body.setVelocity(enemy.body, { x: enemy.body.velocity.x * .5, y: 17 });
          this.burst(p.x, p.y - enemy.radius, 0xff7b2f, 22, 8);
          enemy.jetAt = now + 2600 + this.random() * 900;
          enemy.jetWarnAt = 0;
        }
      }
      if (enemy.kind === 'boss') {
        if (!enemy.bossRage && enemy.hp <= enemy.maxHp * .35) {
          enemy.bossRage = true;
          this.popup(p.x, p.y - 90, 'ЯРОСТЬ!', 0xff5b61);
          this.shakePower = 12;
        }
        enemy.view.tint = enemy.bossRage ? 0xff8b8b : enemy.hp <= enemy.maxHp * .66 ? 0xffc6aa : 0xffffff;
        if (now >= enemy.bossNextAbilityAt) {
          if (!enemy.bossWarnAt) {
            enemy.bossWarnAt = now;
            this.ring(p.x, p.y, 0xff374c, enemy.radius * 2.2);
            this.popup(p.x, p.y - 88, 'ТАРАН!', 0xffd05c);
          } else if (now - enemy.bossWarnAt >= 720) {
            Body.setVelocity(enemy.body, { x: enemy.body.velocity.x * .25, y: enemy.bossRage ? 22 : 18 });
            const summonCount = enemy.bossRage ? 3 : 2;
            for (let i = 0; i < summonCount; i++) this.spawnEnemy(i % 2 ? 'grunt' : 'light', i % 2 ? 'left' : 'right', true);
            this.burst(p.x, p.y, 0xff4157, 38, 11);
            enemy.bossWarnAt = 0;
            enemy.bossNextAbilityAt = now + (enemy.bossRage ? 3900 : 5900);
          }
        }
      }
      this.rescueStalledEnemy(enemy, now);
      if (p.y > 1215) this.enemyDrained(enemy);
    }
    this.updateParticles(delta);
    if (this.phase === 'combat' && !this.enemiesRemainingToSpawn && !this.enemies.size) this.finishWave();
    if (now - this.snapshotAt > 100) this.publish(false);
  };

  private rescueStalledEnemy(enemy: EnemyEntity, now: number) {
    const elapsed = now - enemy.motionSampleAt;
    if (elapsed < GAME.motionSampleMs) return;
    const position = enemy.body.position;
    const moved = Vector.magnitude(Vector.sub(position, enemy.motionAnchor));
    const barelyMoving = enemy.body.speed < GAME.stuckSpeedThreshold && moved < GAME.stuckDistanceThreshold;
    enemy.stalledForMs = barelyMoving ? enemy.stalledForMs + elapsed : 0;
    enemy.motionAnchor = { ...position };
    enemy.motionSampleAt = now;
    if (!shouldRescueStalledBody(
      enemy.body.speed,
      moved,
      enemy.stalledForMs,
      GAME.stuckRescueMs,
      GAME.stuckSpeedThreshold,
      GAME.stuckDistanceThreshold,
    )) return;

    const towardCenter = position.x < GAME.width / 2 ? 1 : position.x > GAME.width / 2 ? -1 : (enemy.body.id + enemy.rescueCount) % 2 ? 1 : -1;
    Body.setPosition(enemy.body, { x: position.x + towardCenter * 4, y: position.y + 2 });
    Body.setVelocity(enemy.body, {
      x: towardCenter * GAME.stuckRescueHorizontalSpeed,
      y: GAME.stuckRescueDownwardSpeed,
    });
    Body.setAngularVelocity(enemy.body, towardCenter * .08);
    enemy.stalledForMs = 0;
    enemy.motionAnchor = { ...enemy.body.position };
    enemy.rescueCount += 1;
    this.burst(position.x, position.y, 0xffef83, 9, 4);
    this.ring(position.x, position.y, 0xffef83, enemy.radius * 1.15);
  }

  private enemyDrained(enemy: EnemyEntity) {
    this.baseHp = Math.max(0, this.baseHp - enemy.baseDamage);
    this.combo = 0;
    this.burst(enemy.body.position.x, 1165, 0xff4157, 28, 12);
    this.popup(360, 1100, `БАЗА −${enemy.baseDamage}`, 0xff6673);
    this.shakePower = Math.max(this.shakePower, 9);
    navigator.vibrate?.(45);
    if (enemy.kind === 'boss' && this.baseHp > 0) {
      Body.setPosition(enemy.body, { x: 360, y: 245 });
      Body.setVelocity(enemy.body, { x: (this.random() - .5) * 6, y: -4 });
      enemy.bossNextAbilityAt = performance.now() + 4200;
      enemy.bossWarnAt = 0;
      return;
    }
    this.removeEnemy(enemy, false);
    if (this.baseHp <= 0) {
      this.phase = 'defeat';
      this.spawnQueue = [];
      for (const other of [...this.enemies.values()]) this.removeEnemy(other, false);
      this.publish(true);
    }
  }

  private finishWave() {
    if (this.wave >= this.stage.waves.length) {
      this.phase = 'victory';
      this.publish(true);
      return;
    }
    this.phase = 'build';
    this.scrap += GAME.baseScrapPerWave + Math.min(12, Math.floor(this.combo / GAME.comboStep));
    this.rerollsThisBuild = 0;
    this.draft = this.rollDraft();
    this.releaseFlippers();
    this.publish(true);
  }

  private burst(x: number, y: number, color: number, count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      const velocity = speed * (.35 + this.random() * .65);
      const view = new Graphics().circle(0, 0, 2 + this.random() * 4).fill({ color, alpha: .95 });
      view.position.set(x, y);
      this.fxLayer.addChild(view);
      const life = 280 + this.random() * 360;
      this.particles.push({ view, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life, maxLife: life, gravity: .018 });
    }
  }

  private ring(x: number, y: number, color: number, radius: number) {
    const view = new Graphics().circle(0, 0, radius * .3).stroke({ color, width: 8, alpha: .9 });
    view.position.set(x, y);
    this.fxLayer.addChild(view);
    this.particles.push({ view, vx: 0, vy: 0, life: 260, maxLife: 260, gravity: -radius / 1300 });
  }

  private lightning(from: Matter.Vector, to: Matter.Vector) {
    const g = new Graphics();
    g.moveTo(from.x, from.y);
    const segments = 6;
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      g.lineTo(from.x + (to.x - from.x) * t + (this.random() - .5) * 22, from.y + (to.y - from.y) * t + (this.random() - .5) * 22);
    }
    g.lineTo(to.x, to.y).stroke({ color: 0xc5a7ff, width: 7, alpha: .95 });
    this.fxLayer.addChild(g);
    this.particles.push({ view: g, vx: 0, vy: 0, life: 150, maxLife: 150, gravity: 0 });
  }

  private popup(x: number, y: number, value: string, color: number) {
    const view = new Text({ text: value, style: { fill: color, fontSize: value.length > 5 ? 22 : 26, fontWeight: '900', fontFamily: 'Arial', stroke: { color: 0x120c12, width: 5 } } });
    view.anchor.set(.5);
    view.position.set(x, y);
    this.fxLayer.addChild(view);
    this.particles.push({ view: view as unknown as Graphics, vx: 0, vy: -1.2, life: 620, maxLife: 620, gravity: 0 });
  }

  private updateParticles(delta: number) {
    const scale = delta / 16.67;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.gravity < 0) p.view.scale.x = p.view.scale.y += -p.gravity * scale;
      else {
        p.vy += p.gravity * delta;
        p.view.x += p.vx * scale;
        p.view.y += p.vy * scale;
      }
      p.view.alpha = clamp(p.life / p.maxLife, 0, 1);
      if (p.life <= 0) {
        p.view.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  private publish(force: boolean, countdown?: number) {
    const now = performance.now();
    if (!force && now - this.snapshotAt < 100) return;
    this.snapshotAt = now;
    this.onSnapshot({
      phase: this.phase,
      wave: this.wave,
      totalWaves: this.stage.waves.length,
      baseHp: this.baseHp,
      maxBaseHp: GAME.maxBaseHp,
      scrap: this.scrap,
      score: this.score,
      combo: this.combo,
      enemiesAlive: this.enemies.size + this.enemiesRemainingToSpawn,
      inputLayout: this.inputLayout,
      flipperMotion: this.flipperMotion,
      draft: this.draft,
      rerollCost: this.rerollCost,
      takeAllCost: GAME.takeAllCost,
      placed: this.placement.map(item => ({ ...item })),
      selectedBumperId: this.selectedBumperId,
      countdown,
      resultStars: this.phase === 'victory' ? starsForHp(this.baseHp, GAME.maxBaseHp) : 0,
      pendingRewards: [...this.pendingRewards],
      buildHint: this.pendingRewards.length ? `Поставь: ${this.pendingRewards[0] === 'repair' ? 'ремонт' : BUMPERS[this.pendingRewards[0] as BumperKind].label}` : this.selectedBumperId ? 'Выбери новый сокет' : undefined,
      bossHp: [...this.enemies.values()].find(enemy => enemy.kind === 'boss')?.hp,
      bossMaxHp: [...this.enemies.values()].find(enemy => enemy.kind === 'boss')?.maxHp,
      bossRage: [...this.enemies.values()].find(enemy => enemy.kind === 'boss')?.bossRage,
    });
    if (!this.resultSent && (this.phase === 'victory' || this.phase === 'defeat')) {
      this.resultSent = true;
      const result: RunResult = {
        runId: `${this.stage.id}-${Date.now()}-${Math.round(this.random() * 1e9)}`,
        stageId: this.stage.id,
        outcome: this.debugUsed || this.loadout.debug ? 'abandoned' : this.phase === 'victory' ? 'victory' : 'defeat',
        stars: this.phase === 'victory' ? starsForHp(this.baseHp, GAME.maxBaseHp) : 0,
        baseHp: this.baseHp, maxBaseHp: GAME.maxBaseHp, score: this.score, reachedWave: this.wave,
        totalWaves: this.stage.waves.length, durationMs: Math.max(0, performance.now() - this.runStartedAt), seed: this.loadout.seed,
        deckSnapshot: this.loadout.deck.map(item => ({ ...item })),
      };
      queueMicrotask(() => this.onResult(result));
    }
  }
}
