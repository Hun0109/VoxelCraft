// Main Game Engine: Physics, Modes (Bomb Tag / Brawl), AI, and Rendering
class GameEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.mode = 'bomb'; // 'bomb' or 'brawl'
    this.players = []; // player game objects
    this.items = [];
    this.particles = [];
    this.floatingTexts = [];
    this.walls = [];
    
    this.isRunning = false;
    this.roundTime = 0;
    this.bombTimer = 15;
    this.currentBomberId = null;
    this.lastBomberId = null;
    this.lastBomberImmunityTimer = 0;
    this.bombTransferCooldown = 0;
    this.roundWinner = null;
    this.matchWinner = null;
    this.screenShake = 0;
    this.shrinkRadius = 380;
    
    this.keys = {};
    this.myInput = { dx: 0, dy: 0, dash: false, emoji: null };
    this.lastInputSent = 0;
    this.loopId = null;
    this.lastFrameTime = performance.now();
  }

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.setupInputs();
  }

  setupInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      if (e.key === ' ' || e.code === 'Space') {
        this.myInput.dash = true;
      }
      // Quick emojis 1,2,3,4
      if (e.key === '1') this.myInput.emoji = '😂';
      if (e.key === '2') this.myInput.emoji = '💣';
      if (e.key === '3') this.myInput.emoji = '🔥';
      if (e.key === '4') this.myInput.emoji = '👑';
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  startMatch(mode, netPlayers) {
    this.mode = mode || 'bomb';
    this.shrinkRadius = 360;
    this.matchWinner = null;
    
    // Spawn points for 4 players (corners / edges)
    const spawns = [
      { x: 180, y: 180 },
      { x: 620, y: 180 },
      { x: 180, y: 420 },
      { x: 620, y: 420 }
    ];

    this.players = netPlayers.map((p, idx) => {
      const sp = spawns[p.slot % spawns.length];
      return {
        id: p.id,
        slot: p.slot,
        nickname: p.nickname,
        color: p.color || '#00f2fe',
        hat: p.hat || '🧢',
        isBot: p.isBot || false,
        score: p.score || 0,
        x: sp.x,
        y: sp.y,
        vx: 0,
        vy: 0,
        radius: 24,
        speed: 4.5,
        alive: true,
        hasBomb: false,
        dashCooldown: 0,
        isDashing: false,
        dashTime: 0,
        invincible: 0,
        powerup: null,
        powerupTime: 0,
        emoji: null,
        emojiTimer: 0,
        facing: { x: 1, y: 0 }
      };
    });

    this.setupWalls();
    this.startRound();

    if (!this.isRunning) {
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.gameLoop();
      if (window.sounds) window.sounds.startBgm();
    }
  }

  setupWalls() {
    this.walls = [];
    if (this.mode === 'brawl') {
      // Brawl mode has smaller pillar obstacles
      this.walls.push({ x: 380, y: 180, w: 40, h: 40 });
      this.walls.push({ x: 380, y: 380, w: 40, h: 40 });
    } else {
      // Bomb Tag has central obstacles to loop around
      this.walls.push({ x: 370, y: 200, w: 60, h: 60 });
      this.walls.push({ x: 240, y: 270, w: 50, h: 50 });
      this.walls.push({ x: 510, y: 270, w: 50, h: 50 });
    }
  }

  startRound() {
    this.roundWinner = null;
    this.items = [];
    this.particles = [];
    this.floatingTexts = [];
    this.shrinkRadius = 360;
    this.bombTransferCooldown = 0;
    this.lastBomberId = null;
    this.lastBomberImmunityTimer = 0;

    // Reset positions and state
    const spawns = [
      { x: 180, y: 180 },
      { x: 620, y: 180 },
      { x: 180, y: 420 },
      { x: 620, y: 420 }
    ];

    this.players.forEach((p, idx) => {
      const sp = spawns[p.slot % spawns.length];
      p.x = sp.x;
      p.y = sp.y;
      p.vx = 0;
      p.vy = 0;
      p.alive = true;
      p.hasBomb = false;
      p.powerup = null;
      p.dashCooldown = 0;
    });

    if (this.mode === 'bomb') {
      this.bombTimer = 14;
      // Pick random initial bomber
      const randIdx = Math.floor(Math.random() * this.players.length);
      this.players[randIdx].hasBomb = true;
      this.currentBomberId = this.players[randIdx].id;
      this.addFloatingText(this.players[randIdx].x, this.players[randIdx].y - 40, '💣 폭탄 부착!', '#ff0055');
    }

    this.addFloatingText(400, 300, '라운드 시작!', '#00f2fe', 32);
  }

  // Handle Local User Key Input
  updateLocalInput() {
    let dx = 0;
    let dy = 0;
    if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
    if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) dx += 1;

    // Normalize
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    this.myInput.dx = dx;
    this.myInput.dy = dy;

    // Send to host / apply
    if (window.network) {
      window.network.sendInput(this.myInput);
    }
    // reset single triggers
    this.myInput.dash = false;
    this.myInput.emoji = null;
  }

  // Host processes player input
  handlePlayerInput(peerId, input) {
    const p = this.players.find((pl) => pl.id === peerId);
    if (!p || !p.alive) return;

    if (p.dashCooldown <= 0 && input.dash) {
      p.isDashing = true;
      p.dashTime = 0.2;
      p.dashCooldown = 1.6;
      p.vx = (input.dx || p.facing.x) * 14;
      p.vy = (input.dy || p.facing.y) * 14;
      if (window.sounds) window.sounds.playDash();
      this.createDashParticles(p);
    } else if (!p.isDashing) {
      p.vx += input.dx * 1.5;
      p.vy += input.dy * 1.5;
      if (input.dx !== 0 || input.dy !== 0) {
        p.facing = { x: input.dx, y: input.dy };
      }
    }

    if (input.emoji) {
      p.emoji = input.emoji;
      p.emojiTimer = 2.0;
    }
  }

  // AI Bots Decision
  updateAI(dt) {
    const alivePlayers = this.players.filter((p) => p.alive);
    this.players.forEach((bot) => {
      if (!bot.isBot || !bot.alive) return;

      let targetX = 400;
      let targetY = 300;

      if (this.mode === 'bomb') {
        const bomber = this.players.find((p) => p.hasBomb && p.alive);
        if (bot.hasBomb) {
          // Chase nearest victim
          let nearest = null;
          let minDist = 9999;
          alivePlayers.forEach((other) => {
            if (other.id !== bot.id) {
              const d = Math.hypot(other.x - bot.x, other.y - bot.y);
              if (d < minDist) {
                minDist = d;
                nearest = other;
              }
            }
          });
          if (nearest) {
            targetX = nearest.x;
            targetY = nearest.y;
            if (minDist < 120 && bot.dashCooldown <= 0) {
              this.handlePlayerInput(bot.id, { dx: (targetX - bot.x) / minDist, dy: (targetY - bot.y) / minDist, dash: true });
            }
          }
        } else if (bomber) {
          // Flee from bomber
          const fleeDx = bot.x - bomber.x;
          const fleeDy = bot.y - bomber.y;
          targetX = bot.x + fleeDx * 2;
          targetY = bot.y + fleeDy * 2;
        }
      } else {
        // Brawl mode: stay near center and bash others
        let nearest = null;
        let minDist = 9999;
        alivePlayers.forEach((other) => {
          if (other.id !== bot.id) {
            const d = Math.hypot(other.x - bot.x, other.y - bot.y);
            if (d < minDist) {
              minDist = d;
              nearest = other;
            }
          }
        });
        if (nearest && minDist < 150 && bot.dashCooldown <= 0) {
          this.handlePlayerInput(bot.id, { dx: (nearest.x - bot.x) / minDist, dy: (nearest.y - bot.y) / minDist, dash: true });
        }
      }

      // Add movement vector
      const dx = targetX - bot.x;
      const dy = targetY - bot.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        this.handlePlayerInput(bot.id, { dx: dx / dist, dy: dy / dist, dash: false });
      }
    });
  }

  // Main Physics Update (Ran by Host)
  update(dt) {
    if (!this.isRunning) return;

    // Screen Shake decay
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 25);
    }

    // Shrinking zone in Brawl mode
    if (this.mode === 'brawl') {
      this.shrinkRadius = Math.max(160, this.shrinkRadius - dt * 3.5);
    }

    // Bomb Timer & Transfer Lock Decay
    if (this.mode === 'bomb') {
      if (this.bombTransferCooldown > 0) {
        this.bombTransferCooldown -= dt;
      }
      if (this.lastBomberImmunityTimer > 0) {
        this.lastBomberImmunityTimer -= dt;
        if (this.lastBomberImmunityTimer <= 0) {
          this.lastBomberId = null;
        }
      }

      const alivePlayers = this.players.filter((p) => p.alive);
      if (alivePlayers.length > 1) {
        this.bombTimer -= dt;
        if (this.bombTimer <= 4 && Math.floor(this.bombTimer * 4) % 2 === 0) {
          if (window.sounds) window.sounds.playTick(4 - this.bombTimer);
        }

        if (this.bombTimer <= 0) {
          // Bomb Explodes! Bomber eliminated!
          const bomber = this.players.find((p) => p.hasBomb && p.alive);
          if (bomber) {
            bomber.alive = false;
            bomber.hasBomb = false;
            this.createExplosion(bomber.x, bomber.y);
            if (window.sounds) window.sounds.playExplosion();
            this.screenShake = 15;
            this.addFloatingText(bomber.x, bomber.y, '💥 탈락!', '#ff0055', 28);

            // Reassign bomb if > 1 alive
            const remaining = this.players.filter((p) => p.alive);
            if (remaining.length > 1) {
              const next = remaining[Math.floor(Math.random() * remaining.length)];
              next.hasBomb = true;
              this.currentBomberId = next.id;
              this.bombTimer = Math.max(8, 14 - (4 - remaining.length) * 2);
              this.addFloatingText(next.x, next.y - 30, '새 폭탄!', '#ffea00');
            } else if (remaining.length === 1) {
              this.handleRoundEnd(remaining[0]);
            }
          }
        }
      }
    }

    // Spawn random powerups periodically
    if (Math.random() < dt * 0.25 && this.items.length < 3) {
      this.spawnItem();
    }

    // Update Players
    this.players.forEach((p) => {
      if (!p.alive) return;

      // Friction
      const friction = 0.88;
      p.vx *= friction;
      p.vy *= friction;

      // Speed bonus for bomber
      const maxSpd = p.hasBomb ? p.speed * 1.25 : (p.powerup === 'speed' ? p.speed * 1.5 : p.speed);
      const currSpd = Math.hypot(p.vx, p.vy);
      if (!p.isDashing && currSpd > maxSpd) {
        p.vx = (p.vx / currSpd) * maxSpd;
        p.vy = (p.vy / currSpd) * maxSpd;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Dash cooldown
      if (p.dashCooldown > 0) p.dashCooldown -= dt;
      if (p.dashTime > 0) {
        p.dashTime -= dt;
        if (p.dashTime <= 0) p.isDashing = false;
      }

      if (p.invincible > 0) p.invincible -= dt;
      if (p.emojiTimer > 0) p.emojiTimer -= dt;

      // Wall bounds
      const minX = p.radius + 10;
      const maxX = 800 - p.radius - 10;
      const minY = p.radius + 10;
      const maxY = 600 - p.radius - 10;

      if (this.mode === 'brawl') {
        // Out of circle check
        const distFromCenter = Math.hypot(p.x - 400, p.y - 300);
        if (distFromCenter > this.shrinkRadius) {
          p.alive = false;
          this.createExplosion(p.x, p.y);
          if (window.sounds) window.sounds.playExplosion();
          this.addFloatingText(p.x, p.y, '장외 탈락!', '#ff0055', 24);
          
          const alive = this.players.filter((pl) => pl.alive);
          if (alive.length === 1) {
            this.handleRoundEnd(alive[0]);
          }
        }
      } else {
        // Arena wall bounce
        if (p.x < minX) { p.x = minX; p.vx *= -0.5; }
        if (p.x > maxX) { p.x = maxX; p.vx *= -0.5; }
        if (p.y < minY) { p.y = minY; p.vy *= -0.5; }
        if (p.y > maxY) { p.y = maxY; p.vy *= -0.5; }
      }

      // Obstacle wall collision
      this.walls.forEach((w) => {
        if (
          p.x + p.radius > w.x &&
          p.x - p.radius < w.x + w.w &&
          p.y + p.radius > w.y &&
          p.y - p.radius < w.y + w.h
        ) {
          p.vx *= -0.8;
          p.vy *= -0.8;
          p.x += p.vx * 1.5;
          p.y += p.vy * 1.5;
        }
      });
    });

    // Player vs Player collisions
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const p1 = this.players[i];
        const p2 = this.players[j];
        if (!p1.alive || !p2.alive) continue;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = p1.radius + p2.radius;

        if (dist < minDist && dist > 0) {
          // Push apart
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          p1.x -= nx * overlap * 0.5;
          p1.y -= ny * overlap * 0.5;
          p2.x += nx * overlap * 0.5;
          p2.y += ny * overlap * 0.5;

          // Impact knockback
          let force = 6;
          if (p1.isDashing || p2.isDashing) force = 14;
          p1.vx -= nx * force;
          p1.vy -= ny * force;
          p2.vx += nx * force;
          p2.vy += ny * force;

          if (window.sounds) window.sounds.playHit();
          this.createSpark(p1.x + nx * p1.radius, p1.y + ny * p1.radius);

          // Bomb Transfer with Absolute Global Lock & Immunity!
          if (this.mode === 'bomb') {
            let source = null;
            let target = null;
            if (p1.hasBomb && !p2.hasBomb) { source = p1; target = p2; }
            else if (p2.hasBomb && !p1.hasBomb) { source = p2; target = p1; }

            // 폭탄 전달 필수 조건:
            // 1. 글로벌 전달 쿨다운이 0이어야 함 (2.0초간 전달 금지)
            // 2. 대상(target)이 직전 소지자(lastBomberId)가 아니어야 함 (3.5초 절대 면역)
            // 3. 대상의 개별 무적 시간(invincible)이 0이어야 함
            if (source && target && this.bombTransferCooldown <= 0 && target.id !== this.lastBomberId && target.invincible <= 0) {
              source.hasBomb = false;
              target.hasBomb = true;
              this.currentBomberId = target.id;
              this.lastBomberId = source.id;
              this.lastBomberImmunityTimer = 3.5; // 방금 넘긴 사람: 3.5초간 절대 면역!
              this.bombTransferCooldown = 2.0;    // 전체 폭탄: 2.0초간 전달 잠금!
              source.invincible = 3.5;            // 시각적 쉴드 3.5초

              // 초강력 반발 넉백 (충돌 반대 방향으로 멀리 튕김)
              source.vx -= nx * 22;
              source.vy -= ny * 22;
              target.vx += nx * 22;
              target.vy += ny * 22;

              this.addFloatingText(source.x, source.y - 30, '🛡️ 탈출! (3.5초 무적)', '#00ff88', 24);
              this.addFloatingText(target.x, target.y - 30, '💣 폭탄 부착! (2초 잠금)', '#ff0055', 26);
              if (window.sounds) window.sounds.playItem();
            }
          }
        }
      }
    }

    // Items pickup
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      this.players.forEach((p) => {
        if (!p.alive) return;
        if (Math.hypot(p.x - it.x, p.y - it.y) < p.radius + 15) {
          p.powerup = it.type;
          p.powerupTime = 5.0;
          this.addFloatingText(p.x, p.y - 25, `+${it.name}!`, '#00f2fe');
          if (window.sounds) window.sounds.playItem();
          this.items.splice(i, 1);
        }
      });
    }

    // Update Particles & Floating Text
    this.updateParticles(dt);

    // Host sends game state to all peers
    if (window.network && window.network.isHost) {
      window.network.broadcast({
        type: 'GAME_STATE',
        state: this.serializeState()
      });
    }
  }

  spawnItem() {
    const types = [
      { type: 'speed', name: '부스터', color: '#ffe600', icon: '⚡' },
      { type: 'punch', name: '메가펀치', color: '#ff0055', icon: '🥊' },
      { type: 'shield', name: '배리어', color: '#00f2fe', icon: '🛡️' }
    ];
    const t = types[Math.floor(Math.random() * types.length)];
    this.items.push({
      x: 100 + Math.random() * 600,
      y: 100 + Math.random() * 400,
      type: t.type,
      name: t.name,
      color: t.color,
      icon: t.icon,
      pulse: 0
    });
  }

  handleRoundEnd(winner) {
    this.roundWinner = winner;
    winner.score += 1;
    this.addFloatingText(400, 250, `🏆 ${winner.nickname} 라운드 승리!`, '#ffe600', 36);
    if (window.sounds) window.sounds.playVictory();

    // Check if match won (First to 3 points)
    if (winner.score >= 3) {
      this.matchWinner = winner;
      this.addFloatingText(400, 320, `👑 최종 우승: ${winner.nickname}! 👑`, '#00ff88', 42);
      if (window.auth && winner.id === window.network.myPeerId) {
        window.auth.recordMatch(true);
      } else if (window.auth) {
        window.auth.recordMatch(false);
      }
      setTimeout(() => {
        // Return to lobby
        if (window.app) window.app.showView('lobby');
      }, 5000);
    } else {
      setTimeout(() => {
        this.startRound();
      }, 3000);
    }
  }

  serializeState() {
    return {
      mode: this.mode,
      bombTimer: this.bombTimer,
      bombTransferCooldown: this.bombTransferCooldown,
      lastBomberId: this.lastBomberId,
      shrinkRadius: this.shrinkRadius,
      players: this.players.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        alive: p.alive,
        hasBomb: p.hasBomb,
        invincible: p.invincible,
        score: p.score,
        emoji: p.emoji,
        emojiTimer: p.emojiTimer,
        color: p.color,
        hat: p.hat,
        nickname: p.nickname
      })),
      items: this.items,
      roundWinner: this.roundWinner ? this.roundWinner.nickname : null,
      matchWinner: this.matchWinner ? this.matchWinner.nickname : null
    };
  }

  applyState(state) {
    this.mode = state.mode;
    this.bombTimer = state.bombTimer;
    this.bombTransferCooldown = state.bombTransferCooldown || 0;
    this.lastBomberId = state.lastBomberId || null;
    this.shrinkRadius = state.shrinkRadius;
    this.items = state.items || [];
    
    // Sync players
    state.players.forEach((sp) => {
      let p = this.players.find((pl) => pl.id === sp.id);
      if (p) {
        // Smooth lerp
        p.x = sp.x;
        p.y = sp.y;
        p.alive = sp.alive;
        p.hasBomb = sp.hasBomb;
        p.invincible = sp.invincible || 0;
        p.score = sp.score;
        p.emoji = sp.emoji;
        p.emojiTimer = sp.emojiTimer;
      }
    });
  }

  // Visual Effects
  createExplosion(x, y) {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() > 0.5 ? '#ff0055' : '#ffea00',
        radius: 3 + Math.random() * 5,
        life: 1.0
      });
    }
  }

  createDashParticles(p) {
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: p.x + (Math.random() - 0.5) * 20,
        y: p.y + (Math.random() - 0.5) * 20,
        vx: -p.vx * 0.2 + (Math.random() - 0.5) * 2,
        vy: -p.vy * 0.2 + (Math.random() - 0.5) * 2,
        color: p.color,
        radius: 4,
        life: 0.4
      });
    }
  }

  createSpark(x, y) {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        color: '#ffffff',
        radius: 2,
        life: 0.3
      });
    }
  }

  addFloatingText(x, y, text, color = '#ffffff', size = 20) {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      size,
      alpha: 1.0,
      vy: -1.2
    });
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * 1.5;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.y += t.vy;
      t.alpha -= dt * 0.6;
      if (t.alpha <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  // Main Render Routine
  render() {
    const ctx = this.ctx;
    ctx.save();

    // Screen Shake
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    // Background Clear
    ctx.fillStyle = '#0a0b12';
    ctx.fillRect(0, 0, 800, 600);

    // Draw Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 800; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 600);
      ctx.stroke();
    }
    for (let y = 0; y < 600; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(800, y);
      ctx.stroke();
    }

    // Shrinking Danger Zone in Brawl Mode
    if (this.mode === 'brawl') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(400, 300, this.shrinkRadius, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 15;
      ctx.stroke();

      // Outer Danger Fill
      ctx.beginPath();
      ctx.rect(0, 0, 800, 600);
      ctx.arc(400, 300, this.shrinkRadius, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(255, 0, 85, 0.15)';
      ctx.fill();
      ctx.restore();
    }

    // Obstacles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
    ctx.lineWidth = 2;
    this.walls.forEach((w) => {
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    });

    // Items
    this.items.forEach((it) => {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fill();
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = it.color;
      ctx.shadowBlur = 10;
      ctx.stroke();

      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.icon, 0, 2);
      ctx.restore();
    });

    // Players
    this.players.forEach((p) => {
      if (!p.alive) {
        // Ghost mode
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '16px sans-serif';
        ctx.fillText('👻', p.x - 8, p.y + 6);
        ctx.restore();
        return;
      }

      ctx.save();
      // Dash Trail
      if (p.isDashing) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5);
        ctx.stroke();
      }

      // Outer Aura if has Bomb
      if (p.hasBomb) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 8 + Math.sin(performance.now() * 0.015) * 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff0055';
        ctx.shadowBlur = 20;
        ctx.stroke();
      }

      // Invincible / Immune Shield Ring (Just passed the bomb)
      if (p.invincible > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 15;
        ctx.stroke();
        if (Math.floor(performance.now() * 0.02) % 2 === 0) {
          ctx.globalAlpha = 0.7;
        }
      }

      // Player Body
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Eyes looking towards velocity/facing
      const eyeOffset = 6;
      const eyeDirX = p.facing.x * 4;
      const eyeDirY = p.facing.y * 4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x - 6 + eyeDirX, p.y - 4 + eyeDirY, 4, 0, Math.PI * 2);
      ctx.arc(p.x + 6 + eyeDirX, p.y - 4 + eyeDirY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0b12';
      ctx.beginPath();
      ctx.arc(p.x - 6 + eyeDirX * 1.3, p.y - 4 + eyeDirY * 1.3, 2, 0, Math.PI * 2);
      ctx.arc(p.x + 6 + eyeDirX * 1.3, p.y - 4 + eyeDirY * 1.3, 2, 0, Math.PI * 2);
      ctx.fill();

      // Hat / Accessory
      if (p.hat) {
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.hat, p.x, p.y - p.radius + 2);
      }

      // Bomb icon on head if hasBomb
      if (p.hasBomb) {
        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        const bounce = Math.abs(Math.sin(performance.now() * 0.01)) * 6;
        ctx.fillText('💣', p.x, p.y - p.radius - 12 - bounce);

        if (this.bombTransferCooldown > 0) {
          ctx.font = 'bold 12px Pretendard, sans-serif';
          ctx.fillStyle = '#ffea00';
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 6;
          ctx.fillText(`🔒 쿨다운 ${this.bombTransferCooldown.toFixed(1)}s`, p.x, p.y - p.radius - 36);
          ctx.shadowBlur = 0;
        }
      }

      // Nickname & Score
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.nickname} (${p.score}점)`, p.x, p.y + p.radius + 16);

      // Emoji bubble
      if (p.emoji && p.emojiTimer > 0) {
        ctx.font = '28px sans-serif';
        ctx.fillText(p.emoji, p.x, p.y - p.radius - 35);
      }

      ctx.restore();
    });

    // Particles
    this.particles.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius * pt.life, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
    });

    // Floating text
    this.floatingTexts.forEach((t) => {
      ctx.save();
      ctx.font = `bold ${t.size}px Pretendard, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.globalAlpha = t.alpha;
      ctx.textAlign = 'center';
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 10;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });

    ctx.restore();
  }

  gameLoop() {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    this.updateLocalInput();

    // If host, run full physics & AI
    if (!window.network || window.network.isHost) {
      this.updateAI(dt);
      this.update(dt);
    } else {
      // Client interpolates particles & text locally
      this.updateParticles(dt);
    }

    this.render();

    // Update HUD
    this.updateHUD();

    this.loopId = requestAnimationFrame(() => this.gameLoop());
  }

  updateHUD() {
    const timerEl = document.getElementById('hud-timer-val');
    if (timerEl) {
      if (this.mode === 'bomb') {
        timerEl.innerText = Math.max(0, this.bombTimer).toFixed(1) + 's';
        timerEl.style.color = this.bombTimer < 5 ? '#ff0055' : '#00f2fe';
      } else {
        timerEl.innerText = '링 축소 중!';
        timerEl.style.color = '#ffea00';
      }
    }

    const scoresList = document.getElementById('hud-scores-list');
    if (scoresList && this.players.length > 0) {
      scoresList.innerHTML = this.players.map((p) => {
        const bombIcon = p.hasBomb ? '💣' : '';
        const deadStyle = !p.alive ? 'opacity: 0.4; text-decoration: line-through;' : '';
        return `
          <div class="hud-player-tag" style="border-left-color: ${p.color}; ${deadStyle}">
            <span>${p.hat || '🧢'}</span>
            <span>${p.nickname}: <strong>${p.score}점</strong> ${bombIcon}</span>
          </div>
        `;
      }).join('');
    }
  }

  stop() {
    this.isRunning = false;
    if (this.loopId) {
      cancelAnimationFrame(this.loopId);
      this.loopId = null;
    }
    if (window.sounds) window.sounds.stopBgm();
  }
}

window.game = new GameEngine();
