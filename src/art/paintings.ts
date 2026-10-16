import { Rng, makeRng, range, hashString } from '../core/rng';
import {
  C,
  Ctx,
  H,
  W,
  clipped,
  eggshell,
  fill,
  finish,
  glow,
  grain,
  ground,
  incise,
  leaf,
  linear,
  radial,
  ridge,
} from './lacquer';

export interface Painting {
  id: string;
  title: string;
  /** One-line caption shown under the title. */
  caption: string;
  draw: (ctx: Ctx, rng: Rng) => void;
}

/* ------------------------------------------------------------------ */
/* Vịnh Hạ Long                                                        */
/* ------------------------------------------------------------------ */

function karst(rng: Rng, cx: number, base: number, w: number, h: number) {
  const pts: { x: number; y: number }[] = [];
  const n = 9;
  pts.push({ x: cx - w / 2, y: base + 10 });
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const prof = Math.pow(Math.sin(t * Math.PI), 0.55);
    const lean = (t - 0.5) * range(rng, -0.25, 0.25);
    pts.push({
      x: cx - w / 2 + w * t + lean * w,
      y: base - h * prof * range(rng, 0.85, 1.05),
    });
  }
  pts.push({ x: cx + w / 2, y: base + 10 });
  return pts;
}

function karstPath(pts: { x: number; y: number }[]) {
  return (ctx: Ctx) => {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.closePath();
  };
}

function junk(ctx: Ctx, rng: Rng, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // Hull
  const hull = (c: Ctx) => {
    c.moveTo(-110, -8);
    c.quadraticCurveTo(-60, 30, 0, 26);
    c.quadraticCurveTo(70, 24, 120, -14);
    c.lineTo(80, -6);
    c.lineTo(-80, -2);
    c.closePath();
  };
  fill(ctx, hull, linear(ctx, 0, -10, 0, 26, [[0, C.umber], [1, C.black]]));
  incise(ctx, (c) => { c.moveTo(-104, -6); c.quadraticCurveTo(0, 14, 116, -12); }, 2.5);
  // Three batten sails (buồm cánh dơi), fan-shaped.
  const sails = [
    { x: -62, h: 150, w: 70 },
    { x: 0, h: 190, w: 86 },
    { x: 58, h: 130, w: 62 },
  ];
  for (const sl of sails) {
    const path = (c: Ctx) => {
      c.moveTo(sl.x, -6);
      c.lineTo(sl.x - sl.w * 0.15, -sl.h);
      c.quadraticCurveTo(sl.x + sl.w * 0.5, -sl.h - 18, sl.x + sl.w * 0.85, -sl.h * 0.78);
      c.quadraticCurveTo(sl.x + sl.w * 1.05, -sl.h * 0.35, sl.x + sl.w * 0.7, -10);
      c.closePath();
    };
    fill(ctx, path, linear(ctx, sl.x, -sl.h, sl.x + sl.w, 0, [[0, C.vermilion], [0.6, C.cinnabar], [1, C.oxblood]]));
    clipped(ctx, path, () => {
      leaf(ctx, rng, { x: sl.x - 20, y: -sl.h - 20, w: sl.w + 40, h: sl.h + 20 }, 22, [3, 7], 'gold', 0.35);
      for (let k = 1; k < 7; k++) {
        const t = k / 7;
        incise(ctx, (c) => {
          c.moveTo(sl.x - sl.w * 0.15 * (1 - t), -sl.h * (1 - t) - 6 * t);
          c.quadraticCurveTo(sl.x + sl.w * 0.5, -sl.h * (1 - t) - 10, sl.x + sl.w * 0.95, -sl.h * (0.8 - t * 0.75));
        }, 1.6, C.goldPale, 0.7);
      }
    });
    incise(ctx, (c) => { c.moveTo(sl.x, -4); c.lineTo(sl.x - sl.w * 0.15, -sl.h - 6); }, 3, C.umber, 1);
  }
  ctx.restore();
}

function haLong(ctx: Ctx, rng: Rng) {
  const horizon = 540;
  ctx.fillStyle = linear(ctx, 0, 0, 0, horizon, [
    [0, '#240b08'],
    [0.35, C.oxblood],
    [0.72, C.cinnabar],
    [0.92, C.ochre],
    [1, C.goldPale],
  ]);
  ctx.fillRect(0, 0, W, horizon);
  grain(ctx, rng, 0, 0, W, horizon, 0.06);

  // Sun in gold leaf.
  const sun = { x: 790, y: 330, r: 112 };
  const sunPath = (c: Ctx) => c.arc(sun.x, sun.y, sun.r, 0, Math.PI * 2);
  glow(ctx, sun.x, sun.y, 300, 'rgba(255,200,120,0.55)', 0.7);
  fill(ctx, sunPath, radial(ctx, sun.x - 30, sun.y - 30, 10, sun.r, [[0, C.goldPale], [1, C.gold]]));
  clipped(ctx, sunPath, () => leaf(ctx, rng, { x: sun.x - sun.r, y: sun.y - sun.r, w: sun.r * 2, h: sun.r * 2 }, 120, [8, 16]));

  // Stylised cloud bands.
  for (let i = 0; i < 6; i++) {
    const y = 120 + i * 58 + range(rng, -10, 10);
    const x = range(rng, -100, 900);
    const w = range(rng, 220, 480);
    const band = (c: Ctx) => c.roundRect(x, y, w, 10 + rng() * 6, 8);
    fill(ctx, band, `rgba(243,220,152,${0.18 + rng() * 0.25})`);
  }
  leaf(ctx, rng, { x: 0, y: 430, w: W, h: 110 }, 18, [4, 9], 'gold', 0.4);

  // Far islands, hazy and silver-leafed.
  const farColor = 'rgba(142,62,38,0.85)';
  for (let i = 0; i < 9; i++) {
    const pts = karst(rng, range(rng, 40, 1160), horizon, range(rng, 70, 150), range(rng, 70, 170));
    const p = karstPath(pts);
    fill(ctx, p, farColor);
    clipped(ctx, p, () => leaf(ctx, rng, { x: 0, y: 300, w: W, h: 250 }, 6, [3, 6], 'silver', 0.35));
  }

  // Water.
  ctx.fillStyle = linear(ctx, 0, horizon, 0, H, [
    [0, '#6b2a18'],
    [0.25, '#3a140c'],
    [1, '#160806'],
  ]);
  ctx.fillRect(0, horizon, W, H - horizon);

  // Sun column reflection.
  for (let i = 0; i < 120; i++) {
    const t = rng();
    const y = horizon + 6 + t * (H - horizon - 20);
    const spread = 40 + t * 120;
    const x = sun.x + range(rng, -spread, spread);
    const w = range(rng, 20, 70) * (1 - t * 0.4);
    ctx.fillStyle = rng() > 0.3 ? `rgba(240,200,110,${0.75 - t * 0.5})` : `rgba(239,230,210,${0.6 - t * 0.4})`;
    ctx.fillRect(x - w / 2, y, w, 2 + t * 4);
  }

  // Mid islands with incised gold rims.
  for (let i = 0; i < 6; i++) {
    const cx = range(rng, 60, 1140);
    const pts = karst(rng, cx, horizon + 30, range(rng, 120, 220), range(rng, 160, 280));
    const p = karstPath(pts);
    fill(ctx, p, linear(ctx, cx - 100, 0, cx + 100, 0, [[0, '#6e2716'], [0.5, '#4a1a10'], [1, '#2c0f09']]));
    clipped(ctx, p, () => {
      leaf(ctx, rng, { x: cx - 140, y: 200, w: 120, h: 380 }, 10, [3, 7], 'gold', 0.5);
      for (let k = 0; k < 5; k++) {
        const y = horizon + 30 - range(rng, 30, 240);
        incise(ctx, (c) => { c.moveTo(cx - 140, y); c.quadraticCurveTo(cx, y - 18, cx + 140, y + 6); }, 1.2, C.goldDeep, 0.6);
      }
    });
    // Reflection.
    ctx.save();
    ctx.translate(0, (horizon + 30) * 2);
    ctx.scale(1, -0.35);
    ctx.globalAlpha = 0.25;
    fill(ctx, p, '#1a0806');
    ctx.restore();
  }

  // Near karsts, dark with eggshell-lit faces.
  const near = [
    { cx: 90, w: 300, h: 560 },
    { cx: 1130, w: 260, h: 470 },
  ];
  for (const n of near) {
    const pts = karst(rng, n.cx, horizon + 120, n.w, n.h);
    const p = karstPath(pts);
    fill(ctx, p, linear(ctx, n.cx - n.w / 2, 0, n.cx + n.w / 2, 0, [[0, '#3a140c'], [1, '#140705']]));
    clipped(ctx, p, () => {
      ctx.save();
      ctx.globalAlpha = 0.85;
      const side = n.cx < W / 2 ? n.cx + n.w * 0.05 : n.cx - n.w * 0.45;
      clipped(ctx, (c) => {
        c.moveTo(side, horizon + 140);
        c.quadraticCurveTo(side + n.w * 0.25, horizon - n.h * 0.6, side + n.w * 0.12, horizon - n.h);
        c.lineTo(side + n.w * 0.4, horizon - n.h);
        c.lineTo(side + n.w * 0.42, horizon + 140);
        c.closePath();
      }, () => eggshell(ctx, rng, { x: side - 20, y: horizon - n.h - 20, w: n.w * 0.5, h: n.h + 180 }, 13,
        ['#d8c8a6', '#c4b18c', '#e6d8bb', '#b39d78']));
      ctx.restore();
      leaf(ctx, rng, { x: n.cx - n.w / 2, y: horizon - n.h, w: n.w, h: n.h }, 6, [3, 6], 'gold', 0.7);
    });
    incise(ctx, p, 2.5, C.gold, 0.55);
  }

  // Ripples.
  for (let i = 0; i < 260; i++) {
    const t = Math.pow(rng(), 0.7);
    const y = horizon + 40 + t * (H - horizon - 40);
    const x = rng() * W;
    const w = 10 + t * 50;
    ctx.fillStyle = rng() > 0.5 ? `rgba(224,182,90,${0.25 + t * 0.4})` : `rgba(239,230,210,${0.15 + t * 0.3})`;
    ctx.fillRect(x, y, w, 1.5 + t * 2);
  }

  junk(ctx, rng, 430, 660, 1.15);
  junk(ctx, rng, 1000, 590, 0.55);

  // Gulls.
  for (let i = 0; i < 7; i++) {
    const x = range(rng, 320, 700);
    const y = range(rng, 150, 300);
    const s = range(rng, 8, 16);
    incise(ctx, (c) => {
      c.moveTo(x - s, y);
      c.quadraticCurveTo(x - s / 2, y - s / 2, x, y);
      c.quadraticCurveTo(x + s / 2, y - s / 2, x + s, y);
    }, 2.2, C.egg, 0.9);
  }
}

/* ------------------------------------------------------------------ */
/* Phố cổ Hội An                                                       */
/* ------------------------------------------------------------------ */

function lantern(ctx: Ctx, rng: Rng, x: number, y: number, r: number, color: string) {
  glow(ctx, x, y, r * 4.2, color === C.gold ? 'rgba(255,210,120,0.8)' : 'rgba(255,120,70,0.75)', 0.5);
  incise(ctx, (c) => { c.moveTo(x, y - r * 1.25); c.lineTo(x, y - r * 2); }, 1.5, C.goldDeep, 1);
  const body = (c: Ctx) => c.ellipse(x, y, r * 0.86, r, 0, 0, Math.PI * 2);
  fill(ctx, body, radial(ctx, x - r * 0.3, y - r * 0.3, r * 0.1, r * 1.1, [
    [0, color === C.gold ? C.goldPale : '#ff9a62'],
    [0.7, color],
    [1, color === C.gold ? C.goldDeep : C.oxblood],
  ]));
  for (let k = -2; k <= 2; k++) {
    incise(ctx, (c) => c.ellipse(x, y, Math.abs(k) * r * 0.2 + 0.5, r, 0, 0, Math.PI * 2), 1, 'rgba(60,20,10,0.6)', 1);
  }
  fill(ctx, (c) => c.rect(x - r * 0.4, y - r * 1.15, r * 0.8, r * 0.22), C.goldDeep);
  fill(ctx, (c) => c.rect(x - r * 0.4, y + r * 0.93, r * 0.8, r * 0.22), C.goldDeep);
  incise(ctx, (c) => { c.moveTo(x, y + r * 1.15); c.lineTo(x + range(rng, -2, 2), y + r * 1.9); }, 2, C.cinnabar, 1);
}

function hoiAn(ctx: Ctx, rng: Rng) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, 600, [
    [0, '#140605'],
    [0.6, '#2e0f0a'],
    [1, '#4a1a10'],
  ]);
  ctx.fillRect(0, 0, W, 600);
  grain(ctx, rng, 0, 0, W, 600, 0.06);
  leaf(ctx, rng, { x: 0, y: 0, w: W, h: 220 }, 4, [1.5, 3.5], 'silver', 0.8);

  // Crescent moon.
  clipped(ctx, (c) => c.arc(1040, 110, 46, 0, Math.PI * 2), () => {
    eggshell(ctx, rng, { x: 990, y: 60, w: 100, h: 100 }, 9);
    fill(ctx, (c) => c.arc(1062, 96, 44, 0, Math.PI * 2), '#1a0806');
  });

  const street = 560;
  let x = -20;
  const houses: { x: number; w: number; top: number }[] = [];
  while (x < W + 20) {
    const w = range(rng, 170, 250);
    houses.push({ x, w, top: range(rng, 220, 300) });
    x += w;
  }

  // Walls.
  for (const hs of houses) {
    const wall = (c: Ctx) => c.rect(hs.x, hs.top + 40, hs.w, street - hs.top - 40);
    fill(ctx, wall, linear(ctx, 0, hs.top, 0, street, [[0, '#d99a34'], [0.5, C.ochre], [1, '#8d5a1c']]));
    clipped(ctx, wall, () => {
      leaf(ctx, rng, { x: hs.x, y: hs.top, w: hs.w, h: street - hs.top }, 26, [4, 10], 'gold', 0.45);
      grain(ctx, rng, hs.x, hs.top, hs.w, street - hs.top, 0.15);
      // Weathering streaks.
      for (let k = 0; k < 6; k++) {
        const sx = hs.x + rng() * hs.w;
        fill(ctx, (c) => c.rect(sx, hs.top + 40, range(rng, 3, 10), range(rng, 40, 160)), 'rgba(90,40,10,0.18)');
      }
    });
    // Upper floor: wooden balcony.
    const mid = hs.top + 40 + (street - hs.top - 40) * 0.42;
    fill(ctx, (c) => c.rect(hs.x + 6, mid - 6, hs.w - 12, 12), C.umber);
    for (let bx = hs.x + 14; bx < hs.x + hs.w - 10; bx += 14) {
      incise(ctx, (c) => { c.moveTo(bx, mid - 34); c.lineTo(bx, mid - 6); }, 2, C.umber, 1);
    }
    fill(ctx, (c) => c.rect(hs.x + 6, mid - 38, hs.w - 12, 5), C.umber);
    // Upper windows.
    const wins = Math.max(1, Math.floor(hs.w / 90));
    for (let k = 0; k < wins; k++) {
      const wx = hs.x + (hs.w / wins) * (k + 0.5) - 26;
      const wy = hs.top + 60;
      fill(ctx, (c) => c.rect(wx, wy, 52, mid - wy - 46), '#3a170c');
      glow(ctx, wx + 26, wy + 30, 50, 'rgba(255,190,100,0.5)', 0.35);
      for (let s = 0; s < 4; s++) incise(ctx, (c) => { c.moveTo(wx + 6 + s * 13, wy); c.lineTo(wx + 6 + s * 13, mid - 46); }, 1.4, C.gold, 0.6);
    }
    // Shop doors below, lit from inside.
    const door = (c: Ctx) => c.rect(hs.x + hs.w * 0.18, mid + 22, hs.w * 0.64, street - mid - 22);
    fill(ctx, door, linear(ctx, 0, mid, 0, street, [[0, '#ffcf7a'], [1, '#c26a24']]));
    clipped(ctx, door, () => {
      for (let s = 0; s < 6; s++) {
        const dx = hs.x + hs.w * 0.18 + (hs.w * 0.64 * s) / 6;
        fill(ctx, (c) => c.rect(dx, mid + 22, 5, street), C.umber);
      }
    });
    // Tiled roof (ngói âm dương).
    const roof = (c: Ctx) => {
      c.moveTo(hs.x - 18, hs.top + 52);
      c.quadraticCurveTo(hs.x + hs.w / 2, hs.top + 36, hs.x + hs.w + 18, hs.top + 52);
      c.lineTo(hs.x + hs.w - 10, hs.top);
      c.lineTo(hs.x + 10, hs.top);
      c.closePath();
    };
    fill(ctx, roof, linear(ctx, 0, hs.top, 0, hs.top + 52, [[0, '#5a2414'], [1, '#2c0f09']]));
    clipped(ctx, roof, () => {
      for (let tx = hs.x - 18; tx < hs.x + hs.w + 18; tx += 9) {
        incise(ctx, (c) => { c.moveTo(tx, hs.top); c.lineTo(tx + (tx - hs.x - hs.w / 2) * 0.05, hs.top + 56); }, 2.5, 'rgba(160,70,40,0.6)', 1);
      }
    });
    incise(ctx, (c) => { c.moveTo(hs.x - 18, hs.top + 52); c.quadraticCurveTo(hs.x + hs.w / 2, hs.top + 36, hs.x + hs.w + 18, hs.top + 52); }, 3, C.gold, 0.8);
    // Lower awning.
    fill(ctx, (c) => {
      c.moveTo(hs.x - 8, mid + 22);
      c.lineTo(hs.x + hs.w + 8, mid + 22);
      c.lineTo(hs.x + hs.w, mid);
      c.lineTo(hs.x, mid);
      c.closePath();
    }, '#4a1c10');
  }

  // Lantern strings.
  for (let row = 0; row < 2; row++) {
    const y0 = row === 0 ? 200 : 330;
    const sag = 40;
    incise(ctx, (c) => { c.moveTo(0, y0); c.quadraticCurveTo(W / 2, y0 + sag * 2, W, y0); }, 1.2, C.goldDeep, 0.8);
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5 + row * 0.5) / 9.5;
      const lx = t * W;
      const ly = y0 + 2 * sag * 2 * t * (1 - t) + 22;
      const colors = [C.cinnabar, C.gold, C.vermilion, C.gold, C.cinnabar];
      lantern(ctx, rng, lx, ly, range(rng, 16, 24), colors[(i + row) % colors.length]);
    }
  }

  // Stone embankment.
  const bank = (c: Ctx) => c.rect(0, street, W, 46);
  clipped(ctx, bank, () => eggshell(ctx, rng, { x: 0, y: street, w: W, h: 46 }, 22, ['#8a7a64', '#6f604c', '#9a8a70', '#5a4c3a']));
  incise(ctx, (c) => { c.moveTo(0, street); c.lineTo(W, street); }, 2, C.gold, 0.6);

  // River with reflections.
  const river = street + 46;
  ctx.fillStyle = linear(ctx, 0, river, 0, H, [[0, '#2a0f0a'], [1, '#0f0504']]);
  ctx.fillRect(0, river, W, H - river);
  for (const hs of houses) {
    for (let k = 0; k < 14; k++) {
      const y = river + 6 + k * 18 + range(rng, -4, 4);
      const w = hs.w * range(rng, 0.3, 0.8);
      ctx.fillStyle = `rgba(201,138,46,${0.32 - k * 0.02})`;
      ctx.fillRect(hs.x + range(rng, 0, hs.w - w), y, w, 4);
    }
  }
  for (let i = 0; i < 18; i++) {
    const lx = ((i + 0.5) / 18) * W + range(rng, -20, 20);
    for (let k = 0; k < 10; k++) {
      ctx.fillStyle = rng() > 0.5 ? `rgba(255,150,80,${0.5 - k * 0.04})` : `rgba(240,200,110,${0.5 - k * 0.04})`;
      ctx.fillRect(lx + range(rng, -10, 10), river + 10 + k * 22, range(rng, 10, 24), 3);
    }
  }

  // Floating flower lanterns (đèn hoa đăng).
  for (let i = 0; i < 9; i++) {
    const fx = range(rng, 60, 1140);
    const fy = range(rng, river + 60, H - 40);
    const s = 0.6 + ((fy - river) / (H - river)) * 0.8;
    glow(ctx, fx, fy - 6 * s, 60 * s, 'rgba(255,200,110,0.9)', 0.5);
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI - Math.PI;
      fill(ctx, (c) => c.ellipse(fx + Math.cos(a) * 12 * s, fy + Math.sin(a) * 5 * s, 7 * s, 11 * s, a + Math.PI / 2, 0, Math.PI * 2),
        p % 2 ? C.rose : C.egg);
    }
    fill(ctx, (c) => c.arc(fx, fy - 8 * s, 4 * s, 0, Math.PI * 2), C.goldPale);
  }

  // Sampan with a rower in a conical hat.
  ctx.save();
  ctx.translate(300, 720);
  fill(ctx, (c) => {
    c.moveTo(-120, -10);
    c.quadraticCurveTo(0, 30, 130, -16);
    c.lineTo(100, 4);
    c.quadraticCurveTo(0, 22, -96, 6);
    c.closePath();
  }, C.black);
  incise(ctx, (c) => { c.moveTo(-118, -9); c.quadraticCurveTo(0, 28, 128, -15); }, 2.5, C.gold, 0.9);
  fill(ctx, (c) => c.rect(40, -60, 16, 54), C.umber);
  fill(ctx, (c) => { c.moveTo(48, -98); c.lineTo(84, -60); c.lineTo(12, -60); c.closePath(); }, C.egg);
  clipped(ctx, (c) => { c.moveTo(48, -98); c.lineTo(84, -60); c.lineTo(12, -60); c.closePath(); },
    () => eggshell(ctx, rng, { x: 10, y: -100, w: 76, h: 42 }, 7));
  incise(ctx, (c) => { c.moveTo(56, -40); c.lineTo(130, 40); }, 3, C.goldDeep, 1);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Ruộng bậc thang                                                     */
/* ------------------------------------------------------------------ */

function terraces(ctx: Ctx, rng: Rng) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, 380, [
    [0, '#3a120c'],
    [0.5, C.cinnabar],
    [0.85, C.ochre],
    [1, C.goldPale],
  ]);
  ctx.fillRect(0, 0, W, 380);
  grain(ctx, rng, 0, 0, W, 380, 0.06);
  const sun = (c: Ctx) => c.arc(300, 190, 64, 0, Math.PI * 2);
  glow(ctx, 300, 190, 220, 'rgba(255,220,150,0.6)', 0.6);
  fill(ctx, sun, C.goldPale);
  clipped(ctx, sun, () => leaf(ctx, rng, { x: 230, y: 120, w: 140, h: 140 }, 140, [6, 12]));

  // Distant ranges in silver leaf and mist.
  const ranges = [
    { y: 300, amp: 120, color: 'rgba(156,195,188,0.55)' },
    { y: 340, amp: 100, color: 'rgba(112,140,130,0.75)' },
    { y: 380, amp: 90, color: 'rgba(70,80,64,0.9)' },
  ];
  for (const r of ranges) {
    const p = ridge(rng, -40, W + 40, r.y, r.amp, 9, 520);
    fill(ctx, p, r.color);
    clipped(ctx, p, () => leaf(ctx, rng, { x: 0, y: r.y - r.amp, w: W, h: r.amp + 40 }, 8, [3, 7], 'silver', 0.45));
  }
  for (let i = 0; i < 5; i++) {
    fill(ctx, (c) => c.roundRect(range(rng, -100, 900), range(rng, 300, 420), range(rng, 300, 600), 14, 7), 'rgba(230,228,215,0.18)');
  }

  // Three terraced hills; each band follows the hill's contour.
  const hills = [
    { x0: -100, x1: 760, top: 400, amp: 140, base: H, seed: 1 },
    { x0: 480, x1: 1300, top: 470, amp: 160, base: H, seed: 2 },
    { x0: -200, x1: 620, top: 640, amp: 110, base: H, seed: 3 },
  ];
  const bandColors = [C.gold, C.ochre, '#d9a441', '#b88a2c', '#8b8a34', '#6f7a3a', C.goldPale];
  for (const hl of hills) {
    const steps = 60;
    const contour = (k: number) => {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = hl.x0 + (hl.x1 - hl.x0) * t;
        const env = Math.sin(t * Math.PI);
        const wob = Math.sin(t * 9 + hl.seed * 3 + k * 0.7) * 6 + Math.sin(t * 23 + k) * 2.5;
        pts.push({ x, y: hl.top - env * hl.amp + k * (10 + env * 9) + wob * (k > 0 ? 1 : 0.3) });
      }
      return pts;
    };
    const hillTop = contour(0);
    const hillPath = (c: Ctx) => {
      c.moveTo(hl.x0, hl.base);
      hillTop.forEach((p) => c.lineTo(p.x, p.y));
      c.lineTo(hl.x1, hl.base);
      c.closePath();
    };
    fill(ctx, hillPath, '#3a1a0c');
    clipped(ctx, hillPath, () => {
      let prev = hillTop;
      for (let k = 1; k < 40; k++) {
        const cur = contour(k);
        const color = bandColors[Math.floor(rng() * bandColors.length)];
        ctx.beginPath();
        prev.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        for (let i = cur.length - 1; i >= 0; i--) ctx.lineTo(cur[i].x, cur[i].y);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        // Paddy rim catches light (eggshell line) above a dark bund.
        ctx.beginPath();
        cur.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.strokeStyle = 'rgba(40,16,8,0.9)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        cur.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y - 2.5) : ctx.lineTo(p.x, p.y - 2.5)));
        ctx.strokeStyle = rng() > 0.6 ? 'rgba(239,230,210,0.85)' : 'rgba(243,220,152,0.6)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        prev = cur;
      }
      leaf(ctx, rng, { x: hl.x0, y: hl.top - hl.amp, w: hl.x1 - hl.x0, h: hl.base - hl.top + hl.amp }, 10, [3, 7], 'gold', 0.55);
      // Shadow side of the hill.
      ctx.fillStyle = linear(ctx, hl.x0, 0, hl.x1, 0, [[0, 'rgba(20,6,4,0)'], [0.6, 'rgba(20,6,4,0)'], [1, 'rgba(20,6,4,0.5)']]);
      ctx.fillRect(hl.x0, 0, hl.x1 - hl.x0, H);
    });
  }

  // Stilt house on the right hill.
  ctx.save();
  ctx.translate(930, 410);
  for (const px of [-40, -14, 14, 40]) fill(ctx, (c) => c.rect(px - 3, 0, 6, 40), C.black);
  fill(ctx, (c) => c.rect(-52, -40, 104, 42), '#4a2010');
  for (let k = -44; k < 50; k += 12) incise(ctx, (c) => { c.moveTo(k, -38); c.lineTo(k, 0); }, 1.5, C.goldDeep, 0.9);
  const roof = (c: Ctx) => { c.moveTo(-72, -36); c.lineTo(0, -98); c.lineTo(72, -36); c.closePath(); };
  fill(ctx, roof, linear(ctx, 0, -98, 0, -36, [[0, C.goldPale], [1, C.ochre]]));
  clipped(ctx, roof, () => {
    for (let k = -80; k < 80; k += 5) incise(ctx, (c) => { c.moveTo(k, -100); c.lineTo(k * 1.05, -30); }, 1, C.goldDeep, 0.7);
  });
  fill(ctx, (c) => c.rect(-14, -30, 28, 22), '#ffcf7a');
  ctx.restore();

  // Foreground rice stalks.
  for (let i = 0; i < 90; i++) {
    const bx = range(rng, -20, 560);
    const by = H + 10;
    const h = range(rng, 60, 170);
    const bend = range(rng, 10, 50);
    incise(ctx, (c) => { c.moveTo(bx, by); c.quadraticCurveTo(bx + bend * 0.3, by - h * 0.6, bx + bend, by - h); }, range(rng, 1.5, 3),
      rng() > 0.4 ? C.gold : C.goldPale, 0.9);
    for (let g = 0; g < 5; g++) {
      const t = 0.75 + g * 0.05;
      fill(ctx, (c) => c.ellipse(bx + bend * t, by - h * t, 2, 5, 0.6, 0, Math.PI * 2), C.goldPale);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Đầm sen                                                             */
/* ------------------------------------------------------------------ */

function lotusLeaf(ctx: Ctx, rng: Rng, x: number, y: number, rx: number, ry: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const notch = range(rng, 0.08, 0.16);
  const leafPath = (c: Ctx) => {
    c.moveTo(0, 0);
    c.ellipse(0, 0, rx, ry, 0, -Math.PI / 2 + notch, Math.PI * 1.5 - notch);
    c.closePath();
  };
  fill(ctx, leafPath, radial(ctx, 0, 0, 4, rx, [[0, '#6f8a3e'], [0.45, C.jade], [1, C.jadeDeep]]));
  clipped(ctx, leafPath, () => {
    leaf(ctx, rng, { x: -rx, y: -ry, w: rx * 0.9, h: ry * 1.2 }, 14, [4, 9], 'gold', 0.45);
    for (let k = 0; k < 16; k++) {
      const a = -Math.PI / 2 + notch + (k / 16) * (Math.PI * 2 - notch * 2);
      incise(ctx, (c) => { c.moveTo(0, 0); c.lineTo(Math.cos(a) * rx, Math.sin(a) * ry); }, 1.4, C.gold, 0.55);
    }
  });
  incise(ctx, leafPath, 2.2, C.gold, 0.85);
  fill(ctx, (c) => c.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2), C.goldPale);
  ctx.restore();
}

function lotusFlower(ctx: Ctx, rng: Rng, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  glow(ctx, 0, -40, 160, 'rgba(255,170,150,0.5)', 0.4);
  const petal = (a: number, len: number, wid: number) => (c: Ctx) => {
    c.save();
    c.rotate(a);
    c.moveTo(0, 0);
    c.bezierCurveTo(wid, -len * 0.3, wid * 0.7, -len * 0.8, 0, -len);
    c.bezierCurveTo(-wid * 0.7, -len * 0.8, -wid, -len * 0.3, 0, 0);
    c.restore();
  };
  const layers = [
    { n: 7, len: 120, wid: 44, spread: 1.9, tone: [C.cinnabar, C.rose] },
    { n: 5, len: 130, wid: 40, spread: 1.3, tone: [C.rose, '#f2c3b1'] },
    { n: 3, len: 120, wid: 36, spread: 0.6, tone: ['#f2c3b1', C.egg] },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const a = -L.spread / 2 + (L.spread * i) / Math.max(1, L.n - 1);
      const p = petal(a, L.len, L.wid);
      fill(ctx, p, linear(ctx, 0, -L.len, 0, 0, [[0, L.tone[0]], [1, L.tone[1]]]));
      clipped(ctx, p, () => eggshell(ctx, rng, { x: -L.len, y: -L.len - 10, w: L.len * 2, h: L.len * 0.55 }, 9,
        ['#f6d7c8', '#ecbfae', '#f8e6da', '#e2a996'], 'rgba(120,30,20,0.45)'));
      incise(ctx, p, 1.6, C.gold, 0.8);
    }
  }
  fill(ctx, (c) => c.ellipse(0, -18, 24, 12, 0, 0, Math.PI * 2), C.gold);
  for (let k = 0; k < 7; k++) fill(ctx, (c) => c.arc(-15 + k * 5, -20 + (k % 2) * 4, 2.4, 0, Math.PI * 2), C.goldDeep);
  ctx.restore();
}

function koi(ctx: Ctx, rng: Rng, x: number, y: number, s: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  const body = (c: Ctx) => {
    c.moveTo(60, 0);
    c.bezierCurveTo(50, -22, 0, -26, -40, -8);
    c.lineTo(-60, -22);
    c.lineTo(-56, 0);
    c.lineTo(-60, 22);
    c.lineTo(-40, 8);
    c.bezierCurveTo(0, 26, 50, 22, 60, 0);
    c.closePath();
  };
  fill(ctx, body, C.egg);
  clipped(ctx, body, () => {
    eggshell(ctx, rng, { x: -64, y: -30, w: 128, h: 60 }, 8);
    for (let k = 0; k < 3; k++) fill(ctx, (c) => c.ellipse(range(rng, -30, 40), range(rng, -10, 10), range(rng, 12, 22), range(rng, 8, 14), rng(), 0, Math.PI * 2), C.cinnabar);
  });
  fill(ctx, (c) => { c.moveTo(10, -18); c.quadraticCurveTo(0, -40, -16, -20); c.closePath(); }, 'rgba(224,182,90,0.85)');
  fill(ctx, (c) => { c.moveTo(10, 18); c.quadraticCurveTo(0, 40, -16, 20); c.closePath(); }, 'rgba(224,182,90,0.85)');
  fill(ctx, (c) => c.arc(44, -6, 3, 0, Math.PI * 2), C.black);
  ctx.restore();
}

function lotus(ctx: Ctx, rng: Rng) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, H, [[0, '#0f1d17'], [0.5, '#16110b'], [1, '#1a0b08']]);
  ctx.fillRect(0, 0, W, H);
  grain(ctx, rng, 0, 0, W, H, 0.06);
  leaf(ctx, rng, { x: 0, y: 0, w: W, h: H }, 2, [2, 5], 'gold', 0.5);

  // Ripple rings.
  for (let i = 0; i < 9; i++) {
    const rx = range(rng, 0, W);
    const ry = range(rng, 0, H);
    for (let k = 1; k < 5; k++) {
      incise(ctx, (c) => c.ellipse(rx, ry, k * 26, k * 10, 0, 0, Math.PI * 2), 1.2, C.gold, 0.5 - k * 0.09);
    }
  }

  koi(ctx, rng, 330, 620, 1.3, -0.4);
  koi(ctx, rng, 1010, 400, 1.0, 2.6);
  koi(ctx, rng, 1000, 760, 0.9, 3.4);

  const leaves = [
    { x: 160, y: 200, rx: 170, ry: 92, r: 0.3 },
    { x: 560, y: 120, rx: 150, ry: 78, r: -0.2 },
    { x: 1040, y: 160, rx: 180, ry: 96, r: 0.5 },
    { x: 760, y: 520, rx: 200, ry: 104, r: 2.4 },
    { x: 120, y: 760, rx: 190, ry: 98, r: 1.4 },
    { x: 560, y: 820, rx: 160, ry: 80, r: 3.6 },
    { x: 1100, y: 560, rx: 140, ry: 74, r: 4.2 },
  ];
  for (const l of leaves) lotusLeaf(ctx, rng, l.x, l.y, l.rx, l.ry, l.r);

  // Stems.
  const stems = [
    { x: 420, y: 520, bx: 470, by: 900 },
    { x: 880, y: 360, bx: 860, by: 900 },
    { x: 640, y: 300, bx: 600, by: 900 },
    { x: 260, y: 430, bx: 300, by: 900 },
  ];
  for (const st of stems) {
    incise(ctx, (c) => { c.moveTo(st.bx, st.by); c.quadraticCurveTo((st.x + st.bx) / 2 + 40, (st.y + st.by) / 2, st.x, st.y); }, 7, '#2a3a20', 1);
    incise(ctx, (c) => { c.moveTo(st.bx, st.by); c.quadraticCurveTo((st.x + st.bx) / 2 + 40, (st.y + st.by) / 2, st.x, st.y); }, 1.5, C.gold, 0.6);
  }
  lotusFlower(ctx, rng, 420, 520, 1.25);
  lotusFlower(ctx, rng, 880, 360, 0.95);

  // Closed buds.
  for (const b of [{ x: 640, y: 300 }, { x: 260, y: 430 }]) {
    const bud = (c: Ctx) => {
      c.moveTo(b.x, b.y);
      c.bezierCurveTo(b.x + 30, b.y - 30, b.x + 14, b.y - 76, b.x, b.y - 96);
      c.bezierCurveTo(b.x - 14, b.y - 76, b.x - 30, b.y - 30, b.x, b.y);
    };
    fill(ctx, bud, linear(ctx, 0, b.y - 96, 0, b.y, [[0, C.cinnabar], [1, C.rose]]));
    incise(ctx, bud, 1.6, C.gold, 0.9);
    incise(ctx, (c) => { c.moveTo(b.x, b.y - 6); c.quadraticCurveTo(b.x + 8, b.y - 50, b.x, b.y - 92); }, 1.2, C.gold, 0.7);
  }

  // Dragonfly.
  ctx.save();
  ctx.translate(640, 230);
  ctx.rotate(-0.3);
  fill(ctx, (c) => c.roundRect(-40, -3, 80, 6, 3), C.gold);
  for (const [wx, wy, a] of [[-6, -4, -0.4], [-6, 4, 0.4], [8, -4, -0.2], [8, 4, 0.2]] as const) {
    fill(ctx, (c) => c.ellipse(wx, wy + Math.sign(wy) * 20, 9, 24, a, 0, Math.PI * 2), 'rgba(201,207,204,0.6)');
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Trăng rằm                                                           */
/* ------------------------------------------------------------------ */

function crane(ctx: Ctx, rng: Rng, x: number, y: number, s: number, flip: boolean, wingUp: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  const body = (c: Ctx) => c.ellipse(0, 0, 46, 14, -0.1, 0, Math.PI * 2);
  // Far wing.
  const wingFar = (c: Ctx) => {
    c.moveTo(-10, -6);
    c.quadraticCurveTo(10, -70 * wingUp, 40, -110 * wingUp);
    c.quadraticCurveTo(30, -40 * wingUp, 24, -4);
    c.closePath();
  };
  fill(ctx, wingFar, C.eggShade);
  // Neck & head.
  incise(ctx, (c) => { c.moveTo(36, -4); c.quadraticCurveTo(70, -8, 100, -16); }, 6, C.egg, 1);
  incise(ctx, (c) => { c.moveTo(70, -9); c.quadraticCurveTo(84, -12, 100, -16); }, 6, C.black, 1);
  fill(ctx, (c) => c.arc(102, -17, 6, 0, Math.PI * 2), C.black);
  fill(ctx, (c) => c.arc(102, -21, 3.2, 0, Math.PI * 2), C.cinnabar);
  incise(ctx, (c) => { c.moveTo(106, -16); c.lineTo(132, -12); }, 3, C.gold, 1);
  // Legs trailing.
  incise(ctx, (c) => { c.moveTo(-40, 4); c.lineTo(-110, 14); }, 2.5, C.black, 1);
  incise(ctx, (c) => { c.moveTo(-40, 8); c.lineTo(-108, 20); }, 2.5, C.black, 1);
  fill(ctx, body, C.egg);
  clipped(ctx, body, () => eggshell(ctx, rng, { x: -50, y: -16, w: 100, h: 32 }, 7));
  // Near wing with black primaries.
  const wingNear = (c: Ctx) => {
    c.moveTo(-14, 0);
    c.quadraticCurveTo(-20, -60 * wingUp, -70, -120 * wingUp);
    c.lineTo(-40, -112 * wingUp);
    c.lineTo(-48, -128 * wingUp);
    c.quadraticCurveTo(10, -70 * wingUp, 22, -2);
    c.closePath();
  };
  fill(ctx, wingNear, C.egg);
  clipped(ctx, wingNear, () => {
    eggshell(ctx, rng, { x: -80, y: -140 * wingUp, w: 110, h: 150 * wingUp }, 8);
    fill(ctx, (c) => c.rect(-90, -150 * wingUp, 120, 50 * wingUp), C.black);
  });
  incise(ctx, wingNear, 1.4, C.gold, 0.9);
  ctx.restore();
}

function moon(ctx: Ctx, rng: Rng) {
  ground(ctx, rng, '#3e110c', '#120605');
  leaf(ctx, rng, { x: 0, y: 0, w: W, h: 500 }, 3, [1.5, 4], 'gold', 0.7);

  const m = { x: 760, y: 350, r: 240 };
  glow(ctx, m.x, m.y, m.r * 1.9, 'rgba(240,220,170,0.45)', 0.55);
  const disc = (c: Ctx) => c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
  clipped(ctx, disc, () => {
    eggshell(ctx, rng, { x: m.x - m.r, y: m.y - m.r, w: m.r * 2, h: m.r * 2 }, 15,
      ['#f3ead6', '#e9dec4', '#f8f1e2', '#dccfb2', '#e2e3d8']);
    ctx.fillStyle = radial(ctx, m.x + 80, m.y + 80, 20, m.r * 1.2, [[0, 'rgba(120,80,40,0)'], [1, 'rgba(120,70,30,0.35)']]);
    ctx.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    for (let i = 0; i < 6; i++) {
      fill(ctx, (c) => c.arc(m.x + range(rng, -150, 150), m.y + range(rng, -150, 150), range(rng, 18, 46), 0, Math.PI * 2), 'rgba(160,130,90,0.18)');
    }
  });
  incise(ctx, disc, 3, C.gold, 0.9);

  // Ruyi clouds in gold leaf.
  const clouds = [
    { x: 560, y: 470, w: 420 },
    { x: 820, y: 560, w: 380 },
    { x: 180, y: 260, w: 300 },
  ];
  for (const cl of clouds) {
    const path = (c: Ctx) => {
      c.moveTo(cl.x, cl.y);
      const n = 4;
      for (let i = 0; i < n; i++) {
        const sx = cl.x + (cl.w / n) * i;
        c.arc(sx + cl.w / n / 2, cl.y, cl.w / n / 2, Math.PI, 0);
      }
      c.lineTo(cl.x + cl.w + 30, cl.y + 28);
      c.lineTo(cl.x - 30, cl.y + 28);
      c.closePath();
    };
    fill(ctx, path, linear(ctx, 0, cl.y - 60, 0, cl.y + 28, [[0, C.goldPale], [1, C.goldDeep]]));
    clipped(ctx, path, () => leaf(ctx, rng, { x: cl.x - 40, y: cl.y - 80, w: cl.w + 80, h: 120 }, 90, [6, 12]));
    for (let i = 0; i < 4; i++) {
      const sx = cl.x + (cl.w / 4) * i + cl.w / 8;
      incise(ctx, (c) => c.arc(sx, cl.y, cl.w / 16, Math.PI, Math.PI * 2.6), 2, C.umber, 0.8);
    }
    incise(ctx, path, 2, C.umber, 0.6);
  }

  // Water.
  ctx.fillStyle = linear(ctx, 0, 700, 0, H, [[0, '#2a0d09'], [1, '#0d0403']]);
  ctx.fillRect(0, 700, W, H - 700);
  for (let i = 0; i < 140; i++) {
    const t = rng();
    ctx.fillStyle = `rgba(239,230,210,${0.6 - t * 0.45})`;
    const w = range(rng, 14, 60);
    ctx.fillRect(m.x + range(rng, -160, 160) * (0.5 + t) - w / 2, 708 + t * 180, w, 2 + t * 2);
  }

  // One Pillar Pagoda.
  ctx.save();
  ctx.translate(430, 700);
  fill(ctx, (c) => c.rect(-14, -110, 28, 140), C.black);
  incise(ctx, (c) => c.rect(-14, -110, 28, 140), 1.5, C.gold, 0.7);
  for (const a of [-1, 1]) incise(ctx, (c) => { c.moveTo(0, -60); c.lineTo(a * 70, -118); }, 4, C.black, 1);
  fill(ctx, (c) => c.rect(-80, -190, 160, 76), '#2a0d09');
  for (let k = -64; k <= 64; k += 32) incise(ctx, (c) => c.rect(k - 10, -178, 20, 52), 1.6, C.gold, 0.8);
  const roofPath = (c: Ctx) => {
    c.moveTo(-130, -186);
    c.quadraticCurveTo(-120, -196, -96, -200);
    c.lineTo(-60, -250);
    c.lineTo(60, -250);
    c.lineTo(96, -200);
    c.quadraticCurveTo(120, -196, 130, -186);
    c.quadraticCurveTo(110, -176, 90, -186);
    c.lineTo(-90, -186);
    c.quadraticCurveTo(-110, -176, -130, -186);
    c.closePath();
  };
  fill(ctx, roofPath, linear(ctx, 0, -250, 0, -180, [[0, C.oxblood], [1, C.black]]));
  incise(ctx, roofPath, 2.4, C.gold, 1);
  fill(ctx, (c) => c.ellipse(0, -262, 14, 10, 0, 0, Math.PI * 2), C.gold);
  for (let k = 0; k < 7; k++) {
    ctx.fillStyle = `rgba(224,182,90,${0.5 - k * 0.06})`;
    ctx.fillRect(-60 + range(rng, -10, 10), 36 + k * 18, 120 - k * 10, 3);
  }
  ctx.restore();

  // Bamboo grove on the left.
  for (let i = 0; i < 7; i++) {
    const bx = range(rng, -20, 260);
    const bw = range(rng, 14, 24);
    const lean = range(rng, -0.06, 0.08);
    ctx.save();
    ctx.translate(bx, H);
    ctx.rotate(lean);
    const stalk = (c: Ctx) => c.rect(-bw / 2, -H - 40, bw, H + 40);
    fill(ctx, stalk, linear(ctx, -bw / 2, 0, bw / 2, 0, [[0, '#2a1a0c'], [0.4, '#4a3214'], [1, '#160c06']]));
    incise(ctx, (c) => { c.moveTo(-bw / 2 + 2, 0); c.lineTo(-bw / 2 + 2, -H - 40); }, 1.5, C.gold, 0.6);
    for (let y = -range(rng, 60, 120); y > -H - 40; y -= range(rng, 90, 140)) {
      fill(ctx, (c) => c.rect(-bw / 2 - 2, y, bw + 4, 5), C.goldDeep);
      if (rng() > 0.45) {
        const dir = rng() > 0.5 ? 1 : -1;
        for (let l = 0; l < 4; l++) {
          const a = dir * (0.4 + l * 0.35) + range(rng, -0.1, 0.1);
          const len = range(rng, 60, 110);
          const lf = (c: Ctx) => {
            c.save();
            c.translate(dir * bw / 2, y);
            c.rotate(a);
            c.moveTo(0, 0);
            c.quadraticCurveTo(len * 0.5, -8, len, 0);
            c.quadraticCurveTo(len * 0.5, 8, 0, 0);
            c.restore();
          };
          fill(ctx, lf, rng() > 0.35 ? C.gold : C.silver);
          clipped(ctx, lf, () => leaf(ctx, rng, { x: -300, y: y - 140, w: 600, h: 280 }, 4, [3, 6], 'gold', 0.6));
        }
      }
    }
    ctx.restore();
  }

  crane(ctx, rng, 700, 300, 1.15, false, 1);
  crane(ctx, rng, 900, 220, 0.8, false, 0.7);
  crane(ctx, rng, 560, 180, 0.6, false, 0.9);
}

export const PAINTINGS: Painting[] = [
  { id: 'ha-long', title: 'Vịnh Hạ Long', caption: 'Thuyền buồm cánh dơi giữa vịnh đá vôi lúc hoàng hôn', draw: haLong },
  { id: 'hoi-an', title: 'Phố cổ Hội An', caption: 'Đêm rằm đèn lồng, hoa đăng trôi trên sông Hoài', draw: hoiAn },
  { id: 'bac-thang', title: 'Ruộng bậc thang', caption: 'Mùa lúa chín trên những sườn đồi Tây Bắc', draw: terraces },
  { id: 'dam-sen', title: 'Đầm sen', caption: 'Sen hồng, lá biếc và đàn cá chép dưới mặt nước', draw: lotus },
  { id: 'trang-ram', title: 'Trăng rằm', caption: 'Hạc bay qua trăng, chùa Một Cột soi bóng', draw: moon },
];

const cache = new Map<string, HTMLCanvasElement>();

/** Renders a painting at the given pixel width (height follows the 4:3 ratio). Cached. */
export function renderPainting(p: Painting, width: number): HTMLCanvasElement {
  const w = Math.round(width);
  const key = `${p.id}@${w}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = Math.round((w * H) / W);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(w / W, h / H);
  p.draw(ctx, makeRng(hashString(p.id)));
  finish(ctx);
  cache.set(key, canvas);
  return canvas;
}

export const PAINTING_ASPECT = W / H;
