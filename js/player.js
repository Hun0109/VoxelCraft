// Player Controller: First-person camera, Physics, Block interaction & Other player avatars
class PlayerController {
  constructor(camera, scene, domElement) {
    this.camera = camera;
    this.scene = scene;
    this.domElement = domElement;
    
    // Physics & Movement
    this.position = new THREE.Vector3(0, 10, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.isGrounded = false;
    this.moveSpeed = 6.0;
    this.jumpForce = 8.0;
    this.gravity = 22.0;
    
    // Camera rotation (Euler yaw & pitch)
    this.pitch = 0;
    this.yaw = 0;
    this.isLocked = false;
    
    // Controls state
    this.keys = {};
    this.selectedBlock = 1; // Default: Grass (1)
    this.currentTarget = null;
    
    // Remote players mesh map: { peerId: THREE.Group }
    this.remotePlayers = {};

    this.setupInputs();
  }

  setupInputs() {
    // Pointer Lock
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      const blocker = document.getElementById('blocker');
      if (blocker) {
        blocker.style.display = this.isLocked ? 'none' : 'flex';
      }
    });

    // Mouse Look
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const sens = 0.0022;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
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
      if (e.deltaY > 0) {
        this.selectedBlock = (this.selectedBlock % 8) + 1;
      } else {
        this.selectedBlock = ((this.selectedBlock - 2 + 8) % 8) + 1;
      }
      this.updateHotbarUI();
    });

    // Mouse Click Block Break & Place
    window.addEventListener('mousedown', (e) => {
      if (!this.isLocked || !this.currentTarget) return;

      if (e.button === 0) {
        // Left Click: Break Block
        const target = this.currentTarget.breakTarget;
        if (target) {
          window.world.setBlock(target.x, target.y, target.z, 0, true);
          if (window.sounds) window.sounds.playHit();
        }
      } else if (e.button === 2) {
        // Right Click: Place Block
        const target = this.currentTarget.placeTarget;
        if (target) {
          // Prevent placing inside player's body
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
    });

    // Prevent context menu on right click
    window.addEventListener('contextmenu', (e) => e.preventDefault());
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
    const halfWidth = 0.35;
    const height = 1.8;
    return new THREE.Box3(
      new THREE.Vector3(this.position.x - halfWidth, this.position.y - height, this.position.z - halfWidth),
      new THREE.Vector3(this.position.x + halfWidth, this.position.y, this.position.z + halfWidth)
    );
  }

  update(dt, world) {
    if (!this.isLocked) return;

    // Camera rotation
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

    // Move & Simple AABB Collision
    this.moveWithCollision(dt, world);

    // Apply Position to Camera (Eye height = 1.62)
    this.camera.position.copy(this.position);

    // Raycast targeted block
    this.currentTarget = world.raycast(this.camera);

    // Network Sync position (send to peers)
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
        // Landed on block
        this.position.y -= this.velocity.y * dt;
        this.position.y = Math.floor(this.position.y - 1.8) + 1.8 + 1.001;
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
    if (this.position.y < -10) {
      this.position.set(0, 15, 0);
      this.velocity.set(0, 0, 0);
    }
  }

  // 3D Voxel Avatar for other players
  createRemotePlayerAvatar(nickname = '플레이어', color = '#3b82f6') {
    const group = new THREE.Group();

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac }); // Skin tone
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
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1e3a8a }); // Jeans blue
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
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.roundRect(10, 10, 236, 44, 10);
    ctx.fill();
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

    // Eye height offset: player camera is at eye level (y), body pivot is at waist
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
