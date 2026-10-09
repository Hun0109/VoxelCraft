// Player Controller: First-person camera, Physics, Block interaction & Avatar sync
class PlayerController {
  constructor(camera, scene, domElement) {
    this.camera = camera;
    this.scene = scene;
    this.domElement = domElement;
    
    // Game & Lock State
    this.isPlaying = false; // Whether in-game
    this.isLocked = false;  // Whether pointer lock is active
    
    // Physics & Movement
    this.position = new THREE.Vector3(0.5, 8.0, 0.5);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.isGrounded = false;
    this.moveSpeed = 6.5;
    this.jumpForce = 8.8;
    this.gravity = 24.0;
    
    // Camera rotation (Euler yaw & pitch)
    this.pitch = 0;
    this.yaw = 0;
    
    // Controls state
    this.keys = {};
    this.selectedBlock = 1; // Default: Grass (1)
    this.currentTarget = null;
    
    // Remote players mesh map: { peerId: THREE.Group }
    this.remotePlayers = {};

    this.setupInputs();
  }

  setupInputs() {
    const blocker = document.getElementById('blocker');
    const btnStart = document.getElementById('btn-start-playing');

    // Handler to dismiss blocker and start game
    const triggerStart = (e) => {
      if (e) e.stopPropagation();
      this.startGameplay();
    };

    if (blocker) {
      blocker.addEventListener('click', triggerStart);
    }
    if (btnStart) {
      btnStart.addEventListener('click', triggerStart);
    }

    // Canvas click: re-engage pointer lock if active
    this.domElement.addEventListener('click', () => {
      if (this.isPlaying && !this.isLocked) {
        this.requestLock();
      }
    });

    // Pointer Lock state listener
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = (document.pointerLockElement === this.domElement);
      if (blocker) {
        if (this.isLocked) {
          blocker.style.display = 'none';
        } else if (this.isPlaying) {
          // Exited via ESC - show pause menu
          const title = document.getElementById('blocker-title');
          const btn = document.getElementById('btn-start-playing');
          if (title) title.innerText = '⏸ 일시 정지';
          if (btn) btn.innerText = '▶ 게임 계속하기';
          blocker.style.display = 'flex';
        }
      }
    });

    document.addEventListener('pointerlockerror', (err) => {
      console.warn('PointerLock permission/restriction notice:', err);
      // Ensure player can continue even if browser restricts pointer lock
      if (this.isPlaying && blocker) {
        blocker.style.display = 'none';
      }
    });

    // Mouse Drag Look Fallback & Click
    let isMouseDown = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    window.addEventListener('mousedown', (e) => {
      if (!this.isPlaying) return;
      isMouseDown = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      // Handle block break & place
      if (this.currentTarget && (this.isLocked || e.target === this.domElement)) {
        if (e.button === 0) {
          // Left Click: Break Block
          const target = this.currentTarget.breakTarget;
          if (target && window.world) {
            window.world.setBlock(target.x, target.y, target.z, 0, true);
            if (window.sounds) window.sounds.playHit();
          }
        } else if (e.button === 2) {
          // Right Click: Place Block
          const target = this.currentTarget.placeTarget;
          if (target && window.world) {
            const playerBox = this.getBoundingBox();
            const blockBox = new THREE.Box3(
              new THREE.Vector3(target.x, target.y, target.z),
              new THREE.Vector3(target.x + 1, target.y + 1, target.z + 1)
            );
            if (!playerBox.intersectsBox(blockBox)) {
              window.world.setBlock(target.x, target.y, target.z, this.selectedBlock, true);
              if (window.sounds) window.sounds.playItem();
            }
          }
        }
      }
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPlaying) return;
      const sens = 0.0022;

      if (this.isLocked) {
        this.yaw -= (e.movementX || 0) * sens;
        this.pitch -= (e.movementY || 0) * sens;
      } else if (isMouseDown && e.target === this.domElement) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        this.yaw -= dx * sens;
        this.pitch -= dy * sens;
      }
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });

    // Keyboard WASD & Space
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;

      // Hotbar selection (Keys 1 ~ 8)
      if (e.key >= '1' && e.key <= '8') {
        this.selectHotbarSlot(parseInt(e.key));
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Mouse Wheel Hotbar selection
    window.addEventListener('wheel', (e) => {
      if (!this.isPlaying) return;
      if (e.deltaY > 0) {
        this.selectedBlock = (this.selectedBlock % 8) + 1;
      } else {
        this.selectedBlock = ((this.selectedBlock - 2 + 8) % 8) + 1;
      }
      this.updateHotbarUI();
    });

    // Prevent context menu on right click
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  startGameplay() {
    this.isPlaying = true;
    const blocker = document.getElementById('blocker');
    if (blocker) {
      blocker.style.display = 'none';
    }
    this.requestLock();
  }

  requestLock() {
    try {
      const promise = this.domElement.requestPointerLock();
      if (promise && promise.catch) {
        promise.catch((err) => {
          console.warn('PointerLock request catch:', err);
        });
      }
    } catch (err) {
      console.warn('PointerLock exception:', err);
    }
  }

  resetToSpawn(world) {
    const groundY = world ? world.getHighestBlock(0, 0) : 4;
    this.position.set(0.5, groundY + 2.8, 0.5);
    this.velocity.set(0, 0, 0);
    this.pitch = 0;
    this.yaw = 0;
  }

  selectHotbarSlot(index) {
    this.selectedBlock = index;
    this.updateHotbarUI();
  }

  updateHotbarUI() {
    document.querySelectorAll('.hotbar-slot').forEach((slot, idx) => {
      if (idx + 1 === this.selectedBlock) {
        slot.classList.add('active');
      } else {
        slot.classList.remove('active');
      }
    });
  }

  getBoundingBox() {
    const halfWidth = 0.32;
    const height = 1.8;
    return new THREE.Box3(
      new THREE.Vector3(this.position.x - halfWidth, this.position.y - height, this.position.z - halfWidth),
      new THREE.Vector3(this.position.x + halfWidth, this.position.y, this.position.z + halfWidth)
    );
  }

  update(dt, world) {
    if (!this.isPlaying) return;

    // Apply Camera rotation
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Movement Direction
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const moveDir = new THREE.Vector3();
    if (this.keys['w']) moveDir.add(forward);
    if (this.keys['s']) moveDir.sub(forward);
    if (this.keys['d']) moveDir.add(right);
    if (this.keys['a']) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      const currentSpeed = this.keys['shift'] ? this.moveSpeed * 1.5 : this.moveSpeed;
      this.velocity.x = moveDir.x * currentSpeed;
      this.velocity.z = moveDir.z * currentSpeed;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // Jump
    if (this.keys[' '] && this.isGrounded) {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
    }

    // Apply Gravity
    this.velocity.y -= this.gravity * dt;

    // Move & Collision
    this.moveWithCollision(dt, world);

    // Apply Eye Position to Camera
    this.camera.position.copy(this.position);

    // Raycast target block
    this.currentTarget = world.raycast(this.camera);

    // Sync position over network
    if (window.network) {
      window.network.sendPlayerState({
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        yaw: this.yaw,
        pitch: this.pitch
      });
    }
  }

  moveWithCollision(dt, world) {
    // X Axis
    this.position.x += this.velocity.x * dt;
    let box = this.getBoundingBox();
    if (world.checkCollision(box)) {
      this.position.x -= this.velocity.x * dt;
      this.velocity.x = 0;
    }

    // Z Axis
    this.position.z += this.velocity.z * dt;
    box = this.getBoundingBox();
    if (world.checkCollision(box)) {
      this.position.z -= this.velocity.z * dt;
      this.velocity.z = 0;
    }

    // Y Axis (Vertical)
    this.position.y += this.velocity.y * dt;
    box = this.getBoundingBox();
    if (world.checkCollision(box)) {
      if (this.velocity.y < 0) {
        // Landed on ground
        this.position.y -= this.velocity.y * dt;
        const feetY = this.position.y - 1.8;
        const blockY = Math.floor(feetY);
        this.position.y = blockY + 1 + 1.8 + 0.001;
        this.velocity.y = 0;
        this.isGrounded = true;
      } else {
        // Hit ceiling
        this.position.y -= this.velocity.y * dt;
        this.velocity.y = 0;
      }
    } else {
      this.isGrounded = false;
    }

    // Void fallback (fell off the world)
    if (this.position.y < -5) {
      this.resetToSpawn(world);
    }
  }

  // 3D Voxel Avatar for other players
  createRemotePlayerAvatar(nickname = '플레이어', color = '#3b82f6') {
    const group = new THREE.Group();

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.55;
    group.add(head);

    // Body (Shirt)
    const bodyGeo = new THREE.BoxGeometry(0.55, 0.7, 0.3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -0.05;
    group.add(body);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.25);
    const armMat = new THREE.MeshLambertMaterial({ color: color });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.38, -0.05, 0);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.38, -0.05, 0);
    group.add(leftArm);
    group.add(rightArm);

    // Legs (Pants)
    const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.28);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1e3a8a });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.14, -0.75, 0);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.14, -0.75, 0);
    group.add(leftLeg);
    group.add(rightLeg);

    // Name tag billboard sprite
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    if (ctx.roundRect) {
      ctx.roundRect(10, 10, 236, 44, 10);
      ctx.fill();
    } else {
      ctx.fillRect(10, 10, 236, 44);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nickname, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 1.1;
    sprite.scale.set(1.5, 0.38, 1);
    group.add(sprite);

    this.scene.add(group);
    return group;
  }

  updateRemotePlayer(peerId, state, nickname, color) {
    let avatar = this.remotePlayers[peerId];
    if (!avatar) {
      avatar = this.createRemotePlayerAvatar(nickname, color);
      this.remotePlayers[peerId] = avatar;
    }

    avatar.position.set(state.x, state.y - 0.9, state.z);
    avatar.rotation.y = state.yaw;
  }

  removeRemotePlayer(peerId) {
    if (this.remotePlayers[peerId]) {
      this.scene.remove(this.remotePlayers[peerId]);
      delete this.remotePlayers[peerId];
    }
  }
}

window.PlayerController = PlayerController;
