// ==========================================
// FIZYKA GRACZA, PŁYNNE ODLATYWANIE ŚWINI ZNAD WODY, CZERW I KOMENDY /PIG & /UNPIG (v1.5)
// ==========================================
let spawnTileX = SPAWN_TILE_X;
let spawnX = spawnTileX * TILE_SIZE; 
let spawnY = getSurfaceY(spawnTileX);

const player = {
    x: spawnX, y: spawnY, width: 16, height: 24,
    vx: 0, vy: 0, speed: 2.35, jumpPower: 5.45, grounded: false,
    direction: 1, walkFrame: 0, hp: 5, maxHp: 5, dead: false, damageEffect: 0,
    fallStartY: spawnY, invulTimer: 0, ridingPig: null, bombCooldown: 0,
    inWater: false, headSubmerged: false, inKelp: false,
    isSwimming: false, swimToggle: false,
    air: 600, maxAir: 600, drownTimer: 0,
    gameMode: 0,
    isAdmin: false,
    isSandworm: false,
    wormSegments: [],
    inStomach: false,
    inAcid: false,
    acidTimer: 0,
    acidPoisonTimer: 0,
    poisonDamageEffect: 0,
    savedWorldX: spawnX,
    savedWorldY: spawnY,
    swallowedByNick: null,
    swallowedById: null,
    stomachExitCooldown: 0
};

let wormTransition = {
    active: false,
    type: null, // 'swallow' | 'spit_out'
    timer: 0,
    maxTimer: 56,
    worldX: 0,
    worldY: 0,
    eaterNick: ""
};

let wormPvpCooldowns = {};

let cameraX = player.x; 
let cameraY = player.y; 
let regenTimer = 0; 
let pigs = []; 
let bombs = [];
let waterBubbles = [];
let splashParticles = [];

let sandworm = { 
    active: false, x: 0, y: 0, targetX: 0, targetY: 0, 
    radius: 12, segments: [], numSegments: 15, speed: 4.4, 
    attackCooldown: 0, state: 'idle',
    ownerId: null, isRemote: false, lastSyncTime: 0
};

function generatePigId() {
    return "pig_" + myPlayerId + "_" + Math.random().toString(36).substring(2, 8);
}

function respawnPlayerAtSpawn() {
    spawnTileX = SPAWN_TILE_X;
    player.x = spawnTileX * TILE_SIZE;
    player.y = getSurfaceY(spawnTileX);
    player.vx = 0;
    player.vy = 0;
    player.fallStartY = player.y;
    cameraX = player.x + player.width / 2 - (canvas.width / SCALE) / 2;
    cameraY = player.y + player.height / 2 - (canvas.height / SCALE) / 2;
}

// Bezpieczne uniesienie świni ponad taflę wody, aby nigdy nie wpadała w pętlę wielokrotnego pluskania!
function liftPigAboveWater(pig) {
    if (!pig) return;
    let safety = 0;
    while (safety < 18) {
        let pL = Math.floor((pig.x - 2) / TILE_SIZE);
        let pR = Math.floor((pig.x + (pig.width || 26) + 2) / TILE_SIZE);
        let pT = Math.floor((pig.y - 2) / TILE_SIZE);
        let pB = Math.floor((pig.y + (pig.height || 18) + 2) / TILE_SIZE);
        let touchingW = false;
        for (let tx = pL; tx <= pR; tx++) {
            for (let ty = pT; ty <= pB; ty++) {
                let t = getTile(tx, ty);
                if (t === BLOCKS.WATER || (t === BLOCKS.KELP && isSubmergedTile(tx, ty))) {
                    touchingW = true;
                }
            }
        }
        if (!touchingW) break;
        pig.y -= 4;
        safety++;
    }
    pig.y -= 5;
}

// Odłączenie gracza od świni (z ochroną przed cofaniem przez sieć i wielokrotnym pluskaniem!)
function dismountCurrentPig(fleeUpwards = false, broadcast = true, isWaterSplash = false) {
    if (!player.ridingPig) return;
    let pig = player.ridingPig;
    player.ridingPig = null;

    if (!pig.id) pig.id = generatePigId();

    let splashX = Math.round(pig.x + pig.width / 2);
    let splashY = Math.round(pig.y + pig.height);

    if (isWaterSplash) {
        createWaterSplash(splashX, splashY, 28);
        liftPigAboveWater(pig);
        pig.vy = -3.2;
        let awayDir = -(player.direction || 1);
        pig.vx = awayDir * 1.8;
        pig.direction = awayDir;
        pig.fleeWaterTimer = 90;
        pig.waterSplashCooldown = 65;
        pig.protectedUntil = performance.now() + 5000;
    } else if (fleeUpwards) {
        pig.vy = -3.0;
        let flyDir = player.direction || 1;
        pig.vx = flyDir * (1.4 + Math.random() * 0.5);
        pig.direction = flyDir;
        pig.fleeWaterTimer = 65;
        pig.waterSplashCooldown = 45;
        pig.protectedUntil = performance.now() + 5000;
    } else {
        pig.vy = -2.0;
        let flyDir = player.direction || 1;
        pig.vx = flyDir * (0.9 + Math.random() * 0.4);
        pig.direction = flyDir;
        pig.fleeWaterTimer = 40;
        pig.waterSplashCooldown = 35;
        pig.protectedUntil = performance.now() + 5000;
    }

    if (!pigs.includes(pig)) {
        pigs.push(pig);
    }

    if (broadcast && typeof sendPigEvent === 'function') {
        sendPigEvent(isWaterSplash ? 'water_flee' : 'dismount', pig, { splashX, splashY });
    }
}

// Komendy /gm 1 (Tryb Kreatywny) oraz /gm 0 (Tryb Przetrwania)
function setPlayerGameMode(mode) {
    if (mode === 1) {
        player.gameMode = 1;
        player.hp = player.maxHp;
        player.air = player.maxAir;
        player.drownTimer = 0;
        player.damageEffect = 0;
        if (player.dead) {
            player.dead = false;
            document.getElementById('gameOver').style.display = 'none';
        }
        // Pasek szybkiego wyboru NIE wypełnia się domyślnymi blokami (gracz sam wybiera bloki z katalogu [E])
        for (let i = 0; i < HOTBAR_SLOTS; i++) {
            if (hotbar[i]) hotbar[i].count = 99;
        }
        showSystemNotification("✨ Włączono Tryb Kreatywny (/gm 1) — Nieśmiertelność i pełny katalog bloków pod [E]!", "#4caf50", 240, true);
    } else {
        player.gameMode = 0;
        player.hp = player.maxHp;
        player.air = player.maxAir;
        player.drownTimer = 0;
        player.damageEffect = 0;
        cursorItem = null;
        showSystemNotification("❤️ Włączono Tryb Przetrwania (/gm 0)!", "#ffeb3b", 220, true);
    }
    if (typeof sendPlayerState === 'function') sendPlayerState();
}

// Wejście do małego świata (Żołądka Czerwia) po pożarciu przez czerwia + animacja pożarcia
function enterWormStomach(eaterNick = "Czerw Pustynny", eaterId = null) {
    if (player.dead || player.inStomach || player.isSandworm || player.stomachExitCooldown > 0) return;
    if (player.ridingPig) {
        dismountCurrentPig(true, true, false);
    }
    player.savedWorldX = player.x;
    player.savedWorldY = player.y;

    // Jeśli żaden inny gracz nie jest aktualnie w żołądku, wygeneruj świeżą komorę żołądka
    let anyoneElseInStomach = false;
    for (let id in remotePlayers) {
        if (remotePlayers[id] && remotePlayers[id].inStomach) {
            anyoneElseInStomach = true;
            break;
        }
    }
    if (!anyoneElseInStomach && typeof generateStomachWorld === 'function') {
        generateStomachWorld();
    }

    player.inStomach = true;
    player.inWater = false;
    player.headSubmerged = false;
    player.air = player.maxAir;
    player.drownTimer = 0;
    player.swallowedByNick = eaterNick;
    player.swallowedById = eaterId;
    player.isSwimming = false;
    player.swimToggle = false;
    miningX = -1;
    miningY = -1;
    miningProgress = 0;

    // Umieść gracza w górnej części komory żołądka (spada z przełyku na centralną wysepkę nad kwasem)
    player.x = Math.floor(STOMACH_WIDTH / 2) * TILE_SIZE - 8;
    player.y = 6 * TILE_SIZE;
    player.vx = 0;
    player.vy = 0.4;
    player.fallStartY = player.y;

    // Uruchom pełnoekranową animację pożarcia przez paszczę Czerwia
    wormTransition = {
        active: true,
        type: 'swallow',
        timer: 0,
        maxTimer: 58,
        worldX: player.x + player.width / 2,
        worldY: player.y + player.height / 2,
        eaterNick: eaterNick || "Czerw Pustynny"
    };

    if (typeof createAcidSplash === 'function') {
        createAcidSplash(player.x + player.width / 2, player.y + player.height, 18);
    }

    // Upewnij się, że gracz ma w ekwipunku przynajmniej kilka bloków, by móc podsadzić się do przełyku
    let hasAnyBlocks = hotbar.some(s => s && s.count > 0) || inv.some(s => s && s.count > 0);
    if (!hasAnyBlocks && typeof addToInventory === 'function') {
        addToInventory(BLOCKS.FLESH, 8);
    }

    cameraX = player.x + player.width / 2 - (canvas.width / SCALE) / 2;
    cameraY = player.y + player.height / 2 - (canvas.height / SCALE) / 2;

    showSystemNotification(`🪱 Zostałeś pożarty przez: ${eaterNick}! Uważaj na żrący kwas i przekop górny przełyk, aby wyjść!`, "#ff9800", 280, true);
    if (typeof sendPlayerState === 'function') sendPlayerState();
}

// Wydostanie się z Żołądka Czerwia z powrotem do głównego świata + animacja wyplucia
function exitWormStomach(reasonMsg = "🪱 Czerw Cię wypluł! Wróciłeś do głównego świata!") {
    if (!player.inStomach) return;
    player.inStomach = false;
    player.inAcid = false;
    player.acidTimer = 0;
    player.acidPoisonTimer = 0;
    player.poisonDamageEffect = 0;
    player.air = player.maxAir;
    player.drownTimer = 0;
    player.stomachExitCooldown = 180; // 3 sekundy ochrony przed ponownym połknięciem
    miningX = -1;
    miningY = -1;
    miningProgress = 0;

    if (player.swallowedById && remotePlayers[player.swallowedById] && remotePlayers[player.swallowedById].inGame !== false) {
        player.x = remotePlayers[player.swallowedById].x;
        player.y = remotePlayers[player.swallowedById].y - 28;
    } else {
        player.x = player.savedWorldX || (SPAWN_TILE_X * TILE_SIZE);
        let safeSurfaceY = getSurfaceY(Math.floor(player.x / TILE_SIZE));
        player.y = Math.min(player.savedWorldY || safeSurfaceY, safeSurfaceY);
    }

    let safety = 0;
    while (checkCollision(player.x, player.y, player.width, player.height) && safety < 80 && player.y > TILE_SIZE * 2) {
        player.y -= TILE_SIZE;
        safety++;
    }

    player.vy = -6.8;
    player.vx = (player.direction || 1) * 2.6;
    player.invulTimer = 65;
    player.fallStartY = player.y;
    player.swallowedByNick = null;
    player.swallowedById = null;

    // Uruchom animację wyplucia z paszczy Czerwia na powierzchnię
    wormTransition = {
        active: true,
        type: 'spit_out',
        timer: 0,
        maxTimer: 54,
        worldX: player.x + player.width / 2,
        worldY: player.y + player.height,
        eaterNick: ""
    };

    if (typeof createAcidSplash === 'function') {
        createAcidSplash(player.x + player.width / 2, player.y + player.height / 2, 28);
    }

    cameraX = player.x + player.width / 2 - (canvas.width / SCALE) / 2;
    cameraY = player.y + player.height / 2 - (canvas.height / SCALE) / 2;

    showSystemNotification(reasonMsg, "#4caf50", 240, true);
    if (typeof sendPlayerState === 'function') sendPlayerState();
}

// Ukryta komenda /czerw - przemiana gracza w Czerwia Pustynnego (i z powrotem)
function toggleSandwormMode() {
    if (player.dead) return;
    if (player.inStomach) {
        showSystemNotification("Nie możesz przemienić się w czerwia wewnątrz żołądka! Przekop górny przełyk!", "#ff5252");
        return;
    }
    player.isSandworm = !player.isSandworm;
    if (player.isSandworm) {
        if (player.ridingPig) {
            dismountCurrentPig(true, true, false);
        }
        player.isSwimming = false;
        player.swimToggle = false;
        miningX = -1;
        miningY = -1;
        miningProgress = 0;
        let cx = player.x + player.width / 2;
        let cy = player.y + player.height / 2;
        player.wormSegments = [];
        for (let i = 0; i < sandworm.numSegments; i++) {
            player.wormSegments.push({ x: cx, y: cy + i * 10 });
        }
        showSystemNotification("🪱 Przemieniłeś się w Czerwia (/czerw)! Steruj WASD lub LPM. Wpisz /czerw ponownie, aby wrócić.", "#4caf50", 240, true);
    } else {
        player.wormSegments = [];
        player.vx = 0;
        player.vy = 0;
        // Jeśli gracz odmienia się pod ziemią wewnątrz bloków, wynieś go do najbliższej wolnej przestrzeni
        let safety = 0;
        while (checkCollision(player.x, player.y, player.width, player.height) && safety < 140 && player.y > TILE_SIZE * 2) {
            player.y -= TILE_SIZE;
            safety++;
        }
        player.fallStartY = player.y;
        showSystemNotification("👤 Wróciłeś do ludzkiej postaci (/czerw)!", "#ffeb3b", 200, true);
    }
    if (typeof sendPlayerState === 'function') sendPlayerState();
}

// Ukryta komenda /pig - natychmiast sadza gracza na latającej świni (jeśli nie ma wierzchowca)
function spawnAndMountPigCommand() {
    if (player.dead) return;
    if (player.inStomach) {
        showSystemNotification("Nie można przyzwać świni wewnątrz żołądka czerwia!", "#ff5252");
        return;
    }
    if (player.ridingPig) {
        showSystemNotification("Już siedzisz na latającej świni!", "#ff9800");
        return;
    }
    if (player.inWater) {
        showSystemNotification("Nie można dosiąść świni pod wodą!", "#ff5252");
        return;
    }
    let newPig = {
        id: generatePigId(),
        x: player.x - 5,
        y: player.y - 4,
        vx: 0,
        vy: 0,
        direction: player.direction || 1,
        width: 26,
        height: 18,
        wingFlap: 0,
        bombTimer: 1200 + Math.random() * 600,
        fleeWaterTimer: 0,
        waterSplashCooldown: 0,
        protectedUntil: performance.now() + 5000
    };
    pigs.push(newPig);
    player.ridingPig = newPig;
    showSystemNotification("🐷 Przyzwano latającą świnię!", "#4caf50");
    if (typeof sendPlayerState === 'function') sendPlayerState();
}

// Ukryta komenda /unpig [nick] - zrzuca wybranego gracza (lub siebie) z latającej świni
function executeUnpigCommand(targetNickArg) {
    if (player.dead) return;
    let cleanTarget = (targetNickArg || "").trim();

    if (!cleanTarget || (playerNick && cleanTarget.toLowerCase() === playerNick.toLowerCase())) {
        if (player.ridingPig) {
            dismountCurrentPig(true, true, false);
            player.vy = -2.5;
            showSystemNotification("🐷 Zsiadłeś z latającej świni!", "#4caf50");
        } else {
            showSystemNotification("Nie lecisz teraz na latającej świni!", "#ff5252");
        }
        return;
    }

    let foundId = null;
    let foundPlayer = null;
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (rp && rp.nick && rp.nick.toLowerCase() === cleanTarget.toLowerCase()) {
            foundId = id;
            foundPlayer = rp;
            break;
        }
    }

    if (!foundPlayer) {
        showSystemNotification(`Nie znaleziono gracza o nicku: ${cleanTarget}`, "#ff5252");
        return;
    }

    if (!foundPlayer.isRiding) {
        showSystemNotification(`Gracz ${foundPlayer.nick} nie siedzi teraz na świni!`, "#ff9800");
        return;
    }

    sendUnpigCommand(foundId, foundPlayer.nick);
    showSystemNotification(`🐷 Zrzucono gracza ${foundPlayer.nick} z latającej świni!`, "#4caf50");
}

function createWaterSplash(cx, cy, count = 24) {
    for (let i = 0; i < count; i++) {
        let angle = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
        let speed = 1.4 + Math.random() * 3.2;
        splashParticles.push({
            x: cx + (Math.random() - 0.5) * 18,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.0,
            size: 2 + Math.random() * 2.5,
            color: Math.random() > 0.35 ? '#60A5FA' : '#E0F2FE',
            life: 28 + Math.floor(Math.random() * 18)
        });
    }
}

// Zielony, żrący plusk kwasu żołądkowego (zamiast niebieskiego plusku wody!)
function createAcidSplash(cx, cy, count = 22) {
    const acidCols = ['#84cc16', '#a3e635', '#bef264', '#4d7c0f', '#22c55e'];
    for (let i = 0; i < count; i++) {
        let angle = -Math.PI * 0.12 - Math.random() * Math.PI * 0.76;
        let speed = 1.1 + Math.random() * 2.7;
        splashParticles.push({
            x: cx + (Math.random() - 0.5) * 18,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.85,
            size: 2.2 + Math.random() * 2.6,
            color: acidCols[Math.floor(Math.random() * acidCols.length)],
            life: 26 + Math.floor(Math.random() * 20)
        });
    }
}

function checkEntityWaterState(x, y, w, h) {
    let left = Math.floor(x / TILE_SIZE);
    let right = Math.floor((x + w - 0.1) / TILE_SIZE);
    let top = Math.floor(y / TILE_SIZE);
    let bottom = Math.floor((y + h - 0.1) / TILE_SIZE);
    let inWater = false;
    let inKelp = false;
    let inAcid = false;
    for (let tx = left; tx <= right; tx++) {
        for (let ty = top; ty <= bottom; ty++) {
            let t = getTile(tx, ty);
            if (t === BLOCKS.WATER) inWater = true;
            if (t === BLOCKS.ACID) inAcid = true;
            if (t === BLOCKS.KELP) {
                inKelp = true;
                if (isSubmergedTile(tx, ty)) inWater = true;
            }
        }
    }
    let eyeX = Math.floor((x + w / 2) / TILE_SIZE);
    let eyeY = Math.floor((y + 4) / TILE_SIZE);
    let eyeTile = getTile(eyeX, eyeY);
    // W kwasie NIE ma topienia się ani paska bąbelków tlenu — w kwasie ginie się od żrących toksyn!
    let headSubmerged = (!inAcid && (eyeTile === BLOCKS.WATER || (eyeTile === BLOCKS.KELP && isSubmergedTile(eyeX, eyeY))));
    return { inWater, inKelp, inAcid, headSubmerged };
}

function damagePlayer(amount, isAcidToxin = false) {
    if (player.gameMode === 1) return; // Nieśmiertelność w trybie kreatywnym (/gm 1)
    if (player.invulTimer <= 0 && !player.dead) {
        player.hp -= amount; 
        if (isAcidToxin) {
            player.poisonDamageEffect = 18;
            player.damageEffect = 8;
        } else {
            player.damageEffect = 15; 
        }
        player.invulTimer = 28; 
        regenTimer = 0; 
        if (player.hp <= 0) {
            player.hp = 0; 
            player.dead = true; 
            if (player.ridingPig) {
                dismountCurrentPig(true, true, false);
            }
            player.isSandworm = false;
            player.wormSegments = [];
            player.acidPoisonTimer = 0;
            player.poisonDamageEffect = 0;
            player.isSwimming = false;
            player.swimToggle = false;
            showInventory = false;
            if (typeof closeCommandBar === 'function') closeCommandBar();
            if (typeof closePlayerContextMenu === 'function') closePlayerContextMenu();
            document.getElementById('gameOver').style.display = 'flex';
        }
    }
}

function tryPvpMeleeAttack(worldMouseX, worldMouseY) {
    if (!roomCode || pvpHitCooldown > 0 || player.dead) return false;

    let playerCenterX = player.x + player.width / 2;
    let playerCenterY = player.y + player.height / 2;
    let maxMeleeDist = 3.2 * TILE_SIZE;

    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp || rp.dead || Boolean(rp.inStomach) !== Boolean(player.inStomach)) continue;

        let rpCenterX = rp.x + 8;
        let rpCenterY = rp.y + 12;
        let distToRp = Math.hypot(rpCenterX - playerCenterX, rpCenterY - playerCenterY);

        let cursorOnPlayer = (worldMouseX >= rp.x - 14 && worldMouseX <= rp.x + 30 &&
                              worldMouseY >= rp.y - 14 && worldMouseY <= rp.y + 38);

        if (distToRp <= maxMeleeDist && cursorOnPlayer) {
            pvpHitCooldown = 18;
            pickaxeSwing += 1.2;
            let dir = (rpCenterX >= playerCenterX) ? 1 : -1;
            player.direction = dir;
            sendPvpHit(id, 1, dir * 3.2, -3.2);
            return true;
        }
    }
    return false;
}

function updateEntities() {
    globalTick++;
    if (player.invulTimer > 0) player.invulTimer--;
    if (player.bombCooldown > 0) player.bombCooldown--;
    if (pvpHitCooldown > 0) pvpHitCooldown--;
    if (systemMessageTimer > 0) systemMessageTimer--;
    if (player.stomachExitCooldown > 0) player.stomachExitCooldown--;
    if (player.poisonDamageEffect > 0) player.poisonDamageEffect--;

    if (wormTransition.active) {
        wormTransition.timer++;
        if (wormTransition.timer >= wormTransition.maxTimer) {
            wormTransition.active = false;
        }
    }

    let wasInWater = player.inWater;
    let wasInAcid = player.inAcid;
    const waterState = checkEntityWaterState(player.x, player.y, player.width, player.height);
    player.inWater = waterState.inWater;
    player.inKelp = waterState.inKelp;
    player.inAcid = Boolean(waterState.inAcid);
    player.headSubmerged = waterState.headSubmerged;

    // Zielony plusk kwasu gdy gracz wpadnie do kwasu w żołądku czerwia
    if (!wasInAcid && player.inAcid && player.vy > 0.8 && !player.ridingPig) {
        let spX = Math.round(player.x + player.width / 2);
        let spY = Math.round(player.y + player.height - 3);
        createAcidSplash(spX, spY, 22);
    }

    // Żrące toksyny Kwasu Żołądkowego (działają w żołądku oraz gdy kwas zostanie postawiony w świecie)
    if (!player.dead) {
        if (player.inAcid) {
            player.acidPoisonTimer = 180; // 3 sekundy zatrucia żrącymi toksynami (utrzymuje się też chwilę po wyjściu)
            if (Math.random() < 0.42) {
                splashParticles.push({
                    x: player.x + (Math.random() - 0.1) * (player.width + 4),
                    y: player.y + Math.random() * player.height,
                    vx: (Math.random() - 0.5) * 1.1,
                    vy: -0.9 - Math.random() * 1.4,
                    size: 2.2 + Math.random() * 1.8,
                    color: Math.random() > 0.4 ? '#a3e635' : '#4ade80',
                    life: 22 + Math.floor(Math.random() * 12)
                });
            }
            if (player.gameMode !== 1) {
                player.acidTimer++;
                if (player.acidTimer >= 36) {
                    damagePlayer(1, true);
                    createAcidSplash(player.x + player.width / 2, player.y + player.height / 2, 10);
                    player.acidTimer = 0;
                }
            }
        } else if (player.acidPoisonTimer > 0) {
            player.acidPoisonTimer--;
            if (Math.random() < 0.25) {
                splashParticles.push({
                    x: player.x + Math.random() * player.width,
                    y: player.y + Math.random() * player.height,
                    vx: (Math.random() - 0.5) * 0.6,
                    vy: -0.6 - Math.random() * 0.8,
                    size: 2.0,
                    color: '#84cc16',
                    life: 18
                });
            }
            if (player.gameMode !== 1) {
                player.acidTimer++;
                if (player.acidTimer >= 72) {
                    damagePlayer(1, true);
                    player.acidTimer = 0;
                }
            }
        } else {
            player.acidTimer = 0;
        }

        // Sprawdź czy gracz w żołądku dotarł do górnego przełyku (x = 16..21, y <= 3.2) -> zostaje wypluty na powierzchnię!
        if (player.inStomach) {
            let pCenterX = (player.x + player.width / 2) / TILE_SIZE;
            let pTopY = player.y / TILE_SIZE;
            if (pTopY <= 3.1 && pCenterX >= 15.5 && pCenterX <= 22.5) {
                exitWormStomach("🪱 Przekopałeś przełyk! Czerw Cię wypluł z powrotem na świat!");
                return;
            }
        }
    }

    // Plusk wody tylko dla zwykłej wody (nigdy w kwasie!)
    if (!wasInWater && player.inWater && !player.inAcid && player.vy > 1.8 && !player.ridingPig) {
        let spX = Math.round(player.x + player.width / 2);
        let spY = Math.round(player.y + player.height - 4);
        createWaterSplash(spX, spY, 18);
        if (typeof sendPigEvent === 'function') {
            sendPigEvent('splash_only', null, { x: spX, y: spY, count: 18 });
        }
    }

    if (!player.dead) {
        if (player.gameMode === 1 || player.isSandworm || player.inStomach || player.inAcid) {
            // W żołądku i w kwasie nie ma topienia się ani utraty tlenu
            player.air = player.maxAir;
            player.drownTimer = 0;
        } else if (player.headSubmerged) {
            if (player.air > 0) {
                player.air--;
                player.drownTimer = 0;
            } else {
                player.drownTimer++;
                if (player.drownTimer >= 60) {
                    damagePlayer(1);
                    player.drownTimer = 0;
                }
            }
            if (Math.random() < (player.isSwimming ? 0.16 : 0.06)) {
                waterBubbles.push({
                    x: player.x + player.width / 2 + (Math.random() - 0.5) * 8,
                    y: player.y + 4,
                    vy: -0.5 - Math.random() * 0.4,
                    r: 1.5 + Math.random() * 1.5
                });
            }
        } else {
            player.air = Math.min(player.maxAir, player.air + 4);
            player.drownTimer = 0;
        }
    }

    // Brak regeneracji zdrowia podczas działania żrących toksyn kwasu
    if (!player.dead && player.hp < player.maxHp && (!player.headSubmerged || player.air > 0) && !player.inAcid && player.acidPoisonTimer <= 0) {
        regenTimer++;
        if (regenTimer >= REGEN_TIME) { player.hp += 1; regenTimer = 0; }
    } else { 
        regenTimer = 0; 
    }

    for (let i = waterBubbles.length - 1; i >= 0; i--) {
        let b = waterBubbles[i];
        b.y += b.vy;
        b.x += Math.sin(globalTick * 0.1 + i) * 0.12;
        let bx = Math.floor(b.x / TILE_SIZE), by = Math.floor(b.y / TILE_SIZE);
        if (!isSubmergedTile(bx, by)) {
            waterBubbles.splice(i, 1);
        }
    }

    for (let i = splashParticles.length - 1; i >= 0; i--) {
        let sp = splashParticles[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.18;
        sp.life--;
        if (sp.life <= 0) {
            splashParticles.splice(i, 1);
        }
    }

    if (globalTick % 4 === 0 && !player.inStomach) {
        updateWaterPhysics(cameraX, cameraY);
    }

    let canControl = !showInventory && !isCommandOpen;
    let moveL = keys['KeyA'] && canControl;
    let moveR = keys['KeyD'] && canControl;
    let jump = keys['KeyW'] && canControl;
    let moveDown = keys['KeyS'] && canControl;
    let triggerBomb = keys['KeyR'] && canControl;
    let dismount = keys['Space'] && canControl;

    if (!player.inWater) {
        player.isSwimming = false;
        player.swimToggle = false;
    } else {
        player.isSwimming = player.swimToggle;
    }

    for (let pid in wormPvpCooldowns) {
        if (wormPvpCooldowns[pid] > 0) wormPvpCooldowns[pid]--;
    }

    if (!player.dead) {
        if (player.isSandworm) {
            // RUCH GRACZA PRZEMIENIONEGO W CZERWIA (/czerw)
            const wormSpeed = sandworm.speed; // 3.5 - identyczna prędkość jak Czerw z Diuny
            let headX = player.x + player.width / 2;
            let headY = player.y + player.height / 2;

            let dirX = (moveR ? 1 : 0) - (moveL ? 1 : 0);
            let dirY = (moveDown ? 1 : 0) - (jump ? 1 : 0);

            if (dirX !== 0 || dirY !== 0) {
                let len = Math.hypot(dirX, dirY);
                let targetVx = (dirX / len) * wormSpeed;
                let targetVy = (dirY / len) * wormSpeed;
                player.vx += (targetVx - player.vx) * 0.25;
                player.vy += (targetVy - player.vy) * 0.25;
            } else if (isClicking && canControl) {
                let wMouseX = (mouseX / SCALE) + cameraX;
                let wMouseY = (mouseY / SCALE) + cameraY;
                let dx = wMouseX - headX;
                let dy = wMouseY - headY;
                let dist = Math.hypot(dx, dy);
                if (dist > 6) {
                    let targetVx = (dx / dist) * wormSpeed;
                    let targetVy = (dy / dist) * wormSpeed;
                    player.vx += (targetVx - player.vx) * 0.25;
                    player.vy += (targetVy - player.vy) * 0.25;
                }
            } else {
                // Gdy gracz nie wciska klawiszy: w powietrzu czerw opada łukiem w dół jak w Diunie, a pod ziemią płynnie wyhamowuje
                let currentTile = getTile(Math.floor(headX / TILE_SIZE), Math.floor(headY / TILE_SIZE));
                if (currentTile === BLOCKS.AIR) {
                    player.vy = Math.min(wormSpeed, player.vy + 0.12);
                    player.vx *= 0.96;
                } else {
                    player.vx *= 0.88;
                    player.vy *= 0.88;
                    if (Math.hypot(player.vx, player.vy) < 0.08) {
                        player.vx = 0;
                        player.vy = 0;
                    }
                }
            }

            player.x += player.vx;
            player.y += player.vy;
            if (Math.abs(player.vx) > 0.1) {
                player.direction = player.vx >= 0 ? 1 : -1;
            }

            if (player.x < 0) player.x = 0;
            if (player.x > MAP_WIDTH * TILE_SIZE - player.width) player.x = MAP_WIDTH * TILE_SIZE - player.width;
            if (player.y < 0) player.y = 0;
            if (player.y > MAP_HEIGHT * TILE_SIZE - player.height) player.y = MAP_HEIGHT * TILE_SIZE - player.height;

            headX = player.x + player.width / 2;
            headY = player.y + player.height / 2;
            player.grounded = true;
            player.fallStartY = player.y;

            // Zjadanie miękkich bloków (piasek, ziemia, trawa, kaktus, liście, wodorosty - identycznie jak Czerw!)
            if (Math.hypot(player.vx, player.vy) > 0.35) {
                let bx = Math.floor(headX / TILE_SIZE);
                let by = Math.floor(headY / TILE_SIZE);
                for (let x = -1; x <= 1; x++) {
                    for (let y = -1; y <= 1; y++) {
                        if (x * x + y * y <= 2) {
                            let block = getTile(bx + x, by + y);
                            if (block !== BLOCKS.AIR && block !== BLOCKS.WATER && BLOCK_HARDNESS[block] <= 25) {
                                setTile(bx + x, by + y, BLOCKS.AIR, true);
                            }
                        }
                    }
                }
            }

            // Aktualizacja 15 segmentów ciała Czerwia gracza
            if (!Array.isArray(player.wormSegments) || player.wormSegments.length !== sandworm.numSegments) {
                player.wormSegments = [];
                for (let i = 0; i < sandworm.numSegments; i++) {
                    player.wormSegments.push({ x: headX, y: headY + i * 10 });
                }
            }
            player.wormSegments[0] = { x: headX, y: headY };
            for (let i = 1; i < sandworm.numSegments; i++) {
                let prev = player.wormSegments[i - 1];
                let curr = player.wormSegments[i];
                let dx = prev.x - curr.x;
                let dy = prev.y - curr.y;
                let dist = Math.hypot(dx, dy);
                let minDist = 12;
                if (dist > minDist && dist > 0.001) {
                    curr.x += (dx / dist) * (dist - minDist);
                    curr.y += (dy / dist) * (dist - minDist);
                }
            }

            // Pożeranie innych graczy przez Czerwia (/czerw) -> zamyka zjedzonego gracza w Żołądku!
            for (let id in remotePlayers) {
                let rp = remotePlayers[id];
                if (!rp || rp.dead || rp.inGame === false || rp.inStomach || rp.isSandworm) continue;
                let rpCenterX = rp.x + 8;
                let rpCenterY = rp.y + 12;
                let hitByWorm = Math.hypot(rpCenterX - headX, rpCenterY - headY) < sandworm.radius * 2 + 4;
                if (hitByWorm && (!wormPvpCooldowns[id] || wormPvpCooldowns[id] <= 0)) {
                    wormPvpCooldowns[id] = 65;
                    let knockDir = (rpCenterX >= headX) ? 1 : -1;
                    sendPvpHit(id, 1, knockDir * 2.0, -4.0, true, true);
                    showSystemNotification(`🪱 Pożarłeś gracza ${rp.nick}! Został zamknięty w Twoim żołądku!`, "#4caf50", 220, true);
                }
            }
        } else if (player.ridingPig) {
            let pig = player.ridingPig;
            if (dismount) {
                keys['Space'] = false;
                dismountCurrentPig(false, true, false);
                player.vy = -player.jumpPower * 0.8; 
            } else {
                if (moveL) { pig.vx = -player.speed - 0.65; pig.direction = -1; player.direction = -1; }
                else if (moveR) { pig.vx = player.speed + 0.65; pig.direction = 1; player.direction = 1; }
                else { pig.vx = 0; }
                
                if (jump) { pig.vy = -player.speed - 0.65; }
                else if (moveDown) { pig.vy = player.speed + 0.65; }
                else { pig.vy = 0; }

                if (!checkCollision(pig.x + pig.vx, pig.y, pig.width, pig.height)) pig.x += pig.vx;
                if (!checkCollision(pig.x, pig.y + pig.vy, pig.width, pig.height)) pig.y += pig.vy;
                
                if(pig.y < 0) pig.y = 0;
                if(pig.y > MAP_HEIGHT * TILE_SIZE - pig.height) pig.y = MAP_HEIGHT * TILE_SIZE - pig.height;
                if(pig.x < 0) pig.x = 0;
                if(pig.x > MAP_WIDTH * TILE_SIZE - pig.width) pig.x = MAP_WIDTH * TILE_SIZE - pig.width;
                
                let pigLeft = Math.floor((pig.x - 2) / TILE_SIZE);
                let pigRight = Math.floor((pig.x + pig.width + 2) / TILE_SIZE);
                let pigTop = Math.floor((pig.y - 2) / TILE_SIZE);
                let pigBottom = Math.floor((pig.y + pig.height + 2) / TILE_SIZE);
                let pigTouchingCactus = false;
                let pigTouchingWater = false;

                for (let tx = pigLeft; tx <= pigRight; tx++) {
                    for (let ty = pigTop; ty <= pigBottom; ty++) {
                        let t = getTile(tx, ty);
                        if (t === BLOCKS.CACTUS) pigTouchingCactus = true;
                        if (t === BLOCKS.WATER || (t === BLOCKS.KELP && isSubmergedTile(tx, ty))) pigTouchingWater = true;
                    }
                }
                
                if (pigTouchingWater) {
                    // Jednokrotne zrzucenie do wody + uniesienie świni ponad wodę + płynny odlot w górę!
                    dismountCurrentPig(true, true, true);
                    player.vy = 1.2;
                    player.vx = (player.direction || 1) * 0.8;
                } else if (pigTouchingCactus && player.gameMode !== 1) {
                    dismountCurrentPig(true, true, false);
                    player.vy = -4; 
                    player.vx = (player.direction) * -2;
                    damagePlayer(1);
                } else {
                    player.x = pig.x + pig.width/2 - player.width/2;
                    player.y = pig.y - player.height + 4; 
                    player.vx = 0; player.vy = 0;
                    player.grounded = true; player.walkFrame = 0;

                    if (triggerBomb && player.bombCooldown <= 0) {
                        let bx = pig.x + pig.width / 2;
                        let by = pig.y + pig.height;
                        bombs.push({ x: bx, y: by, vy: 0, radius: 4, ownerId: myPlayerId });
                        sendBombSpawn(bx, by, 0);
                        player.bombCooldown = 240; 
                    }
                }
            }
        } else if (player.inAcid) {
            // Ruch w Gęstym, Żrącym Kwasie Czerwia (mocne spowolnienie ruchów + zielone rozbryzgi)
            let acidSpeed = player.speed * 0.36;
            if (moveL) {
                player.vx = -acidSpeed;
                player.direction = -1;
                player.walkFrame += 0.045;
            } else if (moveR) {
                player.vx = acidSpeed;
                player.direction = 1;
                player.walkFrame += 0.045;
            } else {
                player.vx *= 0.68;
                if (Math.abs(player.vx) < 0.04) player.vx = 0;
                player.walkFrame = 0;
            }

            if (Math.abs(player.vx) > 0.15 && globalTick % 10 === 0) {
                createAcidSplash(player.x + player.width / 2, player.y + player.height - 2, 4);
            }

            if (jump || dismount) {
                player.vy = -1.35;
                let aboveTile = getTile(Math.floor((player.x + player.width / 2) / TILE_SIZE), Math.floor((player.y - 3) / TILE_SIZE));
                if (aboveTile === BLOCKS.AIR) {
                    player.vy = -4.5;
                    createAcidSplash(player.x + player.width / 2, player.y + player.height - 2, 10);
                }
            } else if (moveDown) {
                player.vy = 0.85;
            } else {
                player.vy += GRAVITY * 0.12;
                if (player.vy > 0.5) player.vy = 0.5;
            }

            if (!checkCollision(player.x + player.vx, player.y, player.width, player.height)) {
                player.x += player.vx;
            } else {
                player.vx = 0;
            }

            player.grounded = false;
            if (!checkCollision(player.x, player.y + player.vy, player.width, player.height)) {
                player.y += player.vy;
            } else {
                if (player.vy > 0) player.grounded = true;
                player.vy = 0;
            }
            player.fallStartY = player.y;
        } else if (player.inWater) {
            let swimSpeed = player.isSwimming ? (player.speed * 0.80) : (player.speed * 0.52);
            if (player.inKelp) {
                swimSpeed *= 0.72;
            }

            if (moveL) { 
                player.vx = -swimSpeed; 
                player.direction = -1; 
                player.walkFrame += player.isSwimming ? 0.09 : 0.055; 
            } else if (moveR) { 
                player.vx = swimSpeed; 
                player.direction = 1; 
                player.walkFrame += player.isSwimming ? 0.09 : 0.055; 
            } else { 
                player.vx *= 0.82; 
                if (Math.abs(player.vx) < 0.05) player.vx = 0;
                player.walkFrame = player.isSwimming ? (player.walkFrame + 0.04) : 0; 
            }

            if (jump || dismount) {
                player.vy = player.isSwimming ? -1.65 : -1.3;
                let aboveTile = getTile(Math.floor((player.x + player.width / 2) / TILE_SIZE), Math.floor((player.y - 4) / TILE_SIZE));
                if (aboveTile === BLOCKS.AIR && !player.headSubmerged) {
                    player.vy = -4.2;
                }
            } else if (moveDown) {
                player.vy = player.isSwimming ? 1.6 : 1.2;
            } else {
                player.vy += GRAVITY * 0.15;
                let maxSink = player.isSwimming ? 0.32 : 0.9;
                if (player.vy > maxSink) player.vy = maxSink;
            }

            if (player.inKelp) {
                player.vy *= 0.7;
            }

            if (!checkCollision(player.x + player.vx, player.y, player.width, player.height)) {
                player.x += player.vx;
            } else {
                player.vx = 0;
            }

            player.grounded = false;
            if (!checkCollision(player.x, player.y + player.vy, player.width, player.height)) {
                player.y += player.vy;
            } else {
                if (player.vy > 0) player.grounded = true;
                player.vy = 0;
            }
            player.fallStartY = player.y;
        } else {
            let landSpeed = player.inKelp ? (player.speed * 0.80) : player.speed;
            if (player.acidPoisonTimer > 0) {
                landSpeed *= 0.72; // Osłabienie i spowolnienie od żrących toksyn jeszcze przez chwilę po wyjściu z kwasu
            }
            if (moveL) { player.vx = -landSpeed; player.direction = -1; player.walkFrame += 0.11; }
            else if (moveR) { player.vx = landSpeed; player.direction = 1; player.walkFrame += 0.11; }
            else { 
                player.vx *= 0.7;
                if (Math.abs(player.vx) < 0.05) player.vx = 0;
                player.walkFrame = 0; 
            }

            if (jump && player.grounded) { 
                player.vy = -player.jumpPower; 
                player.grounded = false; 
            }
            if (player.vy > 0 && canControl) { 
                for (let pig of pigs) {
                    if (pig.fleeWaterTimer && pig.fleeWaterTimer > 40) continue;
                    if (player.x < pig.x + pig.width && player.x + player.width > pig.x &&
                        player.y + player.height > pig.y && player.y + player.height < pig.y + pig.height) {
                        player.ridingPig = pig;
                        pig.vx = 0;
                        pig.vy = 0;
                        if (typeof sendPigEvent === 'function') {
                            sendPigEvent('mount', pig);
                        }
                        break;
                    }
                }
            }
            player.vy += GRAVITY; if (player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;

            if (!checkCollision(player.x + player.vx, player.y, player.width, player.height)) player.x += player.vx;
            else player.vx = 0;

            if (!player.grounded && player.y < player.fallStartY) player.fallStartY = player.y; 
            player.grounded = false;
            
            if (!checkCollision(player.x, player.y + player.vy, player.width, player.height)) {
                player.y += player.vy;
            } else {
                if (player.vy > 0) { player.grounded = true; player.fallStartY = player.y; }
                player.vy = 0; player.y = Math.round(player.y);
            }
        }
    } else {
        player.vx = 0; player.walkFrame = 0;
        player.vy += GRAVITY; if (player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;
        if (!checkCollision(player.x, player.y + player.vy, player.width, player.height)) player.y += player.vy;
    }
    
    const activeMapW = player.inStomach ? STOMACH_WIDTH : MAP_WIDTH;
    const activeMapH = player.inStomach ? STOMACH_HEIGHT : MAP_HEIGHT;
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > activeMapW * TILE_SIZE) player.x = activeMapW * TILE_SIZE - player.width;
    if (player.y > activeMapH * TILE_SIZE && !player.dead) {
        if (player.gameMode === 1 || player.inStomach) { player.y = activeMapH * TILE_SIZE - player.height - TILE_SIZE * 2; player.vy = 0; }
        else { damagePlayer(5); }
    }

    if (!player.dead && player.gameMode !== 1 && !player.isSandworm && player.invulTimer <= 0 && !player.ridingPig) {
        let left = Math.floor((player.x - 2) / TILE_SIZE);
        let right = Math.floor((player.x + player.width + 2) / TILE_SIZE);
        let top = Math.floor((player.y - 2) / TILE_SIZE);
        let bottom = Math.floor((player.y + player.height + 2) / TILE_SIZE);
        
        let touchingCactus = false;
        for (let tx = left; tx <= right; tx++) {
            for (let ty = top; ty <= bottom; ty++) {
                if (getTile(tx, ty) === BLOCKS.CACTUS) touchingCactus = true;
            }
        }
        if (touchingCactus) {
            player.vy = -3.5;
            player.vx = player.direction * -3.5;
            damagePlayer(1);
        }
    }

    if (player.damageEffect > 0) player.damageEffect--;

    // Płynna aktualizacja segmentów i kolizji z innymi graczami przemienionymi w Czerwia (/czerw)
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp || rp.inGame === false || !rp.isSandworm || rp.dead) continue;
        let rHeadX = rp.x + 8;
        let rHeadY = rp.y + 12;
        if (!Array.isArray(rp.wormSegments) || rp.wormSegments.length !== sandworm.numSegments) {
            rp.wormSegments = [];
            for (let i = 0; i < sandworm.numSegments; i++) {
                rp.wormSegments.push({ x: rHeadX, y: rHeadY + i * 10 });
            }
        } else {
            rp.wormSegments[0] = { x: rHeadX, y: rHeadY };
            for (let i = 1; i < sandworm.numSegments; i++) {
                let prev = rp.wormSegments[i - 1];
                let curr = rp.wormSegments[i];
                if (!prev || !curr) continue;
                let dx = prev.x - curr.x;
                let dy = prev.y - curr.y;
                let dist = Math.hypot(dx, dy);
                let minDist = 12;
                if (dist > minDist && dist > 0.001) {
                    curr.x += (dx / dist) * (dist - minDist);
                    curr.y += (dy / dist) * (dist - minDist);
                }
            }
        }
        // Pożarcie naszego gracza przez innego gracza będącego Czerwiem (/czerw)
        if (!player.dead && !player.inStomach && !player.isSandworm && player.stomachExitCooldown <= 0 && player.invulTimer <= 0) {
            let myCenterX = player.x + player.width / 2;
            let myCenterY = player.y + player.height / 2;
            if (Math.hypot(myCenterX - rHeadX, myCenterY - rHeadY) < sandworm.radius * 2) {
                if (player.gameMode !== 1) damagePlayer(1);
                enterWormStomach(rp.nick || "Czerw", id);
            }
        }
    }

    // ==========================================
    // ZSYNCHRONIZOWANY CZERW Z DIUNY (SANDWORM)
    // ==========================================
    let playerTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
    let isOnDesert = isDesertAt(playerTileX);
    if (sandworm.attackCooldown > 0) sandworm.attackCooldown--;

    if (sandworm.active && sandworm.isRemote && sandworm.ownerId !== myPlayerId) {
        if (performance.now() - sandworm.lastSyncTime > 2500) {
            sandworm.active = false;
            sandworm.isRemote = false;
            sandworm.state = 'idle';
        } else if (sandworm.state === 'attacking' && !player.dead && !player.inStomach && !player.isSandworm && player.stomachExitCooldown <= 0) {
            if (Math.hypot(player.x - sandworm.x, player.y - sandworm.y) < sandworm.radius * 2) {
                if (player.gameMode !== 1) damagePlayer(1);
                enterWormStomach("Dziki Czerw", null);
            }
        }
    } else {
        if (isOnDesert && !player.dead) {
            if (!sandworm.active && sandworm.attackCooldown === 0) {
                if (Math.abs(player.vx) > 0 && player.grounded && Math.random() < 0.003) {
                    sandworm.active = true;
                    sandworm.isRemote = false;
                    sandworm.ownerId = myPlayerId;
                    sandworm.state = 'tracking';
                    sandworm.x = player.x;
                    sandworm.y = player.y + 30 * TILE_SIZE; 
                    sandworm.segments = [];
                    for(let i=0; i<sandworm.numSegments; i++) {
                        sandworm.segments.push({x: sandworm.x, y: sandworm.y + i*10});
                    }
                    sendSandwormSync();
                }
            }
        }
        if (sandworm.active && (!sandworm.isRemote || sandworm.ownerId === myPlayerId)) {
            let targetX = player.x + player.width/2;
            let targetY = player.y + player.height/2;
            if (sandworm.state === 'tracking') {
                let dx = targetX - sandworm.x;
                let dy = (targetY + 5 * TILE_SIZE) - sandworm.y;
                let dist = Math.hypot(dx, dy);
                if (dist > 10) {
                    sandworm.x += (dx/dist) * (sandworm.speed - 1.5);
                    sandworm.y += (dy/dist) * (sandworm.speed - 1.5);
                }
                if (Math.abs(dx) < 40 && Math.abs(dy) < 60) {
                    sandworm.state = 'attacking';
                    sandworm.targetX = targetX;
                    sandworm.targetY = targetY - 10 * TILE_SIZE;
                }
            } else if (sandworm.state === 'attacking') {
                let dx = sandworm.targetX - sandworm.x;
                let dy = sandworm.targetY - sandworm.y;
                let dist = Math.hypot(dx, dy);
                
                if (dist > sandworm.speed) {
                    sandworm.x += (dx/dist) * sandworm.speed;
                    sandworm.y += (dy/dist) * sandworm.speed;
                    let bx = Math.floor(sandworm.x / TILE_SIZE);
                    let by = Math.floor(sandworm.y / TILE_SIZE);
                    for (let x = -1; x <= 1; x++) {
                        for (let y = -1; y <= 1; y++) {
                            if (x*x + y*y <= 2) {
                                let block = getTile(bx+x, by+y);
                                if (block !== BLOCKS.AIR && block !== BLOCKS.WATER && BLOCK_HARDNESS[block] <= 25) {
                                    setTile(bx+x, by+y, BLOCKS.AIR, true);
                                }
                            }
                        }
                    }
                } else {
                    sandworm.state = 'retreating'; 
                }
                if (!player.dead && !player.inStomach && !player.isSandworm && player.stomachExitCooldown <= 0 && Math.hypot(player.x - sandworm.x, player.y - sandworm.y) < sandworm.radius * 2) {
                    if (player.gameMode !== 1) damagePlayer(1);
                    enterWormStomach("Dziki Czerw", null);
                }
            } else if (sandworm.state === 'retreating') {
                sandworm.y += sandworm.speed; 
                if (sandworm.y > MAP_HEIGHT * TILE_SIZE + 500) {
                    sandworm.active = false;
                    sandworm.state = 'idle';
                    sandworm.ownerId = null;
                    sandworm.attackCooldown = 300;
                    sendSandwormSync();
                }
            }
            if (sandworm.active) {
                sandworm.segments[0] = {x: sandworm.x, y: sandworm.y};
                for(let i=1; i<sandworm.numSegments; i++) {
                    let prev = sandworm.segments[i-1];
                    let curr = sandworm.segments[i];
                    let dx = prev.x - curr.x;
                    let dy = prev.y - curr.y;
                    let dist = Math.hypot(dx, dy);
                    let minDist = 12; 
                    if (dist > minDist) {
                        curr.x += (dx/dist) * (dist - minDist);
                        curr.y += (dy/dist) * (dist - minDist);
                    }
                }
                if (globalTick % 2 === 0) {
                    sendSandwormSync();
                }
            }
        }
    }

    // ==========================================
    // LATAJĄCE ŚWINIE (PŁYNNE ODLATYWANIE ZNAD WODY BEZ BUGÓW)
    // ==========================================
    let isPigAuthority = (!roomCode || isRoomHost);

    for (let i = pigs.length - 1; i >= 0; i--) {
        let pig = pigs[i];
        if (!pig.id) pig.id = generatePigId();

        if (player.ridingPig === pig) {
            pig.wingFlap += 0.5;
            continue; 
        }

        if (pig.waterSplashCooldown && pig.waterSplashCooldown > 0) {
            pig.waterSplashCooldown--;
        }

        if (pig.vx === 0) pig.vx = (Math.random() > 0.5 ? 1 : -1) * (1.0 + Math.random() * 0.5);
        
        if (pig.fleeWaterTimer && pig.fleeWaterTimer > 0) {
            pig.fleeWaterTimer--;
            pig.vy = -2.6;
            if (Math.abs(pig.vx) < 1.2) {
                pig.vx = (pig.direction || 1) * 1.6;
            }
        } else {
            let groundY = Math.min((SEA_LEVEL - 2) * TILE_SIZE, getSurfaceY(Math.floor((pig.x + pig.width/2)/TILE_SIZE)));
            let targetY = groundY - 10 * TILE_SIZE;
            if (pig.y > targetY) pig.vy -= 0.05;
            else if (pig.y < targetY) pig.vy += 0.05;
            
            if (pig.vy > 2) pig.vy = 2;
            if (pig.vy < -2) pig.vy = -2;
        }

        if (!checkCollision(pig.x + pig.vx, pig.y, pig.width, pig.height)) {
            pig.x += pig.vx;
        } else {
            pig.vx *= -1; 
            pig.vy = -2.8; 
        }
        
        if (!checkCollision(pig.x, pig.y + pig.vy, pig.width, pig.height)) {
            pig.y += pig.vy;
        } else {
            pig.vy = -1.5;
        }
        
        if (pig.vx !== 0) pig.direction = pig.vx > 0 ? 1 : -1;
        if (pig.x < 0 || pig.x > MAP_WIDTH * TILE_SIZE - pig.width) pig.vx *= -1;
        pig.wingFlap += (pig.fleeWaterTimer > 0) ? 0.65 : 0.3;
        
        // Sprawdzaj kontakt z wodą tylko gdy świnia nie jest w trakcie ucieczki znad wody!
        if ((!pig.waterSplashCooldown || pig.waterSplashCooldown <= 0) && (!pig.fleeWaterTimer || pig.fleeWaterTimer <= 0)) {
            let pigLeft = Math.floor((pig.x - 2) / TILE_SIZE);
            let pigRight = Math.floor((pig.x + pig.width + 2) / TILE_SIZE);
            let pigTop = Math.floor((pig.y - 2) / TILE_SIZE);
            let pigBottom = Math.floor((pig.y + pig.height + 2) / TILE_SIZE);
            let pigTouchingCactus = false;
            let pigInWater = false;
            for (let tx = pigLeft; tx <= pigRight; tx++) {
                for (let ty = pigTop; ty <= pigBottom; ty++) {
                    let t = getTile(tx, ty);
                    if (t === BLOCKS.CACTUS) pigTouchingCactus = true;
                    if (t === BLOCKS.WATER) pigInWater = true;
                }
            }
            if (pigTouchingCactus || pigInWater) {
                if (pigInWater) {
                    let spX = Math.round(pig.x + pig.width / 2);
                    let spY = Math.round(pig.y + pig.height);
                    createWaterSplash(spX, spY, 16);
                    liftPigAboveWater(pig);
                    if (isPigAuthority && typeof sendPigEvent === 'function') {
                        sendPigEvent('splash_only', null, { x: spX, y: spY, count: 16 });
                    }
                }
                pig.vy = -3.0; 
                pig.fleeWaterTimer = 75;
                pig.waterSplashCooldown = 60;
                pig.protectedUntil = performance.now() + 4000;
            }
        }
        
        if (isPigAuthority) {
            let minDistToAnyPlayer = Math.abs(pig.x - player.x);
            for (let id in remotePlayers) {
                if (remotePlayers[id]) {
                    let d = Math.abs(pig.x - remotePlayers[id].x);
                    if (d < minDistToAnyPlayer) minDistToAnyPlayer = d;
                }
            }

            if (minDistToAnyPlayer > 75 * TILE_SIZE && (!pig.fleeWaterTimer || pig.fleeWaterTimer <= 0)) {
                pigs.splice(i, 1);
                continue;
            }
            
            if (minDistToAnyPlayer < 16 * TILE_SIZE && !player.dead) {
                pig.bombTimer--;
                if (pig.bombTimer <= 0) {
                    let bx = pig.x + pig.width / 2;
                    let by = pig.y + pig.height;
                    bombs.push({ x: bx, y: by, vy: 0, radius: 4, ownerId: null });
                    sendBombSpawn(bx, by, 0);
                    pig.bombTimer = 1200 + Math.random() * 900; 
                }
            }
        }
    }

    if (isPigAuthority && pigs.length < 1 && Math.random() < 0.0012 && !player.dead) {
        let spawnLeft = Math.random() > 0.5;
        let px = player.x + (spawnLeft ? -35 * TILE_SIZE : 35 * TILE_SIZE); 
        if (px > 0 && px < MAP_WIDTH * TILE_SIZE) {
            let vxInit = (spawnLeft ? 1 : -1) * (1.0 + Math.random() * 0.5);
            let groundY = Math.min((SEA_LEVEL - 2) * TILE_SIZE, getSurfaceY(Math.floor(px/TILE_SIZE)));
            let py = groundY - 10 * TILE_SIZE - Math.random() * 5 * TILE_SIZE; 
            pigs.push({
                id: generatePigId(),
                x: px, y: py, vx: vxInit, vy: 0, direction: vxInit > 0 ? 1 : -1,
                width: 26, height: 18, wingFlap: 0, bombTimer: 1200 + Math.random() * 900,
                fleeWaterTimer: 0, waterSplashCooldown: 0
            });
        }
    }

    // BOMBY (Brak zniszczeń terenu pod wodą + obrażenia PvP od bomby)
    for (let i = bombs.length - 1; i >= 0; i--) {
        let bomb = bombs[i];
        let bTileX = Math.floor(bomb.x / TILE_SIZE);
        let bTileY = Math.floor(bomb.y / TILE_SIZE);
        let bombInWater = isSubmergedTile(bTileX, bTileY) || getTile(bTileX, bTileY) === BLOCKS.WATER;

        bomb.vy += bombInWater ? 0.06 : 0.15; 
        if (bombInWater && bomb.vy > 2.2) bomb.vy = 2.2;
        bomb.y += bomb.vy;

        let bx = Math.floor(bomb.x / TILE_SIZE);
        let by = Math.floor((bomb.y + bomb.radius) / TILE_SIZE);
        let hitTile = getTile(bx, by);

        let hitPlayerDirectly = false;
        if (!player.dead && bomb.ownerId !== myPlayerId) {
            let px = player.x + player.width / 2, py = player.y + player.height / 2;
            if (Math.hypot(bomb.x - px, bomb.y - py) <= 14) {
                hitPlayerDirectly = true;
            }
        }
        
        if ((!isPassableBlock(hitTile)) || hitPlayerDirectly || bomb.y > MAP_HEIGHT * TILE_SIZE) {
            let explosionUnderwater = bombInWater || 
                                      isSubmergedTile(bx, by) || 
                                      isSubmergedTile(bx, by - 1) ||
                                      getTile(bx, by - 1) === BLOCKS.WATER;

            if (explosionUnderwater) {
                createWaterSplash(bomb.x, bomb.y, 12);
            } else if (!isPassableBlock(hitTile) && !bomb.fromNetwork) {
                for (let ex = -1; ex <= 1; ex++) {
                    for (let ey = -1; ey <= 1; ey++) {
                        if (Math.abs(ex) + Math.abs(ey) <= 1) { 
                            let tx = bx + ex; let ty = by + ey;
                            if (isSubmergedTile(tx, ty) || isWaterLike(getTile(tx, ty - 1)) || isWaterLike(getTile(tx - 1, ty)) || isWaterLike(getTile(tx + 1, ty))) {
                                continue;
                            }
                            let block = getTile(tx, ty);
                            if (block !== BLOCKS.AIR && block !== BLOCKS.WATER) {
                                let hardness = BLOCK_HARDNESS[block] || 0;
                                let chance = 1.0;
                                if (hardness > 25 && hardness <= 45) chance = 0.5; 
                                else if (hardness > 45) chance = 0; 
                                if (Math.random() < chance) {
                                    setTile(tx, ty, BLOCKS.AIR);
                                }
                            }
                        }
                    }
                }
            }

            if (!player.dead && player.gameMode !== 1) {
                let px = player.x + player.width / 2, py = player.y + player.height / 2;
                let dist = Math.hypot(bomb.x - px, bomb.y - py);
                if (dist <= 2.5 * TILE_SIZE) {
                    damagePlayer(1);
                    player.vy = -3.2;
                    player.vx = (px >= bomb.x ? 1 : -1) * 2.5;
                }
            }
            bombs.splice(i, 1);
        }
    }

    // KAMERA Z LERP (obsługuje zarówno główny świat, jak i mały świat Żołądka Czerwia)
    let targetCameraX = player.x + player.width / 2 - (canvas.width / SCALE) / 2; 
    let targetCameraY = player.y + player.height / 2 - (canvas.height / SCALE) / 2;
    
    let camWorldW = (player.inStomach ? STOMACH_WIDTH : MAP_WIDTH) * TILE_SIZE;
    let camWorldH = (player.inStomach ? STOMACH_HEIGHT : MAP_HEIGHT) * TILE_SIZE;
    let viewW = canvas.width / SCALE;
    let viewH = canvas.height / SCALE;

    if (camWorldW <= viewW) {
        targetCameraX = (camWorldW - viewW) / 2;
    } else {
        if (targetCameraX < 0) targetCameraX = 0; 
        if (targetCameraX > camWorldW - viewW) targetCameraX = camWorldW - viewW;
    }

    if (camWorldH <= viewH) {
        targetCameraY = (camWorldH - viewH) / 2;
    } else {
        if (targetCameraY < 0) targetCameraY = 0; 
        if (targetCameraY > camWorldH - viewH) targetCameraY = camWorldH - viewH;
    }

    cameraX += (targetCameraX - cameraX) * CAMERA_SPEED;
    cameraY += (targetCameraY - cameraY) * CAMERA_SPEED;

    // WALKA WRĘCZ PVP [LPM], KOPANIE I BUDOWANIE
    const worldMouseX = (mouseX / SCALE) + cameraX;
    const worldMouseY = (mouseY / SCALE) + cameraY;
    const tileX = Math.floor(worldMouseX / TILE_SIZE);
    const tileY = Math.floor(worldMouseY / TILE_SIZE);
    
    let maxDist = player.ridingPig ? 2.25 * TILE_SIZE : 4.5 * TILE_SIZE;
    
    const targetCenterX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const targetCenterY = tileY * TILE_SIZE + TILE_SIZE / 2;
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    
    const distToPlayer = Math.hypot(targetCenterX - playerCenterX, targetCenterY - playerCenterY);
    
    if (buildTimer > 0) buildTimer--;

    let clickMining = isClicking && canControl;
    let clickPlacing = isRightClicking && canControl;

    if (!player.dead && canControl && !player.isSandworm) {
        let hitOtherPlayer = false;
        if (clickMining) {
            hitOtherPlayer = tryPvpMeleeAttack(worldMouseX, worldMouseY);
        }

        if (!hitOtherPlayer && distToPlayer < maxDist) {
            let targetBlock = getTile(tileX, tileY);
            let currentItem = hotbar[selectedSlotIndex];
            let isTargetMinable = (targetBlock !== BLOCKS.AIR && targetBlock !== BLOCKS.WATER && targetBlock !== BLOCKS.ACID && (targetBlock !== BLOCKS.STOMACH_WALL || (!player.inStomach && player.gameMode === 1)));
            let isTargetReplaceable = (targetBlock === BLOCKS.AIR || (targetBlock === BLOCKS.ACID && (!currentItem || currentItem.type !== BLOCKS.ACID)) || (targetBlock === BLOCKS.WATER && (!currentItem || currentItem.type !== BLOCKS.WATER)));
            let canSeeTarget = isBlockVisibleToPlayer(tileX, tileY);
            
            if (clickMining && canSeeTarget) {
                if (isTargetMinable) {
                    if (miningX === tileX && miningY === tileY) {
                        miningProgress += (player.gameMode === 1 ? Math.max(35, Math.ceil((BLOCK_HARDNESS[targetBlock] || 35) / 2)) : 1);
                        pickaxeSwing += 0.18; 
                        
                        if (miningProgress >= BLOCK_HARDNESS[targetBlock]) {
                            let waterAdjacent = isWaterLike(getTile(tileX, tileY - 1)) ||
                                                isWaterLike(getTile(tileX - 1, tileY)) ||
                                                isWaterLike(getTile(tileX + 1, tileY));
                            setTile(tileX, tileY, waterAdjacent ? BLOCKS.WATER : BLOCKS.AIR);
                            if (player.gameMode !== 1) {
                                addToInventory(targetBlock, 1);
                            }
                            miningProgress = 0;
                            miningX = -1;
                            miningY = -1;
                        }
                    } else {
                        miningX = tileX;
                        miningY = tileY;
                        miningProgress = 0;
                    }
                } else {
                    miningProgress = 0;
                    miningX = -1;
                    miningY = -1;
                }
            } else {
                miningProgress = 0;
                miningX = -1;
                miningY = -1;
            }
            
            if (clickPlacing && buildTimer === 0 && currentItem && canSeeTarget && isTargetReplaceable && hasNeighborBlock(tileX, tileY)) {
                let prevBlock = targetBlock;
                if (!checkCollision(player.x, player.y, player.width, player.height)) {
                     setTile(tileX, tileY, currentItem.type);
                     if (checkCollision(player.x, player.y, player.width, player.height)) {
                         setTile(tileX, tileY, prevBlock); 
                     } else { 
                         removeSelectedItem();
                         buildTimer = 7; 
                     }
                }
            }
        } else {
            miningProgress = 0;
            miningX = -1;
            miningY = -1;
        }
    } else {
        miningProgress = 0;
        miningX = -1;
        miningY = -1;
    }

    if (roomCode && globalTick % 2 === 0) {
        sendPlayerState();
    }
}
