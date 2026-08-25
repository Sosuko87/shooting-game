const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 700;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const STATE = {
  TITLE: "title",
  PLAYING: "playing",
  GAMEOVER: "gameover",
};

let gameState = STATE.TITLE;

let lastTime = 0;

function gameLoop(timestamp) {
  // 前フレームからの経過時間を秒に変換
  const rawDelta = lastTime === 0 ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  const deltaTime = rawDelta;

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
  drawBackground(deltaTime);

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

  // 次のフレームを予約
  requestAnimationFrame(gameLoop);
}

// ゲーム開始！
requestAnimationFrame(gameLoop);
const keys = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
};

document.addEventListener("keydown", (e) => {
  if (e.key in keys) {
    keys[e.key] = true;
    e.preventDefault(); // 矢印キーでページがスクロールしないように
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key in keys) keys[e.key] = false;
});
const PLAYER_SPEED = 300; // px/秒

const player = {
  x: CANVAS_WIDTH / 2,
  y: CANVAS_HEIGHT - 80,
  width: 32,
  height: 36,
  hp: 5,
  tilt: 0, // 左右移動時の傾き
};

function updatePlayer(deltaTime) {
  let dx = 0;
  let dy = 0;
  if (keys.ArrowLeft) dx -= 1;
  if (keys.ArrowRight) dx += 1;
  if (keys.ArrowUp) dy -= 1;
  if (keys.ArrowDown) dy += 1;

  player.x += dx * PLAYER_SPEED * deltaTime;
  player.y += dy * PLAYER_SPEED * deltaTime;

  // 画面外に出ないよう制限
  const hw = player.width / 2;
  player.x = Math.max(hw, Math.min(CANVAS_WIDTH - hw, player.x));
  player.y = Math.max(minY, Math.min(CANVAS_HEIGHT - player.height / 2, player.y));

  // 傾き演出：左右移動で機体が傾く
  const targetTilt = dx * (8 * Math.PI / 180);
  player.tilt += (targetTilt - player.tilt) * Math.min(1, 10 * deltaTime);
}
function drawPlayer() {
  const { x, y, width, height, tilt } = player;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // グロウエフェクト
  ctx.shadowColor = "#00ffff";
  ctx.shadowBlur = 18;

  // 三角形の宇宙船
  ctx.beginPath();
  ctx.moveTo(0, -height / 2);        // 機首（上）
  ctx.lineTo(-width / 2, height / 2); // 左翼端
  ctx.lineTo(0, height / 2 - 8);     // くびれ
  ctx.lineTo(width / 2, height / 2);  // 右翼端
  ctx.closePath();

  ctx.fillStyle = "rgba(0, 200, 220, 0.15)";
  ctx.fill();
  ctx.strokeStyle = "#00ffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}
const BULLET_POOL_SIZE = 80;
const BULLET_SPEED = 600;
const SHOT_INTERVAL = 0.12; // 自動連射の間隔（秒）

// 80個分の弾を事前に確保
const bulletPool = Array.from({ length: BULLET_POOL_SIZE }, () => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
}));

// 空いている弾を1つ探す
function acquireFromPool(pool) {
  for (const item of pool) {
    if (!item.active) return item;
  }
  return null; // 全部使用中ならスキップ
}

// 弾を発射
function fireBullet(x, y, vx = 0, vy = -BULLET_SPEED) {
  const b = acquireFromPool(bulletPool);
  if (!b) return;
  b.active = true;
  b.x = x;
  b.y = y;
  b.vx = vx;
  b.vy = vy;
}
let shotTimer = 0;

function updateBullets(deltaTime) {
  shotTimer += deltaTime;
  while (shotTimer >= SHOT_INTERVAL) {
    shotTimer -= SHOT_INTERVAL;
    fireBullet(player.x, player.y - player.height / 2);
    playShootSound();
  }

  // 弾の移動＆画面外判定
  for (const b of bulletPool) {
    if (!b.active) continue;
    b.x += b.vx * deltaTime;
    b.y += b.vy * deltaTime;
    if (b.y < -15 || b.x < -50 || b.x > CANVAS_WIDTH + 50) {
      b.active = false;
    }
  }
}
const ENEMY_POOL_SIZE = 30;
const ENEMY_SPEED_Y = 150;
const ENEMY_SINE_AMPLITUDE = 30; // 左右揺れの幅

const enemyPool = Array.from({ length: ENEMY_POOL_SIZE }, () => ({
  active: false,
  x: 0, y: 0, baseX: 0,
  time: 0, phase: 0,
  hp: 1,
  radius: 10,
}));
e.x = e.baseX + Math.sin(e.time / 2 * Math.PI * 2 + e.phase) * 30;
const BULLET_RADIUS = 1.5; // 弾の半径

function checkCollisions() {
  for (const b of bulletPool) {
    if (!b.active) continue;

    for (const e of enemyPool) {
      if (!e.active) continue;

      const dx = b.x - e.x;
      const dy = b.y - e.y;

      // 2点間の距離 < 半径の合計 → ヒット！
      if (Math.hypot(dx, dy) < BULLET_RADIUS + e.radius) {
        b.active = false;
        e.hp -= 1;
        if (e.hp <= 0) {
          e.active = false;
          spawnExplosion(e.x, e.y); // 爆発エフェクト
          score += onKill(100);     // コンボ付きスコア
          playDestroySound();
        }
      }
    }
  }
}
function checkBossSpawn() {
  if (score >= nextBossScore) {
    bossIntro.phase = "warning"; // WARNING!表示開始
  }
}
function fireBossOmni() {
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const b = acquireFromPool(enemyBulletPool);
    if (!b) continue;
    b.active = true;
    b.x = boss.x;
    b.y = boss.y;
    b.vx = Math.cos(angle) * bulletSpeed;
    b.vy = Math.sin(angle) * bulletSpeed;
  }
}
if (hitStopTimer > 0) hitStopTimer = Math.max(0, hitStopTimer - rawDelta);
const deltaTime = hitStopTimer > 0 ? rawDelta * 0.1 : rawDelta;
const starsFar = Array.from({ length: 50 }, () => createStar("far"));
const starsNear = Array.from({ length: 30 }, () => createStar("near"));
function spawnExplosion(x, y, count = 20, baseHue = 0) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 200;
    const p = acquireFromPool(explosionPool);
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.hue = baseHue + Math.random() * 30;
    // ...
  }
}
if (screenShake.timer > 0) {
  const intensity = screenShake.intensity * (screenShake.timer / screenShake.duration);
  ctx.translate(
    (Math.random() * 2 - 1) * intensity,
    (Math.random() * 2 - 1) * intensity
  );
}
let audioCtx = null;

// ユーザーが最初にキーを押した瞬間に初期化
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

// 発射音：800Hz のサイン波、50ms
function playShootSound() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.05);
}
const LEVEL_UP_INTERVAL = 30; // 30秒ごと
const MAX_LEVEL = 10;

// Lv.1〜10 の間を線形補間
function levelLerp(minVal, maxVal) {
  const t = (gameLevel - 1) / (MAX_LEVEL - 1);
  return minVal + (maxVal - minVal) * t;
}

function getEnemySpawnInterval() {
  return levelLerp(1.5, 0.4); // Lv.1: 1.5秒 → Lv.10: 0.4秒
}
const COMBO_TIMEOUT = 1.0; // 1秒以内に次を倒せばコンボ継続

function onKill(baseScore) {
  comboCount++;
  comboTimer = COMBO_TIMEOUT;
  return Math.round(baseScore * (1 + comboCount * 0.1));
}