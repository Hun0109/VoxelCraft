// Procedural Pixel Textures for VoxelCraft (No external assets required!)
class TextureGenerator {
  constructor() {
    this.cache = {};
  }

  createNoiseCanvas(width, height, baseColor, noiseAmount = 25) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const [r, g, b] = baseColor;
    const imgData = ctx.createImageData(width, height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (Math.random() - 0.5) * noiseAmount;
      imgData.data[i] = Math.min(255, Math.max(0, r + n));
      imgData.data[i + 1] = Math.min(255, Math.max(0, g + n));
      imgData.data[i + 2] = Math.min(255, Math.max(0, b + n));
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  getTexture(type) {
    if (this.cache[type]) return this.cache[type];

    let canvas;
    const size = 16;

    switch (type) {
      case 'grass_top':
        canvas = this.createNoiseCanvas(size, size, [85, 145, 55], 30);
        break;

      case 'grass_side': {
        canvas = this.createNoiseCanvas(size, size, [120, 85, 50], 25);
        const ctx = canvas.getContext('2d');
        const topGrass = this.createNoiseCanvas(size, 4, [85, 145, 55], 30);
        ctx.drawImage(topGrass, 0, 0);
        // Grass drips
        ctx.fillStyle = '#559137';
        for (let x = 0; x < size; x += 2) {
          if (Math.random() > 0.4) {
            ctx.fillRect(x, 4, 1, 1 + Math.floor(Math.random() * 2));
          }
        }
        break;
      }

      case 'dirt':
        canvas = this.createNoiseCanvas(size, size, [120, 85, 50], 25);
        break;

      case 'stone':
        canvas = this.createNoiseCanvas(size, size, [128, 128, 128], 30);
        break;

      case 'wood_side': {
        canvas = this.createNoiseCanvas(size, size, [105, 75, 45], 20);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let y = 0; y < size; y += 3) {
          ctx.fillRect(0, y, size, 1);
        }
        break;
      }

      case 'wood_top': {
        canvas = this.createNoiseCanvas(size, size, [160, 130, 85], 20);
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#694b2d';
        ctx.strokeRect(3, 3, 10, 10);
        ctx.strokeRect(6, 6, 4, 4);
        break;
      }

      case 'leaves': {
        canvas = this.createNoiseCanvas(size, size, [45, 115, 30], 40);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        for (let i = 0; i < 20; i++) {
          ctx.fillRect(Math.floor(Math.random() * size), Math.floor(Math.random() * size), 1, 1);
        }
        break;
      }

      case 'brick': {
        canvas = this.createNoiseCanvas(size, size, [165, 65, 50], 20);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#dedede';
        // Mortar lines
        ctx.fillRect(0, 4, size, 1);
        ctx.fillRect(0, 8, size, 1);
        ctx.fillRect(0, 12, size, 1);
        ctx.fillRect(4, 0, 1, 4);
        ctx.fillRect(12, 0, 1, 4);
        ctx.fillRect(8, 4, 1, 4);
        ctx.fillRect(4, 8, 1, 4);
        ctx.fillRect(12, 8, 1, 4);
        break;
      }

      case 'diamond': {
        canvas = this.createNoiseCanvas(size, size, [70, 210, 225], 30);
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(1, 1, size - 2, size - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(3, 3, 3, 3);
        break;
      }

      case 'glass': {
        canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(200, 230, 255, 0.25)';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.strokeRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(2, 2, 2, 2);
        ctx.fillRect(5, 5, 1, 1);
        break;
      }

      default:
        canvas = this.createNoiseCanvas(size, size, [200, 200, 200], 10);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; // Sharp pixelated Minecraft look!
    tex.minFilter = THREE.NearestFilter;
    this.cache[type] = tex;
    return tex;
  }
}

window.textures = new TextureGenerator();
