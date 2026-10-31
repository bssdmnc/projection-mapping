/**
 * Dynamic Texture Generators for Projection Mapping
 * Renders into an offscreen 2D canvas at 1024x1024 or 1920x1080 for crisp texture sampling.
 */
class PatternGenerators {
  constructor() {
    this.canvases = new Map(); // id -> HTMLCanvasElement
    this.matrixDrops = new Map(); // id -> Array of drop Y positions
  }

  getCanvas(id, width = 1024, height = 1024) {
    if (!this.canvases.has(id)) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      this.canvases.set(id, c);
    }
    return this.canvases.get(id);
  }

  renderPattern(surface, time) {
    const type = surface.sourceType || 'grid';
    const canvas = this.getCanvas(surface.id, 1024, 1024);
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    switch (type) {
      case 'grid':
        this.drawCalibrationGrid(ctx, w, h, surface.name);
        break;
      case 'tunnel':
        this.drawCyberTunnel(ctx, w, h, time);
        break;
      case 'matrix':
        this.drawMatrix(surface.id, ctx, w, h);
        break;
      case 'plasma':
        this.drawPlasma(ctx, w, h, time);
        break;
      case 'clock':
        this.drawClock(ctx, w, h);
        break;
      case 'solid_white':
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        break;
      case 'solid_red':
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(0, 0, w, h);
        break;
      case 'solid_green':
        ctx.fillStyle = '#00ff66';
        ctx.fillRect(0, 0, w, h);
        break;
      case 'solid_blue':
        ctx.fillStyle = '#0088ff';
        ctx.fillRect(0, 0, w, h);
        break;
      case 'solid_black':
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        break;
    }

    return canvas;
  }

  drawCalibrationGrid(ctx, w, h, title) {
    // Dark background with gradient
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Outer border
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#00ffff';
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // Inner safe zone
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff0077';
    ctx.strokeRect(30, 30, w - 60, h - 60);

    // Grid lines (16x16)
    const divisions = 16;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    for (let i = 1; i < divisions; i++) {
      const x = (w / divisions) * i;
      const y = (h / divisions) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Major 4x4 Grid
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    for (let i = 1; i < 4; i++) {
      const x = (w / 4) * i;
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Diagonals (X)
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h);
    ctx.moveTo(w, 0);
    ctx.lineTo(0, h);
    ctx.stroke();

    // Center Crosshairs & Concentric Circles
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 3;

    [80, 160, 260, 380].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Center Cross
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff0055';
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy);
    ctx.lineTo(cx + 50, cy);
    ctx.moveTo(cx, cy - 50);
    ctx.lineTo(cx, cy + 50);
    ctx.stroke();

    // Corner Labels
    ctx.font = 'bold 36px monospace';
    ctx.fillStyle = '#ff3366';
    ctx.fillText('TL (0,0)', 50, 75);

    ctx.fillStyle = '#33ff66';
    ctx.fillText('TR (1,0)', w - 210, 75);

    ctx.fillStyle = '#3399ff';
    ctx.fillText('BR (1,1)', w - 210, h - 50);

    ctx.fillStyle = '#ffcc00';
    ctx.fillText('BL (0,1)', 50, h - 50);

    // Surface Title Banner
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(cx - 200, cy - 35, 400, 70);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 200, cy - 35, 400, 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title || 'КАЛИБРОВКА СЕТКИ', cx, cy);
  }

  drawCyberTunnel(ctx, w, h, time) {
    ctx.fillStyle = '#05020f';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const speed = time * 0.0015;

    // Moving concentric squares
    const numLayers = 14;
    for (let i = numLayers; i >= 1; i--) {
      const progress = (i + (speed % 1)) / numLayers;
      const size = Math.pow(progress, 2.5) * w * 1.2;
      const alpha = Math.min(1.0, progress * 1.5);
      const hue = (progress * 180 + time * 0.05) % 360;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(progress * 0.15 * Math.sin(speed * 0.5));
      ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
      ctx.lineWidth = 4 * progress;
      ctx.strokeRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }

    // Perspective lines from center to corners
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 0, 180, 0.5)';
    const corners = [
      [0, 0], [w, 0], [w, h], [0, h],
      [w / 2, 0], [w / 2, h], [0, h / 2], [w, h / 2]
    ];
    corners.forEach(([px, py]) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(px, py);
      ctx.stroke();
    });

    // Glowing center sphere
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#ff00aa');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 120, 0, Math.PI * 2);
    ctx.fill();
  }

  drawMatrix(id, ctx, w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, w, h);

    const fontSize = 24;
    const columns = Math.floor(w / fontSize);

    if (!this.matrixDrops.has(id)) {
      const drops = [];
      for (let i = 0; i < columns; i++) {
        drops[i] = Math.floor(Math.random() * -50);
      }
      this.matrixDrops.set(id, drops);
    }

    const drops = this.matrixDrops.get(id);
    const chars = '0123456789ABCDEFΣΨΩπ§¤$¥#&*<>[]{}~';

    ctx.font = `bold ${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      const text = chars.charAt(Math.floor(Math.random() * chars.length));
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      // Bright white head
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x, y);

      // Green body trail
      ctx.fillStyle = '#00ff66';
      ctx.fillText(text, x, y - fontSize);

      if (y > h && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  }

  drawPlasma(ctx, w, h, time) {
    const t = time * 0.001;
    const cx = w / 2;
    const cy = h / 2;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Multi-color pulsating rings & metaballs
    for (let i = 0; i < 5; i++) {
      const ox = cx + Math.cos(t * 0.8 + i * 1.5) * (w * 0.25);
      const oy = cy + Math.sin(t * 1.1 + i * 1.2) * (h * 0.25);
      const radius = 180 + Math.sin(t * 2 + i) * 60;

      const grad = ctx.createRadialGradient(ox, oy, 10, ox, oy, radius);
      const hue = (i * 70 + t * 40) % 360;
      grad.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.9)`);
      grad.addColorStop(0.5, `hsla(${(hue + 40) % 360}, 100%, 50%, 0.4)`);
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawClock(ctx, w, h) {
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, w, h);

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;

    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('ru-RU', dateOptions);

    const cx = w / 2;
    const cy = h / 2;

    // Glowing border ring
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#00ffcc';
    ctx.strokeRect(40, 40, w - 80, h - 80);

    // Digital time
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 150px monospace';
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 40;
    ctx.fillText(timeStr, cx, cy - 30);

    // Date
    ctx.shadowBlur = 10;
    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(dateStr.toUpperCase(), cx, cy + 90);

    // Reset shadow
    ctx.shadowBlur = 0;
  }
}

window.PatternGenerators = PatternGenerators;
