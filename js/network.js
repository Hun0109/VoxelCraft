// WebRTC P2P Network Engine powered by PeerJS
class NetworkManager {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomId = null;
    this.connections = {}; // Host: { peerId: DataConnection }
    this.hostConnection = null; // Client: DataConnection to Host
    this.players = []; // List of joined players
    this.onPlayerListUpdate = null;
    this.onChatMessage = null;
    this.onGameStart = null;
    this.onGameState = null;
    this.onPlayerAction = null;
    this.myPeerId = null;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Initialize Peer
  initPeer(customId = null) {
    return new Promise((resolve, reject) => {
      try {
        const id = customId || 'boom-' + Math.random().toString(36).substring(2, 9);
        this.peer = new Peer(id, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          this.myPeerId = id;
          resolve(id);
        });

        this.peer.on('error', (err) => {
          console.error('Peer error:', err);
          if (err.type === 'unavailable-id') {
            // Retry with random id
            this.initPeer().then(resolve).catch(reject);
          } else {
            reject(err);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // HOST: Create a Room
  async createRoom(userProfile, requestedCode = null) {
    this.isHost = true;
    const roomCode = requestedCode || this.generateRoomCode();
    const hostPeerId = `boom-room-${roomCode.toLowerCase()}`;

    try {
      await this.initPeer(hostPeerId);
    } catch (e) {
      // If room id is taken, generate unique
      const fallbackCode = this.generateRoomCode();
      await this.initPeer(`boom-room-${fallbackCode.toLowerCase()}`);
      this.roomId = fallbackCode;
    }
    this.roomId = roomCode;

    // Self is player 0
    this.players = [
      {
        id: this.myPeerId,
        slot: 0,
        nickname: userProfile.nickname,
        color: userProfile.color,
        hat: userProfile.hat,
        isHost: true,
        isBot: false,
        ready: true,
        score: 0
      }
    ];

    // Listen for incoming players
    this.peer.on('connection', (conn) => {
      this.handleIncomingConnection(conn);
    });

    if (this.onPlayerListUpdate) this.onPlayerListUpdate(this.players);
    return this.roomId;
  }

  handleIncomingConnection(conn) {
    if (this.players.length >= 4) {
      conn.on('open', () => {
        conn.send({ type: 'ROOM_FULL' });
        conn.close();
      });
      return;
    }

    conn.on('open', () => {
      this.connections[conn.peer] = conn;

      conn.on('data', (data) => {
        this.handleHostReceivedData(conn.peer, data);
      });

      conn.on('close', () => {
        this.handlePlayerDisconnect(conn.peer);
      });
    });
  }

  handleHostReceivedData(peerId, data) {
    if (data.type === 'JOIN_REQUEST') {
      const availableSlot = [0, 1, 2, 3].find(
        (s) => !this.players.some((p) => p.slot === s)
      );

      const newPlayer = {
        id: peerId,
        slot: availableSlot ?? this.players.length,
        nickname: data.profile.nickname || `플레이어`,
        color: data.profile.color || '#ff007f',
        hat: data.profile.hat || '😎',
        isHost: false,
        isBot: false,
        ready: true,
        score: 0
      };

      this.players.push(newPlayer);
      this.broadcast({
        type: 'PLAYER_LIST',
        players: this.players,
        message: `${newPlayer.nickname} 님이 입장하셨습니다!`
      });
      if (this.onPlayerListUpdate) this.onPlayerListUpdate(this.players);
    } else if (data.type === 'CHAT') {
      this.broadcast(data);
      if (this.onChatMessage) this.onChatMessage(data.sender, data.text);
    } else if (data.type === 'PLAYER_INPUT') {
      if (this.onPlayerAction) {
        this.onPlayerAction(peerId, data.input);
      }
    }
  }

  handlePlayerDisconnect(peerId) {
    const idx = this.players.findIndex((p) => p.id === peerId);
    if (idx !== -1) {
      const leftPlayer = this.players[idx];
      this.players.splice(idx, 1);
      delete this.connections[peerId];
      this.broadcast({
        type: 'PLAYER_LIST',
        players: this.players,
        message: `${leftPlayer.nickname} 님이 퇴장하셨습니다.`
      });
      if (this.onPlayerListUpdate) this.onPlayerListUpdate(this.players);
    }
  }

  // Add an AI bot (Host only)
  addBot(slot = null) {
    if (!this.isHost || this.players.length >= 4) return false;
    const botColors = ['#ff007f', '#ffe600', '#00ff88', '#b537f2'];
    const botHats = ['🤖', '😈', '🐱', '👽', '🤠', '🎃'];
    const botNames = ['알파봇', '네온봇', '스피드봇', '붐마스터', '질풍봇'];

    const usedSlots = this.players.map((p) => p.slot);
    const targetSlot = slot !== null ? slot : [0, 1, 2, 3].find((s) => !usedSlots.includes(s));
    if (targetSlot === undefined) return false;

    const botId = `bot-${Date.now()}-${Math.floor(Math.random() * 100)}`;
    const botPlayer = {
      id: botId,
      slot: targetSlot,
      nickname: botNames[targetSlot % botNames.length],
      color: botColors[targetSlot % botColors.length],
      hat: botHats[targetSlot % botHats.length],
      isHost: false,
      isBot: true,
      ready: true,
      score: 0
    };

    this.players.push(botPlayer);
    this.broadcast({
      type: 'PLAYER_LIST',
      players: this.players
    });
    if (this.onPlayerListUpdate) this.onPlayerListUpdate(this.players);
    return true;
  }

  removeBot(botId) {
    if (!this.isHost) return;
    const idx = this.players.findIndex((p) => p.id === botId && p.isBot);
    if (idx !== -1) {
      this.players.splice(idx, 1);
      this.broadcast({
        type: 'PLAYER_LIST',
        players: this.players
      });
      if (this.onPlayerListUpdate) this.onPlayerListUpdate(this.players);
    }
  }

  // CLIENT: Join an existing Room
  async joinRoom(roomCode, userProfile) {
    this.isHost = false;
    this.roomId = roomCode.toUpperCase().trim();
    const hostPeerId = `boom-room-${this.roomId.toLowerCase()}`;

    await this.initPeer();

    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(hostPeerId, { reliable: true });
      this.hostConnection = conn;

      const timeout = setTimeout(() => {
        reject(new Error('방을 찾을 수 없거나 응답이 없습니다. 방 코드를 확인해주세요.'));
      }, 7000);

      conn.on('open', () => {
        clearTimeout(timeout);
        // Send join request
        conn.send({
          type: 'JOIN_REQUEST',
          profile: {
            nickname: userProfile.nickname,
            color: userProfile.color,
            hat: userProfile.hat
          }
        });
        resolve(this.roomId);
      });

      conn.on('data', (data) => {
        this.handleClientReceivedData(data);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      conn.on('close', () => {
        alert('방장과의 연결이 끊어졌습니다.');
        window.location.reload();
      });
    });
  }

  handleClientReceivedData(data) {
    if (data.type === 'PLAYER_LIST') {
      this.players = data.players;
      if (this.onPlayerListUpdate) this.onPlayerListUpdate(this.players);
      if (data.message && this.onChatMessage) {
        this.onChatMessage('시스템', data.message);
      }
    } else if (data.type === 'CHAT') {
      if (this.onChatMessage) this.onChatMessage(data.sender, data.text);
    } else if (data.type === 'GAME_START') {
      if (this.onGameStart) this.onGameStart(data.config);
    } else if (data.type === 'GAME_STATE') {
      if (this.onGameState) this.onGameState(data.state);
    } else if (data.type === 'ROOM_FULL') {
      alert('방 인원이 가득 찼습니다! (최대 4인)');
    }
  }

  // Send input to Host (Client -> Host)
  sendInput(input) {
    if (this.isHost) {
      // Local host input handled directly
      if (this.onPlayerAction) {
        this.onPlayerAction(this.myPeerId, input);
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({
        type: 'PLAYER_INPUT',
        input
      });
    }
  }

  sendChat(sender, text) {
    const data = { type: 'CHAT', sender, text };
    if (this.isHost) {
      this.broadcast(data);
      if (this.onChatMessage) this.onChatMessage(sender, text);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(data);
    }
  }

  // Broadcast to all clients (Host only)
  broadcast(data) {
    if (!this.isHost) return;
    Object.values(this.connections).forEach((conn) => {
      if (conn && conn.open) {
        conn.send(data);
      }
    });
  }
}

window.network = new NetworkManager();
