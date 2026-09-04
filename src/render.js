/* ============================================================================
   RENDERING
   ========================================================================== */

const screen = document.getElementById("screen");
const sctx = screen.getContext("2d");
sctx.imageSmoothingEnabled = false;

/* Health bars lag behind real damage, so a big combo reads as one long
   drain rather than an instant jump. Purely presentational. */
const hud = [ { trail:1, hp:1 }, { trail:1, hp:1 } ];

function drawBar(ctx, x, y, w, h, frac, trail, flip, color){
  ctx.fillStyle = "#14141f"; ctx.fillRect(x-2, y-2, w+4, h+4);
  ctx.fillStyle = "#2c2c3c"; ctx.fillRect(x, y, w, h);
  const tw = Math.round(w * clamp(trail,0,1)), fw = Math.round(w * clamp(frac,0,1));
  const tx = flip ? x + w - tw : x, fx = flip ? x + w - fw : x;
  ctx.fillStyle = "#ffcf5c"; ctx.fillRect(tx, y, tw, h);
  ctx.fillStyle = color;      ctx.fillRect(fx, y, fw, h);
  ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fillRect(fx, y, fw, 2);
  ctx.fillStyle = "rgba(0,0,0,.28)";       ctx.fillRect(fx, y + h - 2, fw, 2);
}

function drawEffect(ctx, e, camX){
  const x = Math.round(e.x - camX), y = Math.round(e.y), p = e.t / e.life;
  if (e.type === "spark"){
    const r = (e.big ? 15 : 9) * (0.4 + p * 1.5);
    const cols = ["#ffffff","#ffe98a","#ffb03a","#ff6a2a"];
    const c = cols[Math.min(3, Math.floor(p * 4))];
    ctx.fillStyle = c;
    for (let i = 0; i < 8; i++){
      const a = i * Math.PI / 4;
      const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r);
      const s = e.big ? 4 : 3;
      ctx.fillRect(px - (s>>1), py - (s>>1), s, s);
    }
    if (p < 0.5){ ctx.fillStyle = "#fff"; const s = e.big ? 10 : 6; ctx.fillRect(x - (s>>1), y - (s>>1), s, s); }
  } else if (e.type === "guard"){
    ctx.fillStyle = p < 0.5 ? "#bfe9ff" : "#5aa8e0";
    const r = 8 + p * 10;
    for (let i = -2; i <= 2; i++){
      const a = i * 0.35;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 1.6), 3, 3);
    }
  } else if (e.type === "dust"){
    ctx.fillStyle = "rgba(220,215,200," + (1 - p).toFixed(2) + ")";
    const r = 3 + p * 12;
    for (const s of [-1, 1]){
      ctx.fillRect(Math.round(x + s * r), Math.round(y - 2 - p * 3), 3, 2);
      ctx.fillRect(Math.round(x + s * r * 0.6), Math.round(y - 4 - p * 5), 2, 2);
    }
  }
}

function drawProjectile(ctx, pr, camX, frame){
  const x = Math.round(pr.x/FP - camX), y = Math.round(GROUND_Y - pr.y/FP);
  const ph = (frame >> 2) % 3;
  if (pr.kind === "bolt"){
    ctx.fillStyle = "#14141f"; ctx.fillRect(x-10, y-8, 20, 16);
    ctx.fillStyle = "#2e6ad0"; ctx.fillRect(x-9, y-7, 18, 14);
    ctx.fillStyle = "#7fd8ff"; ctx.fillRect(x-6, y-5, 12, 10);
    ctx.fillStyle = "#eaffff"; ctx.fillRect(x-3+ph-1, y-3, 6, 6);
    ctx.fillStyle = "rgba(127,216,255,.5)";
    ctx.fillRect(x - pr.facing*16, y-2, 10, 4);
  } else if (pr.kind === "lance"){
    ctx.fillStyle = "#14141f"; ctx.fillRect(x-12, y-6, 24, 12);
    ctx.fillStyle = "#7d3ce0"; ctx.fillRect(x-11, y-5, 22, 10);
    ctx.fillStyle = "#25f0d0"; ctx.fillRect(x-8, y-3, 16, 6);
    ctx.fillStyle = "#eaffff"; ctx.fillRect(x + pr.facing*4, y-2, 6, 4);
    ctx.fillStyle = "rgba(37,240,208,.45)"; ctx.fillRect(x - pr.facing*22, y-1, 14, 2);
  } else { /* tempest */
    for (let i = 3; i >= 0; i--){
      const s = 8 + i * 5 + (ph*2);
      ctx.fillStyle = ["#eaffff","#a8e8ff","#4da2ff","#1c3fb0"][i];
      ctx.fillRect(x - s, y - s + 2, s*2, s*2 - 4);
    }
  }
}

function drawFighter(ctx, f, camX, opp){
  const pose = f.pose();
  const tint = f.flash > 0 ? "flash" : null;
  const spr = getSprite(f.ch, pose, f.facing, tint);
  const x = Math.round(f.px - camX) - SPRITE_OX;
  const y = Math.round(GROUND_Y - f.py) - SPRITE_OY;
  /* contact shadow, squashed by height off the floor */
  const alt = f.py;
  const sw = Math.max(10, Math.round(30 * f.scale - alt * 0.16));
  ctx.fillStyle = "rgba(0,0,0,.34)";
  ctx.fillRect(Math.round(f.px - camX) - (sw>>1), GROUND_Y - 2, sw, 4);
  ctx.drawImage(spr, x, y);
  /* super-meter-full aura */
  if (f.meter >= METER_MAX && f.state !== S.KNOCKDOWN){
    ctx.globalAlpha = 0.30 + 0.14 * Math.sin(f.animFrame * 0.3);
    ctx.drawImage(getSprite(f.ch, pose, f.facing, "flash"), x, y - 1);
    ctx.globalAlpha = 1;
  }
  void opp;
}

/* Everything in a stage that is not baked into a layer. Crowd figures raise
   and drop their arms on their own cycle, screens flicker, lamps buzz — small
   and cheap, but a still background reads as a painting rather than a place. */
function drawStageProps(ctx, st, camX, frame){
  const P = st.props;
  if (!P) return;
  for (const s of P.screens){
    const x = Math.round(s.x - camX * s.rate);
    if (x < -20 || x > W + 20) continue;
    const t = ((frame + s.phase) * s.speed) | 0;
    ctx.fillStyle = s.rows[t % s.rows.length];
    ctx.fillRect(x, s.y, s.w, s.h);
    if ((t >> 1) % 5 === 0){ ctx.fillStyle = s.flash; ctx.fillRect(x, s.y, s.w, 1); }
  }
  for (const c of P.crowd){
    const x = Math.round(c.x - camX * c.rate);
    if (x < -12 || x > W + 12) continue;
    const up = ((frame + c.phase) % c.period) < (c.period >> 1);
    ctx.fillStyle = c.skin;
    if (up){
      ctx.fillRect(x - 3, c.y - 6, 2, 6);
      ctx.fillRect(x + 2, c.y - 6, 2, 6);
    } else {
      ctx.fillRect(x - 3, c.y - 1, 2, 5);
      ctx.fillRect(x + 2, c.y - 1, 2, 5);
    }
  }
}

function drawHUD(ctx, g){
  const [a, b] = g.fighters;
  const barW = 150, barH = 11;
  for (let i = 0; i < 2; i++){
    const f = g.fighters[i];
    const target = f.hp / f.maxHp;
    hud[i].hp = target;
    if (hud[i].trail > target) hud[i].trail = Math.max(target, hud[i].trail - 0.006);
    else hud[i].trail = target;
    const x = i === 0 ? 12 : W - 12 - barW;
    drawBar(ctx, x, 12, barW, barH, target, hud[i].trail, i === 1, i === 0 ? "#e04a4a" : "#4a9ae0");
    drawText(ctx, f.ch.name, i === 0 ? x : x + barW - textWidth(f.ch.name), 27, "#e8e6f0", 1);
    /* round pips */
    for (let r = 0; r < WINS_NEEDED; r++){
      const px = i === 0 ? x + r*9 : x + barW - 6 - r*9;
      ctx.fillStyle = "#14141f"; ctx.fillRect(px-1, 36, 8, 8);
      ctx.fillStyle = r < f.wins ? "#ffcc33" : "#33334a"; ctx.fillRect(px, 37, 6, 6);
    }
    /* super meter */
    const mx = i === 0 ? 12 : W - 12 - 96;
    const frac = f.meter / METER_MAX;
    ctx.fillStyle = "#14141f"; ctx.fillRect(mx-1, H-16, 98, 9);
    ctx.fillStyle = "#22223a"; ctx.fillRect(mx, H-15, 96, 7);
    const mw = Math.round(96 * frac);
    ctx.fillStyle = frac >= 1 ? (((g.frame>>2)&1) ? "#fff3a0" : "#ffcc33") : f.ch.pal.glow;
    ctx.fillRect(i === 0 ? mx : mx + 96 - mw, H-15, mw, 7);
    drawText(ctx, frac >= 1 ? "SUPER" : "METER", i === 0 ? mx : mx + 96 - textWidth("METER"), H-26,
             frac >= 1 ? "#ffcc33" : "#6a6a86", 1);
  }
  /* timer */
  const secs = Math.max(0, Math.ceil(g.timer / 60));
  const ts = (secs < 10 ? "0" : "") + secs;
  ctx.fillStyle = "#14141f"; ctx.fillRect(W/2 - 22, 8, 44, 26);
  ctx.fillStyle = "#22223a"; ctx.fillRect(W/2 - 20, 10, 40, 22);
  drawTextC(ctx, ts, W/2, 13, secs <= 10 ? "#ff5a5a" : "#ffcc33", 2, 2);

  /* combo counter */
  for (let i = 0; i < 2; i++){
    const f = g.fighters[i];
    if (f.comboShow >= 2 && f.comboShowT > 0){
      const x = i === 0 ? 16 : W - 90;
      drawTextShadow(ctx, f.comboShow + " HIT", x, 52, "#ffcc33", "#14141f", 1);
    }
  }
  void a; void b;
}

function render(g){
  const st = stageFor(g.stage);
  const shakeX = g.shake > 0 ? ((g.frame % 2) ? g.shake : -g.shake) >> 1 : 0;
  const shakeY = g.shake > 0 ? ((g.frame % 3) ? 1 : -1) * (g.shake >> 2) : 0;
  const camX = g.camX;

  sctx.save();
  sctx.translate(shakeX, shakeY);
  sctx.fillStyle = "#05060f"; sctx.fillRect(-8, -8, W+16, H+16);
  sctx.drawImage(st.far,  Math.round(-camX * 0.25), 0);
  sctx.drawImage(st.near, Math.round(-camX * 0.55), 0);
  sctx.drawImage(st.floor, Math.round(-camX), GROUND_Y - 2);

  drawStageProps(sctx, st, camX, g.frame);

  const order = g.fighters[0].state === S.ATTACK ? [1,0] : [0,1];
  for (const i of order) drawFighter(sctx, g.fighters[i], camX, g.fighters[1-i]);
  for (const pr of g.projectiles) drawProjectile(sctx, pr, camX, g.frame);
  for (const e of g.effects) drawEffect(sctx, e, camX);

  /* Foreground last and scrolled fastest: desks and monitors between the
     camera and the fight. */
  if (st.fore) sctx.drawImage(st.fore, Math.round(-camX * 1.34), 0);

  /* The HUD owns the top of the frame. Any stage detail that reaches into it
     competes with the health bars for the same pixels, and in a fight the bars
     have to win. A dithered scrim rather than an alpha fill, so it stays on
     the palette. */
  ditherRect(sctx, 0, 0, W, 40, null, "#000000", 0.34);
  ditherRect(sctx, 0, 40, W, 8, null, "#000000", 0.17);
  sctx.restore();

  drawHUD(sctx, g);

  if (g.announceT > 0 && g.announce){
    const t = g.announce;
    const sc = t.length > 9 ? 2 : 3;
    const y = 76;
    drawTextC(sctx, t, W/2 + 2, y + 2, "#000", sc, 2);
    drawTextC(sctx, t, W/2, y, "#ffcc33", sc, 2);
  }
}
