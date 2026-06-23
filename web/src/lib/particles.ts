// Animated background: a cool, slowly drifting starfield on a fixed canvas, over a faint glow layer
// (.bg-glow + #starfield are styled in base.css). Respects prefers-reduced-motion (paints once, no loop).
interface Star { x: number; y: number; z: number; r: number; }

export function initBackgroundFx(): void {
  // faint cool glow behind the stars
  const glow = document.createElement('div');
  glow.className = 'bg-glow';
  document.body.appendChild(glow);

  const canvas = document.createElement('canvas');
  canvas.id = 'starfield';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DENSITY = 0.00009; // stars per px²
  let w = 0, h = 0, stars: Star[] = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const n = Math.min(220, Math.max(60, Math.round(w * h * DENSITY)));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random() * 0.8 + 0.2,        // depth → speed + brightness
      r: Math.random() * 1.3 + 0.3,        // radius
    }));
  }
  window.addEventListener('resize', resize);
  resize();

  function draw(move: boolean) {
    ctx!.clearRect(0, 0, w, h);
    for (const s of stars) {
      if (move) {
        s.y += s.z * 0.28;
        s.x += s.z * 0.14;
        if (s.y > h) { s.y = -2; s.x = Math.random() * w; }
        if (s.x > w) s.x = -2;
      }
      ctx!.beginPath();
      ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${s.z > 0.62 ? '150,180,255' : '120,140,205'},${(s.z * 0.65 + 0.2).toFixed(2)})`;
      ctx!.fill();
    }
  }

  if (reduce) {
    draw(false);
    return;
  }
  let raf = 0;
  const loop = () => { draw(true); raf = requestAnimationFrame(loop); };
  loop();
  // Pause the redraw loop while the tab/window is hidden — no idle GPU churn on a long-open tool.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) loop();
  });
}
