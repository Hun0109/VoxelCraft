// WebRTC P2P Multiplayer Engine for VoxelCraft
class NetworkManager {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomId = null;
    this.connections = {}; // Host: { peerId: conn }
    this.hostConnection = null; // Client: conn to host
    this.myPeerId = null;
    this.players = {}; // { peerId: { nickname, color } }
    this.onBlockChanged = null;
    this.onPlayerUpdated = null;
    this.onPlayerLeft = null;
    this.onChatMessage = null;
    this.lastStateSent = 0;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  initPeer(customId = null) {
    return new Promise((resolve, reject) => {
      try {
        const id = customId || 'voxel-' + Math.random().toString(36).substring(2, 9);
        this.peer = new Peer(id, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
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

  // HOST: Create World Room
  async createRoom(userProfile, requestedCode = null) {
    this.isHost = true;
    const roomCode = requestedCode || this.generateRoomCode();
    const hostPeerId = `voxel-world-${roomCode.toLowerCase()}`;

    try {
      await this.initPeer(hostPeerId);
    } catch (e) {
      const fallbackCode = this.generateRoomCode();
      await this.initPeer(`voxel-world-${fallbackCode.toLowerCase()}`);
      this.roomId = fallbackCode;
    }
    this.roomId = roomCode;

    this.players[this.myPeerId] = {
      nickname: userProfile.nickname,
      color: userProfile.color || '#3b82f6'
    };

    this.peer.on('connection', (conn) => {
      this.handleIncomingConnection(conn);
    });

    this.updatePlayerCountBadge();
    return this.roomId;
  }

  handleIncomingConnection(conn) {
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
      this.players[peerId] = {
        nickname: data.profile.nickname || '플레이어',
        color: data.profile.color || '#10b981'
      };

      // 1. Send entire world block map to the newcomer
      if (window.world) {
        conn_send(this.connections[peerId], {
          type: 'WORLD_DATA',
          blocks: window.world.getAllBlocks(),
          players: this.players
        });
      }

      // 2. Broadcast join message
      this.broadcast({
        type: 'CHAT',
        sender: '시스템',
        text: `${this.players[peerId].nickname} 님이 월드에 입장하셨습니다!`
      });
      if (this.onChatMessage) {
        this.onChatMessage('시스템', `${this.players[peerId].nickname} 님이 월드에 입장하셨습니다!`);
      }
      this.updatePlayerCountBadge();
    } else if (data.type === 'BLOCK_CHANGE') {
      // Apply block change to host world
      if (window.world) {
        window.world.setBlock(data.x, data.y, data.z, data.blockId, false);
      }
      // Broadcast to other clients
      this.broadcast(data, peerId);
    } else if (data.type === 'PLAYER_STATE') {
      // Forward player position to all other peers
      this.broadcast(data, peerId);
      if (this.onPlayerUpdated && this.players[peerId]) {
        this.onPlayerUpdated(peerId, data.state, this.players[peerId].nickname, this.players[peerId].color);
      }
    } else if (data.type === 'CHAT') {
      this.broadcast(data);
      if (this.onChatMessage) this.onChatMessage(data.sender, data.text);
    }
  }

  handlePlayerDisconnect(peerId) {
    const p = this.players[peerId];
    if (p) {
      delete this.players[peerId];
      delete this.connections[peerId];
      this.broadcast({
        type: 'PLAYER_LEFT',
        peerId
      });
      if (this.onPlayerLeft) this.onPlayerLeft(peerId);
      if (this.onChatMessage) this.onChatMessage('시스템', `${p.nickname} 님이 퇴장하셨습니다.`);
      this.updatePlayerCountBadge();
    }
  }

  // CLIENT: Join World Room
  async joinRoom(roomCode, userProfile) {
    this.isHost = false;
    this.roomId = roomCode.toUpperCase().trim();
    const hostPeerId = `voxel-world-${this.roomId.toLowerCase()}`;

    await this.initPeer();

    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(hostPeerId, { reliable: true });
      this.hostConnection = conn;

      const timeout = setTimeout(() => {
        reject(new Error('월드를 찾을 수 없습니다. 방 코드를 확인해주세요.'));
      }, 7000);

      conn.on('open', () => {
        clearTimeout(timeout);
        // Send join profile
        conn.send({
          type: 'JOIN_REQUEST',
          profile: {
            nickname: userProfile.nickname,
            color: userProfile.color
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
    if (data.type === 'WORLD_DATA') {
      // Load world from host
      if (window.world) {
        window.world.loadAllBlocks(data.blocks);
      }
      this.players = data.players || {};
      this.updatePlayerCountBadge();
    } else if (data.type === 'BLOCK_CHANGE') {
      if (window.world) {
        window.world.setBlock(data.x, data.y, data.z, data.blockId, false);
      }
    } else if (data.type === 'PLAYER_STATE') {
      if (this.onPlayerUpdated && data.peerId !== this.myPeerId) {
        const p = data.profile || { nickname: '플레이어', color: '#3b82f6' };
        this.onPlayerUpdated(data.peerId, data.state, p.nickname, p.color);
      }
    } else if (data.type === 'PLAYER_LEFT') {
      if (this.onPlayerLeft) this.onPlayerLeft(data.peerId);
    } else if (data.type === 'CHAT') {
      if (this.onChatMessage) this.onChatMessage(data.sender, data.text);
    }
  }

  // Send block modification
  sendBlockChange(x, y, z, blockId) {
    const data = { type: 'BLOCK_CHANGE', x, y, z, blockId };
    if (this.isHost) {
      this.broadcast(data);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(data);
    }
  }

  // Send local player position (throttled to 25fps)
  sendPlayerState(state) {
    const now = performance.now();
    if (now - this.lastStateSent < 40) return; // 25 updates/sec
    this.lastStateSent = now;

    const myProfile = window.auth.currentUser || { nickname: '나', color: '#3b82f6' };
    const data = {
      type: 'PLAYER_STATE',
      peerId: this.myPeerId,
      state,
      profile: { nickname: myProfile.nickname, color: myProfile.color }
    };

    if (this.isHost) {
      this.broadcast(data);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(data);
    }
  }

  // Send Chat message
  sendChat(sender, text) {
    const data = { type: 'CHAT', sender, text };
    if (this.isHost) {
      this.broadcast(data);
      if (this.onChatMessage) this.onChatMessage(sender, text);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(data);
    }
  }

  // Broadcast to peers (Host only)
  broadcast(data, excludePeerId = null) {
    if (!this.isHost) return;
    Object.entries(this.connections).forEach(([peerId, conn]) => {
      if (peerId !== excludePeerId && conn && conn.open) {
        conn.send(data);
      }
    });
  }

  updatePlayerCountBadge() {
    const badge = document.getElementById('hud-players-count');
    if (badge) {
      const count = Object.keys(this.players).length || 1;
      badge.innerText = `👥 접속자: ${count}명`;
    }
  }
}

function conn_send(conn, data) {
  if (conn && conn.open) {
    conn.send(data);
  }
}

window.network = new NetworkManager();
