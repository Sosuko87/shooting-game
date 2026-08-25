// ----------------------------------------
// 定数・設定
// ----------------------------------------
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 700;
const DEBUG = false; // デバッグ表示フラグ（FPSなど。trueにすると表示）

// ゲーム状態
const STATE = {
  TITLE: "title",
  PLAYING: "playing",
  GAMEOVER: "gameover",
};

// ----------------------------------------
// Canvas 初期化
// ----------------------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// ----------------------------------------
// ゲーム変数
// ----------------------------------------
let gameState = STATE.TITLE; // 現在のゲーム状態
let lastTime = 0; // 前フレームのタイムスタンプ (ms)
let fps = 0; // 現在のFPS（デバッグ表示用）
let score = 0; // プレイヤースコア

// ----------------------------------------
// ユーティリティ: オブジェクトプール取得
// ----------------------------------------
// プールから非アクティブなエントリを1つ返す（なければ null）
function acquireFromPool(pool) {
  for (const item of pool) {
    if (!item.active) return item;
  }
  return null;
}

// ----------------------------------------
// 背景演出: 星
// ----------------------------------------
// 星を生成するヘルパー（layer: 'far' | 'near'）
function createStar(layer) {
  const isFar = layer === "far";
  return {
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT, // 初期配置は画面全体
    radius: isFar ? 0.5 + Math.random() * 1.0 : 1.0 + Math.random() * 1.5,
    speed: isFar ? 20 + Math.random() * 20 : 60 + Math.random() * 40,
    alpha: isFar ? 0.3 + Math.random() * 0.2 : 0.6 + Math.random() * 0.3,
  };
}

// 奥の星（50個）・手前の星（30個）を初期化
const starsFar = Array.from({ length: 50 }, () => createStar("far"));
const starsNear = Array.from({ length: 30 }, () => createStar("near"));

// 星を更新（画面外に出たら上から再登場）
function updateStars(stars, deltaTime) {
  // レベルが上がるほど流れが速くなる（+5%/レベル）
  const mult = 1 + (gameLevel - 1) * 0.05;
  for (const s of stars) {
    s.y += s.speed * mult * deltaTime;
    if (s.y > CANVAS_HEIGHT + s.radius) {
      s.y = -s.radius;
      s.x = Math.random() * CANVAS_WIDTH;
    }
  }
}

// 星を描画
function drawStars(stars) {
  for (const s of stars) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 220, 255, ${s.alpha})`;
    ctx.fill();
  }
}

// ----------------------------------------
// 背景演出: 流れ星
// ----------------------------------------
const shootingStars = [];
let nextShootingStarTime = 3 + Math.random() * 2; // 次の流れ星まで（秒）
let shootingStarTimer = 0;

function spawnShootingStar() {
  shootingStars.push({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT * 0.4, // 画面上部から
    vx: 200 + Math.random() * 150, // 右下方向
    vy: 150 + Math.random() * 100,
    life: 0.3, // 生存時間（秒）
    maxLife: 0.3,
    trailLength: 120 + Math.random() * 60,
  });
}

function updateShootingStars(deltaTime) {
  // タイマーを進めて一定間隔で生成
  shootingStarTimer += deltaTime;
  if (shootingStarTimer >= nextShootingStarTime) {
    spawnShootingStar();
    shootingStarTimer = 0;
    nextShootingStarTime = 3 + Math.random() * 2;
  }

  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i];
    s.x += s.vx * deltaTime;
    s.y += s.vy * deltaTime;
    s.life -= deltaTime;
    if (s.life <= 0) shootingStars.splice(i, 1);
  }
}

function drawShootingStars() {
  for (const s of shootingStars) {
    const progress = 1 - s.life / s.maxLife; // 0→1 で消えていく
    const alpha = s.life / s.maxLife; // 残り寿命に応じて透明に

    // 速度ベクトルを正規化してトレイル方向を決定
    const speed = Math.hypot(s.vx, s.vy);
    const nx = s.vx / speed;
    const ny = s.vy / speed;

    // グラデーションで尾を描画
    const tx = s.x - nx * s.trailLength;
    const ty = s.y - ny * s.trailLength;
    const grad = ctx.createLinearGradient(tx, ty, s.x, s.y);
    grad.addColorStop(0, `rgba(170, 221, 255, 0)`);
    grad.addColorStop(0.6, `rgba(170, 221, 255, ${alpha * 0.4})`);
    grad.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);

    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(s.x, s.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 先端の輝点
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();
  }
}

// ----------------------------------------
// 背景演出: ネオングリッドライン
// ----------------------------------------
const GRID_LINE_COUNT = 8; // 片側のライン本数
const GRID_SPEED = 80; // 流れる速度（px/秒）
const GRID_SIDE_WIDTH = 60; // 左右グリッド領域の幅（px）
let gridOffset = 0; // ライン流れのオフセット

function updateGrid(deltaTime) {
  gridOffset =
    (gridOffset + GRID_SPEED * deltaTime) % (CANVAS_HEIGHT / GRID_LINE_COUNT);
}

// 片側のグリッドラインを描画（xStart, xEnd でどちら側か指定）
function drawGridSide(xStart, xEnd) {
  const spacing = CANVAS_HEIGHT / GRID_LINE_COUNT;
  for (let i = 0; i <= GRID_LINE_COUNT + 1; i++) {
    const y =
      ((i * spacing + gridOffset) % (CANVAS_HEIGHT + spacing)) - spacing;

    // 上に近いほど細く暗く（パースペクティブ感）
    const t = Math.max(0, y / CANVAS_HEIGHT);
    const alpha = 0.05 + t * 0.08;
    const width = 0.5 + t * 1.0;

    ctx.beginPath();
    ctx.moveTo(xStart, y);
    ctx.lineTo(xEnd, y);
    ctx.strokeStyle = `rgba(80, 160, 255, ${alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // 縦のボーダーライン
  ctx.beginPath();
  ctx.moveTo(xEnd, 0);
  ctx.lineTo(xEnd, CANVAS_HEIGHT);
  ctx.strokeStyle = "rgba(80, 160, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGrid() {
  // 左側グリッド
  drawGridSide(0, GRID_SIDE_WIDTH);
  // 右側グリッド
  drawGridSide(CANVAS_WIDTH, CANVAS_WIDTH - GRID_SIDE_WIDTH);
}

// ----------------------------------------
// プレイヤー: 定数
// ----------------------------------------
const PLAYER_SPEED = 300; // 移動速度 (px/秒)
const PLAYER_TILT_MAX = 8; // 最大傾き角度 (度)
const PLAYER_TILT_SPEED = 10; // 傾きの追従速度 (倍率/秒)
const PLAYER_MIN_Y_RATIO = 0.5; // 移動可能な上限 (画面の何割か)
const PLAYER_MAX_HP = 5; // 最大HP
const PLAYER_RADIUS = 12; // 自機の当たり判定半径 (px)
const INVINCIBLE_DURATION = 1.5; // 被弾後の無敵時間（秒）
const BLINK_INTERVAL = 6; // 無敵中の点滅間隔（フレーム数）

// エンジンパーティクルプール
const PARTICLE_POOL_SIZE = 60;
const PARTICLE_EMIT_RATE = 6; // 1秒に放出するパーティクル数

// ----------------------------------------
// プレイヤー: 状態
// ----------------------------------------
const player = {
  x: CANVAS_WIDTH / 2,
  y: CANVAS_HEIGHT - 80,
  width: 32, // 機体の横幅（半幅 = 16）
  height: 36, // 機体の縦幅
  tilt: 0, // 現在の傾き（ラジアン）
  emitTimer: 0, // パーティクル放出タイマー
  hp: PLAYER_MAX_HP,
  invincibleTimer: 0, // 残り無敵時間（秒）
  tripleShot: false, // 3WAY弾パワーアップ中
  tripleShotTimer: 0, // 残り時間（秒）
  speedBoost: false, // 速度ブーストパワーアップ中
  speedBoostTimer: 0, // 残り時間（秒）
};

// フレームカウンタ（点滅判定用）
let gameFrameCount = 0;

// プレイヤーをゲーム開始時の位置にリセット
function resetPlayer() {
  player.x = CANVAS_WIDTH / 2;
  player.y = CANVAS_HEIGHT - 80;
  player.tilt = 0;
  player.emitTimer = 0;
  player.hp = PLAYER_MAX_HP;
  player.invincibleTimer = 0;
  gameFrameCount = 0;
  screenFlash = false;
  screenShake.timer = 0;
  player.tripleShot = false;
  player.tripleShotTimer = 0;
  player.speedBoost = false;
  player.speedBoostTimer = 0;
  startAnim.phase = "none";
  startAnim.timer = 0;
  startAnim.popScale = 1.0;
  resetLevel();
  resetBullets();
  resetEnemies();
  resetEffects();
  resetBoss();
}

// ----------------------------------------
// キー入力: 押下状態管理
// ----------------------------------------
const keys = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
};

document.addEventListener("keydown", (e) => {
  if (e.key in keys) {
    keys[e.key] = true;
    e.preventDefault(); // 矢印キーによるスクロールを防止
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key in keys) keys[e.key] = false;
});

// ----------------------------------------
// エンジンパーティクル: オブジェクトプール
// ----------------------------------------
// プールを事前確保し、active フラグで使い回す
const particlePool = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  life: 0,
  maxLife: 0,
  radius: 0,
}));

// プールから非アクティブなパーティクルを1つ借りて初期化
function emitParticle(px, py) {
  const p = acquireFromPool(particlePool);
  if (!p) return; // プールが満杯の場合は何もしない（GCを起こさない）
  p.active = true;
  p.x = px + (Math.random() - 0.5) * 8;
  p.y = py;
  p.vx = (Math.random() - 0.5) * 40;
  p.vy = 80 + Math.random() * 60; // 下方向
  p.maxLife = 0.3 + Math.random() * 0.2;
  p.life = p.maxLife;
  p.radius = 3 + Math.random() * 2;
}

function updateParticles(deltaTime) {
  for (const p of particlePool) {
    if (!p.active) continue;
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.life -= deltaTime;
    if (p.life <= 0) p.active = false;
  }
}

function drawParticles() {
  for (const p of particlePool) {
    if (!p.active) continue;
    const t = p.life / p.maxLife; // 1→0 で消えていく
    const radius = p.radius * t; // 縮小
    // オレンジ→黄色のグラデーション（寿命が長いほどオレンジ）
    const r = 255;
    const g = Math.round(120 + (1 - t) * 135); // 120→255
    const a = t * 0.9;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.1, radius), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, 0, ${a})`;
    ctx.fill();
  }
}

// ----------------------------------------
// プレイヤー: 更新
// ----------------------------------------
function updatePlayer(deltaTime) {
  const minY = CANVAS_HEIGHT * PLAYER_MIN_Y_RATIO;
  const hw = player.width / 2; // 半幅
  const hh = player.height / 2; // 半高さ

  // --- 移動 ---
  let dx = 0;
  let dy = 0;
  if (keys.ArrowLeft) dx -= 1;
  if (keys.ArrowRight) dx += 1;
  if (keys.ArrowUp) dy -= 1;
  if (keys.ArrowDown) dy += 1;

  const speed = PLAYER_SPEED * (player.speedBoost ? 1.5 : 1);
  player.x += dx * speed * deltaTime;
  player.y += dy * speed * deltaTime;

  // 移動範囲を制限
  player.x = Math.max(hw, Math.min(CANVAS_WIDTH - hw, player.x));
  player.y = Math.max(minY + hh, Math.min(CANVAS_HEIGHT - hh, player.y));

  // --- 傾き: 目標角度に向けて滑らかに補間 ---
  const targetTilt = dx * ((PLAYER_TILT_MAX * Math.PI) / 180);
  player.tilt +=
    (targetTilt - player.tilt) * Math.min(1, PLAYER_TILT_SPEED * deltaTime);

  // --- エンジンパーティクル放出 ---
  player.emitTimer += deltaTime;
  const interval = 1 / PARTICLE_EMIT_RATE;
  while (player.emitTimer >= interval) {
    emitParticle(player.x, player.y + player.height * 0.4);
    player.emitTimer -= interval;
  }

  updateParticles(deltaTime);
}

// ----------------------------------------
// プレイヤー: 描画
// ----------------------------------------
function drawPlayer() {
  // 無敵中の点滅: BLINK_INTERVAL フレームごとに表示/非表示
  if (
    player.invincibleTimer > 0 &&
    Math.floor(gameFrameCount / BLINK_INTERVAL) % 2 === 1
  ) {
    return; // このフレームは非表示
  }

  // パーティクルは機体の下に描画
  drawParticles();

  const { x, y, width, height, tilt } = player;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // グロウエフェクト（速度ブースト中は緑）
  ctx.shadowColor = player.speedBoost ? "#44ff44" : "#00ffff";
  ctx.shadowBlur = 18;

  // 三角形の宇宙船（上頂点→左下→右下）
  ctx.beginPath();
  ctx.moveTo(0, -height / 2); // 機首（上）
  ctx.lineTo(-width / 2, height / 2); // 左翼端
  ctx.lineTo(0, height / 2 - 8); // エンジン中央のくびれ
  ctx.lineTo(width / 2, height / 2); // 右翼端
  ctx.closePath();

  // 塗りつぶし（シアン、少し透明）
  ctx.fillStyle = "rgba(0, 200, 220, 0.15)";
  ctx.fill();

  // 縁取り（シアン）
  ctx.strokeStyle = "#00ffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // コックピット（小さい円）
  ctx.beginPath();
  ctx.arc(0, -height / 2 + 12, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 255, 255, 0.6)";
  ctx.shadowBlur = 10;
  ctx.fill();

  ctx.restore();
}

// ----------------------------------------
// サウンド: Web Audio API
// ----------------------------------------
let audioCtx = null; // ユーザー操作後に初期化（ブラウザ制限対応）

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

// 波形ノードを作成・接続して再生（t 省略時は即時）
function createAndPlayTone(type, freq, volume, duration, t = audioCtx.currentTime) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

// ホワイトノイズノードを作成・接続して再生（t 省略時は即時）
function createAndPlayNoise(volume, duration, t = audioCtx.currentTime) {
  const bufLen = Math.ceil(audioCtx.sampleRate * duration);
  const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = buf;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(t);
  source.stop(t + duration);
}

// 発射音: 800Hz サイン波、50ms、音量0.1
function playShootSound() {
  if (!audioCtx) return;
  createAndPlayTone("sine", 800, 0.1, 0.05);
}

// 取得音: C→E→G→C アルペジオ（各50ms、音量0.15）
function playPickupSound() {
  if (!audioCtx) return;
  const freqs = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
  freqs.forEach((freq, i) => {
    createAndPlayTone("sine", freq, 0.15, 0.05, audioCtx.currentTime + i * 0.05);
  });
}

// ----------------------------------------
// 弾: 定数
// ----------------------------------------
const BULLET_POOL_SIZE = 80;
const BULLET_SPEED = 600; // px/秒（上方向）
const SHOT_INTERVAL = 0.12; // 自動連射間隔（秒）
const BULLET_W = 3;
const BULLET_H = 15;
const TRAIL_H = 20; // トレイルの長さ

// ----------------------------------------
// 弾: オブジェクトプール
// ----------------------------------------
const bulletPool = Array.from({ length: BULLET_POOL_SIZE }, () => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  pink: false,
}));

let shotTimer = 0; // 連射タイマー

// マズルフラッシュ（1フレームのみ表示）
const muzzleFlash = { active: false, x: 0, y: 0 };

// プールから弾を1つ借りて発射
function fireBullet(x, y, vx = 0, vy = -BULLET_SPEED, pink = false) {
  const b = acquireFromPool(bulletPool);
  if (!b) return;
  b.active = true;
  b.x = x;
  b.y = y;
  b.vx = vx;
  b.vy = vy;
  b.pink = pink;
}

function updateBullets(deltaTime) {
  // --- 自動連射 ---
  shotTimer += deltaTime;
  while (shotTimer >= SHOT_INTERVAL) {
    shotTimer -= SHOT_INTERVAL;

    // 発射位置は機首先端（傾きを考慮して世界座標に変換）
    const tipX = player.x + (player.height / 2) * Math.sin(player.tilt);
    const tipY = player.y - (player.height / 2) * Math.cos(player.tilt);

    if (player.tripleShot) {
      const ang = (15 * Math.PI) / 180;
      fireBullet(tipX, tipY, 0, -BULLET_SPEED, true);
      fireBullet(
        tipX,
        tipY,
        -Math.sin(ang) * BULLET_SPEED,
        -Math.cos(ang) * BULLET_SPEED,
        true,
      );
      fireBullet(
        tipX,
        tipY,
        Math.sin(ang) * BULLET_SPEED,
        -Math.cos(ang) * BULLET_SPEED,
        true,
      );
    } else {
      fireBullet(tipX, tipY);
    }
    playShootSound();

    // マズルフラッシュを1フレーム有効化
    muzzleFlash.active = true;
    muzzleFlash.x = tipX;
    muzzleFlash.y = tipY;
  }

  // --- 弾の移動・画面外判定 ---
  for (const b of bulletPool) {
    if (!b.active) continue;
    b.x += b.vx * deltaTime;
    b.y += b.vy * deltaTime;
    if (b.y < -BULLET_H || b.x < -50 || b.x > CANVAS_WIDTH + 50)
      b.active = false;
  }
}

function drawBullets() {
  ctx.save();

  for (const b of bulletPool) {
    if (!b.active) continue;

    const color = b.pink ? "#ff44ff" : "#00ffff";
    const colorA03 = b.pink
      ? "rgba(255, 68, 255, 0.3)"
      : "rgba(0, 255, 255, 0.3)";
    const colorA0 = b.pink ? "rgba(255, 68, 255, 0)" : "rgba(0, 255, 255, 0)";

    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    // 速度方向に合わせて回転して描画
    const angle = Math.atan2(b.vx, -b.vy);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);

    // --- トレイル（残像）---
    const trailGrad = ctx.createLinearGradient(
      0,
      BULLET_H,
      0,
      BULLET_H + TRAIL_H,
    );
    trailGrad.addColorStop(0, colorA03);
    trailGrad.addColorStop(1, colorA0);
    ctx.fillStyle = trailGrad;
    ctx.fillRect(-BULLET_W / 2, BULLET_H, BULLET_W, TRAIL_H);

    // --- 弾本体（レーザー）---
    ctx.fillStyle = color;
    ctx.fillRect(-BULLET_W / 2, 0, BULLET_W, BULLET_H);

    ctx.restore();
  }

  ctx.restore();
}

function drawMuzzleFlash() {
  if (!muzzleFlash.active) return;

  ctx.save();
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(muzzleFlash.x, muzzleFlash.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fill();
  ctx.restore();

  // 1フレームで消す
  muzzleFlash.active = false;
}

// 弾を全て非アクティブ化（ゲームリセット時）
function resetBullets() {
  for (const b of bulletPool) b.active = false;
  shotTimer = 0;
  muzzleFlash.active = false;
}

// ----------------------------------------
// 敵: 定数
// ----------------------------------------
const ENEMY_POOL_SIZE = 30;
const ENEMY_SPEED_Y = 150; // 下方向の移動速度 (px/秒)
const ENEMY_SINE_AMPLITUDE = 30; // 左右揺れの振幅 (px)
const ENEMY_SINE_PERIOD = 2; // 左右揺れの周期 (秒)
const ENEMY_RADIUS = 10; // 当たり判定用半径 (px)
const ENEMY_HALF = 10; // 菱形の対角線の半分 (px)
const FORMATION_CHANCE = 0.2; // 編隊出現の確率
const FORMATION_SPACING = 48; // 編隊内の敵の間隔 (px)

// ----------------------------------------
// 敵: オブジェクトプール
// ----------------------------------------
const enemyPool = Array.from({ length: ENEMY_POOL_SIZE }, () => ({
  active: false,
  type: "small", // 敵種別
  x: 0,
  y: 0,
  baseX: 0, // サイン波の中心 x 座標
  time: 0, // 個別の経過時間（サイン波用）
  phase: 0, // サイン波の初期位相（編隊内でズラせる）
  hp: 1,
  radius: ENEMY_RADIUS,
}));

let enemySpawnTimer = 0;
let nextEnemySpawnTime = 1 + Math.random(); // 1〜2秒

// プールから1体借りて初期化
function activateEnemy(x, y, phase = 0) {
  const e = acquireFromPool(enemyPool);
  if (!e) return; // プールが満杯なら何もしない
  e.active = true;
  e.x = x;
  e.y = y;
  e.baseX = x;
  e.time = 0;
  e.phase = phase;
  e.hp = 1;
}

// 単体 or 編隊を出現させる
function spawnEnemies() {
  if (Math.random() < getFormationChance()) {
    // --- 編隊: 5〜8体を横一列 ---
    const count = 5 + Math.floor(Math.random() * 4); // 5〜8
    const totalW = (count - 1) * FORMATION_SPACING;
    const startX = CANVAS_WIDTH / 2 - totalW / 2;
    const spawnY = -ENEMY_HALF;

    for (let i = 0; i < count; i++) {
      const ex = startX + i * FORMATION_SPACING;
      // 位相を揃えると全員同じ動きになるので少しずらす
      activateEnemy(ex, spawnY, (i / count) * Math.PI * 0.5);
    }
  } else {
    // --- 単体: ランダムな x ---
    const ex = ENEMY_HALF + Math.random() * (CANVAS_WIDTH - ENEMY_HALF * 2);
    activateEnemy(ex, -ENEMY_HALF);
  }
}

function updateEnemies(deltaTime) {
  // --- スポーンタイマー ---
  enemySpawnTimer += deltaTime;
  if (enemySpawnTimer >= nextEnemySpawnTime && spawnGraceTimer <= 0) {
    spawnEnemies();
    enemySpawnTimer = 0;
    nextEnemySpawnTime = getEnemySpawnInterval();
  }

  // --- 各敵の移動 ---
  for (const e of enemyPool) {
    if (!e.active) continue;

    e.time += deltaTime;
    e.y += ENEMY_SPEED_Y * deltaTime;

    // サイン波で左右に揺れる（baseX を中心に振動）
    e.x =
      e.baseX +
      Math.sin((e.time / ENEMY_SINE_PERIOD) * Math.PI * 2 + e.phase) *
        ENEMY_SINE_AMPLITUDE;

    // 画面下端を超えたら非アクティブに返却
    if (e.y > CANVAS_HEIGHT + ENEMY_HALF) e.active = false;
  }
}

function drawEnemies() {
  ctx.save();
  ctx.shadowColor = "#ff4444";
  ctx.shadowBlur = 14;

  for (const e of enemyPool) {
    if (!e.active) continue;

    // 菱形（上・右・下・左の4点）
    ctx.beginPath();
    ctx.moveTo(e.x, e.y - ENEMY_HALF); // 上
    ctx.lineTo(e.x + ENEMY_HALF, e.y); // 右
    ctx.lineTo(e.x, e.y + ENEMY_HALF); // 下
    ctx.lineTo(e.x - ENEMY_HALF, e.y); // 左
    ctx.closePath();

    // 半透明の赤で塗りつぶし
    ctx.fillStyle = "rgba(255, 68, 68, 0.25)";
    ctx.fill();

    // 赤い縁取り
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 中心の輝点
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 180, 180, 0.8)";
    ctx.fill();
    ctx.shadowBlur = 14; // 次の敵のために戻す
  }

  ctx.restore();
}

// 敵を全て非アクティブ化（ゲームリセット時）
function resetEnemies() {
  for (const e of enemyPool) e.active = false;
  enemySpawnTimer = 0;
  nextEnemySpawnTime = getEnemySpawnInterval();
  for (const e of mediumEnemyPool) e.active = false;
  mediumSpawnTimer = 0;
  nextMediumSpawnTime = getMediumSpawnInterval();
  for (const b of enemyBulletPool) b.active = false;
  for (const e of dashEnemyPool) e.active = false;
  dashSpawnTimer = 0;
  nextDashSpawnTime = getDashSpawnInterval();
  spawnGraceTimer = 3.0; // 開始後3秒は敵を出さない
}

// ----------------------------------------
// 中型敵: 定数
// ----------------------------------------
const MEDIUM_POOL_SIZE = 8; // 同時出現数は少なめ
const MEDIUM_RADIUS = 18; // 当たり判定 & 描画半径
const MEDIUM_SPEED = 100; // 降下速度 (px/秒)
const MEDIUM_HP = 4;
const MEDIUM_SCORE = 300;
const MEDIUM_STOP_Y = 150; // 停止するy座標
const MEDIUM_STOP_SEC = 1.0; // 停止継続時間（秒）
const MEDIUM_FIRE_DELAY = 0.3; // 停止開始から弾発射までの遅延（秒）

// ----------------------------------------
// 中型敵: オブジェクトプール
// ----------------------------------------
const mediumEnemyPool = Array.from({ length: MEDIUM_POOL_SIZE }, () => ({
  active: false,
  type: "medium",
  x: 0,
  y: 0,
  hp: MEDIUM_HP,
  radius: MEDIUM_RADIUS,
  state: "descend1", // 'descend1' | 'stop' | 'descend2'
  stateTimer: 0, // 現在のステートでの経過時間
  hasFired: false, // 停止中の発射済みフラグ
}));

let mediumSpawnTimer = 0;
let nextMediumSpawnTime = 3 + Math.random() * 2; // 3〜5秒

function activateMediumEnemy() {
  const e = acquireFromPool(mediumEnemyPool);
  if (!e) return;
  e.active = true;
  e.x = MEDIUM_RADIUS + Math.random() * (CANVAS_WIDTH - MEDIUM_RADIUS * 2);
  e.y = -MEDIUM_RADIUS;
  e.hp = MEDIUM_HP;
  e.state = "descend1";
  e.stateTimer = 0;
  e.hasFired = false;
}

function updateMediumEnemies(deltaTime) {
  // スポーンタイマー
  mediumSpawnTimer += deltaTime;
  if (mediumSpawnTimer >= nextMediumSpawnTime && spawnGraceTimer <= 0) {
    activateMediumEnemy();
    mediumSpawnTimer = 0;
    nextMediumSpawnTime = getMediumSpawnInterval();
  }

  for (const e of mediumEnemyPool) {
    if (!e.active) continue;
    e.stateTimer += deltaTime;

    if (e.state === "descend1") {
      e.y += MEDIUM_SPEED * deltaTime;
      if (e.y >= MEDIUM_STOP_Y) {
        e.y = MEDIUM_STOP_Y;
        e.state = "stop";
        e.stateTimer = 0;
      }
    } else if (e.state === "stop") {
      // 停止中: 発射タイミングを待つ
      if (!e.hasFired && e.stateTimer >= MEDIUM_FIRE_DELAY) {
        fireMediumEnemyBullets(e);
        e.hasFired = true;
      }
      if (e.stateTimer >= MEDIUM_STOP_SEC) {
        e.state = "descend2";
        e.stateTimer = 0;
      }
    } else {
      // descend2
      e.y += MEDIUM_SPEED * deltaTime;
      if (e.y > CANVAS_HEIGHT + MEDIUM_RADIUS) e.active = false;
    }
  }
}

function drawMediumEnemies() {
  for (const e of mediumEnemyPool) {
    if (!e.active) continue;

    ctx.save();
    ctx.translate(e.x, e.y);

    // グロウ
    ctx.shadowColor = "#ff8800";
    ctx.shadowBlur = 20;

    // 八角形
    const r = MEDIUM_RADIUS;
    const sides = 8;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 8;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();

    // 中心が明るいグラデーション塗り
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, "rgba(255, 220, 100, 0.9)"); // 中心: 明るいオレンジ
    grad.addColorStop(0.5, "rgba(255, 136,   0, 0.5)"); // 中間: オレンジ
    grad.addColorStop(1, "rgba(200,  60,   0, 0.1)"); // 外縁: 暗い赤
    ctx.fillStyle = grad;
    ctx.fill();

    // 縁取り
    ctx.strokeStyle = "#ff8800";
    ctx.lineWidth = 2;
    ctx.stroke();

    // HPゲージ（八角形の下に細いバー）
    const barW = r * 2;
    const hpFrac = e.hp / MEDIUM_HP;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(-r, r + 4, barW, 4);
    ctx.fillStyle = "#ff8800";
    ctx.fillRect(-r, r + 4, barW * hpFrac, 4);

    ctx.restore();
  }
}

// ----------------------------------------
// 敵弾: オブジェクトプール
// ----------------------------------------
const ENEMY_BULLET_POOL = 50;
const ENEMY_BULLET_SPEED = 200;
const ENEMY_BULLET_R = 4;

const enemyBulletPool = Array.from({ length: ENEMY_BULLET_POOL }, () => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
}));

// 中型敵が扇状に3発発射
function fireMediumEnemyBullets(e) {
  // プレイヤーへの角度を基準にする
  const baseAngle = Math.atan2(player.y - e.y, player.x - e.x);
  const offsets = [-20, 0, 20].map((deg) => (deg * Math.PI) / 180);

  for (const off of offsets) {
    const b = acquireFromPool(enemyBulletPool);
    if (!b) continue;
    const angle = baseAngle + off;
    b.active = true;
    b.x = e.x;
    b.y = e.y;
    b.vx = Math.cos(angle) * getEnemyBulletSpeed();
    b.vy = Math.sin(angle) * getEnemyBulletSpeed();
  }
}

function updateEnemyBullets(deltaTime) {
  for (const b of enemyBulletPool) {
    if (!b.active) continue;
    b.x += b.vx * deltaTime;
    b.y += b.vy * deltaTime;
    // 画面外に出たら確実に返却（全方向を広めにチェック）
    if (
      b.x < -30 ||
      b.x > CANVAS_WIDTH + 30 ||
      b.y < -30 ||
      b.y > CANVAS_HEIGHT + 30
    ) {
      b.active = false;
    }
  }
}

function drawEnemyBullets() {
  ctx.save();
  ctx.shadowColor = "#ff0000";
  ctx.shadowBlur = 8;

  for (const b of enemyBulletPool) {
    if (!b.active) continue;

    // 残像トレイル（速度の逆方向に短く引く）
    const speed = Math.hypot(b.vx, b.vy);
    const nx = b.vx / speed;
    const ny = b.vy / speed;
    const trailLen = 14;
    const trailGrad = ctx.createLinearGradient(
      b.x - nx * trailLen,
      b.y - ny * trailLen,
      b.x,
      b.y,
    );
    trailGrad.addColorStop(0, "rgba(255, 0, 0, 0)");
    trailGrad.addColorStop(1, "rgba(255, 0, 0, 0.4)");
    ctx.beginPath();
    ctx.moveTo(b.x - nx * trailLen, b.y - ny * trailLen);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = trailGrad;
    ctx.lineWidth = ENEMY_BULLET_R * 1.5;
    ctx.stroke();

    // 弾本体
    ctx.beginPath();
    ctx.arc(b.x, b.y, ENEMY_BULLET_R, 0, Math.PI * 2);
    ctx.fillStyle = "#ff2222";
    ctx.fill();
  }

  ctx.restore();
}

// ----------------------------------------
// 高速突進敵: 定数
// ----------------------------------------
const DASH_POOL_SIZE = 8;
const DASH_RADIUS = 10; // 当たり判定半径
const DASH_SPEED = 500; // 移動速度 (px/秒)
const DASH_HP = 1;
const DASH_SCORE = 200;
const DASH_TRAIL_LEN = 5; // 残像フレーム数
const DASH_H = 25; // 三角形の高さ (px)
const DASH_W = 10; // 三角形の底辺幅 (px)

// ----------------------------------------
// 高速突進敵: オブジェクトプール
// ----------------------------------------
const dashEnemyPool = Array.from({ length: DASH_POOL_SIZE }, () => ({
  active: false,
  type: "dash",
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  hp: DASH_HP,
  radius: DASH_RADIUS,
  // 残像用: 直近5フレームの位置を固定配列で管理
  trail: Array.from({ length: DASH_TRAIL_LEN }, () => ({ x: 0, y: 0 })),
  trailHead: 0, // リングバッファの書き込み位置
  trailCount: 0, // 有効エントリ数
}));

let dashSpawnTimer = 0;
let nextDashSpawnTime = 4 + Math.random() * 2; // 4〜6秒

function activateDashEnemy() {
  const e = acquireFromPool(dashEnemyPool);
  if (!e) return;
  const fromLeft = Math.random() < 0.5;
  // 進行角度: 水平から20〜50度下向き
  const downAngle = ((20 + Math.random() * 30) * Math.PI) / 180;

  e.active = true;
  e.x = fromLeft ? -DASH_H : CANVAS_WIDTH + DASH_H;
  e.y = 30 + Math.random() * 170;
  e.vx = (fromLeft ? 1 : -1) * Math.cos(downAngle) * DASH_SPEED;
  e.vy = Math.sin(downAngle) * DASH_SPEED;
  e.hp = DASH_HP;
  e.trailHead = 0;
  e.trailCount = 0;
  // 初期位置で全トレイルを埋める
  for (const t of e.trail) {
    t.x = e.x;
    t.y = e.y;
  }
}

function updateDashEnemies(deltaTime) {
  // スポーンタイマー
  dashSpawnTimer += deltaTime;
  if (dashSpawnTimer >= nextDashSpawnTime && spawnGraceTimer <= 0) {
    activateDashEnemy();
    dashSpawnTimer = 0;
    nextDashSpawnTime = getDashSpawnInterval();
  }

  for (const e of dashEnemyPool) {
    if (!e.active) continue;

    // 現在位置をリングバッファに記録してから移動
    e.trail[e.trailHead].x = e.x;
    e.trail[e.trailHead].y = e.y;
    e.trailHead = (e.trailHead + 1) % DASH_TRAIL_LEN;
    e.trailCount = Math.min(e.trailCount + 1, DASH_TRAIL_LEN);

    e.x += e.vx * deltaTime;
    e.y += e.vy * deltaTime;

    // 画面外に出たら返却（余裕をもたせる）
    if (e.x < -100 || e.x > CANVAS_WIDTH + 100 || e.y > CANVAS_HEIGHT + 100) {
      e.active = false;
    }
  }
}

// 三角形を (cx, cy) に向きを合わせて描画するヘルパー
function drawDashShape(cx, cy, vx, vy, alpha) {
  const angle = Math.atan2(vy, vx) + Math.PI / 2; // 速度方向に先端を向ける

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.moveTo(0, -DASH_H / 2); // 先端（進行方向）
  ctx.lineTo(-DASH_W / 2, DASH_H / 2); // 左後端
  ctx.lineTo(DASH_W / 2, DASH_H / 2); // 右後端
  ctx.closePath();

  ctx.restore();
}

function drawDashEnemies() {
  ctx.save();
  ctx.shadowColor = "#44ff44";
  ctx.shadowBlur = 14;

  for (const e of dashEnemyPool) {
    if (!e.active) continue;

    // --- 残像（リングバッファを古い順に描画）---
    for (let i = 0; i < e.trailCount; i++) {
      // oldest first: trailHead + i (mod len)
      const idx = (e.trailHead + i) % DASH_TRAIL_LEN;
      const age = e.trailCount - i; // 1=最古, trailCount=最新
      const alpha = (age / e.trailCount) * 0.35; // 古いほど薄い

      drawDashShape(e.trail[idx].x, e.trail[idx].y, e.vx, e.vy, alpha);
      ctx.fillStyle = `rgba(68, 255, 68, ${alpha})`;
      ctx.fill();
    }

    // --- 本体 ---
    ctx.shadowBlur = 14;
    drawDashShape(e.x, e.y, e.vx, e.vy, 1.0);

    // 半透明塗りつぶし
    ctx.fillStyle = "rgba(68, 255, 68, 0.2)";
    ctx.fill();

    // 縁取り
    ctx.strokeStyle = "#44ff44";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 14;

    drawDashShape(e.x, e.y, e.vx, e.vy, 1.0);
    ctx.stroke();
  }

  ctx.restore();
}

// ----------------------------------------
// 撃破音: Web Audio API（サイン波 + ホワイトノイズ）
// ----------------------------------------
function playDestroySound() {
  if (!audioCtx) return;
  createAndPlayTone("sine", 200, 0.15, 0.15);
  createAndPlayNoise(0.08, 0.15);
}

// ----------------------------------------
// 爆発パーティクル: オブジェクトプール
// ----------------------------------------
const EXPLOSION_POOL_SIZE = 200; // 1撃破20〜29個 × 最大同時撃破を考慮
const explosionPool = Array.from({ length: EXPLOSION_POOL_SIZE }, () => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  life: 0,
  maxLife: 0,
  radius: 0,
  hue: 0, // HSL色相（赤系: 0〜30）
}));

// baseHue: 色相の基準（赤=0, オレンジ=20, 緑=100）
// biasAngle: 方向偏りの基準角度（null=全方向）
const EXPLOSION_MAX = 200; // パーティクル上限（プールサイズと同じ）

function initExplosionParticle(p, x, y, baseHue, biasAngle) {
  const angle =
    biasAngle !== null && Math.random() < 0.7
      ? biasAngle + (Math.random() - 0.5) * ((Math.PI * 11) / 18) // ±55°
      : Math.random() * Math.PI * 2;
  const speed = 60 + Math.random() * 200;
  p.active = true;
  p.x = x;
  p.y = y;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;
  p.maxLife = 0.3 + Math.random() * 0.5;
  p.life = p.maxLife;
  p.radius = 2 + Math.random() * 4;
  p.hue = baseHue + Math.random() * 30;
}

function spawnExplosion(x, y, count = 20, baseHue = 0, biasAngle = null) {
  count += Math.floor(Math.random() * 10);
  let spawned = 0;

  // まず非アクティブなスロットを使う
  for (const p of explosionPool) {
    if (spawned >= count) break;
    if (p.active) continue;
    initExplosionParticle(p, x, y, baseHue, biasAngle);
    spawned++;
  }

  // プールが満杯なら最も寿命が短いものから上書き（古いものを消す）
  while (spawned < count) {
    let minLife = Infinity,
      minIdx = 0;
    for (let i = 0; i < explosionPool.length; i++) {
      if (explosionPool[i].life < minLife) {
        minLife = explosionPool[i].life;
        minIdx = i;
      }
    }
    initExplosionParticle(explosionPool[minIdx], x, y, baseHue, biasAngle);
    spawned++;
  }
}

function updateExplosionParticles(deltaTime) {
  for (const p of explosionPool) {
    if (!p.active) continue;
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.life -= deltaTime;
    if (p.life <= 0) p.active = false;
  }
}

function drawExplosionParticles() {
  ctx.save();
  for (const p of explosionPool) {
    if (!p.active) continue;
    const t = p.life / p.maxLife; // 1→0
    const radius = Math.max(0.1, p.radius * t); // 縮小
    const light = 50 + Math.round((1 - t) * 30); // 発生直後は赤、消える前は明るく
    ctx.shadowColor = `hsl(${p.hue}, 100%, ${light}%)`;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 100%, ${light}%, ${t})`;
    ctx.fill();
  }
  ctx.restore();
}

// ----------------------------------------
// スコアポップアップ
// ----------------------------------------
const scorePopups = []; // 少量・短命なので配列で管理

const SCORE_POPUP_MAX = 30; // 同時表示上限

function spawnScorePopup(x, y, value) {
  if (scorePopups.length >= SCORE_POPUP_MAX) scorePopups.shift(); // 古いものを削除
  scorePopups.push({
    x,
    y,
    text: `+${value}`,
    life: 0.5,
    maxLife: 0.5,
  });
}

function updateScorePopups(deltaTime) {
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    scorePopups[i].life -= deltaTime;
    if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
  }
}

function drawScorePopups() {
  ctx.save();
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of scorePopups) {
    const t = p.life / p.maxLife; // 1→0
    const offsetY = (1 - t) * 30; // 上に30px浮かぶ
    ctx.globalAlpha = t;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(p.text, p.x, p.y - offsetY);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ----------------------------------------
// コンボシステム
// ----------------------------------------
const COMBO_TIMEOUT = 1.0; // コンボ継続時間（秒）

let comboCount = 0;
let comboTimer = 0;
let comboHue = 0; // レインボー用 hue（0〜360）
let comboPop = 1.0; // ポップ演出スケール（1.0 = 通常）

// 敵撃破時: コンボを進めてボーナス込みスコアを返す
function onKill(baseScore) {
  comboCount++;
  comboTimer = COMBO_TIMEOUT;
  comboPop = 1.5;
  return Math.round(baseScore * (1 + comboCount * 0.1));
}

function updateCombo(deltaTime) {
  if (comboCount === 0) return;
  comboTimer -= deltaTime;
  if (comboTimer <= 0) {
    comboCount = 0;
    comboTimer = 0;
    comboPop = 1.0;
  }
  if (comboPop > 1.0) comboPop = Math.max(1.0, comboPop - 5 * deltaTime);
  comboHue = (comboHue + 300 * deltaTime) % 360;
}

function resetCombo() {
  comboCount = 0;
  comboTimer = 0;
  comboPop = 1.0;
  comboHue = 0;
}

// 虹色グラデーションのストップを追加するヘルパー
function addRainbowStops(grad) {
  for (let i = 0; i <= 6; i++) {
    const h = (comboHue + (i / 6) * 360) % 360;
    grad.addColorStop(i / 6, `hsla(${h}, 100%, 60%, 0.85)`);
  }
}

// 画面端レインボーフレーム（コンボ5以上）
function drawRainbowFrame() {
  if (comboCount < 5) return;
  const t = 6; // 帯の幅
  ctx.save();

  // グラデーション方向・矩形を指定して1辺を描画
  function fillRainbowRect(gx1, gy1, gx2, gy2, rx, ry, rw, rh) {
    const g = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
    addRainbowStops(g);
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  }

  fillRainbowRect(0, 0, CANVAS_WIDTH, 0,  0, 0,                CANVAS_WIDTH, t); // 上辺
  fillRainbowRect(0, 0, CANVAS_WIDTH, 0,  0, CANVAS_HEIGHT - t, CANVAS_WIDTH, t); // 下辺
  fillRainbowRect(0, 0, 0, CANVAS_HEIGHT, 0, 0,                t, CANVAS_HEIGHT); // 左辺
  fillRainbowRect(0, 0, 0, CANVAS_HEIGHT, CANVAS_WIDTH - t, 0, t, CANVAS_HEIGHT); // 右辺

  ctx.restore();
}

// コンボ数テキスト表示
function drawComboDisplay() {
  if (comboCount < 2) return;

  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT * 0.35;
  const fontSize = Math.min(40, 16 + comboCount * 2);

  let fillColor, glowColor;
  if (comboCount >= 10) {
    fillColor = `hsl(${comboHue}, 100%, 68%)`;
    glowColor = `hsl(${(comboHue + 60) % 360}, 100%, 55%)`;
  } else if (comboCount >= 5) {
    fillColor = "#ffee00";
    glowColor = "#ff9900";
  } else {
    fillColor = "#ffffff";
    glowColor = "#8888ff";
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(comboPop, comboPop);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 20;
  ctx.fillStyle = fillColor;
  ctx.fillText(`${comboCount} COMBO!`, 0, 0);
  ctx.restore();
}

// ----------------------------------------
// ヒットフラッシュ（1フレームだけ白く光る）
// ----------------------------------------
const hitFlashes = []; // [{x, y}] 描画後に毎フレームクリア

function drawHitFlashes() {
  if (hitFlashes.length === 0) return;
  ctx.save();
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  for (const f of hitFlashes) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius ?? ENEMY_HALF, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  hitFlashes.length = 0; // 1フレームで消去
}

// ----------------------------------------
// パワーアップアイテム
// ----------------------------------------
const POWERUP_SPEED = 50; // 落下速度 (px/秒)
const POWERUP_RADIUS = 12; // 六角形の半径 & 取得判定半径
const POWERUP_DURATION = 15; // 持続時間（秒）
const POWERUP_DROP_CHANCE = 0.3; // 中型敵撃破時ドロップ確率
const POWERUP_COLORS = { W: "#ffff00", S: "#44ff44", B: "#ff4444" };

const powerups = [];

function spawnPowerup(x, y) {
  const types = ["W", "S", "B"];
  const type = types[Math.floor(Math.random() * 3)];
  powerups.push({
    x,
    y,
    type,
    color: POWERUP_COLORS[type],
    angle: 0,
    hueShift: 0,
  });
}

function updatePowerups(deltaTime) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y += POWERUP_SPEED * deltaTime;
    p.angle += 1.5 * deltaTime;
    p.hueShift = (p.hueShift + 180 * deltaTime) % 360;
    if (p.y > CANVAS_HEIGHT + POWERUP_RADIUS) powerups.splice(i, 1);
  }
}

function drawPowerups() {
  for (const p of powerups) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    // 虹色グロウ
    ctx.shadowColor = `hsl(${p.hueShift}, 100%, 60%)`;
    ctx.shadowBlur = 14;

    // 六角形
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * POWERUP_RADIUS;
      const py = Math.sin(a) * POWERUP_RADIUS;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();

    // 虹色グラデーション縁取り
    const grad = ctx.createLinearGradient(
      -POWERUP_RADIUS,
      0,
      POWERUP_RADIUS,
      0,
    );
    grad.addColorStop(0, `hsl(${p.hueShift}, 100%, 65%)`);
    grad.addColorStop(0.33, `hsl(${(p.hueShift + 120) % 360}, 100%, 65%)`);
    grad.addColorStop(0.66, `hsl(${(p.hueShift + 240) % 360}, 100%, 65%)`);
    grad.addColorStop(1, `hsl(${p.hueShift}, 100%, 65%)`);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fill();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 中央アルファベット（回転させない）
    ctx.rotate(-p.angle);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = p.color;
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.type, 0, 0);

    ctx.restore();
  }
}

// ----------------------------------------
// 衝撃波（アイテム取得時）
// ----------------------------------------
const shockwaves = [];

function spawnShockwave() {
  shockwaves.push({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    radius: 0,
    life: 0.3,
    maxLife: 0.3,
  });
}

function updateShockwaves(deltaTime) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.life -= deltaTime;
    sw.radius = (1 - sw.life / sw.maxLife) * 200;
    if (sw.life <= 0) shockwaves.splice(i, 1);
  }
}

function drawShockwaves() {
  ctx.save();
  for (const sw of shockwaves) {
    const alpha = sw.life / sw.maxLife;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 15;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ----------------------------------------
// ボム演出
// ----------------------------------------
const bombEffect = { active: false, radius: 0, life: 0, maxLife: 0.5 };
const BOMB_MAX_RADIUS = 520;

function updateBombEffect(deltaTime) {
  if (!bombEffect.active) return;
  bombEffect.life -= deltaTime;
  bombEffect.radius =
    (1 - bombEffect.life / bombEffect.maxLife) * BOMB_MAX_RADIUS;
  if (bombEffect.life <= 0) bombEffect.active = false;
}

function drawBombEffect() {
  if (!bombEffect.active) return;
  const alpha = bombEffect.life / bombEffect.maxLife;
  ctx.save();
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 40;
  // 太いリング
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
  ctx.lineWidth = 24;
  ctx.beginPath();
  ctx.arc(
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    bombEffect.radius,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  // 細い先端リング
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function activateBomb() {
  for (const e of enemyPool) {
    if (!e.active) continue;
    spawnExplosion(e.x, e.y, 20, 0);
    playDestroySound();
    e.active = false;
  }
  for (const e of mediumEnemyPool) {
    if (!e.active) continue;
    spawnExplosion(e.x, e.y, 30, 20);
    playDestroySound();
    e.active = false;
  }
  for (const e of dashEnemyPool) {
    if (!e.active) continue;
    spawnExplosion(e.x, e.y, 20, 100, Math.atan2(e.vy, e.vx));
    playDestroySound();
    e.active = false;
  }
  for (const b of enemyBulletPool) b.active = false;
  bombEffect.active = true;
  bombEffect.radius = 0;
  bombEffect.life = bombEffect.maxLife;
}

// ----------------------------------------
// アイテム取得判定
// ----------------------------------------
function checkPowerupCollisions() {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    const dx = p.x - player.x,
      dy = p.y - player.y;
    if (Math.hypot(dx, dy) < POWERUP_RADIUS + PLAYER_RADIUS) {
      if (p.type === "W") {
        player.tripleShot = true;
        player.tripleShotTimer = POWERUP_DURATION;
      } else if (p.type === "S") {
        player.speedBoost = true;
        player.speedBoostTimer = POWERUP_DURATION;
      } else if (p.type === "B") {
        activateBomb();
      }
      spawnShockwave();
      playPickupSound();
      powerups.splice(i, 1);
    }
  }
}

// ----------------------------------------
// ボス敵
// ----------------------------------------
const BOSS_HP = 30;
const BOSS_RADIUS = 30;
const BOSS_DRAW_R = 35;
const BOSS_SCORE_VAL = 3000;
const BOSS_SPEED = 80;
const BOSS_Y = 80;
const BOSS_THRESHOLD = 3000;

let nextBossScore = BOSS_THRESHOLD;
let hitStopTimer = 0;

const boss = {
  active: false,
  x: CANVAS_WIDTH / 2,
  y: -BOSS_DRAW_R,
  vx: BOSS_SPEED,
  hp: BOSS_HP,
  radius: BOSS_RADIUS,
  pattern: "A",
  patternTimer: 0,
  patternAShots: 0,
  patternCSummoned: false,
  laserPhase: "aim",
  laserTimer: 0,
  laserAngle: 0,
  aura: Array.from({ length: 7 }, (_, i) => ({
    angle: (i / 7) * Math.PI * 2,
    dist: 32 + Math.random() * 12,
    orbitSpeed: 0.5 + Math.random() * 1.0,
    size: 2 + Math.random() * 3,
    alphaCycle: Math.random() * Math.PI * 2,
  })),
};

const bossIntro = { phase: "none", timer: 0, blinkOn: true };
const bossFlash = { active: false, alpha: 0, timer: 0 };
const bossText = { active: false, alpha: 0, timer: 0 };

function isBossPresent() {
  return boss.active || bossIntro.phase !== "none";
}

// ボス出現BGM（60Hzパルス×8、1秒）
function playBossIntroSound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(60, t);
  gain.gain.setValueAtTime(0, t);
  for (let i = 0; i < 8; i++) {
    const pt = t + i * 0.125;
    gain.gain.setValueAtTime(0.15, pt);
    gain.gain.setValueAtTime(0.01, pt + 0.1);
  }
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 1.1);
}

// ボス撃破音（80Hz長い減衰 + ノイズ、500ms）
function playBossDestroySound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  // 周波数スイープ付きのサイン波（createAndPlayTone では設定できないため直接生成）
  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
  oscGain.gain.setValueAtTime(0.25, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.5);
  createAndPlayNoise(0.15, 0.5, t);
}

// 全方位16発発射
function fireBossOmni() {
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const b = acquireFromPool(enemyBulletPool);
    if (!b) continue;
    b.active = true;
    b.x = boss.x;
    b.y = boss.y;
    b.vx = Math.cos(angle) * getEnemyBulletSpeed();
    b.vy = Math.sin(angle) * getEnemyBulletSpeed();
  }
}

// パターン切り替え
function advanceBossPattern() {
  boss.patternTimer = 0;
  boss.patternAShots = 0;
  boss.patternCSummoned = false;
  boss.laserPhase = "aim";
  boss.laserTimer = 0;
  if (boss.pattern === "A") boss.pattern = "B";
  else if (boss.pattern === "B") boss.pattern = "C";
  else boss.pattern = "A";
}

// ボス出現チェック（updatePlayingから毎フレーム呼ぶ）
function checkBossSpawn() {
  if (boss.active || bossIntro.phase !== "none") return;
  if (score >= nextBossScore) {
    bossIntro.phase = "warning";
    bossIntro.timer = 0;
    bossIntro.blinkOn = true;
  }
}

function updateBossIntro(deltaTime) {
  if (bossIntro.phase === "none") return;
  bossIntro.timer += deltaTime;

  if (bossIntro.phase === "warning") {
    bossIntro.blinkOn = Math.floor(bossIntro.timer / 0.2) % 2 === 0;
    if (bossIntro.timer >= 2.0) {
      bossIntro.phase = "blackout";
      bossIntro.timer = 0;
      playBossIntroSound();
    }
  } else if (bossIntro.phase === "blackout") {
    if (bossIntro.timer >= 0.3) {
      bossIntro.phase = "entering";
      bossIntro.timer = 0;
      boss.x = CANVAS_WIDTH / 2;
      boss.y = -BOSS_DRAW_R;
      boss.vx = BOSS_SPEED;
      boss.hp = BOSS_HP;
      boss.pattern = "A";
      boss.patternTimer = 0;
      boss.patternAShots = 0;
      boss.patternCSummoned = false;
      boss.laserPhase = "aim";
      boss.laserTimer = 0;
    }
  } else if (bossIntro.phase === "entering") {
    boss.y += 60 * deltaTime;
    if (boss.y >= BOSS_Y) {
      boss.y = BOSS_Y;
      boss.active = true;
      bossIntro.phase = "none";
      nextBossScore += BOSS_THRESHOLD;
    }
  }
}

function updateBoss(deltaTime) {
  if (!boss.active) return;

  // 左右往復
  boss.x += boss.vx * deltaTime;
  if (boss.x > CANVAS_WIDTH - BOSS_DRAW_R) {
    boss.x = CANVAS_WIDTH - BOSS_DRAW_R;
    boss.vx = -BOSS_SPEED;
  }
  if (boss.x < BOSS_DRAW_R) {
    boss.x = BOSS_DRAW_R;
    boss.vx = BOSS_SPEED;
  }

  // オーラ更新
  for (const a of boss.aura) {
    a.angle += a.orbitSpeed * deltaTime;
    a.alphaCycle += 2.5 * deltaTime;
  }

  // パターンタイマー
  boss.patternTimer += deltaTime;
  if (boss.patternTimer >= 3.0) advanceBossPattern();

  // パターンA: 全方位16発 ×2
  if (boss.pattern === "A") {
    if (boss.patternAShots === 0 && boss.patternTimer >= 0.5) {
      fireBossOmni();
      boss.patternAShots = 1;
    }
    if (boss.patternAShots === 1 && boss.patternTimer >= 2.0) {
      fireBossOmni();
      boss.patternAShots = 2;
    }
  }

  // パターンB: 予告1秒 → 照射0.5秒
  if (boss.pattern === "B") {
    if (boss.laserPhase === "aim") {
      boss.laserAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
      boss.laserTimer += deltaTime;
      if (boss.laserTimer >= 1.0) {
        boss.laserPhase = "fire";
        boss.laserTimer = 0;
      }
    } else if (boss.laserPhase === "fire") {
      boss.laserTimer += deltaTime;
      if (boss.laserTimer >= 0.5) boss.laserPhase = "done";
    }
  }

  // パターンC: ザコ3体召喚（1回のみ）
  if (boss.pattern === "C" && !boss.patternCSummoned) {
    boss.patternCSummoned = true;
    activateEnemy(boss.x - 60, boss.y + 20);
    activateEnemy(boss.x, boss.y + 20);
    activateEnemy(boss.x + 60, boss.y + 20);
  }
}

// ボス撃破処理
function destroyBoss() {
  boss.active = false;
  hitStopTimer = 0.3;
  spawnExplosion(boss.x, boss.y, 50, 280, null); // 紫
  spawnExplosion(boss.x, boss.y, 40, 0, null); // 白系
  bossFlash.active = true;
  bossFlash.alpha = 1;
  bossFlash.timer = 0;
  bossText.active = true;
  bossText.alpha = 1;
  bossText.timer = 0;
  screenShake.timer = 0.5;
  screenShake.intensity = 10;
  const bossActual = onKill(BOSS_SCORE_VAL);
  spawnScorePopup(boss.x, boss.y, bossActual);
  score += bossActual;
  playBossDestroySound();
}

function updateBossDestroyEffects(deltaTime) {
  if (bossFlash.active) {
    bossFlash.timer += deltaTime;
    bossFlash.alpha = Math.max(0, 1 - bossFlash.timer / 0.5);
    if (bossFlash.timer >= 0.5) bossFlash.active = false;
  }
  if (bossText.active) {
    bossText.timer += deltaTime;
    bossText.alpha = Math.max(0, 1 - bossText.timer / 1.5);
    if (bossText.timer >= 1.5) bossText.active = false;
  }
}

// 弾 vs ボスの衝突判定
function checkBossCollisions() {
  if (!boss.active) return;
  for (const b of bulletPool) {
    if (!b.active) continue;
    const dx = b.x - boss.x,
      dy = b.y - boss.y;
    if (Math.hypot(dx, dy) < BULLET_RADIUS + BOSS_RADIUS) {
      b.active = false;
      boss.hp -= 1;
      hitFlashes.push({ x: boss.x, y: boss.y, radius: BOSS_RADIUS });
      if (boss.hp <= 0) destroyBoss();
    }
  }
}

// プレイヤー vs ボス / レーザー衝突判定
function checkBossPlayerCollision() {
  if (!boss.active || player.invincibleTimer > 0) return;
  const dx = boss.x - player.x,
    dy = boss.y - player.y;
  if (Math.hypot(dx, dy) < BOSS_RADIUS + PLAYER_RADIUS) {
    damagePlayer();
    return;
  }
  if (boss.pattern === "B" && boss.laserPhase === "fire") {
    const lx = Math.cos(boss.laserAngle);
    const ly = Math.sin(boss.laserAngle);
    const px = player.x - boss.x;
    const py = player.y - boss.y;
    const dot = px * lx + py * ly;
    const perp = Math.abs(px * ly - py * lx);
    if (dot > 0 && perp < PLAYER_RADIUS + 5) damagePlayer();
  }
}

// ボス描画
function drawBoss() {
  if (!boss.active && bossIntro.phase !== "entering") return;
  const bx = boss.x,
    by = boss.y;
  const r = BOSS_DRAW_R;

  // HP に応じた色（紫 → 赤）
  const hpFrac = boss.hp / BOSS_HP;
  const rr = Math.round(0xcc + (0xff - 0xcc) * (1 - hpFrac));
  const gg = Math.round(0x44 * hpFrac);
  const bbc = Math.round(0xff * hpFrac);
  const bossColor = `rgb(${rr},${gg},${bbc})`;

  ctx.save();
  ctx.translate(bx, by);

  // オーラパーティクル
  for (const a of boss.aura) {
    const ax = Math.cos(a.angle) * a.dist;
    const ay = Math.sin(a.angle) * a.dist;
    const aa = 0.3 + Math.abs(Math.sin(a.alphaCycle)) * 0.5;
    ctx.beginPath();
    ctx.arc(ax, ay, a.size, 0, Math.PI * 2);
    ctx.shadowColor = "#cc44ff";
    ctx.shadowBlur = 8;
    ctx.fillStyle = `rgba(180, 60, 255, ${aa})`;
    ctx.fill();
  }

  ctx.shadowColor = bossColor;
  ctx.shadowBlur = 25;

  // ひし形1（直立）
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.75, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.75, 0);
  ctx.closePath();
  ctx.fillStyle = `rgba(${rr},${gg},${bbc},0.2)`;
  ctx.fill();
  ctx.strokeStyle = bossColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // ひし形2（45度回転）
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.78);
  ctx.lineTo(r * 0.58, 0);
  ctx.lineTo(0, r * 0.78);
  ctx.lineTo(-r * 0.58, 0);
  ctx.closePath();
  ctx.fillStyle = `rgba(${rr},${gg},${bbc},0.15)`;
  ctx.fill();
  ctx.strokeStyle = bossColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 中心輝点（回転を戻す）
  ctx.rotate(-Math.PI / 4);
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rr},${gg},${bbc},0.95)`;
  ctx.shadowBlur = 15;
  ctx.fill();

  ctx.restore();

  // HPバー（ボス本体上）
  if (boss.active) {
    const barW = r * 2.2;
    const barX = bx - barW / 2;
    const barY = by - r - 12;
    const fillW = barW * hpFrac;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(barX, barY, barW, 5);
    const barColor =
      hpFrac > 0.6 ? "#44ff44" : hpFrac > 0.3 ? "#ffee00" : "#ff3322";
    ctx.fillStyle = barColor;
    ctx.shadowColor = barColor;
    ctx.shadowBlur = 4;
    ctx.fillRect(barX, barY, fillW, 5);
    ctx.restore();
  }

  // レーザー描画
  if (boss.active && boss.pattern === "B" && boss.laserPhase !== "done") {
    const lx = Math.cos(boss.laserAngle);
    const ly = Math.sin(boss.laserAngle);
    ctx.save();
    if (boss.laserPhase === "aim") {
      ctx.strokeStyle = "rgba(255, 60, 60, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
    } else {
      ctx.strokeStyle = "rgba(255, 100, 80, 0.92)";
      ctx.lineWidth = 10;
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 25;
    }
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(
      bx + lx * (CANVAS_HEIGHT + 100),
      by + ly * (CANVAS_HEIGHT + 100),
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// WARNING! / 暗転 演出
function drawBossIntroEffects() {
  if (bossIntro.phase === "warning" && bossIntro.blinkOn) {
    ctx.save();
    ctx.fillStyle = "#ff2200";
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur = 20;
    ctx.font = "bold 38px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WARNING!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.restore();
  }
  if (bossIntro.phase === "blackout") {
    const a = Math.min(1, bossIntro.timer / 0.3) * 0.85;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
}

// 撃破演出（白閃光 + BOSS DESTROYED!）
function drawBossDestroyEffects() {
  if (bossFlash.active) {
    ctx.fillStyle = `rgba(255,255,255,${bossFlash.alpha})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  if (bossText.active) {
    ctx.save();
    ctx.globalAlpha = bossText.alpha;
    ctx.fillStyle = "#ffff00";
    ctx.shadowColor = "#ffff00";
    ctx.shadowBlur = 22;
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BOSS DESTROYED!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ボスリセット
function resetBoss() {
  boss.active = false;
  boss.hp = BOSS_HP;
  bossIntro.phase = "none";
  bossIntro.timer = 0;
  bossFlash.active = false;
  bossText.active = false;
  hitStopTimer = 0;
  nextBossScore = BOSS_THRESHOLD;
}

// ----------------------------------------
// 衝突判定: 弾 vs 敵（円形）
// ----------------------------------------
const BULLET_RADIUS = BULLET_W / 2; // 弾の当たり判定半径

// 自機の弾がプール内の敵に当たったとき共通処理
function onBulletHitEnemy(
  b,
  e,
  scoreValue,
  explodeCount,
  explodeHue,
  biasAngle = null,
) {
  b.active = false;
  e.hp -= 1;
  if (e.hp <= 0) {
    hitFlashes.push({ x: e.x, y: e.y, radius: e.radius });
    e.active = false;
    spawnExplosion(e.x, e.y, explodeCount, explodeHue, biasAngle);
    const actual = onKill(scoreValue);
    spawnScorePopup(e.x, e.y, actual);
    score += actual;
    playDestroySound();
  } else {
    hitFlashes.push({ x: e.x, y: e.y, radius: e.radius });
  }
}

function checkCollisions() {
  for (const b of bulletPool) {
    if (!b.active) continue;
    let hit = false;

    // ザコ敵との判定
    for (const e of enemyPool) {
      if (!e.active) continue;
      const dx = b.x - e.x,
        dy = b.y - e.y;
      if (Math.hypot(dx, dy) < BULLET_RADIUS + e.radius) {
        onBulletHitEnemy(b, e, 100, 20, 0); // 赤爆発
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // 中型敵との判定
    for (const e of mediumEnemyPool) {
      if (!e.active) continue;
      const dx = b.x - e.x,
        dy = b.y - e.y;
      if (Math.hypot(dx, dy) < BULLET_RADIUS + e.radius) {
        onBulletHitEnemy(b, e, MEDIUM_SCORE, 30, 20); // オレンジ爆発
        if (!e.active) {
          screenShake.timer = 0.15;
          screenShake.intensity = 3;
          if (Math.random() < POWERUP_DROP_CHANCE) spawnPowerup(e.x, e.y);
        }
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // 突進敵との判定
    for (const e of dashEnemyPool) {
      if (!e.active) continue;
      const dx = b.x - e.x,
        dy = b.y - e.y;
      if (Math.hypot(dx, dy) < BULLET_RADIUS + e.radius) {
        const biasAngle = Math.atan2(e.vy, e.vx); // 進行方向に爆発を偏らせる
        onBulletHitEnemy(b, e, DASH_SCORE, 20, 100, biasAngle); // 緑爆発
        break;
      }
    }
  }
}

// ----------------------------------------
// レベルシステム
// ----------------------------------------
const LEVEL_UP_INTERVAL = 30; // 秒
const MAX_LEVEL = 10;

let gameLevel = 1;
let levelTimer = 0;
let spawnGraceTimer = 0; // 開始直後の敵出現猶予（秒）

const levelUpAnim = { active: false, timer: 0, level: 1 };

// level 1〜MAX_LEVEL の線形補間
function levelLerp(minVal, maxVal) {
  const t = (gameLevel - 1) / (MAX_LEVEL - 1);
  return minVal + (maxVal - minVal) * t;
}

function getEnemySpawnInterval() {
  const base = levelLerp(1.5, 0.4);
  const bossMult = isBossPresent() ? 2.0 : 1.0; // ボス戦中は半分の頻度
  return base * bossMult * (0.85 + Math.random() * 0.3);
}

function getMediumSpawnInterval() {
  const base = levelLerp(5.0, 2.0);
  const bossMult = isBossPresent() ? 2.0 : 1.0; // ボス戦中は半分の頻度
  return base * bossMult * (0.85 + Math.random() * 0.3);
}

function getDashSpawnInterval() {
  const base = levelLerp(6.0, 2.0);
  return base * (0.85 + Math.random() * 0.3);
}

function getFormationChance() {
  return levelLerp(0.2, 0.5);
}

function getEnemyBulletSpeed() {
  return levelLerp(200, 350);
}

// レベルアップ音（C+E 和音、200ms、音量0.2）
function playLevelUpSound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [261.63, 329.63].forEach((freq) => createAndPlayTone("sine", freq, 0.2, 0.2, t));
}

function updateLevel(deltaTime) {
  if (gameLevel >= MAX_LEVEL) return;
  levelTimer += deltaTime;
  if (levelTimer >= LEVEL_UP_INTERVAL) {
    levelTimer -= LEVEL_UP_INTERVAL;
    gameLevel++;
    levelUpAnim.active = true;
    levelUpAnim.timer = 0;
    levelUpAnim.level = gameLevel;
    playLevelUpSound();
  }
}

function updateLevelUpAnim(deltaTime) {
  if (!levelUpAnim.active) return;
  levelUpAnim.timer += deltaTime;
  if (levelUpAnim.timer >= 1.5) levelUpAnim.active = false;
}

function resetLevel() {
  gameLevel = 1;
  levelTimer = 0;
  levelUpAnim.active = false;
  levelUpAnim.timer = 0;
}

// LEVEL X! ズームイン→停止→フェードアウト
function drawLevelUpAnim() {
  if (!levelUpAnim.active) return;
  const t = levelUpAnim.timer;
  let scale, alpha;
  if (t < 0.5) {
    scale = 0.3 + (t / 0.5) * 0.7;
    alpha = t / 0.5;
  } else if (t < 1.0) {
    scale = 1.0;
    alpha = 1.0;
  } else {
    scale = 1.0;
    alpha = Math.max(0, 1.0 - (t - 1.0) / 0.5);
  }
  ctx.save();
  ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 44px monospace";
  ctx.shadowColor = "#00ffff";
  ctx.shadowBlur = 25;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`LEVEL ${levelUpAnim.level}!`, 0, 0);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// レベル表示（右上）
function drawLevel() {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#00ffff";
  ctx.shadowBlur = 8;
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(`LV.${gameLevel}`, CANVAS_WIDTH - 10, 10);
  ctx.restore();
}

// ----------------------------------------
// スコア表示
// ----------------------------------------
function drawScore() {
  ctx.save();
  ctx.shadowColor = "#00ffff";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`SCORE: ${score}`, 10, 10);
  ctx.restore();
}

// 演出を全リセット（ゲームリセット時）
function resetEffects() {
  for (const p of explosionPool) p.active = false;
  scorePopups.length = 0;
  hitFlashes.length = 0;
  powerups.length = 0;
  shockwaves.length = 0;
  bombEffect.active = false;
  resetCombo();
  score = 0;
}

// ----------------------------------------
// 被弾音: ノイズ + 周波数スイープ
// ----------------------------------------
function playDamageSound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;

  // 周波数が下がるスイープ（800Hz → 100Hz、createAndPlayTone では設定できないため直接生成）
  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
  oscGain.gain.setValueAtTime(0.2, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.1);

  createAndPlayNoise(0.15, 0.1, t);
}

// ----------------------------------------
// スクリーンシェイク / 画面フラッシュ
// ----------------------------------------
const screenShake = { timer: 0, duration: 0.2, intensity: 5 };
let screenFlash = false; // 被弾時の赤フラッシュフラグ（1フレーム）

// ----------------------------------------
// 被弾処理
// ----------------------------------------
function damagePlayer() {
  if (player.invincibleTimer > 0) return; // 無敵中は無効

  player.hp -= 1;
  player.invincibleTimer = INVINCIBLE_DURATION;
  screenFlash = true;
  screenShake.timer = screenShake.duration;
  screenShake.intensity = 5; // 被弾時は強め

  playDamageSound();

  if (player.hp <= 0) {
    player.hp = 0;
    spawnExplosion(player.x, player.y, 40, 0);
    initGameOver(score);
    gameState = STATE.GAMEOVER;
  }
}

// ----------------------------------------
// 衝突判定: 敵 vs 自機
// ----------------------------------------

// オブジェクト (x, y) がプレイヤーの当たり判定に触れているか確認
function hitsPlayer(x, y, radius) {
  return Math.hypot(x - player.x, y - player.y) < radius + PLAYER_RADIUS;
}

function checkPlayerCollisions() {
  if (player.invincibleTimer > 0) return; // 無敵中はスキップ

  // ザコ敵との接触
  for (const e of enemyPool) {
    if (!e.active) continue;
    if (hitsPlayer(e.x, e.y, e.radius)) {
      e.active = false;
      spawnExplosion(e.x, e.y);
      playDestroySound();
      damagePlayer();
      return;
    }
  }

  // 中型敵との接触
  for (const e of mediumEnemyPool) {
    if (!e.active) continue;
    if (hitsPlayer(e.x, e.y, e.radius)) {
      e.active = false;
      spawnExplosion(e.x, e.y, 30, 20); // オレンジ爆発
      playDestroySound();
      damagePlayer();
      return;
    }
  }

  // 突進敵との接触
  for (const e of dashEnemyPool) {
    if (!e.active) continue;
    if (hitsPlayer(e.x, e.y, e.radius)) {
      const biasAngle = Math.atan2(e.vy, e.vx);
      e.active = false;
      spawnExplosion(e.x, e.y, 20, 100, biasAngle); // 緑、進行方向に散る
      playDestroySound();
      damagePlayer();
      return;
    }
  }

  // 敵弾との接触
  for (const b of enemyBulletPool) {
    if (!b.active) continue;
    if (hitsPlayer(b.x, b.y, ENEMY_BULLET_R)) {
      b.active = false;
      damagePlayer();
      return;
    }
  }
}

// ----------------------------------------
// HP 表示
// ----------------------------------------
function drawHp() {
  ctx.save();

  // HP ❤ アイコン（スコア下 y=32）
  ctx.shadowColor = "#ff4444";
  ctx.shadowBlur = 10;
  ctx.font = "16px monospace";
  ctx.textBaseline = "top";
  for (let i = 0; i < PLAYER_MAX_HP; i++) {
    ctx.fillStyle = i < player.hp ? "#ff4444" : "rgba(255,68,68,0.2)";
    ctx.fillText("❤", 10 + i * 20, 32);
  }

  // パワーアップタイマーバー（y=54 から）
  const barX = 10;
  const barMaxW = 100;
  let barY = 54;

  function drawTimerBar(label, frac, color) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(barX, barY, barMaxW, 5);
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, barMaxW * frac, 5);
    ctx.font = "bold 9px monospace";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(label, barX + barMaxW + 5, barY + 2.5);
    barY += 11;
  }

  if (player.tripleShot)
    drawTimerBar("W", player.tripleShotTimer / POWERUP_DURATION, "#ffff00");
  if (player.speedBoost)
    drawTimerBar("S", player.speedBoostTimer / POWERUP_DURATION, "#44ff44");

  ctx.restore();
}

// ----------------------------------------
// 画面赤フラッシュ（被弾時・1フレーム）
// ----------------------------------------
function drawScreenFlash() {
  if (!screenFlash) return;
  ctx.fillStyle = "rgba(255, 0, 0, 0.35)";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  screenFlash = false; // 次フレームでは描画しない
}

// ----------------------------------------
// 描画: 背景（単色塗りつぶし + 演出一式）
// ----------------------------------------
function drawBackground(deltaTime) {
  // ボス戦中は背景を紫がかりにする
  ctx.fillStyle = isBossPresent() ? "#110830" : "#0a0a2e";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 演出を更新してから描画
  updateStars(starsFar, deltaTime);
  updateStars(starsNear, deltaTime);
  updateShootingStars(deltaTime);
  updateGrid(deltaTime);

  drawStars(starsFar);
  drawGrid();
  drawStars(starsNear);
  drawShootingStars();
}

// ----------------------------------------
// 描画: FPS（デバッグ）
// ----------------------------------------
function drawFps() {
  if (!DEBUG) return;
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(`FPS: ${fps}`, 8, CANVAS_HEIGHT - 8);
}

// ----------------------------------------
// タイトル演出
// ----------------------------------------
let titleTime = 0; // タイトル画面の経過時間

// ----------------------------------------
// ゲーム開始演出（READY → GO!）
// ----------------------------------------
const startAnim = { phase: "none", timer: 0, popScale: 1.0 };

function updateStartAnim(deltaTime) {
  startAnim.timer += deltaTime;
  if (startAnim.phase === "ready" && startAnim.timer >= 0.7) {
    startAnim.phase = "go";
    startAnim.timer = 0;
    startAnim.popScale = 1.4;
  } else if (startAnim.phase === "go") {
    startAnim.popScale = Math.max(1.0, startAnim.popScale - 3 * deltaTime);
    if (startAnim.timer >= 0.5) startAnim.phase = "none";
  }
}

function drawStartAnim() {
  if (startAnim.phase === "none") return;
  const cx = CANVAS_WIDTH / 2,
    cy = CANVAS_HEIGHT / 2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (startAnim.phase === "ready") {
    ctx.globalAlpha = Math.min(1, startAnim.timer / 0.15);
    ctx.font = "bold 40px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 18;
    ctx.fillText("READY", cx, cy);
  } else {
    ctx.globalAlpha = Math.max(0, 1 - startAnim.timer / 0.5);
    ctx.translate(cx, cy);
    ctx.scale(startAnim.popScale, startAnim.popScale);
    ctx.font = "bold 40px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#00ffff";
    ctx.shadowBlur = 22;
    ctx.fillText("GO!", 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ----------------------------------------
// ゲームオーバー演出
// ----------------------------------------
const gameOverState = {
  darkAlpha: 0,
  scoreDisplay: 0,
  finalScore: 0,
  glitchTimer: 0,
  glitchX: 2,
  glitchY: 0,
  breathTimer: 0,
};

function initGameOver(finalScore) {
  gameOverState.darkAlpha = 0;
  gameOverState.scoreDisplay = 0;
  gameOverState.finalScore = finalScore;
  gameOverState.glitchTimer = 0;
  gameOverState.glitchX = 2;
  gameOverState.glitchY = 0;
  gameOverState.breathTimer = 0;
}

// ----------------------------------------
// 描画: タイトル画面
// ----------------------------------------
function drawTitle() {
  const cx = CANVAS_WIDTH / 2,
    cy = CANVAS_HEIGHT / 2;

  // ネオンチラチラ（複数sin波で非周期的ゆらぎ）
  const flicker =
    12 +
    Math.sin(titleTime * 7.3) * 4 +
    Math.sin(titleTime * 13.7) * 3 +
    Math.sin(titleTime * 31.1) * 2;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // タイトル（グロウ二重描き）
  ctx.font = "bold 36px monospace";
  ctx.shadowColor = "#00ffff";
  ctx.shadowBlur = flicker * 2.2;
  ctx.fillStyle = "rgba(0, 255, 255, 0.28)";
  ctx.fillText("SPACE SHOOTER", cx, cy - 50);
  ctx.shadowBlur = flicker;
  ctx.fillStyle = "#00ffff";
  ctx.fillText("SPACE SHOOTER", cx, cy - 50);

  // サブタイトル明滅（sin波で呼吸）
  const breathA = 0.3 + 0.35 * (1 + Math.sin(titleTime * 2.5 - Math.PI / 2));
  ctx.globalAlpha = breathA;
  ctx.font = "18px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
  ctx.shadowBlur = 6;
  ctx.fillText("PRESS SPACE TO START", cx, cy + 20);
  ctx.globalAlpha = 1;

  ctx.restore();
}

// ----------------------------------------
// 描画: プレイ画面
// ----------------------------------------
function drawPlaying() {
  drawExplosionParticles(); // 爆発は最奥に
  drawBoss(); // ボス（敵の下に描くとレーザーが埋もれるため先に）
  drawEnemies();
  drawMediumEnemies();
  drawDashEnemies();
  drawPowerups(); // パワーアップアイテム
  drawHitFlashes(); // 敵の上にフラッシュを重ねる
  drawEnemyBullets();
  drawBullets();
  drawMuzzleFlash();
  drawPlayer(); // 機体は最前面
  drawShockwaves(); // 取得時衝撃波
  drawBombEffect(); // ボム演出
  drawBossDestroyEffects(); // ボス撃破演出（全面フラッシュ）
  drawScorePopups();
  drawBossIntroEffects(); // WARNING! / 暗転（UI の直前）
  drawScreenFlash(); // 赤フラッシュは UI の直前
  drawRainbowFrame(); // コンボ5以上でレインボーフレーム
  drawComboDisplay(); // コンボ数表示
  drawLevelUpAnim(); // レベルアップ演出
  drawScore();
  drawLevel(); // レベル表示（右上）
  drawHp();
  drawStartAnim(); // 開始演出（最前面）
}

// ----------------------------------------
// 描画: ゲームオーバー画面
// ----------------------------------------
function drawGameOver() {
  const gs = gameOverState;
  const cx = CANVAS_WIDTH / 2,
    cy = CANVAS_HEIGHT / 2;

  // 爆発パーティクル（背景に残す）
  drawExplosionParticles();

  // 暗転オーバーレイ
  ctx.fillStyle = `rgba(0, 0, 0, ${gs.darkAlpha})`;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // GAME OVER — グリッチ（クロマティック・アベレーション風）
  const goY = cy - 80;
  ctx.font = "bold 44px monospace";

  // 赤チャンネル（右にずれ）
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = "#ff0000";
  ctx.fillText("GAME OVER", cx + gs.glitchX + 3, goY + gs.glitchY);

  // 青チャンネル（左にずれ）
  ctx.fillStyle = "#0044ff";
  ctx.fillText("GAME OVER", cx + gs.glitchX - 3, goY + gs.glitchY);

  // メイン（白）
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ff4444";
  ctx.shadowBlur = 20;
  ctx.fillText("GAME OVER", cx, goY);
  ctx.shadowBlur = 0;

  // スコア表示
  ctx.globalAlpha = Math.min(1, gs.darkAlpha / 0.5);
  ctx.font = "22px monospace";
  ctx.fillStyle = "#ffdd00";
  ctx.shadowColor = "#ffaa00";
  ctx.shadowBlur = 10;
  ctx.fillText(`SCORE  ${Math.floor(gs.scoreDisplay)}`, cx, goY + 70);
  ctx.shadowBlur = 0;

  // PRESS SPACE TO RETRY — ゆっくり明滅
  const breathA =
    0.3 + 0.35 * (1 + Math.sin(gs.breathTimer * 2.0 - Math.PI / 2));
  ctx.globalAlpha = breathA * Math.min(1, gs.darkAlpha / 0.4);
  ctx.font = "16px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 6;
  ctx.fillText("PRESS SPACE TO RETRY", cx, goY + 130);
  ctx.globalAlpha = 1;

  ctx.restore();
}

// ----------------------------------------
// 更新: タイトル画面
// ----------------------------------------
function updateTitle(deltaTime) {
  titleTime += deltaTime;
}

// ----------------------------------------
// 更新: プレイ画面
// ----------------------------------------
function updatePlaying(deltaTime) {
  // 開始演出中はゲームロジックをスキップ
  if (startAnim.phase !== "none") {
    updateStartAnim(deltaTime);
    return;
  }

  gameFrameCount++;

  // 開始猶予タイマー（3秒間は敵スポーンしない）
  if (spawnGraceTimer > 0)
    spawnGraceTimer = Math.max(0, spawnGraceTimer - deltaTime);

  // 無敵タイマーを減らす
  if (player.invincibleTimer > 0) {
    player.invincibleTimer = Math.max(0, player.invincibleTimer - deltaTime);
  }

  // スクリーンシェイクのタイマーを減らす
  if (screenShake.timer > 0) {
    screenShake.timer = Math.max(0, screenShake.timer - deltaTime);
  }

  // パワーアップタイマー
  if (player.tripleShotTimer > 0) {
    player.tripleShotTimer = Math.max(0, player.tripleShotTimer - deltaTime);
    if (player.tripleShotTimer === 0) player.tripleShot = false;
  }
  if (player.speedBoostTimer > 0) {
    player.speedBoostTimer = Math.max(0, player.speedBoostTimer - deltaTime);
    if (player.speedBoostTimer === 0) player.speedBoost = false;
  }

  updatePlayer(deltaTime);
  updateBullets(deltaTime);
  updateEnemies(deltaTime);
  updateMediumEnemies(deltaTime);
  updateDashEnemies(deltaTime);
  updateEnemyBullets(deltaTime);
  updatePowerups(deltaTime);
  checkBossSpawn();
  updateBossIntro(deltaTime);
  updateBoss(deltaTime);
  checkCollisions();
  checkBossCollisions();
  checkPlayerCollisions();
  checkBossPlayerCollision();
  checkPowerupCollisions();
  updateLevel(deltaTime);
  updateLevelUpAnim(deltaTime);
  updateCombo(deltaTime);
  updateExplosionParticles(deltaTime);
  updateScorePopups(deltaTime);
  updateShockwaves(deltaTime);
  updateBombEffect(deltaTime);
  updateBossDestroyEffects(deltaTime);
}

// ----------------------------------------
// 更新: ゲームオーバー画面
// ----------------------------------------
function updateGameOver(deltaTime) {
  const gs = gameOverState;
  // 暗転オーバーレイ（0.8まで徐々に上昇）
  if (gs.darkAlpha < 0.8) {
    gs.darkAlpha = Math.min(0.8, gs.darkAlpha + deltaTime * 0.6);
  }
  // スコアカウントアップ（1秒かけて最終スコアへ）
  if (gs.scoreDisplay < gs.finalScore) {
    gs.scoreDisplay = Math.min(
      gs.finalScore,
      gs.scoreDisplay + gs.finalScore * deltaTime * 1.5,
    );
  }
  // グリッチタイマー（0.1秒ごとにオフセットを更新）
  gs.glitchTimer += deltaTime;
  if (gs.glitchTimer >= 0.1) {
    gs.glitchTimer = 0;
    gs.glitchX = (Math.random() - 0.5) * 8;
    gs.glitchY = (Math.random() - 0.5) * 4;
  }
  // 呼吸タイマー
  gs.breathTimer += deltaTime;
  // 爆発パーティクル継続
  updateExplosionParticles(deltaTime);
}

// ----------------------------------------
// メインループ
// ----------------------------------------
function gameLoop(timestamp) {
  // deltaTime を秒単位で計算（初回は 0 に）
  const rawDelta = lastTime === 0 ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  // FPS 計算（rawDelta が 0 のとき除算を避ける）
  fps = rawDelta > 0 ? Math.round(1 / rawDelta) : fps;

  // ヒットストップ: リアルタイムで減算し、ゲーム時間を 0.1 倍にする
  if (hitStopTimer > 0) hitStopTimer = Math.max(0, hitStopTimer - rawDelta);
  const deltaTime = hitStopTimer > 0 ? rawDelta * 0.1 : rawDelta;

  // --- 更新 ---
  switch (gameState) {
    case STATE.TITLE:
      updateTitle(deltaTime);
      break;
    case STATE.PLAYING:
      updatePlaying(deltaTime);
      break;
    case STATE.GAMEOVER:
      updateGameOver(deltaTime);
      break;
  }

  // --- 描画 ---
  // スクリーンシェイク: アクティブ中はランダムにキャンバス全体をずらす
  const shaking = screenShake.timer > 0;
  if (shaking) {
    const si =
      screenShake.intensity * (screenShake.timer / screenShake.duration);
    ctx.save();
    ctx.translate((Math.random() * 2 - 1) * si, (Math.random() * 2 - 1) * si);
  }

  drawBackground(deltaTime); // 毎フレーム背景で塗りつぶし＋演出更新

  switch (gameState) {
    case STATE.TITLE:
      drawTitle();
      break;
    case STATE.PLAYING:
      drawPlaying();
      break;
    case STATE.GAMEOVER:
      drawGameOver();
      break;
  }

  if (shaking) ctx.restore(); // シェイク用の translate をリセット

  drawFps(); // FPS は最前面に表示（シェイクの外に置いて安定させる）

  // 次フレームをリクエスト
  requestAnimationFrame(gameLoop);
}

// ----------------------------------------
// キー入力
// ----------------------------------------
document.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    e.preventDefault(); // スペースキーでのスクロールを防止
    initAudio(); // ユーザー操作のタイミングで AudioContext を初期化
    if (gameState === STATE.TITLE) {
      resetPlayer();
      startAnim.phase = "ready";
      startAnim.timer = 0;
      gameState = STATE.PLAYING;
    } else if (gameState === STATE.GAMEOVER) {
      // タイトルに戻る
      titleTime = 0;
      gameState = STATE.TITLE;
    }
  }
});

// ----------------------------------------
// ゲーム開始
// ----------------------------------------
requestAnimationFrame(gameLoop);
