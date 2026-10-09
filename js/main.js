// Main Controller: UI logic, Modals, View Management, URL Param Handling
class AppManager {
  constructor() {
    this.currentView = 'home';
    this.selectedColor = '#00f2fe';
    this.selectedHat = '🧢';
    this.gameMode = 'bomb'; // 'bomb' or 'brawl'
  }

  init() {
    this.setupViewNavigation();
    this.setupAuthModals();
    this.setupLobbyEvents();
    this.setupCustomizer();
    this.setupMobileControls();
    this.updateUserBadge();

    // Check URL parameters for direct room join (?room=XXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
      document.getElementById('input-join-code').value = roomFromUrl;
      setTimeout(() => {
        this.joinRoomByCode(roomFromUrl);
      }, 500);
    }

    // Network Callbacks
    window.network.onPlayerListUpdate = (players) => this.renderLobbySlots(players);
    window.network.onChatMessage = (sender, text) => this.appendChatMessage(sender, text);
    window.network.onGameStart = (config) => {
      this.showView('game');
      window.game.startMatch(config.mode, window.network.players);
    };
    window.network.onGameState = (state) => {
      window.game.applyState(state);
    };
    window.network.onPlayerAction = (peerId, input) => {
      window.game.handlePlayerInput(peerId, input);
    };

    // Game canvas init
    const canvas = document.getElementById('gameCanvas');
    window.game.init(canvas);
  }

  showView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');

    if (viewName !== 'game' && window.game.isRunning) {
      window.game.stop();
    }
  }

  showToast(message, icon = '✨') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  updateUserBadge() {
    const user = window.auth.currentUser;
    if (!user) return;
    document.getElementById('header-user-name').innerText = user.nickname;
    document.getElementById('header-user-coins').innerText = `🪙 ${user.coins || 0} 코인 (승률 ${user.stats.matches ? Math.round((user.stats.wins / user.stats.matches) * 100) : 0}%)`;
    const avatar = document.getElementById('header-user-avatar');
    avatar.style.backgroundColor = user.color || '#00f2fe';
    avatar.innerText = user.hat || '🧢';

    // Update wardrobe preview if modal open
    this.selectedColor = user.color || '#00f2fe';
    this.selectedHat = user.hat || '🧢';
  }

  setupAuthModals() {
    const authModal = document.getElementById('modal-auth');
    const btnOpenAuth = document.getElementById('btn-open-auth');
    const btnCloseAuth = document.getElementById('btn-close-auth');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    btnOpenAuth.addEventListener('click', () => {
      if (window.sounds) window.sounds.init();
      authModal.classList.add('active');
    });

    btnCloseAuth.addEventListener('click', () => {
      authModal.classList.remove('active');
    });

    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      formLogin.style.display = 'block';
      formRegister.style.display = 'none';
    });

    tabRegister.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      formLogin.style.display = 'none';
      formRegister.style.display = 'block';
    });

    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('login-id').value;
      const p = document.getElementById('login-pw').value;
      const res = await window.auth.login(u, p);
      if (res.success) {
        this.showToast(`${res.user.nickname} 님, 환영합니다!`, '👋');
        this.updateUserBadge();
        authModal.classList.remove('active');
      } else {
        alert(res.message);
      }
    });

    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('reg-id').value;
      const p = document.getElementById('reg-pw').value;
      const n = document.getElementById('reg-nick').value;
      const res = await window.auth.register(u, p, n);
      if (res.success) {
        this.showToast('회원가입이 완료되었습니다!', '🎉');
        this.updateUserBadge();
        authModal.classList.remove('active');
      } else {
        alert(res.message);
      }
    });

    // Sound toggle
    const soundBtn = document.getElementById('btn-toggle-sound');
    soundBtn.addEventListener('click', () => {
      if (window.sounds) {
        window.sounds.init();
        const enabled = window.sounds.toggleSound();
        soundBtn.innerText = enabled ? '🔊' : '🔇';
        this.showToast(enabled ? '사운드가 켜졌습니다.' : '사운드가 꺼졌습니다.');
      }
    });
  }

  setupCustomizer() {
    const modal = document.getElementById('modal-customizer');
    const btnOpen = document.getElementById('btn-open-customizer');
    const btnClose = document.getElementById('btn-close-customizer');
    const btnSave = document.getElementById('btn-save-custom');

    btnOpen.addEventListener('click', () => {
      modal.classList.add('active');
      this.renderCustomizerPreview();
    });

    btnClose.addEventListener('click', () => {
      modal.classList.remove('active');
    });

    // Color buttons
    document.querySelectorAll('.color-option').forEach((el) => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.color-option').forEach((o) => o.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedColor = el.dataset.color;
        this.renderCustomizerPreview();
      });
    });

    // Hat buttons
    document.querySelectorAll('.hat-option').forEach((el) => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.hat-option').forEach((o) => o.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedHat = el.dataset.hat;
        this.renderCustomizerPreview();
      });
    });

    btnSave.addEventListener('click', () => {
      window.auth.updateProfile({
        color: this.selectedColor,
        hat: this.selectedHat
      });
      this.updateUserBadge();
      this.showToast('캐릭터 설정이 저장되었습니다!', '🎨');
      modal.classList.remove('active');
    });
  }

  renderCustomizerPreview() {
    const preview = document.getElementById('wardrobe-preview');
    preview.style.backgroundColor = this.selectedColor;
    preview.innerText = this.selectedHat;
  }

  setupViewNavigation() {
    // Host Room Button
    document.getElementById('btn-host-room').addEventListener('click', async () => {
      if (window.sounds) window.sounds.init();
      const user = window.auth.currentUser;
      const roomCode = await window.network.createRoom(user);
      document.getElementById('lobby-room-code').innerText = roomCode;
      this.showView('lobby');
      this.showToast(`방 [${roomCode}] 이 생성되었습니다!`, '🎮');
    });

    // Join Room Button
    document.getElementById('btn-join-room').addEventListener('click', () => {
      if (window.sounds) window.sounds.init();
      const code = document.getElementById('input-join-code').value.trim();
      if (!code) {
        alert('참가할 4자리 방 코드를 입력해주세요!');
        return;
      }
      this.joinRoomByCode(code);
    });

    // Solo Play (Host + 3 Bots)
    document.getElementById('btn-solo-play').addEventListener('click', async () => {
      if (window.sounds) window.sounds.init();
      const user = window.auth.currentUser;
      const roomCode = await window.network.createRoom(user);
      document.getElementById('lobby-room-code').innerText = roomCode;

      // Add 3 Bots
      window.network.addBot(1);
      window.network.addBot(2);
      window.network.addBot(3);

      this.showView('lobby');
      this.showToast('혼자 연습 모드 (AI 봇 3인 장착 완료!)', '🤖');
    });

    // Copy Invite Link
    document.getElementById('btn-copy-link').addEventListener('click', () => {
      const roomCode = window.network.roomId;
      const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('초대 링크가 복사되었습니다! 친구에게 보내세요.', '📋');
      }).catch(() => {
        prompt('아래 주소를 복사하여 친구에게 전달하세요:', url);
      });
    });

    // Leave Lobby
    document.getElementById('btn-leave-lobby').addEventListener('click', () => {
      window.location.search = '';
      window.location.reload();
    });

    // Mode Switchers
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!window.network.isHost) {
          this.showToast('게임 모드는 방장만 변경할 수 있습니다.');
          return;
        }
        document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.gameMode = btn.dataset.mode;
        this.showToast(`게임 모드가 [${btn.innerText}] (으)로 변경되었습니다.`);
      });
    });

    // Start Game
    document.getElementById('btn-start-game').addEventListener('click', () => {
      if (!window.network.isHost) return;
      if (window.network.players.length < 2) {
        alert('최소 2명 이상(또는 AI 봇)이 있어야 게임을 시작할 수 있습니다! [봇 추가]를 눌러보세요.');
        return;
      }
      const config = { mode: this.gameMode };
      window.network.broadcast({ type: 'GAME_START', config });
      this.showView('game');
      window.game.startMatch(this.gameMode, window.network.players);
    });

    // In-game Exit
    document.getElementById('btn-exit-game').addEventListener('click', () => {
      if (confirm('게임을 종료하고 로비로 돌아갈까요?')) {
        this.showView('lobby');
      }
    });
  }

  async joinRoomByCode(code) {
    const user = window.auth.currentUser;
    try {
      this.showToast('방에 연결 중...', '⏳');
      await window.network.joinRoom(code, user);
      document.getElementById('lobby-room-code').innerText = code.toUpperCase();
      document.getElementById('btn-start-game').style.display = 'none'; // Only host starts
      this.showView('lobby');
      this.showToast(`[${code}] 방에 입장했습니다!`, '🎉');
    } catch (err) {
      alert(err.message || '방 참가 실패');
    }
  }

  setupLobbyEvents() {
    // Lobby Chat
    const chatInput = document.getElementById('lobby-chat-input');
    const chatBtn = document.getElementById('btn-send-chat');

    const sendChat = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      const user = window.auth.currentUser;
      window.network.sendChat(user.nickname, text);
      chatInput.value = '';
    };

    chatBtn.addEventListener('click', sendChat);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChat();
    });
  }

  renderLobbySlots(players) {
    const container = document.getElementById('players-slots-container');
    container.innerHTML = '';

    for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
      const player = players.find((p) => p.slot === slotIdx);
      const slotEl = document.createElement('div');
      slotEl.className = 'player-slot glass-panel';

      if (player) {
        slotEl.classList.add('occupied');
        if (player.id === window.network.myPeerId) slotEl.classList.add('is-me');

        let badgeHtml = '';
        if (player.isHost) badgeHtml = '<span class="slot-badge host">👑 방장</span>';
        else if (player.isBot) badgeHtml = '<span class="slot-badge bot">🤖 AI 봇</span>';
        else badgeHtml = '<span class="slot-badge ready">준비완료</span>';

        let removeBotBtn = '';
        if (window.network.isHost && player.isBot) {
          removeBotBtn = `<button class="btn btn-ghost" style="padding: 4px 10px; font-size: 11px; margin-top: 8px;" onclick="window.network.removeBot('${player.id}')">봇 삭제</button>`;
        }

        slotEl.innerHTML = `
          <div class="slot-avatar" style="background-color: ${player.color};">
            ${player.hat || '🧢'}
          </div>
          <div class="slot-name">${player.nickname}</div>
          ${badgeHtml}
          ${removeBotBtn}
        `;
      } else {
        // Empty slot
        let addBotHtml = '';
        if (window.network.isHost) {
          addBotHtml = `<button class="btn btn-ghost" style="padding: 6px 14px; font-size: 12px; margin-top: 8px;" onclick="window.network.addBot(${slotIdx})">+ AI 봇 추가</button>`;
        }

        slotEl.innerHTML = `
          <div class="slot-avatar" style="background: rgba(255,255,255,0.05); border: 1px dashed rgba(255,255,255,0.2);">
            👤
          </div>
          <div class="slot-name" style="color: var(--text-muted);">빈 슬롯</div>
          <span class="slot-badge">대기 중</span>
          ${addBotHtml}
        `;
      }

      container.appendChild(slotEl);
    }
  }

  appendChatMessage(sender, text) {
    const box = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    if (sender === '시스템') {
      msg.className = 'chat-msg system';
      msg.innerText = `[알림] ${text}`;
    } else {
      msg.innerHTML = `<span class="sender">${sender}:</span><span>${text}</span>`;
    }
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
  }

  setupMobileControls() {
    const dashBtn = document.getElementById('touch-dash-btn');
    if (dashBtn) {
      dashBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.game.myInput.dash = true;
      });
    }

    const stick = document.getElementById('touch-stick-area');
    const knob = document.getElementById('touch-stick-knob');
    if (stick && knob) {
      let isTouching = false;
      const center = { x: 60, y: 60 };

      const handleTouch = (touch) => {
        const rect = stick.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        const dx = touchX - center.x;
        const dy = touchY - center.y;
        const dist = Math.min(40, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);

        knob.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
        window.game.keys['arrowright'] = dx > 15;
        window.game.keys['arrowleft'] = dx < -15;
        window.game.keys['arrowdown'] = dy > 15;
        window.game.keys['arrowup'] = dy < -15;
      };

      stick.addEventListener('touchstart', (e) => {
        isTouching = true;
        handleTouch(e.touches[0]);
      });

      stick.addEventListener('touchmove', (e) => {
        if (isTouching) handleTouch(e.touches[0]);
      });

      const resetTouch = () => {
        isTouching = false;
        knob.style.transform = 'translate(0px, 0px)';
        window.game.keys['arrowright'] = false;
        window.game.keys['arrowleft'] = false;
        window.game.keys['arrowdown'] = false;
        window.game.keys['arrowup'] = false;
      };

      stick.addEventListener('touchend', resetTouch);
      stick.addEventListener('touchcancel', resetTouch);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppManager();
  window.app.init();
});
