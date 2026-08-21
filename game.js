'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────
const W = 1600, H = 600, GROUND = 300;
const GRAVITY = 0.52, JUMP_FORCE = -12, BASE_SPEED = 10;
const DW = 50, DH = 60;
const SCORE_PER_LEVEL = 100;
const SCORE_CAP = 999;
const POWER_DURATION = 99;
const BG_BLEND_STEP = 5;

// ─── Biome Backgrounds ────────────────────────────────────────────────────────
const BIOS = [
  { sky1:'#87CEEB', sky2:'#D4EDFF', gnd:'#C8A96E', line:'#8B7355', stars:false, name:'Desert'     },
  { sky1:'#FF8C42', sky2:'#FFD166', gnd:'#7CB342', line:'#558B2F', stars:false, name:'Savanna'    },
  { sky1:'#0D1B2A', sky2:'#1B2838', gnd:'#2C3E50', line:'#3D5A80', stars:true,  name:'Night City' },
  { sky1:'#3E0000', sky2:'#8B1A00', gnd:'#3E2723', line:'#795548', stars:false, name:'Volcanic'   },
  { sky1:'#000005', sky2:'#040415', gnd:'#0A0A1A', line:'#1A1A3A', stars:true,  name:'Deep Space' },
];

// ─── Dino Skins ───────────────────────────────────────────────────────────────
const SKINS = [
  { name:'Classic', body:'#5D8A3C', dark:'#3A5C22', belly:'#7AB648', eye:'#FFF', pupil:'#000' },
  { name:'Fire',    body:'#E53935', dark:'#B71C1C', belly:'#FF7043', eye:'#FFF', pupil:'#000' },
  { name:'Ice',     body:'#1E88E5', dark:'#0D47A1', belly:'#64B5F6', eye:'#FFF', pupil:'#000' },
  { name:'Shadow',  body:'#7B1FA2', dark:'#4A148C', belly:'#CE93D8', eye:'#FFD700', pupil:'#000' },
  { name:'Gold',    body:'#F9A825', dark:'#E65100', belly:'#FFEE58', eye:'#FFF', pupil:'#000' },
];

// Each biome auto-selects a matching skin (index into SKINS) unless the player overrides.
// Desert→Classic, Savanna→Gold, Night City→Ice, Volcanic→Fire, Deep Space→Shadow
const BIOME_SKIN = [0, 4, 2, 1, 3];

// ─── State ────────────────────────────────────────────────────────────────────
let canvas, ctx;
let state = 'intro'; // 'intro' | 'running' | 'gameover'
let score, hiScore, level, speed, tick;
let skinIdx, skinManual;
let dino, obstacles, powerups, particles, clouds, stars;
let spawnTick, spawnGap, puTick, puGap;
let lvlMsg;
let bgFrom, bgBlend; // smooth cross-fade between biomes on level-up

// ─── Boot ─────────────────────────────────────────────────────────────────────
function init() {
  canvas = document.getElementById('gameCanvas');
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext('2d');

  hiScore = Number(localStorage.getItem('trex2_hi')) || 0;
  skinIdx = Number(localStorage.getItem('trex2_skin')) || 0;
  skinManual = localStorage.getItem('trex2_skinManual') === '1';

  document.addEventListener('keydown', onKey);
  canvas.addEventListener('mousedown', onTap);
  canvas.addEventListener('touchstart', onTap, { passive: false });

  resetGame();
  requestAnimationFrame(loop);
}

function resetGame() {
  score = 0;
  level = 1;
  speed = BASE_SPEED;
  tick = 0;
  spawnTick = 0;
  spawnGap = 90;
  puTick = 0;
  puGap = 900;
  lvlMsg = { on: false, timer: 0, lv: 0 };
  bgFrom = null;
  bgBlend = 1;

  // Auto-match skin to the starting biome unless the player picked one manually.
  if (!skinManual) skinIdx = BIOME_SKIN[level - 1];

  dino = { x:80, y:GROUND - DH, vy:0, jumping:false, legF:0, legT:0, powered:false, powerT:0 };

  obstacles = [];
  powerups  = [];
  particles = [];
  clouds = Array.from({ length:6 }, (_, i) => ({
    x: 80 + i * 140, y: 18 + Math.random() * 65,
    w: 55 + Math.random() * 65, h: 16 + Math.random() * 20,
    spd: 0.4 + Math.random() * 0.5,
  }));
  stars = Array.from({ length:110 }, () => ({
    x: Math.random() * W, y: Math.random() * (GROUND - 15),
    r: 0.4 + Math.random() * 1.4, ph: Math.random() * Math.PI * 2,
  }));
}

// ─── Input ────────────────────────────────────────────────────────────────────
function onKey(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); doJump(); }
  if (e.key >= '1' && e.key <= '5') {
    skinIdx = Number(e.key) - 1;
    skinManual = true;
    localStorage.setItem('trex2_skin', skinIdx);
    localStorage.setItem('trex2_skinManual', '1');
  }
}
function onTap(e) { e.preventDefault(); doJump(); }

function doJump() {
  if (state === 'intro')    { state = 'running'; return; }
  if (state === 'gameover') { resetGame(); state = 'running'; return; }
  if (state === 'running' && !dino.jumping) {
    dino.vy = JUMP_FORCE;
    dino.jumping = true;
    burst(dino.x + 22, GROUND + 2, '#C8A96E', 7);
  }
}

// ─── Particles ────────────────────────────────────────────────────────────────
function burst(x, y, col, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 4;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 2,
                     life: 1, col, sz: 2.5 + Math.random() * 3.5 });
  }
}

// ─── Spawn ────────────────────────────────────────────────────────────────────
function spawnObstacle() {
  const r = Math.random();
  if (r < 0.50) {
    obstacles.push({ type:'cactus', x: W+10, v: Math.floor(Math.random()*3) });
  } else if (r < 0.78) {
    const hs = [GROUND-70, GROUND-105, GROUND-135];
    obstacles.push({ type:'bat', x: W+10, y: hs[Math.floor(Math.random()*3)], wf:0 });
  } else {
    obstacles.push({ type:'asteroid', x: W+50, y: -25,
                     vy: 2.5 + Math.random()*2.5, angle:0 });
  }
}

function spawnPowerUp() {
  powerups.push({ x: W+10, y: GROUND-95-Math.random()*55, pulse:Math.random()*Math.PI*2, done:false });
}

// ─── Collision ────────────────────────────────────────────────────────────────
function hit(ax,ay,aw,ah, bx,by,bw,bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}
// Circle-vs-rect test: the asteroid sprite rotates, so a fixed axis-aligned
// box drifts out of sync with its silhouette. A circle stays accurate at any angle.
function circleRectHit(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx+rw));
  const ny = Math.max(ry, Math.min(cy, ry+rh));
  const dx = cx-nx, dy = cy-ny;
  return dx*dx + dy*dy < r*r;
}
function dinoBox() {
  return { x:dino.x+8, y:dino.y+6, w:DW-14, h:DH-6 };
}
function obsBox(o) {
  if (o.type === 'cactus')   return { x:o.x+4, y:GROUND-54, w:[20,42,62][o.v], h:54 };
  if (o.type === 'bat')      return { x:o.x+6, y:o.y+4,     w:36,              h:18 };
  if (o.type === 'asteroid') return { x:o.x-14,y:o.y-14,    w:28,              h:28 };
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update() {
  score  = Math.min(score + 0.1, SCORE_CAP);
  speed  += 0.0008;
  spawnGap = Math.max(42, 90 - speed * 2.5);
  if (bgBlend < 1) bgBlend = Math.min(1, bgBlend + BG_BLEND_STEP);

  // Level check
  const newLv = Math.min(Math.floor(score / SCORE_PER_LEVEL) + 1, BIOS.length);
  if (newLv > level) {
    bgFrom = BIOS[Math.min(level-1, BIOS.length-1)]; // fade out from the old biome
    bgBlend = 0;
    level = newLv;
    if (!skinManual) skinIdx = BIOME_SKIN[level - 1]; // skin follows the new atmosphere
    lvlMsg = { on:true, timer:130, lv:level };
    burst(W/2, H/2, '#FFD700', 35);
  }

  // Dino physics
  if (dino.jumping) {
    dino.vy += GRAVITY;
    dino.y  += dino.vy;
    if (dino.y >= GROUND - DH) { dino.y = GROUND - DH; dino.vy = 0; dino.jumping = false; }
  } else {
    dino.legT++;
    if (dino.legT >= 8) { dino.legT = 0; dino.legF ^= 1; }
  }

  if (dino.powered && --dino.powerT <= 0) dino.powered = false;

  // Spawn
  if (++spawnTick >= spawnGap) { spawnObstacle(); spawnTick = 0; }
  if (++puTick    >= puGap)    { spawnPowerUp();  puTick = 0; puGap = 700 + Math.random()*500; }

  const db = dinoBox();
  let killed = false;

  // Obstacles
  obstacles = obstacles.filter(o => {
    o.x -= speed;
    if (o.type === 'bat')      { o.wf += 0.14; o.y += Math.sin(tick*0.04)*0.4; }
    if (o.type === 'asteroid') { o.vy = Math.min(o.vy+0.06, 8); o.y += o.vy; o.angle += 0.04; }
    if (o.x < -90 || (o.type === 'asteroid' && o.y > H+20)) return false;

    // Asteroid sprite spins, so its hit test uses a circle (rotation-invariant)
    // instead of the fixed axis-aligned box used by cactus/bat.
    let isHit;
    if (o.type === 'asteroid') {
      isHit = circleRectHit(o.x, o.y, 16, db.x, db.y, db.w, db.h);
    } else {
      const ob = obsBox(o);
      isHit = hit(db.x,db.y,db.w,db.h, ob.x,ob.y,ob.w,ob.h);
    }
    if (isHit) {
      if (dino.powered) { burst(o.x, (o.y||GROUND-30), '#FF6D00', 12); return false; }
      killed = true;
    }
    return true;
  });

  if (killed) { die(); return; }

  // Power-ups
  powerups = powerups.filter(p => {
    p.x -= speed;
    p.pulse += 0.065;
    if (!p.done && hit(db.x,db.y,db.w,db.h, p.x-18,p.y-18,36,36)) {
      dino.powered = true;
      dino.powerT  = POWER_DURATION;
      burst(p.x, p.y, '#FFD700', 22);
      return false; // bubble disappears immediately once collected
    }
    return p.x > -45;
  });

  // Particles
  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.13; p.life -= 0.022; return p.life > 0;
  });

  // Clouds
  clouds.forEach(c => {
    c.x -= c.spd * (speed / BASE_SPEED);
    if (c.x + c.w < 0) { c.x = W+20; c.y = 18 + Math.random()*65; }
  });

  if (lvlMsg.on && --lvlMsg.timer <= 0) lvlMsg.on = false;
}

function die() {
  state = 'gameover';
  if (score > hiScore) { hiScore = score; localStorage.setItem('trex2_hi', hiScore); }
  burst(dino.x+22, dino.y+26, '#FF3D00', 28);
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y,   x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x,   y+h, x,   y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x,   y,   x+r, y);
  ctx.closePath();
}

// ─── Draw Background ──────────────────────────────────────────────────────────
function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1),16), pb = parseInt(b.slice(1),16);
  const ar=(pa>>16)&255, ag=(pa>>8)&255, ab=pa&255;
  const br=(pb>>16)&255, bg=(pb>>8)&255, bb=pb&255;
  const r = Math.round(ar+(br-ar)*t), g = Math.round(ag+(bg-ag)*t), bl = Math.round(ab+(bb-ab)*t);
  return `rgb(${r},${g},${bl})`;
}

function drawBg() {
  const target = BIOS[Math.min(level-1, BIOS.length-1)];
  const bg = (bgBlend < 1 && bgFrom) ? {
    ...target,
    sky1: lerpColor(bgFrom.sky1, target.sky1, bgBlend),
    sky2: lerpColor(bgFrom.sky2, target.sky2, bgBlend),
    gnd:  lerpColor(bgFrom.gnd,  target.gnd,  bgBlend),
    line: lerpColor(bgFrom.line, target.line, bgBlend),
  } : target;

  const grd = ctx.createLinearGradient(0, 0, 0, GROUND);
  grd.addColorStop(0, bg.sky1);
  grd.addColorStop(1, bg.sky2);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, GROUND);

  // Stars / Moon
  if (bg.stars) {
    stars.forEach(s => {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(s.ph + tick*0.018));
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
    });
    if (level === 3) { // crescent moon
      ctx.fillStyle = '#FFFDE7';
      ctx.beginPath(); ctx.arc(700, 38, 22, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = BIOS[2].sky1;
      ctx.beginPath(); ctx.arc(712, 33, 18, 0, Math.PI*2); ctx.fill();
    }
    if (level >= 5) { // planet
      const pGrd = ctx.createRadialGradient(640,55,0, 640,55,34);
      pGrd.addColorStop(0, 'rgba(160,110,80,0.9)');
      pGrd.addColorStop(1, 'rgba(100,70,50,0.5)');
      ctx.fillStyle = pGrd;
      ctx.beginPath(); ctx.arc(640, 55, 34, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(180,140,100,0.35)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(640, 55, 56, 12, -0.3, 0, Math.PI*2); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // Clouds
  if (level < 5) {
    const cCol = level === 3 ? 'rgba(50,70,110,0.55)' : 'rgba(255,255,255,0.72)';
    clouds.forEach(c => {
      ctx.fillStyle = cCol;
      ctx.beginPath(); ctx.ellipse(c.x+c.w*.50, c.y+c.h*.60, c.w*.50, c.h*.50, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x+c.w*.30, c.y+c.h*.30, c.w*.32, c.h*.68, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x+c.w*.72, c.y+c.h*.35, c.w*.28, c.h*.62, 0, 0, Math.PI*2); ctx.fill();
    });
  }

  // Ground
  ctx.fillStyle = bg.gnd;
  ctx.fillRect(0, GROUND, W, H-GROUND);
  ctx.fillStyle = bg.line;
  ctx.fillRect(0, GROUND, W, 5);

  // Rolling track dashes
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const x = ((-tick * speed * 0.25 + i * 210) % (W+210) + W+210) % (W+210) - 20;
    ctx.beginPath(); ctx.moveTo(x, GROUND+15); ctx.lineTo(x+48, GROUND+15); ctx.stroke();
  }
  ctx.lineWidth = 1;

  // Lava glow (volcanic)
  if (level === 4) {
    for (let i = 0; i < 3; i++) {
      const lx = (tick*1.1 + i*270) % (W+100);
      const lg = ctx.createRadialGradient(lx, GROUND+14, 0, lx, GROUND+14, 55);
      lg.addColorStop(0, 'rgba(255,90,0,0.28)');
      lg.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(lx-55, GROUND, 110, 50);
    }
  }
}

// ─── Draw Dino ────────────────────────────────────────────────────────────────
function drawDino() {
  const sk = SKINS[skinIdx];
  const { x, y } = dino;
  const pw = dino.powered;

  // Power aura
  if (pw) {
    const pulseAlpha = 0.22 + 0.16*Math.sin(tick*0.25);
    const ag = ctx.createRadialGradient(x+22, y+28, 4, x+22, y+28, 42);
    ag.addColorStop(0,    `rgba(255,215,0,${pulseAlpha.toFixed(3)})`);        // gold core
    ag.addColorStop(0.55, `rgba(255,60,0,${(pulseAlpha*0.85).toFixed(3)})`);  // red mid
    ag.addColorStop(1,    'rgba(255,60,0,0)');                                // fade out
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.ellipse(x+22, y+30, 42, 38, 0, 0, Math.PI*2); ctx.fill();
  }

  // Tail
  ctx.fillStyle = sk.dark;
  ctx.fillRect(x-14, y+24, 16, 8);
  ctx.fillRect(x-20, y+18, 10, 10);

  // Body
  ctx.fillStyle = sk.body;
  ctx.fillRect(x, y+20, DW-4, 28);

  // Belly stripe
  ctx.fillStyle = sk.belly;
  ctx.fillRect(x+6, y+30, DW-18, 14);

  // Back ridges
  ctx.fillStyle = sk.dark;
  for (let i = 0; i < 3; i++) ctx.fillRect(x+5+i*8, y+14, 5, 6-i);

  // Neck / head
  ctx.fillStyle = sk.body;
  ctx.fillRect(x+14, y+8,  22, 16);
  ctx.fillRect(x+18, y,    24, 16);

  // Snout
  ctx.fillStyle = sk.dark;
  ctx.fillRect(x+34, y+4, 10, 10);
  ctx.fillStyle = sk.belly;
  ctx.fillRect(x+36, y+5, 6, 7);
  ctx.fillStyle = sk.dark;
  ctx.fillRect(x+38, y+6, 3, 3);

  // Eye
  ctx.fillStyle = sk.eye;
  ctx.fillRect(x+20, y+2, 10, 10);
  ctx.fillStyle = sk.pupil;
  ctx.fillRect(x+24, y+4,  5,  5);
  ctx.fillStyle = '#FFF';
  ctx.fillRect(x+26, y+4,  2,  2); // shine

  // Arm
  ctx.fillStyle = sk.body;
  ctx.fillRect(x+16, y+28, 10, 8);
  ctx.fillRect(x+24, y+33,  6, 4);

  // Legs
  ctx.fillStyle = sk.body;
  if (dino.jumping) {
    ctx.fillRect(x+6,  y+46, 10, 8);
    ctx.fillRect(x+24, y+46, 10, 8);
  } else {
    const lf = dino.legF;
    const h1 = lf ? 16 : 10, h2 = lf ? 10 : 16;
    ctx.fillRect(x+6,  y+46, 10, h1);
    ctx.fillRect(x+6  + (lf?0:-4),  y+46+h1, 12, 4);
    ctx.fillRect(x+24, y+46, 10, h2);
    ctx.fillRect(x+24 + (lf?4:0),   y+46+h2, 12, 4);
  }

  // Lightning sparks when powered
  if (pw) {
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.65 + 0.35*Math.sin(tick*0.3);
    [[-6,12],[42,16],[8,42]].forEach(([sx,sy]) => {
      ctx.beginPath();
      ctx.moveTo(x+sx, y+sy);
      ctx.lineTo(x+sx+5, y+sy+5);
      ctx.lineTo(x+sx+2, y+sy+5);
      ctx.lineTo(x+sx+7, y+sy+13);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
}

// ─── Draw Cactus ──────────────────────────────────────────────────────────────
function drawCactus(o) {
  const n = o.v + 1;
  for (let i = 0; i < n; i++) singleCactus(o.x + i*22, i===0 ? 1 : i===1 ? 0.87 : 0.77);
}

function singleCactus(x, sc) {
  const h = Math.round(54*sc), gy = GROUND-h;
  ctx.fillStyle = '#2D6A2D';
  ctx.fillRect(x+7, gy, 8, h);                              // trunk
  ctx.fillRect(x+5, gy+2, 12, 5);                           // top cap
  ctx.fillRect(x,   gy + Math.round(h*0.28), 9, 5);         // left arm base
  ctx.fillRect(x,   gy + Math.round(h*0.10), 6, Math.round(h*0.20)); // left arm up
  ctx.fillRect(x+13,gy + Math.round(h*0.34), 9, 5);         // right arm base
  ctx.fillRect(x+16,gy + Math.round(h*0.14), 6, Math.round(h*0.22)); // right arm up
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(x+9, gy+4, 3, h-6);                          // highlight

  // Texture: shaded right edge + ribbed spine ticks down the trunk
  ctx.fillStyle = '#1E4D1E';
  ctx.fillRect(x+13, gy+4, 2, h-6);                         // right-side shade
  ctx.fillStyle = '#245A24';
  const spineStep = 9;
  for (let spineY = gy + 8; spineY < GROUND - 4; spineY += spineStep) {
    ctx.fillRect(x+7, spineY, 8, 1);                        // horizontal rib tick
  }
}

// ─── Draw Bat ─────────────────────────────────────────────────────────────────
function drawBat(o) {
  const { x, y, wf } = o;
  const ws = Math.sin(wf) * 15;

  // Orient the bat toward its flight direction (moving left) with a gentle wing-synced bank.
  const bankTilt = -0.14 + Math.sin(wf) * 0.1;
  const pivotX = x + 24, pivotY = y + 12;
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(bankTilt);
  ctx.translate(-pivotX, -pivotY);

  ctx.fillStyle = '#1A0D2E';
  // Left wing
  ctx.beginPath();
  ctx.moveTo(x+24, y+12);
  ctx.quadraticCurveTo(x+7,  y-ws,  x-10, y+8-ws*0.4);
  ctx.quadraticCurveTo(x+5,  y+22,  x+24, y+16);
  ctx.fill();
  // Right wing
  ctx.beginPath();
  ctx.moveTo(x+24, y+12);
  ctx.quadraticCurveTo(x+41, y-ws,  x+58, y+8-ws*0.4);
  ctx.quadraticCurveTo(x+43, y+22,  x+24, y+16);
  ctx.fill();
  // Wing ribs
  ctx.strokeStyle = 'rgba(100,50,160,0.3)';
  ctx.lineWidth = 0.7;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(x+24,y+14); ctx.lineTo(x+24-i*8, y-ws*0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+24,y+14); ctx.lineTo(x+24+i*8, y-ws*0.5); ctx.stroke();
  }
  ctx.lineWidth = 1;

  // Body
  ctx.fillStyle = '#2E1B4A';
  ctx.beginPath(); ctx.ellipse(x+24, y+12, 13, 9, 0, 0, Math.PI*2); ctx.fill();

  // Ears
  ctx.fillStyle = '#1A0D2E';
  ctx.fillRect(x+17, y-6, 5, 10);
  ctx.fillRect(x+26, y-6, 5, 10);

  // Eyes
  ctx.fillStyle = '#FF1744';
  ctx.beginPath(); ctx.arc(x+20, y+9, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x+28, y+9, 3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#FF6090';
  ctx.beginPath(); ctx.arc(x+21, y+8, 1, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x+29, y+8, 1, 0, Math.PI*2); ctx.fill();

  // Fangs
  ctx.fillStyle = '#ECEFF1';
  ctx.fillRect(x+21, y+18, 3, 5);
  ctx.fillRect(x+27, y+18, 3, 5);

  ctx.restore();
}

// ─── Draw Asteroid ────────────────────────────────────────────────────────────
function drawAsteroid(o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.angle);

  // Fire trail
  ctx.fillStyle = 'rgba(255,100,0,0.28)';
  ctx.beginPath(); ctx.ellipse(7, -22, 6, 20, 0.3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,210,0,0.18)';
  ctx.beginPath(); ctx.ellipse(7, -24, 3, 13, 0.3, 0, Math.PI*2); ctx.fill();

  // Rock
  ctx.fillStyle = '#6D6055';
  ctx.beginPath();
  ctx.moveTo(0,-17); ctx.lineTo(12,-10); ctx.lineTo(16,2);
  ctx.lineTo(10,14); ctx.lineTo(0,17);  ctx.lineTo(-12,11);
  ctx.lineTo(-16,-2);ctx.lineTo(-10,-13);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#8D8075';
  ctx.beginPath();
  ctx.moveTo(0,-12); ctx.lineTo(8,-6); ctx.lineTo(10,2);
  ctx.lineTo(4,10);  ctx.lineTo(-6,8); ctx.lineTo(-8,0);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#4D4040';
  ctx.beginPath(); ctx.arc(-4,-4, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 5, 5, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(-3, 8, 2, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

// ─── Draw Power-up ────────────────────────────────────────────────────────────
function drawPowerUp(p) {
  const bob = Math.sin(p.pulse) * 4;
  const px = p.x, py = p.y + bob;
  const r  = 18 + Math.sin(p.pulse*1.5)*1.5;

  // Outer glow
  const og = ctx.createRadialGradient(px, py, 0, px, py, r+12);
  og.addColorStop(0,   'rgba(255,220,50,0.40)'); // gold core
  og.addColorStop(0.6, 'rgba(255,70,0,0.22)');   // red halo
  og.addColorStop(1,   'rgba(255,70,0,0)');       // fade out
  ctx.fillStyle = og;
  ctx.beginPath(); ctx.arc(px, py, r+12, 0, Math.PI*2); ctx.fill();

  // Bubble
  ctx.fillStyle = 'rgba(160,220,255,0.16)';
  ctx.strokeStyle = 'rgba(120,200,255,0.72)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();

  // Bubble shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath(); ctx.ellipse(px-r*0.34, py-r*0.34, r*0.22, r*0.13, -0.5, 0, Math.PI*2); ctx.fill();

  // Lightning bolt
  ctx.fillStyle = '#FFD700';
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur  = 10;
  const s = r * 0.52;
  ctx.beginPath();
  ctx.moveTo(px+3,  py-s);
  ctx.lineTo(px-4,  py-1);
  ctx.lineTo(px+1,  py-1);
  ctx.lineTo(px-3,  py+s);
  ctx.lineTo(px+7,  py+2);
  ctx.lineTo(px+1,  py+2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth  = 1;
}

// ─── Draw Particles ───────────────────────────────────────────────────────────
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.col;
    const sz = p.sz * p.life;
    ctx.fillRect(p.x-sz/2, p.y-sz/2, sz, sz);
  });
  ctx.globalAlpha = 1;
}

// ─── Draw HUD ─────────────────────────────────────────────────────────────────
function drawHUD() {
  ctx.font = 'bold 17px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(`HI ${Math.floor(hiScore).toString().padStart(5,'0')}`, W-200, 26);
  ctx.fillText(Math.floor(score).toString().padStart(5,'0'), W-80, 26);
  ctx.fillText(`LVL ${level}`, 18, 26);

  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillText(BIOS[Math.min(level-1,BIOS.length-1)].name.toUpperCase(), 18, 42);
  const skinPercent = Math.round(((skinIdx + 1) / SKINS.length) * 100);
  ctx.fillText(`SKIN: ${SKINS[skinIdx].name} ${skinPercent}%`, 18, 57);

  // Power bar
  if (dino.powered) {
    const pct = dino.powerT / POWER_DURATION;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(W/2-52, 8, 104, 12);
    ctx.fillStyle = `hsl(${pct*50+10},100%,55%)`;
    ctx.fillRect(W/2-52, 8, 104*pct, 12);
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ POWERED UP', W/2, 18);
    ctx.textAlign = 'left';
  }

  // Level-up banner
  if (lvlMsg.on) {
    const t = lvlMsg.timer / 130;
    ctx.globalAlpha = Math.min(1, t*3, (1-t)*3.5);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${lvlMsg.lv}!`, W/2, H/2-18);
    ctx.fillStyle = '#FFF';
    ctx.font = '13px monospace';
    ctx.fillText(BIOS[Math.min(lvlMsg.lv-1,BIOS.length-1)].name.toUpperCase(), W/2, H/2+8);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

// ─── Screens ──────────────────────────────────────────────────────────────────
function drawIntro() {
  drawBg();
  dino.legT++;
  if (dino.legT >= 10) { dino.legT = 0; dino.legF ^= 1; }
  drawDino();

  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  rrect(W/2-172, H/2-72, 344, 118, 14); ctx.fill();

  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 34px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('T-REX 2.0', W/2, H/2-22);

  ctx.fillStyle = '#CCC';
  ctx.font = '12px monospace';
  ctx.fillText('Jump over CACTUS · Dodge BATS & ASTEROIDS', W/2, H/2+5);
  ctx.fillText('Catch ⚡ bubbles for POWER-UP · Level up every 1000pts', W/2, H/2+22);

  const blink = Math.floor(tick/28) % 2 === 0;
  ctx.fillStyle = blink ? '#FFFFFF' : 'rgba(255,255,255,0.25)';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('PRESS SPACE / TAP TO START', W/2, H/2+52);
  ctx.textAlign = 'left';
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(0,0,0,0.68)';
  rrect(W/2-162, H/2-68, 324, 125, 14); ctx.fill();

  ctx.fillStyle = '#FF5252';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', W/2, H/2-22);

  ctx.fillStyle = '#FFF';
  ctx.font = '18px monospace';
  ctx.fillText(`SCORE: ${Math.floor(score)}`, W/2, H/2+10);

  if (Math.floor(score) > 0 && Math.floor(score) >= Math.floor(hiScore)) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('✦ NEW HIGH SCORE ✦', W/2, H/2+32);
  }

  const blink = Math.floor(tick/28) % 2 === 0;
  ctx.fillStyle = blink ? '#AAFFAA' : 'rgba(170,255,170,0.28)';
  ctx.font = '13px monospace';
  ctx.fillText('PRESS SPACE TO PLAY AGAIN', W/2, H/2+54);
  ctx.textAlign = 'left';
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
function loop() {
  tick++;

  if (state === 'intro') {
    drawIntro();
  } else if (state === 'running') {
    update();
    drawBg();
    obstacles.forEach(o => {
      if (o.type==='cactus')   drawCactus(o);
      else if (o.type==='bat') drawBat(o);
      else                     drawAsteroid(o);
    });
    powerups.forEach(drawPowerUp);
    drawParticles();
    drawDino();
    drawHUD();
  } else { // gameover
    drawBg();
    obstacles.forEach(o => {
      if (o.type==='cactus')   drawCactus(o);
      else if (o.type==='bat') drawBat(o);
      else                     drawAsteroid(o);
    });
    powerups.forEach(drawPowerUp);
    drawParticles();
    drawDino();
    drawHUD();
    drawGameOver();
  }

  requestAnimationFrame(loop);
}

window.addEventListener('load', init);
