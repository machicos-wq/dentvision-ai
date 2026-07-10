/* DentVision AI v3 - primo motore locale rilevamento bollature
   Funziona offline nel browser usando Canvas, senza API a pagamento.
   Obiettivo: trovare zone tonde/ellittiche con contrasto anomalo su lamiera.
*/

export class DentEngine {
  constructor(options = {}) {
    this.options = {
      maxSize: options.maxSize || 1400,
      grid: options.grid || 18,
      sensitivity: options.sensitivity || 1.15,
      minArea: options.minArea || 18,
      maxArea: options.maxArea || 9000,
      mergeDistance: options.mergeDistance || 28,
      ...options
    };
  }

  async analyzeImage(fileOrImage) {
    const img = await this.#loadImage(fileOrImage);
    const { canvas, ctx, scale } = this.#drawScaled(img);
    const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = this.#toGray(src);
    const blurred = this.#boxBlur(gray, canvas.width, canvas.height, 3);
    const detail = this.#localContrast(gray, blurred);
    const threshold = this.#adaptiveThreshold(detail);
    const blobs = this.#findBlobs(threshold, detail, canvas.width, canvas.height);
    const merged = this.#mergeBlobs(blobs);
    const dents = this.#scoreDents(merged, detail, canvas.width, canvas.height, scale);
    return {
      width: canvas.width,
      height: canvas.height,
      originalWidth: img.naturalWidth || img.width,
      originalHeight: img.naturalHeight || img.height,
      scale,
      dents
    };
  }

  drawOverlay(imageEl, result, overlayCanvas) {
    const canvas = overlayCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = imageEl.clientWidth;
    canvas.height = imageEl.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sx = canvas.width / result.width;
    const sy = canvas.height / result.height;

    result.dents.forEach((dent, i) => {
      const x = dent.x * sx;
      const y = dent.y * sy;
      const rx = Math.max(10, dent.rx * sx);
      const ry = Math.max(10, dent.ry * sy);

      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = dent.color;
      ctx.stroke();
      ctx.fillStyle = dent.color;
      ctx.beginPath();
      ctx.arc(x, y - ry - 12, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y - ry - 12);
    });
  }

  #loadImage(fileOrImage) {
    return new Promise((resolve, reject) => {
      if (fileOrImage instanceof HTMLImageElement) return resolve(fileOrImage);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = typeof fileOrImage === 'string' ? fileOrImage : URL.createObjectURL(fileOrImage);
    });
  }

  #drawScaled(img) {
    const maxSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const scale = maxSide > this.options.maxSize ? this.options.maxSize / maxSide : 1;
    const w = Math.round((img.naturalWidth || img.width) * scale);
    const h = Math.round((img.naturalHeight || img.height) * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, ctx, scale };
  }

  #toGray(imageData) {
    const d = imageData.data;
    const out = new Float32Array(imageData.width * imageData.height);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      out[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    }
    return out;
  }

  #boxBlur(src, w, h, radius) {
    const out = new Float32Array(src.length);
    const size = radius * 2 + 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0;
        for (let yy = -radius; yy <= radius; yy++) {
          const py = y + yy;
          if (py < 0 || py >= h) continue;
          for (let xx = -radius; xx <= radius; xx++) {
            const px = x + xx;
            if (px < 0 || px >= w) continue;
            sum += src[py * w + px];
            count++;
          }
        }
        out[y * w + x] = sum / Math.max(1, count || size * size);
      }
    }
    return out;
  }

  #localContrast(gray, blurred) {
    const out = new Float32Array(gray.length);
    for (let i = 0; i < gray.length; i++) out[i] = Math.abs(gray[i] - blurred[i]);
    return out;
  }

  #adaptiveThreshold(detail) {
    let sum = 0;
    for (const v of detail) sum += v;
    const mean = sum / detail.length;
    let variance = 0;
    for (const v of detail) variance += (v - mean) ** 2;
    const std = Math.sqrt(variance / detail.length);
    const limit = mean + std * this.options.sensitivity;
    const mask = new Uint8Array(detail.length);
    for (let i = 0; i < detail.length; i++) mask[i] = detail[i] > limit ? 1 : 0;
    return mask;
  }

  #findBlobs(mask, detail, w, h) {
    const seen = new Uint8Array(mask.length);
    const blobs = [];
    const qx = [];
    const qy = [];

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const start = y * w + x;
        if (!mask[start] || seen[start]) continue;
        let minX = x, maxX = x, minY = y, maxY = y, area = 0, energy = 0;
        qx.length = 0; qy.length = 0;
        qx.push(x); qy.push(y); seen[start] = 1;
        while (qx.length) {
          const cx = qx.pop();
          const cy = qy.pop();
          const idx = cy * w + cx;
          area++; energy += detail[idx];
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = cx + dx, ny = cy + dy;
              if (nx <= 0 || ny <= 0 || nx >= w - 1 || ny >= h - 1) continue;
              const ni = ny * w + nx;
              if (mask[ni] && !seen[ni]) {
                seen[ni] = 1;
                qx.push(nx); qy.push(ny);
              }
            }
          }
        }
        if (area >= this.options.minArea && area <= this.options.maxArea) {
          const bw = maxX - minX + 1, bh = maxY - minY + 1;
          const ratio = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
          if (ratio < 4.5) blobs.push({ minX, maxX, minY, maxY, area, energy });
        }
      }
    }
    return blobs;
  }

  #mergeBlobs(blobs) {
    const out = [];
    for (const b of blobs) {
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      let merged = false;
      for (const o of out) {
        const ox = (o.minX + o.maxX) / 2;
        const oy = (o.minY + o.maxY) / 2;
        const dist = Math.hypot(cx - ox, cy - oy);
        if (dist < this.options.mergeDistance) {
          o.minX = Math.min(o.minX, b.minX); o.maxX = Math.max(o.maxX, b.maxX);
          o.minY = Math.min(o.minY, b.minY); o.maxY = Math.max(o.maxY, b.maxY);
          o.area += b.area; o.energy += b.energy;
          merged = true;
          break;
        }
      }
      if (!merged) out.push({ ...b });
    }
    return out;
  }

  #scoreDents(blobs, detail, w, h, scale) {
    return blobs.map((b) => {
      const bw = b.maxX - b.minX + 1;
      const bh = b.maxY - b.minY + 1;
      const x = (b.minX + b.maxX) / 2;
      const y = (b.minY + b.maxY) / 2;
      const rx = bw / 2 + 8;
      const ry = bh / 2 + 8;
      const contrast = b.energy / Math.max(1, b.area);
      const diameterPx = Math.max(bw, bh) / Math.max(scale, 0.001);
      const depthScore = Math.min(100, Math.round(contrast * 4 + b.area / 25));
      const difficultyScore = Math.min(100, Math.round(depthScore + diameterPx / 8));
      let difficulty = 'facile', color = '#22c55e';
      if (difficultyScore > 55) { difficulty = 'media'; color = '#f59e0b'; }
      if (difficultyScore > 78) { difficulty = 'difficile'; color = '#ef4444'; }
      return {
        x: Math.round(x), y: Math.round(y),
        rx: Math.round(rx), ry: Math.round(ry),
        area: b.area,
        diameterPx: Math.round(diameterPx),
        depthScore,
        difficultyScore,
        difficulty,
        color,
        confidence: Math.min(99, Math.round(40 + contrast * 3 + Math.min(30, b.area / 40)))
      };
    }).sort((a, b) => b.confidence - a.confidence).slice(0, 80);
  }
}
