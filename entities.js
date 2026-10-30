// ==========================================
// FIZYKA GRACZA, PŁYNNE ODLATYWANIE ŚWINI ZNAD WODY, CZERW I KOMENDY /PIG & /UNPIG (v1.5)
// ==========================================
let spawnTileX = SPAWN_TILE_X;
let spawnX = spawnTileX * TILE_SIZE; 
let spawnY = getSurfaceY(spawnTileX);

const player = {
    x: spawnX, y: spawnY, width: 16, height: 24,
    vx: 0, vy: 0, speed: 1.9, jumpPower: 4.95, grounded: false,
    direction: 1, walkFrame: 0, hp: 5, maxHp: 5, dead: false, damageEffect: 0,
    fallStartY: spawnY, invulTimer: 0, ridingPig: null, ridingCamel: null, passengerOnPlayerId: null, camelInteractCooldown: 0, bombCooldown: 0,
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
let deers = [];
let camels = [];
let fishes = [];
let bombs = [];
let waterBubbles = [];
let splashParticles = [];

spawnInitialForestDeers();
spawnInitialDesertCamels();
spawnInitialOceanFishes();

let sandworm = { 
    active: false, x: 0, y: 0, targetX: 0, targetY: 0, 
    radius: 12, segments: [], numSegments: 15, speed: 3.9, 
    attackCooldown: 0, state: 'idle',
    ownerId: null, isRemote: false, lastSyncTime: 0
};

function generateDeerId() {
    return "deer_" + myPlayerId + "_" + Math.random().toString(36).substring(2, 8);
}

function getDeerDimensions(variant) {
    if (variant === 'byk') return { width: 28, height: 24, speed: 0.68 };
    if (variant === 'lania') return { width: 24, height: 20, speed: 0.74 };
    return { width: 16, height: 15, speed: 0.80 }; // 'ciele'
}

// Jelenie swobodnie przechodzą na tle pni drzew i liści w lesie (nie blokują się między drzewami!),
// ale kolidują z ziemią, trawą, kamieniem, piaskiem i innymi twardymi blokami terenu.
function isPassableForDeer(block) {
    return block === BLOCKS.AIR || block === BLOCKS.WATER || block === BLOCKS.KELP ||
           block === BLOCKS.ACID || block === BLOCKS.WOOD || block === BLOCKS.LEAVES || block === BLOCKS.OPUNTIA;
}

function checkDeerCollision(x, y, w, h) {
    let left = Math.floor(x / TILE_SIZE);
    let right = Math.floor((x + w - 0.1) / TILE_SIZE);
    let top = Math.floor(y / TILE_SIZE);
    let bottom = Math.floor((y + h - 0.1) / TILE_SIZE);
    for (let tx = left; tx <= right; tx++) {
        for (let ty = top; ty <= bottom; ty++) {
            if (!isPassableForDeer(getTile(tx, ty))) return true;
        }
    }
    return false;
}

// Wyszukuje bezpieczną pozycję nad ziemią bez kolizji z blokami i poza wodą
function findSafeDeerSpawnPos(baseTx, variant) {
    const dims = getDeerDimensions(variant);
    for (let offset = 0; offset <= 14; offset++) {
        let dirs = offset === 0 ? [0] : [-offset, offset];
        for (let d of dirs) {
            let tx = baseTx + d;
            if (tx < 12 || tx >= MAP_WIDTH - 12) continue;
            let sy = surfaceHeights[tx];
            if (!sy || sy >= SEA_LEVEL - 1 || sy < 6) continue;
            let groundBlk = map[tx] ? map[tx][sy] : BLOCKS.AIR;
            if (groundBlk !== BLOCKS.GRASS && groundBlk !== BLOCKS.DIRT) continue;

            let spawnX = tx * TILE_SIZE;
            let spawnY = sy * TILE_SIZE - dims.height;

            // Jeśli sąsiedni kafelek pod szerokością jelenia jest wyżej, podnieś pozycję startową (do 3 bloków w górę)
            for (let lift = 0; lift < 4; lift++) {
                if (!checkDeerCollision(spawnX, spawnY, dims.width, dims.height)) {
                    return { x: spawnX, y: spawnY, tx: tx };
                }
                spawnY -= TILE_SIZE;
            }
        }
    }
    return null;
}

// Losuje skład grupy jeleni:
// - 70% szans: pojedynczy osobnik (Byk, Łania lub rzadziej Cielę)
// - 22% szans: dwójka (Łania + Cielę lub Byk + Łania)
// - 8% szans: trójka / pełna rodzinka (Byk + Łania + Cielę)
function pickDeerSpawnGroup() {
    let r = Math.random();
    if (r < 0.70) {
        let vRand = Math.random();
        if (vRand < 0.45) return ['lania'];
        if (vRand < 0.85) return ['byk'];
        return ['ciele'];
    } else if (r < 0.92) {
        return Math.random() < 0.55 ? ['lania', 'ciele'] : ['byk', 'lania'];
    } else {
        return ['byk', 'lania', 'ciele'];
    }
}

function spawnDeerGroupAtTile(baseTx) {
    let group = pickDeerSpawnGroup();
    let spawned = 0;
    for (let idx = 0; idx < group.length; idx++) {
        let variant = group[idx];
        let safePos = findSafeDeerSpawnPos(baseTx + idx * 3, variant);
        if (safePos) {
            deers.push(createDeerEntity(safePos.x, safePos.y, variant));
            spawned++;
        }
    }
    return spawned;
}

function createDeerEntity(x, y, variant = 'lania') {
    const dims = getDeerDimensions(variant);
    return {
        id: generateDeerId(),
        variant: variant, // 'byk' | 'lania' | 'ciele'
        x: x,
        y: y,
        lastX: x,
        vx: 0,
        vy: 0,
        width: dims.width,
        height: dims.height,
        baseSpeed: dims.speed,
        direction: Math.random() > 0.5 ? 1 : -1,
        walkFrame: Math.random() * 10,
        grounded: false,
        state: 'walk', // 'walk' | 'idle' | 'graze'
        stateTimer: 90 + Math.floor(Math.random() * 140),
        grazeProgress: 0,
        jumpCooldown: 0,
        turnCooldown: 0,
        stuckTimer: 0
    };
}

function spawnInitialForestDeers() {
    deers = [];
    let forestCenters = [];
    for (let tx = 40; tx < MAP_WIDTH - 40; tx += 32) {
        if ((isForestAt(tx) && countTreesNearTileX(tx, 16) >= 1) || countTreesNearTileX(tx, 16) >= 2) {
            let sy = surfaceHeights[tx];
            if (sy < SEA_LEVEL - 1 && map[tx] && map[tx][sy] === BLOCKS.GRASS) {
                forestCenters.push(tx);
                tx += 65; // Częstsze występowanie w lasach na całej mapie
            }
        }
    }
    if (forestCenters.length < 5) {
        for (let tx = 50; tx < MAP_WIDTH - 50; tx += 85) {
            if (isForestAt(tx) && surfaceHeights[tx] < SEA_LEVEL - 1) {
                forestCenters.push(tx);
                if (forestCenters.length >= 6) break;
            }
        }
    }

    for (let i = 0; i < Math.min(7, forestCenters.length); i++) {
        spawnDeerGroupAtTile(forestCenters[i]);
    }
}

function generateCamelId() {
    return "camel_" + myPlayerId + "_" + Math.random().toString(36).substring(2, 8);
}

// Rozdzielone gatunki:
// 1) Wielbłąd dwugarbny ('wielblad_samiec', 'wielblad_samica', 'wielblad_mlody')
// 2) Dromader jednogarbny ('dromader_samiec', 'dromader_samica', 'dromader_mlody')
function getCamelSpeciesAndRole(variant) {
    let v = variant || 'dromader_samica';
    if (v === 'wielblad') v = 'wielblad_samiec';
    if (v === 'dromader') v = 'dromader_samiec';
    if (v === 'mlody') v = 'dromader_mlody';

    let species = v.startsWith('wielblad') ? 'wielblad' : 'dromader';
    let role = 'samica';
    if (v.endsWith('_samiec')) role = 'samiec';
    else if (v.endsWith('_mlody')) role = 'mlody';
    return { species, role, variant: `${species}_${role}` };
}

function getCamelDimensions(variant) {
    const info = getCamelSpeciesAndRole(variant);
    if (info.species === 'wielblad') {
        if (info.role === 'samiec') return { width: 34, height: 27, speed: 0.56 };
        if (info.role === 'samica') return { width: 30, height: 24, speed: 0.60 };
        return { width: 21, height: 18, speed: 0.68 }; // 'wielblad_mlody'
    } else {
        // 'dromader'
        if (info.role === 'samiec') return { width: 32, height: 26, speed: 0.62 };
        if (info.role === 'samica') return { width: 28, height: 23, speed: 0.66 };
        return { width: 19, height: 17, speed: 0.72 }; // 'dromader_mlody'
    }
}

// Wielbłądy i dromadery swobodnie mijają kaktusy i drzewa w tle (nie klinują się na kaktusach!),
// ale kolidują z piaskiem, ziemią, kamieniem i twardym podłożem.
function isPassableForCamel(block) {
    return block === BLOCKS.AIR || block === BLOCKS.WATER || block === BLOCKS.KELP ||
           block === BLOCKS.ACID || block === BLOCKS.CACTUS || block === BLOCKS.WOOD ||
           block === BLOCKS.LEAVES || block === BLOCKS.OPUNTIA;
}

function checkCamelCollision(x, y, w, h) {
    let left = Math.floor(x / TILE_SIZE);
    let right = Math.floor((x + w - 0.1) / TILE_SIZE);
    let top = Math.floor(y / TILE_SIZE);
    let bottom = Math.floor((y + h - 0.1) / TILE_SIZE);
    for (let tx = left; tx <= right; tx++) {
        for (let ty = top; ty <= bottom; ty++) {
            if (!isPassableForCamel(getTile(tx, ty))) return true;
        }
    }
    return false;
}

// Wyszukuje bezpieczne miejsce na pustyni (na piasku) bez kolizji z blokami i poza wodą
function findSafeCamelSpawnPos(baseTx, variant) {
    const dims = getCamelDimensions(variant);
    for (let offset = 0; offset <= 14; offset++) {
        let dirs = offset === 0 ? [0] : [-offset, offset];
        for (let d of dirs) {
            let tx = baseTx + d;
            if (tx < 12 || tx >= MAP_WIDTH - 12) continue;
            if (!isDesertAt(tx)) continue;
            let sy = surfaceHeights[tx];
            if (!sy || sy >= SEA_LEVEL - 1 || sy < 6) continue;
            let groundBlk = map[tx] ? map[tx][sy] : BLOCKS.AIR;
            if (groundBlk !== BLOCKS.SAND) continue;

            let spawnX = tx * TILE_SIZE;
            let spawnY = sy * TILE_SIZE - dims.height;

            for (let lift = 0; lift < 4; lift++) {
                if (!checkCamelCollision(spawnX, spawnY, dims.width, dims.height)) {
                    return { x: spawnX, y: spawnY, tx: tx };
                }
                spawnY -= TILE_SIZE;
            }
        }
    }
    return null;
}

// Wybiera gatunek dla danego obszaru pustyni tak, aby Wielbłądy i Dromadery pojawiały się w osobnych skupiskach
function chooseCamelSpeciesForTile(baseTx, forcedSpecies = null) {
    if (forcedSpecies === 'wielblad' || forcedSpecies === 'dromader') return forcedSpecies;
    let worldX = baseTx * TILE_SIZE;
    // Jeśli w promieniu 60 bloków jest już jakiś osobnik, zachowaj ten sam gatunek w tej okolicy
    for (let other of camels) {
        if (Math.abs(other.x - worldX) < 60 * TILE_SIZE) {
            return getCamelSpeciesAndRole(other.variant).species;
        }
    }
    // W przeciwnym razie przypisz gatunek na podstawie sektora mapy, aby oba gatunki występowały na pustyniach, ale w osobnych stadach
    let sector = Math.floor(baseTx / 70);
    return (sector % 2 === 0) ? 'dromader' : 'wielblad';
}

// Losuje skład grupy w obrębie JEDNEGO gatunku ('wielblad' ALBO 'dromader' — nigdy mieszane!):
// - 70% szans: pojedynczy osobnik (samica, samiec lub rzadziej młody)
// - 22% szans: dwójka tego samego gatunku (samica + młody lub samiec + samica)
// - 8% szans: trójka / rodzinka tego samego gatunku (samiec + samica + młody)
function pickCamelSpawnGroup(species) {
    let sp = (species === 'wielblad' || species === 'dromader') ? species : (Math.random() < 0.5 ? 'wielblad' : 'dromader');
    let r = Math.random();
    if (r < 0.70) {
        let vRand = Math.random();
        if (vRand < 0.45) return [`${sp}_samica`];
        if (vRand < 0.85) return [`${sp}_samiec`];
        return [`${sp}_mlody`];
    } else if (r < 0.92) {
        return Math.random() < 0.55
            ? [`${sp}_samica`, `${sp}_mlody`]
            : [`${sp}_samiec`, `${sp}_samica`];
    } else {
        return [`${sp}_samiec`, `${sp}_samica`, `${sp}_mlody`];
    }
}

function spawnCamelGroupAtTile(baseTx, forcedSpecies = null) {
    let sp = chooseCamelSpeciesForTile(baseTx, forcedSpecies);
    let group = pickCamelSpawnGroup(sp);
    let spawned = 0;
    for (let idx = 0; idx < group.length; idx++) {
        let variant = group[idx];
        let safePos = findSafeCamelSpawnPos(baseTx + idx * 3, variant);
        if (safePos) {
            camels.push(createCamelEntity(safePos.x, safePos.y, variant));
            spawned++;
        }
    }
    return spawned;
}

function createCamelEntity(x, y, variant = 'dromader_samica') {
    const info = getCamelSpeciesAndRole(variant);
    const dims = getCamelDimensions(info.variant);
    return {
        id: generateCamelId(),
        variant: info.variant, // np. 'wielblad_samiec', 'wielblad_samica', 'wielblad_mlody', 'dromader_samiec', 'dromader_samica', 'dromader_mlody'
        species: info.species, // 'wielblad' | 'dromader'
        role: info.role,       // 'samiec' | 'samica' | 'mlody'
        x: x,
        y: y,
        lastX: x,
        vx: 0,
        vy: 0,
        width: dims.width,
        height: dims.height,
        baseSpeed: dims.speed,
        direction: Math.random() > 0.5 ? 1 : -1,
        walkFrame: Math.random() * 10,
        grounded: false,
        state: 'walk', // 'walk' | 'idle' | 'graze'
        stateTimer: 100 + Math.floor(Math.random() * 150),
        grazeProgress: 0,
        jumpCooldown: 0,
        turnCooldown: 0,
        stuckTimer: 0,
        isTamed: false
    };
}

// Sprawdza, czy na wielbłądzie prowadzonym przez danego kierowcę (driverId) siedzi już drugi gracz (pasażer)
function getPassengerIdOnCamelDriver(driverId) {
    if (!driverId) return null;
    if (player && !player.dead && player.passengerOnPlayerId === driverId) {
        return myPlayerId;
    }
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (rp && rp.inGame !== false && !rp.dead && rp.passengerOnPlayerId === driverId) {
            return id;
        }
    }
    return null;
}

// Zsiadanie z 2. miejsca (pasażera) na wielbłądzie dwugarbnym
function dismountPassengerCamel() {
    if (!player.passengerOnPlayerId) return;
    player.passengerOnPlayerId = null;
    if (typeof sendPlayerState === 'function') sendPlayerState();
}

// Zsiadanie z oswojonego wielbłąda lub dromadera (jako kierowca - 1. osoba)
function dismountCurrentCamel(broadcast = true) {
    if (!player.ridingCamel) return;
    let camel = player.ridingCamel;
    player.ridingCamel = null;
    camel.vx = 0;
    camel.state = 'idle';
    camel.stateTimer = 90;
    if (!camels.includes(camel)) {
        camels.push(camel);
    }
    if (broadcast && typeof sendCamelEvent === 'function') {
        sendCamelEvent('dismount', camel);
    }
    if (typeof sendPlayerState === 'function') sendPlayerState();
}

// Karmienie wielbłąda/dromadera owocem opuncji z ręki, wsiadanie jako 1. osoba (kierowca) oraz dosiadanie się jako 2. osoba (pasażer na Wielbłądzie dwugarbnym)
function tryInteractWithCamel(worldMouseX, worldMouseY, isRightClick) {
    if (player.dead || player.inStomach || player.isSandworm || player.camelInteractCooldown > 0) return false;
    let playerCenterX = player.x + player.width / 2;
    let playerCenterY = player.y + player.height / 2;
    let maxInteractDist = 4.8 * TILE_SIZE;
    let currentItem = hotbar[selectedSlotIndex];
    let holdingOpuntia = Boolean(currentItem && currentItem.type === BLOCKS.OPUNTIA && currentItem.count > 0);

    // A. Sprawdź, czy klikamy na wielbłąda/dromadera prowadzonego już przez innego gracza
    if ((isRightClick || holdingOpuntia) && !player.ridingCamel && !player.passengerOnPlayerId) {
        for (let id in remotePlayers) {
            let rp = remotePlayers[id];
            if (!rp || rp.inGame === false || rp.dead || !rp.isRidingCamel) continue;
            if (Boolean(rp.inStomach) !== Boolean(player.inStomach)) continue;

            let dir = rp.direction || 1;
            let rpCamelInfo = getCamelSpeciesAndRole(rp.camelVariant || 'wielblad_samica');
            let isTwoHumped = (rpCamelInfo.species === 'wielblad');
            let cDims = getCamelDimensions(rpCamelInfo.variant);
            let camelX = rp.x + 8 - cDims.width / 2 - (isTwoHumped ? dir * 5 : 0);
            let camelY = rp.y + 17;

            let dist = Math.hypot((camelX + cDims.width / 2) - playerCenterX, (camelY + cDims.height / 2) - playerCenterY);
            if (dist > maxInteractDist) continue;

            let cursorOnRiddenCamel = (worldMouseX >= camelX - 12 && worldMouseX <= camelX + cDims.width + 12 &&
                                       worldMouseY >= rp.y - 10 && worldMouseY <= camelY + cDims.height + 10);
            if (!cursorOnRiddenCamel) continue;

            // Dromader (1 garb) ma miejsce TYLKO dla 1 osoby!
            if (!isTwoHumped) {
                player.camelInteractCooldown = 18;
                showSystemNotification("🐪 To jest Dromader (jednogarbny) — ma miejsce tylko dla 1 osoby! (Wielbłąd dwugarbny mieści 2 osoby)", "#ff9800", 210, false);
                return true;
            }

            let existingPassenger = getPassengerIdOnCamelDriver(id);
            if (existingPassenger && existingPassenger !== myPlayerId) {
                player.camelInteractCooldown = 18;
                showSystemNotification("🐪 Na tym Wielbłądzie dwugarbnym siedzą już 2 osoby!", "#ff9800", 190, false);
                return true;
            }

            if (player.ridingPig) {
                dismountCurrentPig(false, true, false);
            }
            player.passengerOnPlayerId = id;
            player.camelInteractCooldown = 18;
            showSystemNotification(`🐪 Usiadłeś jako 2. osoba za graczem ${rp.nick || "Gracz"}! (Z 2 osobami wielbłąd idzie wolniej | [Spacja] Zejście)`, "#4caf50", 230, true);
            if (typeof sendPlayerState === 'function') sendPlayerState();
            return true;
        }
    }

    // B. Interakcja z wolnymi wielbłądami dwugarbnymi i dromaderami na świecie
    for (let i = 0; i < camels.length; i++) {
        let c = camels[i];
        if (!c || c === player.ridingCamel) continue;
        let cCenterX = c.x + (c.width || 30) / 2;
        let cCenterY = c.y + (c.height || 25) / 2;
        let dist = Math.hypot(cCenterX - playerCenterX, cCenterY - playerCenterY);
        if (dist > maxInteractDist) continue;

        let cursorOnCamel = (worldMouseX >= c.x - 10 && worldMouseX <= c.x + (c.width || 30) + 10 &&
                             worldMouseY >= c.y - 14 && worldMouseY <= c.y + (c.height || 25) + 8);
        if (!cursorOnCamel) continue;

        let info = getCamelSpeciesAndRole(c.variant);
        let isTwoHumped = (info.species === 'wielblad');

        // 0. BLOKADA JAZDY NA MAŁYM WIELBŁĄDZIE / DROMADERZE ('mlody'):
        // Mały osobnik nie zamienia się w dużego po nakarmieniu i nie można na nim jeździć!
        if (info.role === 'mlody') {
            if (holdingOpuntia) {
                removeSelectedItem();
                player.camelInteractCooldown = 18;
                c.state = 'idle';
                c.vx = 0;
                c.stateTimer = 90;
                for (let p = 0; p < 8; p++) {
                    splashParticles.push({
                        x: cCenterX + (Math.random() - 0.5) * 14,
                        y: c.y + (Math.random() - 0.5) * 8,
                        vx: (Math.random() - 0.5) * 1.2,
                        vy: -0.8 - Math.random() * 1.0,
                        size: 2.4,
                        color: (p % 2 === 0) ? '#fb7185' : '#fde047',
                        life: 22
                    });
                }
                let youngLabel = isTwoHumped ? "Mały wielbłąd" : "Mały dromader";
                showSystemNotification(`🐪 ${youngLabel} ze smakiem zjadł owoc opuncji, ale jest za mały, żeby na nim jeździć!`, "#ffeb3b", 220, false);
                return true;
            } else if (isRightClick) {
                player.camelInteractCooldown = 18;
                let youngLabel = isTwoHumped ? "Mały wielbłąd" : "Mały dromader";
                showSystemNotification(`🐪 ${youngLabel} jest za mały — jeździć można tylko na dorosłych osobnikach!`, "#ff9800", 210, false);
                return true;
            }
            continue;
        }

        // 1. Oswajanie dorosłego osobnika owocem opuncji z ręki (działa na dorosłego Wielbłąda dwugarbnego oraz dorosłego Dromadera)
        if (holdingOpuntia && !c.isTamed) {
            removeSelectedItem();
            player.camelInteractCooldown = 18;
            c.isTamed = true;
            c.state = 'idle';
            c.vx = 0;
            c.stateTimer = 120;

            for (let p = 0; p < 12; p++) {
                splashParticles.push({
                    x: cCenterX + (Math.random() - 0.5) * 20,
                    y: c.y - 2 + (Math.random() - 0.5) * 10,
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: -0.9 - Math.random() * 1.2,
                    size: 2.8,
                    color: (p % 2 === 0) ? '#f43f5e' : '#fde047',
                    life: 26
                });
            }
            if (isTwoHumped) {
                showSystemNotification("🐪 Oswoiłeś Wielbłąda dwugarbnego (2 miejsca)! Kliknij PPM, aby usiąść (drugi gracz może dosiąść się za Tobą!).", "#4caf50", 240, true);
            } else {
                showSystemNotification("🐪 Oswoiłeś Dromadera (1 miejsce)! Kliknij PPM (lub wskocz), aby na nim jeździć!", "#4caf50", 230, true);
            }
            if (typeof sendCamelEvent === 'function') {
                sendCamelEvent('tame', c);
            }
            return true;
        }

        // 2. Wsiadanie na dorosłego, oswojonego Wielbłąda dwugarbnego (2-osobowego) lub Dromadera (1-osobowego)
        if (c.isTamed && info.role !== 'mlody' && (isRightClick || holdingOpuntia)) {
            if (player.ridingPig) {
                dismountCurrentPig(false, true, false);
            }
            if (player.passengerOnPlayerId) {
                dismountPassengerCamel();
            }
            if (player.ridingCamel && player.ridingCamel !== c) {
                dismountCurrentCamel(true);
            }
            player.ridingCamel = c;
            player.camelInteractCooldown = 18;
            c.vx = 0;
            if (typeof sendCamelEvent === 'function') {
                sendCamelEvent('mount', c);
            }
            if (isTwoHumped) {
                showSystemNotification("🐪 Usiadłeś na Wielbłądzie dwugarbnym (1/2 miejsca)! Druga osoba może dosiąść się za Tobą. [A/D] Ruch, [W] Skok, [Spacja] Zejście.", "#ffeb3b", 220, false);
            } else {
                showSystemNotification("🐪 Usiadłeś na Dromaderze (1/1 miejsce)! [A/D] Ruch, [W] Skok, [Spacja] Zejście.", "#ffeb3b", 210, false);
            }
            if (typeof sendPlayerState === 'function') sendPlayerState();
            return true;
        } else if (!c.isTamed && isRightClick) {
            player.camelInteractCooldown = 18;
            let speciesLabel = isTwoHumped ? "Wielbłąda dwugarbnego" : "Dromadera";
            showSystemNotification(`🐪 Najpierw nakarm ${speciesLabel} owocem opuncji z ręki, aby go oswoić!`, "#ff9800", 210, false);
            return true;
        }
    }
    return false;
}

function spawnInitialDesertCamels() {
    camels = [];
    let desertCenters = [];
    for (let tx = 35; tx < MAP_WIDTH - 35; tx += 30) {
        if (isDesertAt(tx)) {
            let sy = surfaceHeights[tx];
            if (sy < SEA_LEVEL - 1 && map[tx] && map[tx][sy] === BLOCKS.SAND) {
                desertCenters.push(tx);
                tx += 58; // Znacznie częstsze występowanie na pustyniach (w osobnych siedliskach)
            }
        }
    }
    const speciesOrder = ['dromader', 'wielblad'];
    for (let i = 0; i < Math.min(7, desertCenters.length); i++) {
        spawnCamelGroupAtTile(desertCenters[i], speciesOrder[i % 2]);
    }
}

function generateFishId() {
    return "fish_" + myPlayerId + "_" + Math.random().toString(36).substring(2, 8);
}

// 4 gatunki ryb w wodzie:
// 0: 'blazenek'  - Błazenek koralowy (pływa w ławicach blisko koralowców; karmiony Wodorostami daje pełny tlen i czasem wypluwa skarb!)
// 1: 'zlota'     - Złota Rybka / Skalar (wyskakuje łukiem ponad taflę wody robiąc salta i ucieka w popłochu z bąbelkami!)
// 2: 'rozdymka'  - Rozdymka Kolczasta (gdy gracz podpłynie blisko, nadyma się 2.5x w kolczastą kulę i lekko kłuje!)
// 3: 'glebinowa' - Świecąca Ryba Głębinowa / Żabnica (posiada bioluminescencyjną latarenkę oświetlającą głębiny i noc!)
function getFishDimensions(variant) {
    if (variant === 'rozdymka') return { width: 14, height: 11, speed: 0.55 };
    if (variant === 'glebinowa') return { width: 18, height: 12, speed: 0.52 };
    if (variant === 'zlota') return { width: 15, height: 10, speed: 0.82 };
    return { width: 13, height: 9, speed: 0.72 }; // 'blazenek'
}

function createFishEntity(x, y, variant = 'blazenek') {
    const dims = getFishDimensions(variant);
    let dir = Math.random() > 0.5 ? 1 : -1;
    return {
        id: generateFishId(),
        variant: variant, // 'blazenek' | 'zlota' | 'rozdymka' | 'glebinowa'
        x: x,
        y: y,
        vx: dir * dims.speed,
        vy: (Math.random() - 0.5) * 0.3,
        width: dims.width,
        height: dims.height,
        baseSpeed: dims.speed,
        direction: dir,
        swimPhase: Math.random() * 10,
        state: 'swim', // 'swim' | 'dart' | 'leap' | 'flop'
        stateTimer: 80 + Math.floor(Math.random() * 120),
        isPuffed: false,
        puffTimer: 0,
        puffScale: 1.0,
        fedCooldown: 0
    };
}

function findSafeWaterTileForFish(baseTx) {
    for (let offset = 0; offset <= 14; offset++) {
        let dirs = offset === 0 ? [0] : [-offset, offset];
        for (let d of dirs) {
            let tx = baseTx + d;
            if (tx < 8 || tx >= MAP_WIDTH - 8) continue;
            let floorY = surfaceHeights[tx];
            if (!floorY || floorY <= SEA_LEVEL + 3) continue;
            let minWaterY = SEA_LEVEL + 1;
            let maxWaterY = floorY - 2;
            if (maxWaterY <= minWaterY) continue;
            let ty = minWaterY + Math.floor(Math.random() * (maxWaterY - minWaterY + 1));
            if (getTile(tx, ty) === BLOCKS.WATER || getTile(tx, ty) === BLOCKS.KELP) {
                return { x: tx * TILE_SIZE, y: ty * TILE_SIZE, tx, ty, floorY };
            }
        }
    }
    return null;
}

function spawnFishSchoolAtTile(baseTx) {
    let pos = findSafeWaterTileForFish(baseTx);
    if (!pos) return 0;
    let depth = pos.ty - SEA_LEVEL;
    let r = Math.random();
    let spawned = 0;

    if (depth >= 9 && r < 0.25) {
        // W głębinach pojawia się Świecąca Ryba Głębinowa (pojedynczo lub w parze)
        fishes.push(createFishEntity(pos.x, pos.y, 'glebinowa'));
        spawned++;
        if (Math.random() < 0.35) {
            fishes.push(createFishEntity(pos.x + 18, pos.y + 6, 'glebinowa'));
            spawned++;
        }
    } else if (r < 0.55) {
        // Ławica Błazenków koralowych (2 do 4 rybek blisko siebie)
        let count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            fishes.push(createFishEntity(pos.x + i * 14, pos.y + (i % 2) * 8, 'blazenek'));
            spawned++;
        }
    } else if (r < 0.80) {
        // Złote Rybki skaczące nad wodą (1-2 osobniki blisko tafli)
        let surfY = (SEA_LEVEL + 2 + Math.floor(Math.random() * 3)) * TILE_SIZE;
        fishes.push(createFishEntity(pos.x, surfY, 'zlota'));
        spawned++;
        if (Math.random() < 0.50) {
            fishes.push(createFishEntity(pos.x + 16, surfY + 6, 'zlota'));
            spawned++;
        }
    } else {
        // Rozdymka Kolczasta (1-2 osobniki)
        fishes.push(createFishEntity(pos.x, pos.y, 'rozdymka'));
        spawned++;
    }
    return spawned;
}

function spawnInitialOceanFishes() {
    fishes = [];
    for (let tx = 24; tx < MAP_WIDTH - 24; tx += 36) {
        if (isOceanAt(tx) && surfaceHeights[tx] > SEA_LEVEL + 5) {
            spawnFishSchoolAtTile(tx);
            tx += 42;
            if (fishes.length >= 18) break;
        }
    }
}

// Interakcja PPM z rybką: karmienie Błazenka lub Złotej Rybki Wodorostami (BLOCKS.KELP) -> odnawia tlen i daje szansę na podwodny skarb!
function tryInteractWithFish(worldMouseX, worldMouseY, isRightClick) {
    if (!isRightClick || player.dead || player.inStomach || player.isSandworm) return false;
    let currentItem = hotbar[selectedSlotIndex];
    if (!currentItem || currentItem.type !== BLOCKS.KELP || currentItem.count <= 0) return false;

    let playerCenterX = player.x + player.width / 2;
    let playerCenterY = player.y + player.height / 2;
    let maxDist = 4.6 * TILE_SIZE;

    for (let f of fishes) {
        if (!f || f.fedCooldown > 0) continue;
        let fcx = f.x + f.width / 2;
        let fcy = f.y + f.height / 2;
        if (Math.hypot(fcx - playerCenterX, fcy - playerCenterY) > maxDist) continue;
        if (worldMouseX >= f.x - 10 && worldMouseX <= f.x + f.width + 10 &&
            worldMouseY >= f.y - 10 && worldMouseY <= f.y + f.height + 10) {
            removeSelectedItem();
            f.fedCooldown = 240;
            // Odnów pełny zapas tlenu gracza pod wodą!
            player.air = player.maxAir;
            player.drownTimer = 0;

            for (let b = 0; b < 8; b++) {
                waterBubbles.push({
                    x: fcx + (Math.random() - 0.5) * 14,
                    y: fcy + (Math.random() - 0.5) * 10,
                    vy: -0.7 - Math.random() * 0.6,
                    r: 2.0 + Math.random() * 1.5
                });
                splashParticles.push({
                    x: fcx + (Math.random() - 0.5) * 14,
                    y: fcy + (Math.random() - 0.5) * 10,
                    vx: (Math.random() - 0.5) * 1.4,
                    vy: -0.8 - Math.random() * 1.0,
                    size: 2.4,
                    color: (b % 2 === 0) ? '#fde047' : '#38bdf8',
                    life: 24
                });
            }

            if (Math.random() < 0.40) {
                let rewardBlock = (Math.random() < 0.45) ? BLOCKS.DIAMOND : BLOCKS.CORAL_GOLD;
                addToInventory(rewardBlock, 1);
                let rewardName = (rewardBlock === BLOCKS.DIAMOND) ? "Diament 💎" : "Złoty Koral 🪸";
                showSystemNotification(`🐠 Nakarmiłeś rybkę wodorostem! Odnaleziony na dnie skarb: ${rewardName} + Pełny Tlen!`, "#4caf50", 230, true);
            } else {
                showSystemNotification("🐠 Nakarmiłeś rybkę wodorostem! Rybka wypuściła dla Ciebie świeże bąbelki tlenu (100% Tlenu)!", "#38bdf8", 210, false);
            }
            return true;
        }
    }
    return false;
}

// ==========================================
// KOMENDY SPAWNOWANIA ZWIERZĄT (/jelen, /wielblad, /dromader, /ryba, /swinia)
// ==========================================
function spawnAnimalCommand(mobCategory, argStr) {
    if (player.dead) return;
    if (player.inStomach) {
        showSystemNotification("Nie można spawnować zwierząt wewnątrz żołądka Czerwia!", "#ff5252", 200, true);
        return;
    }

    let cleanArg = (argStr || "").trim().toLowerCase();
    let dir = player.direction || 1;
    let spawnX = Math.round(player.x + dir * 32);
    let spawnY = Math.round(player.y - 6);
    spawnX = Math.max(TILE_SIZE * 2, Math.min((MAP_WIDTH - 4) * TILE_SIZE, spawnX));

    if (mobCategory === 'jelen') {
        let variant = 'byk';
        let label = "Byka (0 - Samiec z porożem)";
        if (cleanArg === '1' || cleanArg === 'lania' || cleanArg === 'samica' || cleanArg === 'kobieta') {
            variant = 'lania';
            label = "Łanię (1 - Samica)";
        } else if (cleanArg === '2' || cleanArg === 'ciele' || cleanArg === 'dziecko' || cleanArg === 'mlody') {
            variant = 'ciele';
            label = "Cielę (2 - Dziecko / Jelonek)";
        } else if (cleanArg === '' || cleanArg === '0' || cleanArg === 'byk' || cleanArg === 'samiec' || cleanArg === 'mezczyzna') {
            variant = 'byk';
            label = "Byka (0 - Samiec z porożem)";
        } else {
            showSystemNotification("Użycie: /jelen [0 | 1 | 2]  (0 - Byk/Samiec, 1 - Łania/Samica, 2 - Cielę/Dziecko)", "#ff5252", 220, true);
            return;
        }

        let dims = getDeerDimensions(variant);
        let sy = player.y + player.height - dims.height;
        for (let lift = 0; lift < 4; lift++) {
            if (!checkDeerCollision(spawnX, sy, dims.width, dims.height)) break;
            sy -= TILE_SIZE;
        }
        let dObj = createDeerEntity(spawnX, sy, variant);
        deers.push(dObj);
        if (typeof sendMobSpawnPacket === 'function') {
            sendMobSpawnPacket('deer', dObj);
        }
        showSystemNotification(`🦌 Zespawnowano Jelenia: ${label}!`, "#4caf50", 210, true);
    } else if (mobCategory === 'wielblad' || mobCategory === 'dromader') {
        let sp = (mobCategory === 'wielblad') ? 'wielblad' : 'dromader';
        let spName = (sp === 'wielblad') ? "Wielbłąda dwugarbnego" : "Dromadera jednogarbnego";
        let role = 'samiec';
        let roleLabel = "0 - Samiec";

        if (cleanArg === '1' || cleanArg === 'samica' || cleanArg === 'kobieta') {
            role = 'samica';
            roleLabel = "1 - Samica";
        } else if (cleanArg === '2' || cleanArg === 'mlody' || cleanArg === 'dziecko' || cleanArg === 'maly') {
            role = 'mlody';
            roleLabel = "2 - Dziecko / Młody";
        } else if (cleanArg === '' || cleanArg === '0' || cleanArg === 'samiec' || cleanArg === 'mezczyzna') {
            role = 'samiec';
            roleLabel = "0 - Samiec";
        } else {
            showSystemNotification(`Użycie: /${mobCategory} [0 | 1 | 2]  (0 - Samiec, 1 - Samica, 2 - Dziecko/Młody)`, "#ff5252", 220, true);
            return;
        }

        let fullVar = `${sp}_${role}`;
        let dims = getCamelDimensions(fullVar);
        let sy = player.y + player.height - dims.height;
        for (let lift = 0; lift < 4; lift++) {
            if (!checkCamelCollision(spawnX, sy, dims.width, dims.height)) break;
            sy -= TILE_SIZE;
        }
        let cObj = createCamelEntity(spawnX, sy, fullVar);
        camels.push(cObj);
        if (typeof sendMobSpawnPacket === 'function') {
            sendMobSpawnPacket('camel', cObj);
        }
        showSystemNotification(`🐪 Zespawnowano ${spName} (${roleLabel})!`, "#4caf50", 210, true);
    } else if (mobCategory === 'ryba') {
        let variant = 'blazenek';
        let label = "Błazenka koralowego (0)";
        if (cleanArg === '1' || cleanArg === 'zlota' || cleanArg === 'skalar') {
            variant = 'zlota';
            label = "Złotą Rybkę skaczącą (1)";
        } else if (cleanArg === '2' || cleanArg === 'rozdymka' || cleanArg === 'kolczasta') {
            variant = 'rozdymka';
            label = "Rozdymkę kolczastą (2)";
        } else if (cleanArg === '3' || cleanArg === 'glebinowa' || cleanArg === 'zabnica') {
            variant = 'glebinowa';
            label = "Świecącą Rybę Głębinową (3)";
        } else if (cleanArg === '' || cleanArg === '0' || cleanArg === 'blazenek') {
            variant = 'blazenek';
            label = "Błazenka koralowego (0)";
        } else {
            showSystemNotification("Użycie: /ryba [0 | 1 | 2 | 3]  (0 - Błazenek, 1 - Złota Rybka, 2 - Rozdymka, 3 - Głębinowa)", "#ff5252", 220, true);
            return;
        }

        let fObj = createFishEntity(spawnX, player.y + 4, variant);
        fishes.push(fObj);
        if (typeof sendMobSpawnPacket === 'function') {
            sendMobSpawnPacket('fish', fObj);
        }
        showSystemNotification(`🐠 Zespawnowano rybę: ${label}!`, "#38bdf8", 210, true);
    } else if (mobCategory === 'swinia') {
        let newPig = {
            id: generatePigId(),
            x: spawnX,
            y: player.y - 24,
            vx: dir * 1.2,
            vy: -0.5,
            direction: dir,
            width: 26,
            height: 18,
            wingFlap: 0,
            bombTimer: 1200 + Math.random() * 600,
            fleeWaterTimer: 0,
            waterSplashCooldown: 0,
            protectedUntil: performance.now() + 5000
        };
        pigs.push(newPig);
        if (typeof sendMobSpawnPacket === 'function') {
            sendMobSpawnPacket('pig', newPig);
        }
        showSystemNotification("🐷 Zespawnowano dziką Latającą Świnię!", "#4caf50", 210, true);
    }
}

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

// Komenda /spawn — teleportuje gracza pod Totem na Spawnie
function teleportPlayerToSpawn() {
    if (player.dead) return;
    if (player.inStomach) {
        showSystemNotification("Nie możesz użyć /spawn wewnątrz żołądka czerwia! Przekop przełyk!", "#ff5252", 210, true);
        return;
    }
    if (player.ridingPig) {
        dismountCurrentPig(false, true, false);
    }
    if (player.ridingCamel) {
        dismountCurrentCamel(true);
    }
    if (player.passengerOnPlayerId) {
        dismountPassengerCamel();
    }
    player.isSwimming = false;
    player.swimToggle = false;
    miningX = -1;
    miningY = -1;
    miningProgress = 0;
    respawnPlayerAtSpawn();
    showSystemNotification("🗿 Przeteleportowano pod Totem na Spawnie (/spawn)!", "#4caf50", 210, true);
    if (typeof sendPlayerState === 'function') sendPlayerState();
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
    if (player.ridingCamel) {
        dismountCurrentCamel(true);
    }
    if (player.passengerOnPlayerId) {
        dismountPassengerCamel();
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
            if (player.ridingCamel) {
                dismountCurrentCamel(true);
            }
            if (player.passengerOnPlayerId) {
                dismountPassengerCamel();
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
            if (typeof sendPlayerState === 'function') sendPlayerState();
            return true;
        }
    }
    return false;
}

function updateEntities() {
    globalTick++;

    // Płynna aktualizacja pory dnia (cykl dobowy trwa kilka minut czasu rzeczywistego)
    let nowMs = performance.now();
    let dtMs = Math.max(0, Math.min(200, nowMs - lastTimeUpdateMs));
    lastTimeUpdateMs = nowMs;
    if (isPlaying) {
        worldTime = (worldTime + dtMs / DAY_CYCLE_DURATION_MS) % 1.0;
        let newPhase = getDayPhaseId(worldTime);
        if (newPhase !== currentDayPhaseName) {
            currentDayPhaseName = newPhase;
            if (!player.inStomach) {
                if (newPhase === 'sunrise') {
                    showSystemNotification("🌅 Wschodzi słońce — nastaje malowniczy świt!", "#fb923c", 210, false);
                } else if (newPhase === 'day') {
                    showSystemNotification("☀️ Nastał słoneczny dzień!", "#fde047", 190, false);
                } else if (newPhase === 'sunset') {
                    showSystemNotification("🌇 Słońce chyli się ku zachodowi...", "#f97316", 210, false);
                } else if (newPhase === 'night') {
                    showSystemNotification("🌙 Zapadła noc — na niebie pojawił się księżyc i gwiazdy.", "#93c5fd", 220, false);
                }
            }
        }
    }

    if (player.invulTimer > 0) player.invulTimer--;
    if (player.bombCooldown > 0) player.bombCooldown--;
    if (pvpHitCooldown > 0) pvpHitCooldown--;
    if (systemMessageTimer > 0) systemMessageTimer--;
    if (player.stomachExitCooldown > 0) player.stomachExitCooldown--;
    if (player.poisonDamageEffect > 0) player.poisonDamageEffect--;
    if (player.camelInteractCooldown > 0) player.camelInteractCooldown--;

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
        } else if (player.passengerOnPlayerId) {
            // JAZDA JAKO 2. OSOBA (PASAŻER) NA TYLNYM SIODLE WIELBŁĄDA DWUGARBNEGO
            let driverRp = remotePlayers[player.passengerOnPlayerId];
            if (dismount || !driverRp || driverRp.inGame === false || driverRp.dead || !driverRp.isRidingCamel || Boolean(driverRp.inStomach) !== Boolean(player.inStomach)) {
                if (dismount) keys['Space'] = false;
                dismountPassengerCamel();
                player.vy = -player.jumpPower * 0.80;
            } else {
                let dir = driverRp.direction || 1;
                player.direction = dir;
                // Pasażer siedzi na tylnym garbie za kierowcą!
                player.x = driverRp.x - dir * 11;
                player.y = driverRp.y;
                player.vx = 0;
                player.vy = 0;
                player.grounded = true;
                player.fallStartY = player.y;
                player.walkFrame = 0;
            }
        } else if (player.ridingCamel) {
            // JAZDA JAKO 1. OSOBA (KIEROWCA) NA OSWOJONYM WIELBŁĄDZIE DWUGARBNYM
            // Z 2 osobami na grzbiecie wielbłąd porusza się wyraźnie wolniej!
            let camel = player.ridingCamel;
            let hasSecondRider = Boolean(getPassengerIdOnCamelDriver(myPlayerId));
            if (dismount) {
                keys['Space'] = false;
                dismountCurrentCamel(true);
                player.vy = -player.jumpPower * 0.82;
            } else {
                let mountSpeed = hasSecondRider ? (player.speed * 0.76) : (player.speed * 1.18);
                let walkStep = hasSecondRider ? 0.11 : 0.16;
                if (moveL) {
                    camel.vx = -mountSpeed;
                    camel.direction = -1;
                    player.direction = -1;
                    camel.walkFrame += walkStep;
                } else if (moveR) {
                    camel.vx = mountSpeed;
                    camel.direction = 1;
                    player.direction = 1;
                    camel.walkFrame += walkStep;
                } else {
                    camel.vx *= 0.65;
                    if (Math.abs(camel.vx) < 0.05) camel.vx = 0;
                }

                if (jump && camel.grounded) {
                    camel.vy = hasSecondRider ? (-player.jumpPower * 0.86) : (-player.jumpPower * 1.02);
                    camel.grounded = false;
                }

                camel.vy += GRAVITY;
                if (camel.vy > MAX_FALL_SPEED) camel.vy = MAX_FALL_SPEED;

                if (camel.vx !== 0) {
                    if (!checkCamelCollision(camel.x + camel.vx, camel.y, camel.width, camel.height)) {
                        camel.x += camel.vx;
                    } else if (camel.grounded && !checkCamelCollision(camel.x + camel.vx, camel.y - TILE_SIZE, camel.width, camel.height)) {
                        // Płynne wchodzenie wielbłąda na 1-blokowe wydmy i wzniesienia
                        camel.y -= TILE_SIZE;
                        camel.x += camel.vx;
                    } else {
                        camel.vx = 0;
                    }
                }

                camel.grounded = false;
                if (!checkCamelCollision(camel.x, camel.y + camel.vy, camel.width, camel.height)) {
                    camel.y += camel.vy;
                } else {
                    if (camel.vy > 0) camel.grounded = true;
                    camel.vy = 0;
                    camel.y = Math.round(camel.y);
                }

                if (camel.x < 0) camel.x = 0;
                if (camel.x > MAP_WIDTH * TILE_SIZE - camel.width) camel.x = MAP_WIDTH * TILE_SIZE - camel.width;

                // Sprawdź czy wielbłąd nie wpadł do głębokiej wody
                let cMidTx = Math.floor((camel.x + camel.width / 2) / TILE_SIZE);
                let cMidTy = Math.floor((camel.y + camel.height / 2) / TILE_SIZE);
                if (getTile(cMidTx, cMidTy) === BLOCKS.WATER) {
                    dismountCurrentCamel(true);
                    player.vy = -2.2;
                } else {
                    let dir = camel.direction || 1;
                    let isTwoHumped = (getCamelSpeciesAndRole(camel.variant).species === 'wielblad');
                    // Na Wielbłądzie dwugarbnym kierowca siedzi na przednim garbie (+dir*5, zostawiając tylny dla 2. osoby), a na Dromaderze centralnie!
                    player.x = camel.x + camel.width / 2 - player.width / 2 + (isTwoHumped ? dir * 5 : 0);
                    player.y = camel.y - player.height + 7;
                    player.vx = 0;
                    player.vy = 0;
                    player.grounded = true;
                    player.fallStartY = player.y;
                    player.walkFrame = 0;
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
            if (moveL) { player.vx = -landSpeed; player.direction = -1; player.walkFrame += 0.13; }
            else if (moveR) { player.vx = landSpeed; player.direction = 1; player.walkFrame += 0.13; }
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
                if (!player.ridingPig && !player.ridingCamel && !player.passengerOnPlayerId) {
                    // 1. Wskoczenie jako 1. osoba wyłącznie na dorosłego, oswojonego Wielbłąda dwugarbnego lub Dromadera
                    for (let c of camels) {
                        if (!c.isTamed || getCamelSpeciesAndRole(c.variant).role === 'mlody') continue;
                        if (player.x < c.x + c.width && player.x + player.width > c.x &&
                            player.y + player.height > c.y && player.y + player.height < c.y + c.height) {
                            player.ridingCamel = c;
                            c.vx = 0;
                            if (typeof sendCamelEvent === 'function') {
                                sendCamelEvent('mount', c);
                            }
                            break;
                        }
                    }
                    // 2. Wskoczenie jako 2. osoba (pasażer) WYŁĄCZNIE na Wielbłąda dwugarbnego prowadzonego już przez innego gracza
                    if (!player.ridingCamel) {
                        for (let id in remotePlayers) {
                            let rp = remotePlayers[id];
                            if (!rp || rp.inGame === false || rp.dead || !rp.isRidingCamel) continue;
                            if (Boolean(rp.inStomach) !== Boolean(player.inStomach)) continue;
                            if (getCamelSpeciesAndRole(rp.camelVariant || 'wielblad_samica').species !== 'wielblad') continue;
                            if (getPassengerIdOnCamelDriver(id)) continue;
                            let dir = rp.direction || 1;
                            let cDims = getCamelDimensions(rp.camelVariant || 'wielblad_samica');
                            let camelX = rp.x + 8 - cDims.width / 2 - dir * 5;
                            let camelY = rp.y + 17;
                            if (player.x < camelX + cDims.width && player.x + player.width > camelX &&
                                player.y + player.height > camelY - 6 && player.y + player.height < camelY + cDims.height) {
                                player.passengerOnPlayerId = id;
                                showSystemNotification(`🐪 Wskoczyłeś jako 2. osoba na wielbłąda gracza ${rp.nick || "Gracz"}!`, "#4caf50", 200, false);
                                if (typeof sendPlayerState === 'function') sendPlayerState();
                                break;
                            }
                        }
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

    if (!player.dead && player.gameMode !== 1 && !player.isSandworm && player.invulTimer <= 0 && !player.ridingPig && !player.ridingCamel && !player.passengerOnPlayerId) {
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

    // Płynna interpolacja ruchu, animacji oraz akcji innych graczy w Multiplayerze (60-70 FPS bez szarpania!)
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp || rp.inGame === false) continue;

        if (typeof rp.targetX === 'number' && typeof rp.targetY === 'number') {
            let dx = rp.targetX - rp.x;
            let dy = rp.targetY - rp.y;
            let dist = Math.hypot(dx, dy);
            if (dist > 90) {
                // Natychmiastowy skok przy teleportacji (/spawn, wejście/wyjście z żołądka)
                rp.x = rp.targetX;
                rp.y = rp.targetY;
            } else {
                // Płynne doganianie pozycji docelowej + predykcja prędkości
                rp.x += dx * 0.38 + (rp.vx || 0) * 0.22;
                rp.y += dy * 0.38 + (rp.vy || 0) * 0.22;
                if (Math.abs(rp.targetX - rp.x) < 0.15) rp.x = rp.targetX;
                if (Math.abs(rp.targetY - rp.y) < 0.15) rp.y = rp.targetY;
            }
        }

        // Płynne podtrzymanie animacji chodu oraz machania kilofem między pakietami sieciowymi
        if (!rp.dead && !rp.isRiding && !rp.isRidingCamel && !rp.passengerOnPlayerId && Math.abs(rp.vx || 0) > 0.15) {
            rp.walkFrame = (rp.walkFrame || 0) + (rp.isSwimming ? 0.08 : 0.12);
        }
        if (rp.isRidingCamel && Math.abs(rp.vx || 0) > 0.15) {
            rp.camelWalkFrame = (rp.camelWalkFrame || 0) + 0.14;
        }
        if (rp.pickaxeAnim !== null && rp.pickaxeAnim !== undefined) {
            rp.pickaxeAnim += 0.18;
        }

        if (!rp.isSandworm || rp.dead) continue;
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

    // ==========================================
    // JELENIE W LASACH (BYK, ŁANIA I CIELĘ — PŁYNNE CHODZENIE BEZ BLOKOWANIA SIĘ I CZĘSTSZY RESP)
    // ==========================================
    let isDeerAuthority = (!roomCode || isRoomHost);

    if (isDeerAuthority && deers.length === 0 && globalTick === 5) {
        spawnInitialForestDeers();
    }

    // Regularny, okresowy resp jeleni co jakiś czas w lasach i okolicach drzew (do 12 jeleni na mapie)
    if (isDeerAuthority && deers.length < 12 && globalTick % 160 === 0 && Math.random() < 0.72 && !player.dead && !player.inStomach) {
        let pTx = Math.floor(player.x / TILE_SIZE);
        let nearbyDeers = deers.filter(d => Math.abs(d.x - player.x) < 60 * TILE_SIZE).length;
        if (nearbyDeers < 6) {
            // Przeszukaj kilka losowych miejsc w pobliżu gracza (poza bezpośrednim środkiem ekranu), szukając lasu lub drzew
            for (let attempt = 0; attempt < 6; attempt++) {
                let spawnSide = Math.random() > 0.5 ? 1 : -1;
                let candTx = pTx + spawnSide * (18 + Math.floor(Math.random() * 36));
                if (candTx > 14 && candTx < MAP_WIDTH - 14) {
                    let treesNearby = countTreesNearTileX(candTx, 16);
                    if (isForestAt(candTx) || treesNearby >= 1) {
                        if (spawnDeerGroupAtTile(candTx) > 0) break;
                    }
                }
            }
        }
    }

    for (let i = deers.length - 1; i >= 0; i--) {
        let d = deers[i];
        if (!d.id) d.id = generateDeerId();
        let dims = getDeerDimensions(d.variant);
        d.width = dims.width;
        d.height = dims.height;
        d.baseSpeed = dims.speed;
        if (d.jumpCooldown > 0) d.jumpCooldown--;
        if (d.turnCooldown > 0) d.turnCooldown--;

        // Natychmiastowe wysunięcie w górę, jeśli jeleń znalazł się wewnątrz bloku ziemi/kamienia
        let unstickSteps = 0;
        while (checkDeerCollision(d.x, d.y, d.width, d.height) && unstickSteps < 14 && d.y > TILE_SIZE * 2) {
            d.y -= 4;
            d.vy = 0;
            unstickSteps++;
        }

        let centerTx = Math.floor((d.x + d.width / 2) / TILE_SIZE);
        let footTy = Math.floor((d.y + d.height + 1) / TILE_SIZE);
        let groundBlock = getTile(centerTx, footTy);

        if (isDeerAuthority) {
            d.stateTimer--;

            if (d.stateTimer <= 0) {
                if (d.state === 'graze') {
                    if (groundBlock === BLOCKS.GRASS && Math.random() < 0.45) {
                        setTile(centerTx, footTy, BLOCKS.DIRT, true);
                        for (let p = 0; p < 6; p++) {
                            splashParticles.push({
                                x: d.x + (d.direction === 1 ? d.width : 0) + (Math.random() - 0.5) * 8,
                                y: d.y + d.height - 2,
                                vx: (Math.random() - 0.5) * 1.2,
                                vy: -0.7 - Math.random() * 1.0,
                                size: 2.2,
                                color: Math.random() > 0.4 ? '#228B22' : '#8B4513',
                                life: 20
                            });
                        }
                    }
                    d.state = 'walk';
                    d.direction = Math.random() > 0.5 ? 1 : -1;
                    d.stateTimer = 100 + Math.floor(Math.random() * 150);
                } else if (d.state === 'walk') {
                    if (d.grounded && groundBlock === BLOCKS.GRASS && Math.random() < 0.52) {
                        d.state = 'graze';
                        d.vx = 0;
                        d.stateTimer = 100 + Math.floor(Math.random() * 65);
                    } else {
                        d.state = 'idle';
                        d.vx = 0;
                        d.stateTimer = 45 + Math.floor(Math.random() * 60);
                    }
                } else {
                    if (d.grounded && groundBlock === BLOCKS.GRASS && Math.random() < 0.42) {
                        d.state = 'graze';
                        d.vx = 0;
                        d.stateTimer = 100 + Math.floor(Math.random() * 65);
                    } else {
                        d.state = 'walk';
                        d.direction = Math.random() > 0.5 ? 1 : -1;
                        if (d.variant === 'ciele') {
                            let nearestMom = null;
                            let minMomDist = 9999;
                            for (let other of deers) {
                                if (other.variant === 'lania') {
                                    let dist = Math.abs(other.x - d.x);
                                    if (dist < minMomDist) {
                                        minMomDist = dist;
                                        nearestMom = other;
                                    }
                                }
                            }
                            if (nearestMom && minMomDist > 40 && minMomDist < 320) {
                                d.direction = (nearestMom.x >= d.x) ? 1 : -1;
                            }
                        }
                        d.stateTimer = 95 + Math.floor(Math.random() * 140);
                    }
                }
            }
        }

        if (d.state === 'walk') {
            d.vx = d.direction * d.baseSpeed;
            d.walkFrame += 0.105;
            d.grazeProgress = Math.max(0, (d.grazeProgress || 0) - 0.10);

            if (!d.turnCooldown || d.turnCooldown <= 0) {
                let aheadTx = Math.floor((d.x + (d.direction === 1 ? d.width + 6 : -6)) / TILE_SIZE);
                let aheadFootTile = getTile(aheadTx, footTy);
                let aheadBodyTile = getTile(aheadTx, footTy - 1);
                // Zawróć wyłącznie przed wodą, kaktusem lub bardzo głęboką przepaścią (> 4 bloki w dół)
                let deepDrop = (getTile(aheadTx, footTy + 1) === BLOCKS.AIR &&
                                getTile(aheadTx, footTy + 2) === BLOCKS.AIR &&
                                getTile(aheadTx, footTy + 3) === BLOCKS.AIR &&
                                getTile(aheadTx, footTy + 4) === BLOCKS.AIR);
                if (aheadFootTile === BLOCKS.WATER || aheadBodyTile === BLOCKS.WATER || aheadBodyTile === BLOCKS.CACTUS || deepDrop) {
                    d.direction *= -1;
                    d.vx = d.direction * d.baseSpeed;
                    d.turnCooldown = 30;
                }
            }
        } else if (d.state === 'graze') {
            d.vx = 0;
            d.walkFrame = 0;
            d.grazeProgress = Math.min(1, (d.grazeProgress || 0) + 0.08);
            if (!player.inStomach && Math.random() < 0.14) {
                let muzzleX = d.direction === 1 ? (d.x + d.width + 3) : (d.x - 3);
                splashParticles.push({
                    x: muzzleX + (Math.random() - 0.5) * 4,
                    y: d.y + d.height - 2,
                    vx: (Math.random() - 0.5) * 0.7,
                    vy: -0.5 - Math.random() * 0.6,
                    size: 2,
                    color: Math.random() > 0.35 ? '#228B22' : '#4ade80',
                    life: 16
                });
            }
        } else {
            d.vx = 0;
            d.walkFrame = 0;
            d.grazeProgress = Math.max(0, (d.grazeProgress || 0) - 0.10);
        }

        d.vy += GRAVITY;
        if (d.vy > MAX_FALL_SPEED) d.vy = MAX_FALL_SPEED;

        let prevX = d.x;
        if (d.vx !== 0) {
            if (!checkDeerCollision(d.x + d.vx, d.y, d.width, d.height)) {
                d.x += d.vx;
                d.stuckTimer = 0;
            } else if (!checkDeerCollision(d.x + d.vx, d.y - TILE_SIZE, d.width, d.height)) {
                // Płynne wejście na 1-blokowy stopień terenu (natychmiastowe uniesienie o 1 blok zapobiega cofaniu w powietrzu!)
                d.y -= TILE_SIZE;
                d.x += d.vx;
                if (d.vy > 0) d.vy = 0;
                d.stuckTimer = 0;
            } else if (d.grounded && (!d.jumpCooldown || d.jumpCooldown <= 0) &&
                       !checkDeerCollision(d.x + d.vx, d.y - TILE_SIZE * 2, d.width, d.height)) {
                // Skok na 2-blokowy próg terenu
                d.y -= TILE_SIZE;
                d.vy = -3.8;
                d.grounded = false;
                d.jumpCooldown = 28;
                d.stuckTimer = 0;
            } else if (d.vy < -0.2) {
                // Gdy jeleń wznosi się podczas skoku, NIE zawracamy go w powietrzu — czekamy aż doleci na szczyt progu
            } else {
                d.direction *= -1;
                d.vx = 0;
                d.turnCooldown = 25;
            }
        }

        d.grounded = false;
        if (!checkDeerCollision(d.x, d.y + d.vy, d.width, d.height)) {
            d.y += d.vy;
        } else {
            if (d.vy > 0) d.grounded = true;
            d.vy = 0;
            d.y = Math.round(d.y);
        }

        // Detektor utknięcia w wąskich dołkach / rozpadlinach — jeśli jeleń chce iść, a nie przesuwa się w osi X
        if (d.state === 'walk') {
            if (Math.abs(d.x - prevX) < 0.05) {
                d.stuckTimer = (d.stuckTimer || 0) + 1;
                if (d.stuckTimer === 18) {
                    if (!checkDeerCollision(d.x, d.y - TILE_SIZE, d.width, d.height)) {
                        d.y -= TILE_SIZE;
                        d.vy = -3.2;
                    } else {
                        d.direction *= -1;
                    }
                } else if (d.stuckTimer > 40) {
                    // Wydostań jelenia na powierzchnię w tym punkcie
                    let surfY = (surfaceHeights[centerTx] || SEA_LEVEL - 4) * TILE_SIZE - d.height - 2;
                    if (!checkDeerCollision(d.x, surfY, d.width, d.height)) {
                        d.y = surfY;
                        d.vy = 0;
                    }
                    d.direction *= -1;
                    d.stuckTimer = 0;
                }
            } else {
                d.stuckTimer = 0;
            }
        }

        if (d.x < TILE_SIZE * 2) { d.x = TILE_SIZE * 2; d.direction = 1; }
        if (d.x > (MAP_WIDTH - 3) * TILE_SIZE - d.width) { d.x = (MAP_WIDTH - 3) * TILE_SIZE - d.width; d.direction = -1; }

        if (isDeerAuthority) {
            let minDistToAnyPlayer = Math.abs(d.x - player.x);
            for (let id in remotePlayers) {
                if (remotePlayers[id]) {
                    let distP = Math.abs(d.x - remotePlayers[id].x);
                    if (distP < minDistToAnyPlayer) minDistToAnyPlayer = distP;
                }
            }
            if (minDistToAnyPlayer > 110 * TILE_SIZE) {
                deers.splice(i, 1);
            }
        }
    }

    // ==========================================
    // WIELBŁĄDY I DROMADERY NA PUSTYNI (PŁYNNE CHODZENIE PO WYDMACH, ZJADANIE OPUNCJI I CZĘSTSZY RESP)
    // ==========================================
    let isCamelAuthority = (!roomCode || isRoomHost);

    if (isCamelAuthority && camels.length === 0 && globalTick === 5) {
        spawnInitialDesertCamels();
    }

    // Regularny, okresowy resp wielbłądów i dromaderów co jakiś czas na pustyni (do 12 osobników na mapie)
    if (isCamelAuthority && camels.length < 12 && globalTick % 160 === 0 && Math.random() < 0.72 && !player.dead && !player.inStomach) {
        let pTx = Math.floor(player.x / TILE_SIZE);
        let nearbyCamels = camels.filter(c => Math.abs(c.x - player.x) < 60 * TILE_SIZE).length;
        if (nearbyCamels < 6) {
            for (let attempt = 0; attempt < 6; attempt++) {
                let spawnSide = Math.random() > 0.5 ? 1 : -1;
                let candTx = pTx + spawnSide * (18 + Math.floor(Math.random() * 36));
                if (candTx > 14 && candTx < MAP_WIDTH - 14 && isDesertAt(candTx)) {
                    if (spawnCamelGroupAtTile(candTx) > 0) break;
                }
            }
        }
    }

    for (let i = camels.length - 1; i >= 0; i--) {
        let c = camels[i];
        if (!c.id) c.id = generateCamelId();
        let dims = getCamelDimensions(c.variant);
        c.width = dims.width;
        c.height = dims.height;
        c.baseSpeed = dims.speed;
        if (c.jumpCooldown > 0) c.jumpCooldown--;
        if (c.turnCooldown > 0) c.turnCooldown--;

        // Jeśli gracz aktualnie jedzie na tym wielbłądzie, ruchem steruje gracz
        if (player.ridingCamel === c) {
            c.state = (Math.abs(c.vx) > 0.05) ? 'walk' : 'idle';
            c.grazeProgress = 0;
            continue;
        }

        // Natychmiastowe wysunięcie w górę, jeśli wielbłąd znalazł się wewnątrz bloku
        let unstickSteps = 0;
        while (checkCamelCollision(c.x, c.y, c.width, c.height) && unstickSteps < 14 && c.y > TILE_SIZE * 2) {
            c.y -= 4;
            c.vy = 0;
            unstickSteps++;
        }

        let centerTx = Math.floor((c.x + c.width / 2) / TILE_SIZE);
        let footTy = Math.floor((c.y + c.height + 1) / TILE_SIZE);
        let groundBlock = getTile(centerTx, footTy);

        // Sprawdź czy tuż obok wielbłąda rośnie kaktus z małymi owocami opuncji!
        let cactusTx = -1;
        let cactusTy = -1;
        for (let dx = -1; dx <= 1; dx++) {
            let checkTx = centerTx + dx;
            for (let ty = footTy - 1; ty >= Math.max(2, footTy - 4); ty--) {
                if (hasOpuntiaFruit(checkTx, ty)) {
                    cactusTx = checkTx;
                    cactusTy = ty;
                    break;
                }
            }
            if (cactusTx !== -1) break;
        }

        if (isCamelAuthority) {
            c.stateTimer--;

            if (c.stateTimer <= 0) {
                if (c.state === 'graze') {
                    // Wielbłąd zjada mały owoc opuncji z kaktusa — owoc znika, a sam kaktus zostaje!
                    if (cactusTx !== -1 && hasOpuntiaFruit(cactusTx, cactusTy)) {
                        setOpuntiaFruit(cactusTx, cactusTy, false, true);
                        for (let p = 0; p < 8; p++) {
                            splashParticles.push({
                                x: cactusTx * TILE_SIZE + 10 + (Math.random() - 0.5) * 10,
                                y: cactusTy * TILE_SIZE + 8,
                                vx: (Math.random() - 0.5) * 1.4,
                                vy: -0.7 - Math.random() * 1.1,
                                size: 2.4,
                                color: (p % 2 === 0) ? '#f43f5e' : '#fb7185',
                                life: 22
                            });
                        }
                    }
                    c.state = 'walk';
                    c.direction = Math.random() > 0.5 ? 1 : -1;
                    c.stateTimer = 110 + Math.floor(Math.random() * 160);
                } else if (c.state === 'walk') {
                    if (c.grounded && (cactusTx !== -1 || (groundBlock === BLOCKS.SAND && Math.random() < 0.48))) {
                        c.state = 'graze';
                        c.vx = 0;
                        if (cactusTx !== -1) {
                            c.direction = (cactusTx * TILE_SIZE >= c.x) ? 1 : -1;
                        }
                        c.stateTimer = 110 + Math.floor(Math.random() * 70);
                    } else {
                        c.state = 'idle';
                        c.vx = 0;
                        c.stateTimer = 55 + Math.floor(Math.random() * 70);
                    }
                } else {
                    if (c.grounded && (cactusTx !== -1 || (groundBlock === BLOCKS.SAND && Math.random() < 0.38))) {
                        c.state = 'graze';
                        c.vx = 0;
                        c.stateTimer = 110 + Math.floor(Math.random() * 70);
                    } else {
                        c.state = 'walk';
                        c.direction = Math.random() > 0.5 ? 1 : -1;
                        // Młode podąża wyłącznie za samicą (lub dorosłym osobnikiem) SWOJEGO własnego gatunku ('wielblad' albo 'dromader')
                        let cInfo = getCamelSpeciesAndRole(c.variant);
                        c.variant = cInfo.variant;
                        c.species = cInfo.species;
                        c.role = cInfo.role;
                        if (cInfo.role === 'mlody') {
                            let nearestMom = null;
                            let minMomDist = 9999;
                            for (let other of camels) {
                                if (other === c) continue;
                                let oInfo = getCamelSpeciesAndRole(other.variant);
                                if (oInfo.species === cInfo.species && (oInfo.role === 'samica' || oInfo.role === 'samiec')) {
                                    let dist = Math.abs(other.x - c.x);
                                    let weightedDist = (oInfo.role === 'samica') ? dist : dist * 1.35;
                                    if (weightedDist < minMomDist) {
                                        minMomDist = weightedDist;
                                        nearestMom = other;
                                    }
                                }
                            }
                            if (nearestMom && minMomDist > 38 && minMomDist < 340) {
                                c.direction = (nearestMom.x >= c.x) ? 1 : -1;
                            }
                        }
                        c.stateTimer = 105 + Math.floor(Math.random() * 150);
                    }
                }
            }
        }

        if (c.state === 'walk') {
            c.vx = c.direction * c.baseSpeed;
            c.walkFrame += 0.095;
            c.grazeProgress = Math.max(0, (c.grazeProgress || 0) - 0.09);

            if (!c.turnCooldown || c.turnCooldown <= 0) {
                let aheadTx = Math.floor((c.x + (c.direction === 1 ? c.width + 6 : -6)) / TILE_SIZE);
                let aheadFootTile = getTile(aheadTx, footTy);
                let aheadBodyTile = getTile(aheadTx, footTy - 1);
                let deepDrop = (getTile(aheadTx, footTy + 1) === BLOCKS.AIR &&
                                getTile(aheadTx, footTy + 2) === BLOCKS.AIR &&
                                getTile(aheadTx, footTy + 3) === BLOCKS.AIR &&
                                getTile(aheadTx, footTy + 4) === BLOCKS.AIR);
                // Wielbłądy zawracają przed wodą lub głębokim urwiskiem
                if (aheadFootTile === BLOCKS.WATER || aheadBodyTile === BLOCKS.WATER || deepDrop) {
                    c.direction *= -1;
                    c.vx = c.direction * c.baseSpeed;
                    c.turnCooldown = 30;
                }
            }
        } else if (c.state === 'graze') {
            c.vx = 0;
            c.walkFrame = 0;
            c.grazeProgress = Math.min(1, (c.grazeProgress || 0) + 0.08);
            if (!player.inStomach && Math.random() < 0.14) {
                let muzzleX = c.direction === 1 ? (c.x + c.width + 4) : (c.x - 4);
                let isEatingCactus = (cactusTx !== -1);
                splashParticles.push({
                    x: muzzleX + (Math.random() - 0.5) * 4,
                    y: c.y + c.height - (isEatingCactus ? 8 : 2),
                    vx: (Math.random() - 0.5) * 0.7,
                    vy: -0.5 - Math.random() * 0.6,
                    size: 2,
                    color: isEatingCactus ? '#f43f5e' : (Math.random() > 0.4 ? '#DEB887' : '#84cc16'),
                    life: 16
                });
            }
        } else {
            c.vx = 0;
            c.walkFrame = 0;
            c.grazeProgress = Math.max(0, (c.grazeProgress || 0) - 0.09);
        }

        c.vy += GRAVITY;
        if (c.vy > MAX_FALL_SPEED) c.vy = MAX_FALL_SPEED;

        let prevX = c.x;
        if (c.vx !== 0) {
            if (!checkCamelCollision(c.x + c.vx, c.y, c.width, c.height)) {
                c.x += c.vx;
                c.stuckTimer = 0;
            } else if (!checkCamelCollision(c.x + c.vx, c.y - TILE_SIZE, c.width, c.height)) {
                // Płynne wchodzenie na 1-blokowe wydmy i stopnie (natychmiastowe uniesienie o 1 blok zapobiega klinowaniu się!)
                c.y -= TILE_SIZE;
                c.x += c.vx;
                if (c.vy > 0) c.vy = 0;
                c.stuckTimer = 0;
            } else if (c.grounded && (!c.jumpCooldown || c.jumpCooldown <= 0) &&
                       !checkCamelCollision(c.x + c.vx, c.y - TILE_SIZE * 2, c.width, c.height)) {
                // Skok na 2-blokowy uskok wydmy
                c.y -= TILE_SIZE;
                c.vy = -3.8;
                c.grounded = false;
                c.jumpCooldown = 28;
                c.stuckTimer = 0;
            } else if (c.vy < -0.2) {
                // Gdy wielbłąd wznosi się podczas skoku, nie zawracamy go w powietrzu
            } else {
                c.direction *= -1;
                c.vx = 0;
                c.turnCooldown = 25;
            }
        }

        c.grounded = false;
        if (!checkCamelCollision(c.x, c.y + c.vy, c.width, c.height)) {
            c.y += c.vy;
        } else {
            if (c.vy > 0) c.grounded = true;
            c.vy = 0;
            c.y = Math.round(c.y);
        }

        // Detektor utknięcia w dołkach między wydmami
        if (c.state === 'walk') {
            if (Math.abs(c.x - prevX) < 0.05) {
                c.stuckTimer = (c.stuckTimer || 0) + 1;
                if (c.stuckTimer === 18) {
                    if (!checkCamelCollision(c.x, c.y - TILE_SIZE, c.width, c.height)) {
                        c.y -= TILE_SIZE;
                        c.vy = -3.2;
                    } else {
                        c.direction *= -1;
                    }
                } else if (c.stuckTimer > 40) {
                    let surfY = (surfaceHeights[centerTx] || SEA_LEVEL - 4) * TILE_SIZE - c.height - 2;
                    if (!checkCamelCollision(c.x, surfY, c.width, c.height)) {
                        c.y = surfY;
                        c.vy = 0;
                    }
                    c.direction *= -1;
                    c.stuckTimer = 0;
                }
            } else {
                c.stuckTimer = 0;
            }
        }

        if (c.x < TILE_SIZE * 2) { c.x = TILE_SIZE * 2; c.direction = 1; }
        if (c.x > (MAP_WIDTH - 3) * TILE_SIZE - c.width) { c.x = (MAP_WIDTH - 3) * TILE_SIZE - c.width; c.direction = -1; }

        if (isCamelAuthority) {
            let minDistToAnyPlayer = Math.abs(c.x - player.x);
            for (let id in remotePlayers) {
                if (remotePlayers[id]) {
                    let distP = Math.abs(c.x - remotePlayers[id].x);
                    if (distP < minDistToAnyPlayer) minDistToAnyPlayer = distP;
                }
            }
            if (!c.isTamed && minDistToAnyPlayer > 110 * TILE_SIZE) {
                camels.splice(i, 1);
            }
        }
    }

    // ==========================================
    // RYBY W WODZIE I OCEANACH (BŁAZENKI, ZŁOTE RYBKI SKACZĄCE, ROZDYMKI KOLCZASTE I RYBY GŁĘBINOWE)
    // ==========================================
    let isFishAuthority = (!roomCode || isRoomHost);

    if (isFishAuthority && fishes.length === 0 && globalTick === 5) {
        spawnInitialOceanFishes();
    }

    // Okresowy resp ryb w wodzie/oceanach co jakiś czas (do 20 ryb na mapie)
    if (isFishAuthority && fishes.length < 20 && globalTick % 150 === 0 && Math.random() < 0.75 && !player.dead && !player.inStomach) {
        let pTx = Math.floor(player.x / TILE_SIZE);
        for (let attempt = 0; attempt < 5; attempt++) {
            let side = Math.random() > 0.5 ? 1 : -1;
            let candTx = pTx + side * (12 + Math.floor(Math.random() * 34));
            if (candTx > 10 && candTx < MAP_WIDTH - 10 && surfaceHeights[candTx] > SEA_LEVEL + 4) {
                if (spawnFishSchoolAtTile(candTx) > 0) break;
            }
        }
    }

    for (let i = fishes.length - 1; i >= 0; i--) {
        let f = fishes[i];
        if (!f.id) f.id = generateFishId();
        let dims = getFishDimensions(f.variant);
        f.width = dims.width;
        f.height = dims.height;
        f.baseSpeed = dims.speed;
        if (f.fedCooldown > 0) f.fedCooldown--;

        let fcx = f.x + f.width / 2;
        let fcy = f.y + f.height / 2;
        let fTx = Math.floor(fcx / TILE_SIZE);
        let fTy = Math.floor(fcy / TILE_SIZE);
        let tileAtFish = getTile(fTx, fTy);
        let inWaterNow = (tileAtFish === BLOCKS.WATER || (tileAtFish === BLOCKS.KELP && isSubmergedTile(fTx, fTy)));

        // Mechanika 1: Rozdymka Kolczasta ('rozdymka') nadyma się w wielką kolczastą kulę, gdy gracz podpłynie blisko!
        if (f.variant === 'rozdymka') {
            let distToPlayer = Math.hypot((player.x + player.width / 2) - fcx, (player.y + player.height / 2) - fcy);
            let nearAnyPlayer = (!player.dead && !player.inStomach && distToPlayer < 62);
            if (!nearAnyPlayer) {
                for (let pid in remotePlayers) {
                    let rp = remotePlayers[pid];
                    if (rp && !rp.dead && !rp.inStomach && Math.hypot((rp.x + 8) - fcx, (rp.y + 12) - fcy) < 62) {
                        nearAnyPlayer = true;
                        break;
                    }
                }
            }
            if (nearAnyPlayer) {
                if (!f.isPuffed && inWaterNow) {
                    f.isPuffed = true;
                    f.puffTimer = 110;
                    // Bąbelki przy gwałtownym nadęciu się Rozdymki
                    for (let b = 0; b < 5; b++) {
                        waterBubbles.push({
                            x: fcx + (Math.random() - 0.5) * 12,
                            y: fcy + (Math.random() - 0.5) * 12,
                            vy: -0.6 - Math.random() * 0.4,
                            r: 1.8
                        });
                    }
                } else {
                    f.puffTimer = Math.max(f.puffTimer, 60);
                }
            } else if (f.puffTimer > 0) {
                f.puffTimer--;
                if (f.puffTimer <= 0) f.isPuffed = false;
            }
            let targetScale = f.isPuffed ? 2.15 : 1.0;
            f.puffScale = (f.puffScale || 1.0) + (targetScale - (f.puffScale || 1.0)) * 0.18;

            // Jeśli gracz dotknie nadętej Rozdymki (w trybie Survival), kolce lekko go odrzucają i kłują!
            if (f.isPuffed && !player.dead && player.gameMode !== 1 && player.invulTimer <= 0 && distToPlayer < 22) {
                let pushDir = (player.x + player.width / 2 >= fcx) ? 1 : -1;
                player.vx = pushDir * 2.8;
                player.vy = -2.4;
                damagePlayer(1);
            }
        } else {
            f.isPuffed = false;
            f.puffScale = 1.0;
        }

        if (inWaterNow) {
            // Ryba jest w wodzie!
            if (f.state === 'leap' || f.state === 'flop') {
                if (f.vy > 1.2) {
                    createWaterSplash(fcx, f.y, 8);
                }
                f.state = 'swim';
                f.vy *= 0.3;
            }

            f.swimPhase += (f.state === 'dart' ? 0.34 : 0.18);
            f.stateTimer--;

            // Płoszenie ryb, gdy gracz szybko płynie tuż obok (z wyjątkiem nadętej Rozdymki lub gdy gracz trzyma Wodorosty!)
            let currentHeld = hotbar[selectedSlotIndex];
            let holdingKelp = Boolean(currentHeld && currentHeld.type === BLOCKS.KELP && currentHeld.count > 0);
            let pDist = Math.hypot((player.x + player.width / 2) - fcx, (player.y + player.height / 2) - fcy);

            if (holdingKelp && f.variant === 'blazenek' && pDist < 95 && pDist > 20) {
                // Błazenki podpływają ciekawie do gracza trzymającego Wodorosty!
                f.direction = (player.x + player.width / 2 >= fcx) ? 1 : -1;
                f.vx = f.direction * f.baseSpeed * 1.15;
                f.vy = ((player.y + player.height / 2) - fcy) * 0.03;
            } else if (!holdingKelp && f.variant !== 'rozdymka' && player.inWater && pDist < 46 && Math.hypot(player.vx, player.vy) > 0.9) {
                f.state = 'dart';
                f.direction = (fcx >= player.x + player.width / 2) ? 1 : -1;
                f.stateTimer = 35;
                if (Math.random() < 0.25) {
                    waterBubbles.push({ x: fcx, y: fcy, vy: -0.6, r: 1.5 });
                }
            }

            if (f.stateTimer <= 0) {
                // Złota Rybka blisko powierzchni wody ma szansę wyskoczyć łukiem ponad taflę wody!
                if (f.variant === 'zlota' && fTy <= SEA_LEVEL + 3 && getTile(fTx, SEA_LEVEL - 1) === BLOCKS.AIR && Math.random() < 0.32) {
                    f.state = 'leap';
                    f.vy = -4.2 - Math.random() * 0.8;
                    f.vx = f.direction * (f.baseSpeed * 1.85);
                    f.stateTimer = 55;
                    createWaterSplash(fcx, SEA_LEVEL * TILE_SIZE, 10);
                } else {
                    f.state = 'swim';
                    if (Math.random() < 0.45) f.direction *= -1;
                    f.vy = (Math.random() - 0.5) * 0.45;
                    f.stateTimer = 80 + Math.floor(Math.random() * 130);
                }
            }

            let spdMult = f.isPuffed ? 0.35 : (f.state === 'dart' ? 2.1 : 1.0);
            f.vx = f.direction * f.baseSpeed * spdMult;

            // Utrzymuj Świecącą Rybę Głębinową głębiej pod wodą, a Złotą Rybkę bliżej powierzchni
            if (f.variant === 'glebinowa' && fTy < SEA_LEVEL + 6) {
                f.vy = Math.max(f.vy, 0.28);
            } else if (f.variant === 'zlota' && fTy > SEA_LEVEL + 7) {
                f.vy = Math.min(f.vy, -0.25);
            } else if (fTy <= SEA_LEVEL && f.state !== 'leap') {
                f.vy = Math.max(0.25, f.vy);
            }

            // Sprawdź czy przed rybą jest woda; jeśli ściana lądu — zawróć płynnie
            let nextX = f.x + f.vx;
            let aheadTx = Math.floor((nextX + (f.direction === 1 ? f.width + 2 : -2)) / TILE_SIZE);
            let aheadTile = getTile(aheadTx, fTy);
            if (aheadTile === BLOCKS.WATER || (aheadTile === BLOCKS.KELP && isSubmergedTile(aheadTx, fTy))) {
                f.x = nextX;
            } else {
                f.direction *= -1;
                f.vx = f.direction * f.baseSpeed;
            }

            let nextY = f.y + f.vy + Math.sin(f.swimPhase * 0.5) * 0.12;
            let nextTy = Math.floor((nextY + (f.vy >= 0 ? f.height : 0)) / TILE_SIZE);
            let vertTile = getTile(fTx, nextTy);
            if (f.state === 'leap' || vertTile === BLOCKS.WATER || (vertTile === BLOCKS.KELP && isSubmergedTile(fTx, nextTy))) {
                f.y = nextY;
            } else {
                f.vy *= -0.7;
            }

            // Losowe drobne bąbelki powietrza od ryb
            if (Math.random() < 0.008) {
                waterBubbles.push({
                    x: fcx + f.direction * 5,
                    y: fcy - 2,
                    vy: -0.45 - Math.random() * 0.3,
                    r: 1.3 + Math.random() * 1.0
                });
            }
        } else {
            // Ryba znalazła się nad wodą (w trakcie skoku 'leap' albo trzepocze na lądzie 'flop'!)
            f.vy += GRAVITY * 0.85;
            if (f.vy > MAX_FALL_SPEED) f.vy = MAX_FALL_SPEED;
            f.swimPhase += 0.45;

            if (!checkCollision(f.x + f.vx, f.y, f.width, f.height)) {
                f.x += f.vx;
            } else {
                f.direction *= -1;
                f.vx = f.direction * 0.8;
            }

            if (!checkCollision(f.x, f.y + f.vy, f.width, f.height)) {
                f.y += f.vy;
            } else {
                // Trzepotanie i podskakiwanie ryby na lądzie w stronę wody!
                f.state = 'flop';
                f.vy = -2.4 - Math.random() * 1.2;
                if (Math.random() < 0.4) f.direction *= -1;
                f.vx = f.direction * (0.9 + Math.random() * 0.8);
            }
        }

        if (f.x < TILE_SIZE * 2) { f.x = TILE_SIZE * 2; f.direction = 1; }
        if (f.x > (MAP_WIDTH - 3) * TILE_SIZE - f.width) { f.x = (MAP_WIDTH - 3) * TILE_SIZE - f.width; f.direction = -1; }

        if (isFishAuthority) {
            let minDistToAnyPlayer = Math.abs(f.x - player.x);
            for (let id in remotePlayers) {
                if (remotePlayers[id]) {
                    let distP = Math.abs(f.x - remotePlayers[id].x);
                    if (distP < minDistToAnyPlayer) minDistToAnyPlayer = distP;
                }
            }
            if (minDistToAnyPlayer > 110 * TILE_SIZE) {
                fishes.splice(i, 1);
            }
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
        let interactedWithCamel = false;
        if (clickMining || clickPlacing) {
            interactedWithCamel = tryInteractWithCamel(worldMouseX, worldMouseY, clickPlacing) ||
                                  tryInteractWithFish(worldMouseX, worldMouseY, clickPlacing);
        }
        if (clickMining && !interactedWithCamel) {
            hitOtherPlayer = tryPvpMeleeAttack(worldMouseX, worldMouseY);
        }

        if (!interactedWithCamel && !hitOtherPlayer && distToPlayer < maxDist) {
            let targetBlock = getTile(tileX, tileY);
            let currentItem = hotbar[selectedSlotIndex];
            let isTargetMinable = (!isSpawnTotemBaseTile(tileX, tileY) && targetBlock !== BLOCKS.AIR && targetBlock !== BLOCKS.WATER && targetBlock !== BLOCKS.ACID && (targetBlock !== BLOCKS.STOMACH_WALL || (!player.inStomach && player.gameMode === 1)));
            let isTargetReplaceable = (targetBlock === BLOCKS.AIR || (targetBlock === BLOCKS.ACID && (!currentItem || currentItem.type !== BLOCKS.ACID)) || (targetBlock === BLOCKS.WATER && (!currentItem || currentItem.type !== BLOCKS.WATER)));
            let canSeeTarget = isBlockVisibleToPlayer(tileX, tileY);
            
            if (clickMining && canSeeTarget) {
                if (isTargetMinable) {
                    // Jeśli kopiemy kaktusa, na którym rośnie mały owoc opuncji — najpierw szybko wydobywamy sam owoc opuncji!
                    let targetHasOpuntia = (targetBlock === BLOCKS.CACTUS && hasOpuntiaFruit(tileX, tileY));
                    let requiredHardness = targetHasOpuntia ? BLOCK_HARDNESS[BLOCKS.OPUNTIA] : BLOCK_HARDNESS[targetBlock];

                    if (miningX === tileX && miningY === tileY) {
                        miningProgress += (player.gameMode === 1 ? Math.max(35, Math.ceil((requiredHardness || 35) / 2)) : 1);
                        pickaxeSwing += 0.18; 
                        
                        if (miningProgress >= requiredHardness) {
                            if (targetHasOpuntia) {
                                // Wydobycie samego owocu opuncji z kaktusa (owoc znika z kaktusa i trafia do ręki/ekwipunku!)
                                setOpuntiaFruit(tileX, tileY, false, true);
                                if (player.gameMode !== 1) {
                                    addToInventory(BLOCKS.OPUNTIA, 1);
                                }
                                for (let p = 0; p < 7; p++) {
                                    splashParticles.push({
                                        x: tileX * TILE_SIZE + 10 + (Math.random() - 0.5) * 10,
                                        y: tileY * TILE_SIZE + 6,
                                        vx: (Math.random() - 0.5) * 1.4,
                                        vy: -0.7 - Math.random() * 1.0,
                                        size: 2.3,
                                        color: (p % 2 === 0) ? '#f43f5e' : '#fb7185',
                                        life: 20
                                    });
                                }
                            } else {
                                let waterAdjacent = isWaterLike(getTile(tileX, tileY - 1)) ||
                                                    isWaterLike(getTile(tileX - 1, tileY)) ||
                                                    isWaterLike(getTile(tileX + 1, tileY));
                                setTile(tileX, tileY, waterAdjacent ? BLOCKS.WATER : BLOCKS.AIR);
                                if (player.gameMode !== 1) {
                                    addToInventory(targetBlock, 1);
                                }
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
            
            if (clickPlacing && buildTimer === 0 && currentItem && canSeeTarget) {
                // Jeśli gracz trzyma Owoc Opuncji i kliknie PPM na kaktusa bez owocu -> może z powrotem osadzić owoc na kaktusie!
                if (currentItem.type === BLOCKS.OPUNTIA && targetBlock === BLOCKS.CACTUS && !hasOpuntiaFruit(tileX, tileY)) {
                    setOpuntiaFruit(tileX, tileY, true, true);
                    removeSelectedItem();
                    buildTimer = 7;
                } else if (currentItem.type !== BLOCKS.OPUNTIA && isTargetReplaceable && hasNeighborBlock(tileX, tileY)) {
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

    if (roomCode) {
        sendPlayerState();
    }
}
