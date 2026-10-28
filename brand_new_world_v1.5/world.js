// ==========================================
// DETERMINISTYCZNY GENERATOR ŚWIATA (SEED DLA MULTIPLAYERA - v1.5)
// ==========================================
let map = [];
let biomeMap = [];
let surfaceHeights = [];
let modifiedTiles = {};
let currentWorldSeed = Math.floor(Math.random() * 900000) + 100000;

const SPAWN_TILE_X = Math.floor(MAP_WIDTH / 2);

function createSeededRandom(seed) {
    let a = seed >>> 0;
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pseudoNoise(x, seed) {
    let n = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

function smoothNoise(x, wavelength, seed) {
    let x0 = Math.floor(x / wavelength);
    let x1 = x0 + 1;
    let t = (x / wavelength) - x0;
    let ft = t * Math.PI;
    let f = (1 - Math.cos(ft)) * 0.5;
    return pseudoNoise(x0, seed) * (1 - f) + pseudoNoise(x1, seed) * f;
}

function generateWorld(seedValue = currentWorldSeed) {
    currentWorldSeed = seedValue;
    modifiedTiles = {};
    const rng = createSeededRandom(currentWorldSeed);

    const SEED_1 = rng() * 1000;
    const SEED_2 = rng() * 1000;
    const SEED_3 = rng() * 1000;

    let desertZones = [];
    let oceanZones = [];

    let mainDesertOnLeft = rng() < 0.5;
    
    let d1Width = 110 + Math.floor(rng() * 45);
    let d1Start = mainDesertOnLeft 
        ? Math.floor(SPAWN_TILE_X - 75 - d1Width - rng() * 60)
        : Math.floor(SPAWN_TILE_X + 75 + rng() * 60);
    desertZones.push({ start: d1Start, end: d1Start + d1Width });

    let seaWidth = 115 + Math.floor(rng() * 45);
    let seaStart = !mainDesertOnLeft
        ? Math.floor(SPAWN_TILE_X - 85 - seaWidth - rng() * 50)
        : Math.floor(SPAWN_TILE_X + 85 + rng() * 50);
    oceanZones.push({ start: seaStart, end: seaStart + seaWidth, maxDepth: 18 });

    oceanZones.push({ start: 18, end: 155 + Math.floor(rng() * 35), maxDepth: 24 });
    oceanZones.push({ start: MAP_WIDTH - 185 - Math.floor(rng() * 35), end: MAP_WIDTH - 18, maxDepth: 24 });

    let d2Width = 95 + Math.floor(rng() * 35);
    let d2Start = !mainDesertOnLeft
        ? Math.floor(220 + rng() * 70)
        : Math.floor(MAP_WIDTH - 330 - rng() * 60);
    desertZones.push({ start: d2Start, end: d2Start + d2Width });

    for (let x = 0; x < MAP_WIDTH; x++) {
        let inOcean = null;
        for (let oz of oceanZones) {
            if (x >= oz.start && x <= oz.end) {
                inOcean = oz;
                break;
            }
        }
        let inDesert = false;
        if (!inOcean) {
            for (let dz of desertZones) {
                if (x >= dz.start && x <= dz.end) {
                    inDesert = true;
                    break;
                }
            }
        }

        if (Math.abs(x - SPAWN_TILE_X) < 40) {
            biomeMap[x] = 'plains';
        } else if (inOcean) {
            biomeMap[x] = 'ocean';
        } else if (inDesert) {
            biomeMap[x] = 'desert';
        } else {
            let bVal = smoothNoise(x, 70, SEED_3);
            if (bVal < 0.35) biomeMap[x] = 'plains';
            else if (bVal < 0.72) biomeMap[x] = 'forest';
            else biomeMap[x] = 'hills';
        }
    }

    let rawHeights = [];
    const baseLevel = 58;
    for (let x = 0; x < MAP_WIDTH; x++) {
        let nLarge = (smoothNoise(x, 90, SEED_1) - 0.5) * 16;
        let nMed   = (smoothNoise(x, 32, SEED_2) - 0.5) * 7;
        let nSmall = (smoothNoise(x, 12, SEED_3) - 0.5) * 3;

        let biome = biomeMap[x];
        let h;
        if (biome === 'ocean') {
            let oz = oceanZones.find(z => x >= z.start && x <= z.end);
            let center = (oz.start + oz.end) / 2;
            let halfW = (oz.end - oz.start) / 2;
            let normDist = Math.abs(x - center) / halfW;
            let depthFactor = Math.sin((1 - normDist) * Math.PI * 0.5);
            let targetDepth = oz.maxDepth * depthFactor + (smoothNoise(x, 18, SEED_2) - 0.5) * 4;
            h = SEA_LEVEL + 2 + Math.max(2, targetDepth);
        } else if (biome === 'desert') {
            h = baseLevel + nLarge * 0.4 + Math.sin((x + SEED_1) / 14) * 2.5;
        } else if (biome === 'plains') {
            h = baseLevel + nLarge * 0.35 + nMed * 0.3;
        } else if (biome === 'hills') {
            h = baseLevel - 7 + nLarge * 1.1 + nMed * 0.85 + nSmall;
        } else {
            h = baseLevel + nLarge * 0.7 + nMed * 0.55 + nSmall * 0.4;
        }

        if (biome !== 'ocean' && h > SEA_LEVEL - 2) {
            h = SEA_LEVEL - 2;
        }
        rawHeights[x] = Math.round(h);
    }

    surfaceHeights[0] = rawHeights[0];
    for (let x = 1; x < MAP_WIDTH; x++) {
        let diff = rawHeights[x] - surfaceHeights[x - 1];
        if (diff > 1) surfaceHeights[x] = surfaceHeights[x - 1] + 1;
        else if (diff < -1) surfaceHeights[x] = surfaceHeights[x - 1] - 1;
        else surfaceHeights[x] = rawHeights[x];
    }

    for (let x = 0; x < MAP_WIDTH; x++) {
        map[x] = [];
        let h = surfaceHeights[x];
        let biome = biomeMap[x];
        let isSandy = (biome === 'desert' || biome === 'ocean' || h >= SEA_LEVEL - 1);
        let dirtDepth = isSandy ? (7 + Math.floor(smoothNoise(x, 10, SEED_2) * 5)) : (4 + Math.floor(smoothNoise(x, 12, SEED_1) * 4));

        for (let y = 0; y < MAP_HEIGHT; y++) {
            if (y < h) {
                if (y >= SEA_LEVEL && (biome === 'ocean' || h > SEA_LEVEL)) {
                    map[x][y] = BLOCKS.WATER;
                } else {
                    map[x][y] = BLOCKS.AIR;
                }
            } else if (y === h) {
                map[x][y] = isSandy ? BLOCKS.SAND : BLOCKS.GRASS;
            } else if (y <= h + dirtDepth) {
                map[x][y] = isSandy ? BLOCKS.SAND : BLOCKS.DIRT;
            } else {
                map[x][y] = BLOCKS.STONE;
            }
        }
    }

    for (let i = 0; i < 200; i++) {
        let cx = 10 + Math.floor(rng() * (MAP_WIDTH - 20));
        let cy = surfaceHeights[cx] + 10 + Math.floor(rng() * (MAP_HEIGHT - surfaceHeights[cx] - 25));
        let r = 2 + Math.floor(rng() * 3);
        let pocketBlock = (biomeMap[cx] === 'desert' && cy < surfaceHeights[cx] + 35) ? BLOCKS.SAND : BLOCKS.DIRT;
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (dx*dx + dy*dy <= r*r + 1 && map[cx+dx] && map[cx+dx][cy+dy] === BLOCKS.STONE) {
                    map[cx+dx][cy+dy] = pocketBlock;
                }
            }
        }
    }

    for (let i = 0; i < 260; i++) {
        let vx = 8 + Math.floor(rng() * (MAP_WIDTH - 16));
        let minY = surfaceHeights[vx] + 22;
        if (minY >= MAP_HEIGHT - 10) continue;
        let vy = minY + Math.floor(rng() * (MAP_HEIGHT - minY - 8));
        let veinSize = 3 + Math.floor(rng() * 5);
        for (let s = 0; s < veinSize; s++) {
            if (vx >= 2 && vx < MAP_WIDTH - 2 && vy >= minY && vy < MAP_HEIGHT - 4) {
                if (map[vx][vy] === BLOCKS.STONE) {
                    map[vx][vy] = BLOCKS.DIAMOND;
                }
            }
            vx += Math.floor(rng() * 3) - 1;
            vy += Math.floor(rng() * 3) - 1;
        }
    }

    let numCaves = 40;
    for (let c = 0; c < numCaves; c++) {
        let wx = 25 + Math.floor(rng() * (MAP_WIDTH - 50));
        let wy = surfaceHeights[wx] + 15 + Math.floor(rng() * 65);
        let length = 45 + Math.floor(rng() * 70);
        let angle = rng() * Math.PI * 2;

        for (let step = 0; step < length; step++) {
            angle += (rng() - 0.5) * 0.7;
            angle = Math.atan2(Math.sin(angle) * 0.65, Math.cos(angle));
            wx += Math.cos(angle) * 1.8;
            wy += Math.sin(angle) * 1.8;

            let ix = Math.floor(wx);
            let iy = Math.floor(wy);
            if (ix < 8 || ix >= MAP_WIDTH - 8) break;
            let minCaveY = surfaceHeights[ix] + (biomeMap[ix] === 'ocean' ? 12 : 8);
            if (iy < minCaveY) { wy = minCaveY + 2; continue; }
            if (iy > MAP_HEIGHT - 12) { wy = MAP_HEIGHT - 14; continue; }

            let radius = 1.8 + Math.sin(step * 0.2) * 0.8;
            let rCeil = Math.ceil(radius);
            for (let dx = -rCeil; dx <= rCeil; dx++) {
                for (let dy = -rCeil; dy <= rCeil; dy++) {
                    if (dx*dx + dy*dy <= radius*radius) {
                        let tx = ix + dx, ty = iy + dy;
                        if (tx > 2 && tx < MAP_WIDTH - 2 && ty > minCaveY && ty < MAP_HEIGHT - 5) {
                            if (map[tx][ty] !== BLOCKS.DIAMOND) {
                                map[tx][ty] = BLOCKS.AIR;
                            }
                        }
                    }
                }
            }
        }
    }

    const coralTypes = [BLOCKS.CORAL_PINK, BLOCKS.CORAL_CYAN, BLOCKS.CORAL_GOLD];

    for (let x = 8; x < MAP_WIDTH - 8; x++) {
        if (Math.abs(x - SPAWN_TILE_X) < 5) continue;

        let y = surfaceHeights[x];
        let groundBlock = map[x][y];
        let biome = biomeMap[x];

        if (biome === 'ocean' && y > SEA_LEVEL + 4) {
            let waterDepth = y - SEA_LEVEL;
            if (waterDepth >= 6 && rng() < 0.14) {
                let cType = coralTypes[Math.floor(rng() * coralTypes.length)];
                let reefH = 1 + Math.floor(rng() * 3);
                for (let i = 1; i <= reefH; i++) {
                    if (map[x][y - i] === BLOCKS.WATER) {
                        map[x][y - i] = cType;
                    }
                }
                if (reefH >= 2 && rng() < 0.7) {
                    let side = rng() < 0.5 ? -1 : 1;
                    if (map[x + side] && map[x + side][y - reefH] === BLOCKS.WATER) {
                        map[x + side][y - reefH] = cType;
                    }
                }
                x += 1;
            } else if (waterDepth >= 5 && rng() < 0.28) {
                let maxKelpH = Math.min(11, waterDepth - 2);
                let kelpH = 3 + Math.floor(rng() * Math.max(1, maxKelpH - 2));
                for (let i = 1; i <= kelpH; i++) {
                    if (map[x][y - i] === BLOCKS.WATER) {
                        map[x][y - i] = BLOCKS.KELP;
                    }
                }
            }
        } else if (groundBlock === BLOCKS.GRASS && y < SEA_LEVEL) {
            let treeChance = (biome === 'forest') ? 0.14 : (biome === 'plains' ? 0.05 : 0.08);
            if (rng() < treeChance && Math.abs(surfaceHeights[x-1] - y) <= 1 && Math.abs(surfaceHeights[x+1] - y) <= 1) {
                let treeH = 4 + Math.floor(rng() * 4);
                for (let i = 1; i <= treeH; i++) {
                    if (y - i >= 0) map[x][y - i] = BLOCKS.WOOD;
                }
                for (let lx = -2; lx <= 2; lx++) {
                    for (let ly = -3; ly <= 0; ly++) {
                        let tx = x + lx, ty = y - treeH + ly;
                        if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
                            if (Math.abs(lx) + Math.abs(ly + 1) <= 3 && map[tx][ty] === BLOCKS.AIR) {
                                map[tx][ty] = BLOCKS.LEAVES;
                            }
                        }
                    }
                }
                x += 4 + Math.floor(rng() * 3);
            }
        } else if (groundBlock === BLOCKS.SAND && biome === 'desert' && y < SEA_LEVEL) {
            if (rng() < 0.065) {
                let cactusH = 2 + Math.floor(rng() * 3);
                for (let i = 1; i <= cactusH; i++) {
                    if (y - i >= 0) map[x][y - i] = BLOCKS.CACTUS;
                }
                x += 3 + Math.floor(rng() * 3);
            }
        }
    }
}

generateWorld(currentWorldSeed);

function isWaterLike(block) {
    return block === BLOCKS.WATER;
}

function isSubmergedTile(x, y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
    let b = map[x][y];
    if (b === BLOCKS.WATER) return true;
    if (b === BLOCKS.KELP) {
        return y >= SEA_LEVEL || 
               getTile(x - 1, y) === BLOCKS.WATER || 
               getTile(x + 1, y) === BLOCKS.WATER || 
               getTile(x, y - 1) === BLOCKS.WATER ||
               getTile(x, y + 1) === BLOCKS.WATER;
    }
    return false;
}

function isPassableBlock(block) {
    return block === BLOCKS.AIR || block === BLOCKS.WATER || block === BLOCKS.KELP;
}

function getSurfaceY(tx) {
    let clampedTx = Math.max(0, Math.min(MAP_WIDTH - 1, tx));
    for(let y = 0; y < MAP_HEIGHT; y++) {
        let b = map[clampedTx][y];
        if(b !== BLOCKS.AIR && b !== BLOCKS.LEAVES && b !== BLOCKS.WATER && b !== BLOCKS.KELP) {
            return (y - 2) * TILE_SIZE;
        }
    }
    return 10 * TILE_SIZE;
}

function isDesertAt(tx) {
    let clampedTx = Math.max(0, Math.min(MAP_WIDTH - 1, tx));
    return biomeMap[clampedTx] === 'desert';
}

function isOceanAt(tx) {
    let clampedTx = Math.max(0, Math.min(MAP_WIDTH - 1, tx));
    return biomeMap[clampedTx] === 'ocean';
}

function getTile(x, y) { 
    return (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) ? map[x][y] : BLOCKS.AIR; 
}

function setTile(x, y, block, broadcast = true) { 
    if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        map[x][y] = block;
        modifiedTiles[`${x},${y}`] = block;
        if (broadcast && typeof sendBlockChange === 'function') {
            sendBlockChange(x, y, block);
        }
    }
}

function checkCollision(x, y, w, h) {
    let left = Math.floor(x / TILE_SIZE);
    let right = Math.floor((x + w - 0.1) / TILE_SIZE);
    let top = Math.floor(y / TILE_SIZE);
    let bottom = Math.floor((y + h - 0.1) / TILE_SIZE);
    for (let tx = left; tx <= right; tx++) {
        for (let ty = top; ty <= bottom; ty++) {
            if (!isPassableBlock(getTile(tx, ty))) return true;
        }
    }
    return false;
}

function updateWaterPhysics(camX, camY) {
    const startX = Math.max(1, Math.floor(camX / TILE_SIZE) - 8);
    const endX = Math.min(MAP_WIDTH - 2, Math.ceil((camX + canvas.width / SCALE) / TILE_SIZE) + 8);
    const startY = Math.max(1, Math.floor(camY / TILE_SIZE) - 8);
    const endY = Math.min(MAP_HEIGHT - 2, Math.ceil((camY + canvas.height / SCALE) / TILE_SIZE) + 8);

    let changes = [];
    for (let x = startX; x <= endX; x++) {
        for (let y = endY; y >= startY; y--) {
            let b = map[x][y];
            if (b === BLOCKS.KELP) {
                let below = map[x][y + 1];
                if (below === BLOCKS.AIR || below === BLOCKS.WATER) {
                    changes.push({ x: x, y: y, block: (y >= SEA_LEVEL ? BLOCKS.WATER : BLOCKS.AIR) });
                }
            } else if (b === BLOCKS.WATER) {
                if (map[x][y + 1] === BLOCKS.AIR) {
                    changes.push({ x: x, y: y + 1, block: BLOCKS.WATER });
                } else if (y >= SEA_LEVEL) {
                    if (map[x - 1][y] === BLOCKS.AIR) {
                        changes.push({ x: x - 1, y: y, block: BLOCKS.WATER });
                    }
                    if (map[x + 1][y] === BLOCKS.AIR) {
                        changes.push({ x: x + 1, y: y, block: BLOCKS.WATER });
                    }
                }
            }
        }
    }
    for (let ch of changes) {
        map[ch.x][ch.y] = ch.block;
    }
}

function hasLineOfSight(startX, startY, endX, endY) {
    let dx = endX - startX;
    let dy = endY - startY;
    let distance = Math.hypot(dx, dy);
    let steps = Math.ceil(distance / 2);
    
    let targetTx = Math.floor(endX / TILE_SIZE);
    let targetTy = Math.floor(endY / TILE_SIZE);

    let pLeft = player.x; 
    let pRight = player.x + player.width;
    let pTop = player.y; 
    let pBottom = player.y + player.height;

    for (let i = 0; i <= steps; i++) {
        let stepRatio = steps === 0 ? 0 : (i / steps);
        let px = startX + (dx * stepRatio);
        let py = startY + (dy * stepRatio);
        let tx = Math.floor(px / TILE_SIZE);
        let ty = Math.floor(py / TILE_SIZE);
        
        if (tx === targetTx && ty === targetTy) continue;
        if (px >= pLeft && px <= pRight && py >= pTop && py <= pBottom) continue;
        
        let tile = getTile(tx, ty);
        if (tile !== BLOCKS.AIR && tile !== BLOCKS.WATER && tile !== BLOCKS.KELP) return false;
    }
    return true;
}

function isBlockVisibleToPlayer(targetTx, targetTy) {
    let eyeX = player.x + player.width / 2;
    let eyeY = player.y + 8;
    let cx = targetTx * TILE_SIZE + TILE_SIZE / 2;
    let cy = targetTy * TILE_SIZE + TILE_SIZE / 2;

    if (hasLineOfSight(eyeX, eyeY, cx, cy)) return true;

    const inset = 3;
    const points = [
        { x: targetTx * TILE_SIZE + inset, y: targetTy * TILE_SIZE + inset },
        { x: targetTx * TILE_SIZE + TILE_SIZE - inset, y: targetTy * TILE_SIZE + inset },
        { x: targetTx * TILE_SIZE + inset, y: targetTy * TILE_SIZE + TILE_SIZE - inset },
        { x: targetTx * TILE_SIZE + TILE_SIZE - inset, y: targetTy * TILE_SIZE + TILE_SIZE - inset }
    ];
    for (let pt of points) {
        if (hasLineOfSight(eyeX, eyeY, pt.x, pt.y)) return true;
    }
    return false;
}
