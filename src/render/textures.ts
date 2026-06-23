// Procedural canvas textures for terrain and surfaces.
// Pure functions — no side effects beyond creating GPU-side texture objects.

import * as THREE from 'three';

export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  rpt = 1,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rpt, rpt);
  t.anisotropy = 8; // Keep textures sharp at grazing angles
  return t;
}

export function grassTex(): THREE.CanvasTexture {
  return canvasTexture(256, 256, ctx => {
    ctx.fillStyle = '#1e381b';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#244520' : '#142712';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
  }, 40);
}

export function cobbleTex(): THREE.CanvasTexture {
  return canvasTexture(256, 256, ctx => {
    ctx.fillStyle = '#26262b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#18181a';
    ctx.lineWidth = 1.5;
    for (let y = 0; y < 256; y += 16) {
      const s = ((y / 16) % 2) * 8;
      for (let x = -16; x < 272; x += 16) {
        ctx.fillStyle = Math.random() > 0.4 ? '#38383e' : '#222226';
        ctx.fillRect(x + s, y, 14, 14);
        ctx.strokeRect(x + s, y, 14, 14);
      }
    }
  }, 6);
}

export function roadTex(): THREE.CanvasTexture {
  return canvasTexture(128, 128, ctx => {
    ctx.fillStyle = '#4c3e31';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#5d4c3c' : '#392e24';
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
  });
}

export function sandTex(): THREE.CanvasTexture {
  return canvasTexture(256, 256, ctx => {
    // Base sand color
    ctx.fillStyle = '#dfb56c';
    ctx.fillRect(0, 0, 256, 256);

    // Draw thick 3D-shaded wind ripples (shadow first, then highlight offset)
    const drawWave = (color: string, width: number, yOffset: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      // Fewer waves (every 64 pixels) so they are larger and clearer
      for (let y = 32; y < 256; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y + yOffset);
        for (let x = 0; x <= 256; x += 16) {
          const wave = Math.sin((x / 256) * Math.PI * 4) * 12;
          ctx.lineTo(x, y + wave + yOffset);
        }
        ctx.stroke();
      }
    };

    // Thick shadow of the wind ripples
    drawWave('#8c6220', 6, 2);
    // Highlight of the wind ripples
    drawWave('#fff3d1', 3, -1);

    // Add large, high-contrast grit specks (coarse particles)
    for (let i = 0; i < 800; i++) {
      const rand = Math.random();
      if (rand < 0.3) {
        // Large glistening white sand spec
        ctx.fillStyle = '#fffae8';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
      } else if (rand < 0.7) {
        // Medium dark sand spec
        ctx.fillStyle = '#ab7a30';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
      } else {
        // Large deep brown dirt/grit spec
        ctx.fillStyle = '#604418';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 4);
      }
    }
  }, 12);
}

export function desertTileTex(): THREE.CanvasTexture {
  return canvasTexture(256, 256, ctx => {
    ctx.fillStyle = '#8b6f47';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#7a5f3a';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 16) {
      const s = ((y / 16) % 2) * 8;
      for (let x = -16; x < 272; x += 16) {
        ctx.fillStyle = Math.random() > 0.4 ? '#9b7f57' : '#7b6343';
        ctx.fillRect(x + s, y, 14, 14);
        ctx.strokeRect(x + s, y, 14, 14);
      }
    }
  }, 6);
}
