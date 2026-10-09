// Main Application: Three.js Setup, Scene, Render Loop, and Game UI Binding
class App {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.world = null;
    this.player = null;
    this.clock = new THREE.Clock();
    this.inGame = false;
  }

  init() {
    this.setupThreeScene();
    this.setupUIEvents();
    this.setupNetworkCallbacks();

    // Check URL parameters for direct room join (?room=XXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
      document.getElementById('input-join-code').value = roomFromUrl;
      setTimeout(() => {
        this.joinRoom(roomFromUrl);
      }, 500);
    }
  }

  setupThreeScene() {
    const container = document.getElementById('canvas-container');

    // 1. Scene & Sky Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Minecraft sky blue
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.022);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 150);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(this.renderer.domElement);

    // 4. Lighting (Sun & Ambient)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.85);
    sunLight.position.set(20, 35, 15);
    this.scene.add(sunLight);

    // 5. Voxel World
    this.world = new VoxelWorld(this.scene);
    window.world = this.world;

    // 6. Player Controller
    this.player = new PlayerController(this.camera, this.scene, this.renderer.domElement);
    window.player = this.player;

    // Window Resize Handler
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start Render Loop
    this.animate();
  }

  setupUIEvents() {
    // Host Room
    const btnHost = document.getElementById('btn-host-world');
    btnHost.addEventListener('click', async () => {
      if (window.sounds) window.sounds.init();
      const user = window.auth.currentUser || { nickname: '방장', color: '#3b82f6' };
      
      btnHost.innerText = '🌍 월드 생성 중...';
      btnHost.disabled = true;

      // 1. Generate Terrain immediately
      this.world.generateTerrain();

      // 2. Create P2P Room (with 3.5s timeout fallback to avoid blocking)
      try {
        const roomCode = await Promise.race([
          window.network.createRoom(user),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
        ]);
        document.getElementById('hud-room-code').innerText = roomCode;
        this.showToast(`월드 [${roomCode}] 가 생성되었습니다!`, '🌍');
      } catch (e) {
        console.warn('Network room creation timed out, falling back to local host:', e);
        const fallbackCode = window.network.generateRoomCode();
        document.getElementById('hud-room-code').innerText = fallbackCode;
        this.showToast(`월드 [${fallbackCode}] 가 준비되었습니다!`, '🌍');
      }

      this.enterGame();
      btnHost.innerText = '🌍 새 멀티 월드 생성 (방장)';
      btnHost.disabled = false;
    });

    // Join Room
    const btnJoin = document.getElementById('btn-join-world');
    btnJoin.addEventListener('click', async () => {
      if (window.sounds) window.sounds.init();
      const code = document.getElementById('input-join-code').value.trim();
      if (!code) {
        alert('참가할 4자리 월드 코드를 입력해주세요!');
        return;
      }
      btnJoin.innerText = '입장 중...';
      btnJoin.disabled = true;
      await this.joinRoom(code);
      btnJoin.innerText = '입장';
      btnJoin.disabled = false;
    });

    // Solo Mode (Instant, zero network delay)
    document.getElementById('btn-solo-world').addEventListener('click', () => {
      if (window.sounds) window.sounds.init();
      this.world.generateTerrain();
      document.getElementById('hud-room-code').innerText = '솔로 모드';
      this.enterGame();
      this.showToast('솔로 건축 월드 시작!', '🛠️');
    });

    // Copy Invite Link
    document.getElementById('btn-copy-link').addEventListener('click', () => {
      const roomCode = window.network.roomId;
      if (!roomCode) return;
      const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('초대 링크가 복사되었습니다! 친구에게 보내세요.', '📋');
      }).catch(() => {
        prompt('아래 링크를 복사하여 친구에게 전달하세요:', url);
      });
    });

    // Chat Bar Events
    const chatInput = document.getElementById('chat-input');
    const sendChat = () => {
      const text = chatInput.value.trim();
      if (text) {
        const user = window.auth.currentUser || { nickname: '나' };
        window.network.sendChat(user.nickname, text);
        chatInput.value = '';
      }
      chatInput.blur();
      if (this.player) this.player.requestLock();
    };

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendChat();
      }
      e.stopPropagation(); // Don't trigger WASD while typing
    });

    window.addEventListener('keydown', (e) => {
      if (!this.inGame) return;
      // Enter or 'T' opens chat
      if ((e.key === 'Enter' || e.key.toLowerCase() === 't') && document.activeElement !== chatInput) {
        e.preventDefault();
        document.exitPointerLock();
        chatInput.focus();
      }
    });

    // Hotbar clicks
    document.querySelectorAll('.hotbar-slot').forEach((slot) => {
      slot.addEventListener('click', () => {
        const blockId = parseInt(slot.dataset.block);
        this.player.selectHotbarSlot(blockId);
      });
    });
  }

  async joinRoom(code) {
    const user = window.auth.currentUser || { nickname: '게스트', color: '#10b981' };
    try {
      this.showToast('월드에 접속하는 중...', '⏳');
      await window.network.joinRoom(code, user);
      document.getElementById('hud-room-code').innerText = code.toUpperCase();
      this.enterGame();
      this.showToast(`[${code}] 월드에 입장했습니다!`, '🎉');
    } catch (err) {
      alert(err.message || '월드 참가 실패');
    }
  }

  enterGame() {
    this.inGame = true;
    document.getElementById('lobby-view').style.display = 'none';
    document.getElementById('game-hud').style.display = 'block';

    // Immediately start gameplay & position player above ground
    if (this.player && this.world) {
      this.player.resetToSpawn(this.world);
      this.player.startGameplay();
    }
  }

  setupNetworkCallbacks() {
    window.network.onPlayerUpdated = (peerId, state, nickname, color) => {
      if (this.player) {
        this.player.updateRemotePlayer(peerId, state, nickname, color);
      }
    };

    window.network.onPlayerLeft = (peerId) => {
      if (this.player) {
        this.player.removeRemotePlayer(peerId);
      }
    };

    window.network.onChatMessage = (sender, text) => {
      this.appendChatMessage(sender, text);
    };
  }

  appendChatMessage(sender, text) {
    const box = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'chat-message';
    msg.innerHTML = `<span class="sender">${sender}:</span> <span class="text">${text}</span>`;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
  }

  showToast(message, icon = '✨') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.inGame && this.player) {
      this.player.update(dt, this.world);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
