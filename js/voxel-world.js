// Voxel World: Block definitions, Procedural terrain, Meshing, and Raycasting
class VoxelWorld {
  constructor(scene) {
    this.scene = scene;
    this.worldSizeX = 36;
    this.worldSizeZ = 36;
    this.worldHeight = 16;
    this.blocks = {}; // key: "x,y,z" -> blockId
    this.meshes = {}; // key: "x,y,z" -> THREE.Mesh
    this.materials = {};
    this.blockBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    
    // Highlight box for block targeting
    const highlightGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const highlightMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.6
    });
    this.highlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
    this.highlightMesh.visible = false;
    this.scene.add(this.highlightMesh);

    this.initMaterials();
  }

  initMaterials() {
    const t = window.textures;
    
    // 1: Grass (multi-face)
    this.materials[1] = [
      new THREE.MeshLambertMaterial({ map: t.getTexture('grass_side') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('grass_side') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('grass_top') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('dirt') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('grass_side') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('grass_side') })
    ];

    // 2: Dirt
    this.materials[2] = new THREE.MeshLambertMaterial({ map: t.getTexture('dirt') });
    // 3: Stone
    this.materials[3] = new THREE.MeshLambertMaterial({ map: t.getTexture('stone') });
    // 4: Wood (trunk)
    this.materials[4] = [
      new THREE.MeshLambertMaterial({ map: t.getTexture('wood_side') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('wood_side') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('wood_top') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('wood_top') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('wood_side') }),
      new THREE.MeshLambertMaterial({ map: t.getTexture('wood_side') })
    ];
    // 5: Leaves
    this.materials[5] = new THREE.MeshLambertMaterial({
      map: t.getTexture('leaves'),
      transparent: true,
      alphaTest: 0.1
    });
    // 6: Brick
    this.materials[6] = new THREE.MeshLambertMaterial({ map: t.getTexture('brick') });
    // 7: Diamond
    this.materials[7] = new THREE.MeshLambertMaterial({ map: t.getTexture('diamond') });
    // 8: Glass
    this.materials[8] = new THREE.MeshLambertMaterial({
      map: t.getTexture('glass'),
      transparent: true,
      opacity: 0.7
    });
  }

  getKey(x, y, z) {
    return `${x},${y},${z}`;
  }

  getBlock(x, y, z) {
    return this.blocks[this.getKey(x, y, z)] || 0;
  }

  setBlock(x, y, z, blockId, sync = true) {
    const key = this.getKey(x, y, z);
    const prev = this.blocks[key] || 0;

    if (blockId === 0) {
      if (this.meshes[key]) {
        this.scene.remove(this.meshes[key]);
        delete this.meshes[key];
      }
      delete this.blocks[key];
    } else {
      this.blocks[key] = blockId;
      if (this.meshes[key]) {
        this.scene.remove(this.meshes[key]);
      }
      const mesh = new THREE.Mesh(this.blockBoxGeo, this.materials[blockId]);
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      mesh.userData = { voxelCoord: { x, y, z } };
      this.scene.add(mesh);
      this.meshes[key] = mesh;
    }

    if (sync && window.network) {
      window.network.sendBlockChange(x, y, z, blockId);
    }
    return prev;
  }

  generateTerrain() {
    const halfX = Math.floor(this.worldSizeX / 2);
    const halfZ = Math.floor(this.worldSizeZ / 2);

    for (let x = -halfX; x < halfX; x++) {
      for (let z = -halfZ; z < halfZ; z++) {
        // Natural rolling hills using sine waves
        const height = Math.floor(
          3 +
          Math.sin(x * 0.18) * 2 +
          Math.cos(z * 0.18) * 2 +
          Math.sin((x + z) * 0.1) * 1.5
        );

        for (let y = 0; y <= height; y++) {
          if (y === height) {
            this.setBlock(x, y, z, 1, false); // Grass top
          } else if (y > height - 3) {
            this.setBlock(x, y, z, 2, false); // Dirt
          } else {
            this.setBlock(x, y, z, 3, false); // Stone
          }
        }

        // Random Trees
        if (Math.random() < 0.015 && x > -halfX + 3 && x < halfX - 3 && z > -halfZ + 3 && z < halfZ - 3) {
          this.growTree(x, height + 1, z);
        }
      }
    }
  }

  growTree(x, y, z) {
    const trunkHeight = 4;
    for (let dy = 0; dy < trunkHeight; dy++) {
      this.setBlock(x, y + dy, z, 4, false); // Wood
    }
    // Leaves crown
    for (let lx = -2; lx <= 2; lx++) {
      for (let lz = -2; lz <= 2; lz++) {
        for (let ly = trunkHeight - 1; ly <= trunkHeight + 1; ly++) {
          if (Math.abs(lx) === 2 && Math.abs(lz) === 2 && ly === trunkHeight + 1) continue;
          if (this.getBlock(x + lx, y + ly, z + lz) === 0) {
            this.setBlock(x + lx, y + ly, z + lz, 5, false);
          }
        }
      }
    }
  }

  // Raycasting for target block selection
  raycast(camera) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 6.5; // Minecraft reach distance (blocks)

    const meshList = Object.values(this.meshes);
    const intersects = raycaster.intersectObjects(meshList);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const norm = hit.face.normal;
      const coord = hit.object.userData.voxelCoord;

      this.highlightMesh.visible = true;
      this.highlightMesh.position.set(coord.x + 0.5, coord.y + 0.5, coord.z + 0.5);

      return {
        breakTarget: coord,
        placeTarget: {
          x: coord.x + Math.round(norm.x),
          y: coord.y + Math.round(norm.y),
          z: coord.z + Math.round(norm.z)
        }
      };
    } else {
      this.highlightMesh.visible = false;
      return null;
    }
  }

  // Check simple AABB collision with solid blocks
  checkCollision(box) {
    const minX = Math.floor(box.min.x);
    const maxX = Math.floor(box.max.x);
    const minY = Math.floor(box.min.y);
    const maxY = Math.floor(box.max.y);
    const minZ = Math.floor(box.min.z);
    const maxZ = Math.floor(box.max.z);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.getBlock(x, y, z) !== 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Export all world blocks for new player sync
  getAllBlocks() {
    return this.blocks;
  }

  // Import full world blocks
  loadAllBlocks(blockMap) {
    // Clear current
    Object.values(this.meshes).forEach((m) => this.scene.remove(m));
    this.blocks = {};
    this.meshes = {};

    Object.entries(blockMap).forEach(([k, id]) => {
      const [x, y, z] = k.split(',').map(Number);
      this.setBlock(x, y, z, id, false);
    });
  }
}

window.VoxelWorld = VoxelWorld;
