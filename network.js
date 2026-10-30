// ==========================================
// SYSTEM MULTIPLAYER HYBRYDOWY (Synchronizacja Świń, Plusku Wody, Czerwia, Czatu, Szeptów /msg i /unpig - v1.5)
// ==========================================
let myPlayerId = "p_" + Math.random().toString(36).substring(2, 9);
let roomCode = null;
let isRoomHost = false;
let peerInstance = null;
let peerConnections = [];
let localChannel = null;
let mqttClients = [];
let mqttTopic = null;

let remotePlayers = {}; // { id: { nick, x, y, direction, walkFrame, skinIndex, dead, hp, maxHp, damageEffect, isSwimming, isRiding, pigWingFlap, pickaxeAnim, grounded, inGame, isHost, lastSeen } }
let hasReceivedWorldSync = false;
let packetCounter = 0;
let seenPacketIds = new Set();

let lastPeerReconnectTime = 0;
let lastHostPeerRecreateTime = 0;
let joinQueryInterval = null;

const PEER_ICE_CONFIG = {
    debug: 0,
    pingInterval: 5000,
    config: {
        iceTransportPolicy: 'all',
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            {
                urls: [
                    'turn:openrelay.metered.ca:80',
                    'turn:openrelay.metered.ca:443',
                    'turn:openrelay.metered.ca:443?transport=tcp',
                    'turns:openrelay.metered.ca:443?transport=tcp'
                ],
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    }
};

const WSS_RELAYS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
];

function nextPacketId() {
    packetCounter++;
    return myPlayerId + "_" + packetCounter + "_" + Date.now().toString(36);
}

function getTakenNicksInSession() {
    let list = [];
    for (let id in remotePlayers) {
        if (id === myPlayerId) continue;
        let rp = remotePlayers[id];
        if (rp && rp.nick && rp.inGame !== false) {
            let lower = rp.nick.toLowerCase();
            if (!list.includes(lower)) list.push(lower);
        }
    }
    return list;
}

function getTakenSkinsInSession() {
    let list = [];
    for (let id in remotePlayers) {
        if (id === myPlayerId) continue;
        let rp = remotePlayers[id];
        if (rp && typeof rp.skinIndex === 'number' && rp.inGame !== false) {
            if (!list.includes(rp.skinIndex)) list.push(rp.skinIndex);
        }
    }
    return list;
}

// Zwraca tablicę wszystkich graczy w sesji (do podpowiadania nicków w /msg [nick] oraz /unpig [nick])
function getAllSessionPlayersList() {
    let list = [];
    if (playerNick) {
        list.push({
            id: myPlayerId,
            nick: playerNick,
            isRiding: Boolean(player && player.ridingPig),
            isMe: true
        });
    }
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (rp && rp.nick && rp.inGame !== false) {
            list.push({
                id: id,
                nick: rp.nick,
                isRiding: Boolean(rp.isRiding),
                isMe: false
            });
        }
    }
    return list;
}

function isNickTakenInSession(nickToCheck) {
    if (!isMultiplayerMode || !roomCode) return false;
    let lower = nickToCheck.trim().toLowerCase();
    return getTakenNicksInSession().includes(lower);
}

function removeRemotePlayer(playerId) {
    if (remotePlayers[playerId]) {
        let leavingNick = remotePlayers[playerId].nick;
        let wasHost = remotePlayers[playerId].isHost;
        delete remotePlayers[playerId];
        if (leavingNick && isPlaying && typeof addChatMessage === 'function') {
            addChatMessage(null, `➖ Gracz ${leavingNick} opuścił grę.`, 'system');
        }
        if (typeof updateSkinAvailabilityUI === 'function') {
            updateSkinAvailabilityUI();
        }
        if (wasHost && !isRoomHost && isPlaying && roomCode) {
            promoteSelfToHost();
        }
    }
}

function setupLocalChannel(code) {
    if (localChannel) {
        try { localChannel.close(); } catch (e) {}
    }
    if (typeof BroadcastChannel !== 'undefined') {
        localChannel = new BroadcastChannel('bnw_room_' + code);
        localChannel.onmessage = (ev) => {
            handleNetworkPacket(ev.data, null);
        };
    }
}

function setupWebSocketRelay(code, onAnyRelayConnected) {
    for (let c of mqttClients) {
        try { c.end(true); } catch (e) {}
    }
    mqttClients = [];
    mqttTopic = 'bnw_v15_room_' + code;

    if (typeof mqtt === 'undefined') return;

    let callbackFired = false;
    WSS_RELAYS.forEach((brokerUrl, idx) => {
        try {
            const client = mqtt.connect(brokerUrl, {
                clientId: 'bnw_' + myPlayerId + '_' + idx + '_' + Math.random().toString(16).substring(2, 6),
                clean: true,
                connectTimeout: 5000,
                reconnectPeriod: 2000
            });

            client.isRelayOpen = false;
            mqttClients.push(client);

            client.on('connect', () => {
                if (roomCode !== code) {
                    try { client.end(true); } catch (e) {}
                    return;
                }
                client.isRelayOpen = true;
                client.subscribe(mqttTopic, { qos: 0 }, () => {
                    if (!callbackFired && onAnyRelayConnected) {
                        callbackFired = true;
                        onAnyRelayConnected();
                    }
                    if (!isRoomHost && !hasReceivedWorldSync) {
                        let qPkt = { type: 'hello_query', pktId: nextPacketId(), senderId: myPlayerId };
                        seenPacketIds.add(qPkt.pktId);
                        try { client.publish(mqttTopic, JSON.stringify(qPkt), { qos: 0 }); } catch (e) {}
                    }
                });
            });

            client.on('message', (topic, message) => {
                if (topic !== mqttTopic) return;
                try {
                    const data = JSON.parse(message.toString());
                    handleNetworkPacket(data, null);
                } catch (e) {}
            });

            client.on('close', () => { client.isRelayOpen = false; });
            client.on('offline', () => { client.isRelayOpen = false; });
            client.on('error', () => {});
        } catch (err) {}
    });
}

function broadcastPacket(packet) {
    if (!packet.pktId && packet.type !== 'player_state' && packet.type !== 'roster_sync' && packet.type !== 'sandworm_sync') {
        packet.pktId = nextPacketId();
        seenPacketIds.add(packet.pktId);
    }

    for (let i = peerConnections.length - 1; i >= 0; i--) {
        let conn = peerConnections[i];
        if (conn && conn.open) {
            try { conn.send(packet); } catch (e) {}
        }
    }

    if (mqttTopic && mqttClients.length > 0) {
        let serialized = null;
        for (let i = 0; i < mqttClients.length; i++) {
            let mc = mqttClients[i];
            if (mc && mc.isRelayOpen) {
                if (!serialized) serialized = JSON.stringify(packet);
                try { mc.publish(mqttTopic, serialized, { qos: 0 }); } catch (e) {}
            }
        }
    }

    if (localChannel) {
        try { localChannel.postMessage(packet); } catch (e) {}
    }
}

function relayFromHost(packet, sourceConn) {
    if (!isRoomHost) return;
    for (let i = 0; i < peerConnections.length; i++) {
        let conn = peerConnections[i];
        if (conn && conn !== sourceConn && conn.open) {
            try { conn.send(packet); } catch (e) {}
        }
    }
}

function getActivePlayersSnapshot(excludeId = null) {
    let snapshot = {};
    let now = performance.now();
    if (isPlaying && playerNick && myPlayerId !== excludeId) {
        let curPickaxeAnim = (isClicking && (miningX !== -1 || pvpHitCooldown > 15) && !showInventory && !isCommandOpen) ? Number(pickaxeSwing.toFixed(2)) : null;
        snapshot[myPlayerId] = {
            nick: playerNick,
            x: Number(player.x.toFixed(2)),
            y: Number(player.y.toFixed(2)),
            vx: Number((player.ridingPig ? player.ridingPig.vx : (player.ridingCamel ? player.ridingCamel.vx : player.vx) || 0).toFixed(2)),
            vy: Number((player.ridingPig ? player.ridingPig.vy : (player.ridingCamel ? player.ridingCamel.vy : player.vy) || 0).toFixed(2)),
            direction: player.direction,
            walkFrame: Number((player.walkFrame || 0).toFixed(2)),
            skinIndex: selectedSkinIndex,
            dead: player.dead,
            hp: player.hp,
            maxHp: player.maxHp,
            isSwimming: player.isSwimming,
            isRiding: player.ridingPig !== null,
            pigWingFlap: player.ridingPig ? Number((player.ridingPig.wingFlap || 0).toFixed(2)) : 0,
            isRidingCamel: player.ridingCamel !== null,
            camelVariant: player.ridingCamel ? player.ridingCamel.variant : null,
            camelWalkFrame: player.ridingCamel ? Number((player.ridingCamel.walkFrame || 0).toFixed(2)) : 0,
            passengerOnPlayerId: player.passengerOnPlayerId || null,
            pickaxeAnim: curPickaxeAnim,
            miningX: miningX,
            miningY: miningY,
            miningProgress: Number((miningProgress || 0).toFixed(1)),
            grounded: player.grounded,
            gameMode: player.gameMode || 0,
            isAdmin: Boolean(player.isAdmin),
            isSandworm: Boolean(player.isSandworm),
            inStomach: Boolean(player.inStomach),
            isPoisoned: Boolean(player.inAcid || player.acidPoisonTimer > 0),
            poisonDamageEffect: player.poisonDamageEffect || 0,
            wormSegments: (player.isSandworm && Array.isArray(player.wormSegments)) ? player.wormSegments.map(s => ({ x: Math.round(s.x), y: Math.round(s.y) })) : null,
            isHost: isRoomHost,
            inGame: true
        };
    }
    for (let id in remotePlayers) {
        if (id === excludeId) continue;
        let rp = remotePlayers[id];
        if (rp && now - rp.lastSeen <= 3800) {
            snapshot[id] = {
                nick: rp.nick,
                x: typeof rp.targetX === 'number' ? rp.targetX : rp.x,
                y: typeof rp.targetY === 'number' ? rp.targetY : rp.y,
                vx: rp.vx || 0,
                vy: rp.vy || 0,
                direction: rp.direction,
                walkFrame: rp.walkFrame,
                skinIndex: rp.skinIndex,
                dead: rp.dead,
                hp: rp.hp,
                maxHp: rp.maxHp,
                isSwimming: rp.isSwimming,
                isRiding: Boolean(rp.isRiding),
                pigWingFlap: rp.pigWingFlap || 0,
                isRidingCamel: Boolean(rp.isRidingCamel),
                camelVariant: rp.camelVariant || null,
                camelWalkFrame: rp.camelWalkFrame || 0,
                passengerOnPlayerId: rp.passengerOnPlayerId || null,
                pickaxeAnim: rp.pickaxeAnim,
                miningX: typeof rp.miningX === 'number' ? rp.miningX : -1,
                miningY: typeof rp.miningY === 'number' ? rp.miningY : -1,
                miningProgress: rp.miningProgress || 0,
                grounded: rp.grounded,
                gameMode: rp.gameMode || 0,
                isAdmin: Boolean(rp.isAdmin),
                isSandworm: Boolean(rp.isSandworm),
                inStomach: Boolean(rp.inStomach),
                isPoisoned: Boolean(rp.isPoisoned),
                poisonDamageEffect: rp.poisonDamageEffect || 0,
                wormSegments: rp.wormSegments || null,
                isHost: Boolean(rp.isHost),
                inGame: rp.inGame !== false
            };
        }
    }
    return snapshot;
}

function getFishesSnapshot() {
    if (typeof fishes === 'undefined') return [];
    return fishes.map(f => ({
        id: f.id,
        variant: f.variant || 'blazenek',
        x: Math.round(f.x),
        y: Math.round(f.y),
        vx: Number((f.vx || 0).toFixed(2)),
        vy: Number((f.vy || 0).toFixed(2)),
        direction: f.direction || 1,
        swimPhase: Number((f.swimPhase || 0).toFixed(2)),
        state: f.state || 'swim',
        isPuffed: Boolean(f.isPuffed),
        puffScale: Number((f.puffScale || 1.0).toFixed(2))
    }));
}

function applyFishesSnapshot(fishList) {
    if (!Array.isArray(fishList) || typeof fishes === 'undefined') return;
    let newFishes = [];
    for (let wf of fishList) {
        let existing = fishes.find(f => f.id && f.id === wf.id);
        let dims = (typeof getFishDimensions === 'function') ? getFishDimensions(wf.variant) : { width: 13, height: 9, speed: 0.72 };
        if (existing) {
            if (Math.hypot(existing.x - wf.x, existing.y - wf.y) > 80) {
                existing.x = wf.x;
                existing.y = wf.y;
            } else {
                existing.x += (wf.x - existing.x) * 0.35;
                existing.y += (wf.y - existing.y) * 0.35;
            }
            existing.variant = wf.variant || existing.variant;
            existing.vx = wf.vx;
            existing.vy = wf.vy;
            existing.direction = wf.direction || 1;
            existing.state = wf.state || 'swim';
            existing.isPuffed = Boolean(wf.isPuffed);
            existing.puffScale = wf.puffScale || (existing.isPuffed ? 2.15 : 1.0);
            newFishes.push(existing);
        } else {
            newFishes.push({
                id: wf.id || ("fish_" + Math.random().toString(36).substring(2, 8)),
                variant: wf.variant || 'blazenek',
                x: wf.x,
                y: wf.y,
                vx: wf.vx || 0,
                vy: wf.vy || 0,
                width: dims.width,
                height: dims.height,
                baseSpeed: dims.speed,
                direction: wf.direction || 1,
                swimPhase: wf.swimPhase || 0,
                state: wf.state || 'swim',
                stateTimer: 90,
                isPuffed: Boolean(wf.isPuffed),
                puffTimer: wf.isPuffed ? 80 : 0,
                puffScale: wf.puffScale || (wf.isPuffed ? 2.15 : 1.0),
                fedCooldown: 0
            });
        }
    }
    fishes = newFishes;
}

function getCamelsSnapshot() {
    if (typeof camels === 'undefined') return [];
    let list = [];
    for (let c of camels) {
        if (player && player.ridingCamel === c) continue;
        list.push({
            id: c.id,
            variant: c.variant || 'dromader_samica',
            x: Math.round(c.x),
            y: Math.round(c.y),
            vx: Number((c.vx || 0).toFixed(2)),
            vy: Number((c.vy || 0).toFixed(2)),
            direction: c.direction || 1,
            walkFrame: Number((c.walkFrame || 0).toFixed(2)),
            state: c.state || 'walk',
            grazeProgress: Number((c.grazeProgress || 0).toFixed(2)),
            isTamed: Boolean(c.isTamed)
        });
    }
    return list;
}

function applyCamelsSnapshot(camelList) {
    if (!Array.isArray(camelList) || typeof camels === 'undefined') return;
    let newCamels = [];
    let addedIds = new Set();
    if (player && player.ridingCamel) {
        newCamels.push(player.ridingCamel);
        if (player.ridingCamel.id) addedIds.add(player.ridingCamel.id);
    }
    for (let wc of camelList) {
        if (wc.id && addedIds.has(wc.id)) continue;
        let existing = camels.find(c => c.id && c.id === wc.id && c !== (player && player.ridingCamel));
        let dims = (typeof getCamelDimensions === 'function') ? getCamelDimensions(wc.variant) : { width: 30, height: 25, speed: 0.62 };
        if (existing) {
            if (Math.hypot(existing.x - wc.x, existing.y - wc.y) > 80) {
                existing.x = wc.x;
                existing.y = wc.y;
            } else {
                existing.x += (wc.x - existing.x) * 0.35;
                existing.y += (wc.y - existing.y) * 0.35;
            }
            existing.variant = wc.variant || existing.variant;
            existing.vx = wc.vx;
            existing.vy = wc.vy;
            existing.direction = wc.direction || 1;
            existing.state = wc.state || 'walk';
            existing.grazeProgress = wc.grazeProgress || 0;
            existing.isTamed = Boolean(existing.isTamed || wc.isTamed);
            newCamels.push(existing);
            if (existing.id) addedIds.add(existing.id);
        } else {
            let created = {
                id: wc.id || ("camel_" + Math.random().toString(36).substring(2, 8)),
                variant: wc.variant || 'dromader_samica',
                x: wc.x,
                y: wc.y,
                vx: wc.vx || 0,
                vy: wc.vy || 0,
                width: dims.width,
                height: dims.height,
                baseSpeed: dims.speed,
                direction: wc.direction || 1,
                walkFrame: wc.walkFrame || 0,
                grounded: true,
                state: wc.state || 'walk',
                stateTimer: 100,
                grazeProgress: wc.grazeProgress || 0,
                isTamed: Boolean(wc.isTamed)
            };
            newCamels.push(created);
            if (created.id) addedIds.add(created.id);
        }
    }
    camels = newCamels;
}

function getDeersSnapshot() {
    if (typeof deers === 'undefined') return [];
    return deers.map(d => ({
        id: d.id,
        variant: d.variant || 'lania',
        x: Math.round(d.x),
        y: Math.round(d.y),
        vx: Number((d.vx || 0).toFixed(2)),
        vy: Number((d.vy || 0).toFixed(2)),
        direction: d.direction || 1,
        walkFrame: Number((d.walkFrame || 0).toFixed(2)),
        state: d.state || 'walk',
        grazeProgress: Number((d.grazeProgress || 0).toFixed(2))
    }));
}

function applyDeersSnapshot(deerList) {
    if (!Array.isArray(deerList) || typeof deers === 'undefined') return;
    let newDeers = [];
    for (let wd of deerList) {
        let existing = deers.find(d => d.id && d.id === wd.id);
        let dims = (typeof getDeerDimensions === 'function') ? getDeerDimensions(wd.variant) : { width: 24, height: 20, speed: 0.84 };
        if (existing) {
            if (Math.hypot(existing.x - wd.x, existing.y - wd.y) > 80) {
                existing.x = wd.x;
                existing.y = wd.y;
            } else {
                existing.x += (wd.x - existing.x) * 0.35;
                existing.y += (wd.y - existing.y) * 0.35;
            }
            existing.variant = wd.variant || existing.variant;
            existing.vx = wd.vx;
            existing.vy = wd.vy;
            existing.direction = wd.direction || 1;
            existing.state = wd.state || 'walk';
            existing.grazeProgress = wd.grazeProgress || 0;
            newDeers.push(existing);
        } else {
            newDeers.push({
                id: wd.id || ("deer_" + Math.random().toString(36).substring(2, 8)),
                variant: wd.variant || 'lania',
                x: wd.x,
                y: wd.y,
                vx: wd.vx || 0,
                vy: wd.vy || 0,
                width: dims.width,
                height: dims.height,
                baseSpeed: dims.speed,
                direction: wd.direction || 1,
                walkFrame: wd.walkFrame || 0,
                grounded: true,
                state: wd.state || 'walk',
                stateTimer: 90,
                grazeProgress: wd.grazeProgress || 0
            });
        }
    }
    deers = newDeers;
}

function getWildPigsSnapshot() {
    if (typeof pigs === 'undefined') return [];
    let list = [];
    for (let p of pigs) {
        if (player && player.ridingPig === p) continue;
        list.push({
            id: p.id,
            x: Math.round(p.x),
            y: Math.round(p.y),
            vx: Number((p.vx || 0).toFixed(2)),
            vy: Number((p.vy || 0).toFixed(2)),
            direction: p.direction || 1,
            wingFlap: Number((p.wingFlap || 0).toFixed(2)),
            fleeWaterTimer: p.fleeWaterTimer || 0,
            waterSplashCooldown: p.waterSplashCooldown || 0
        });
    }
    return list;
}

function applyWildPigsSnapshot(wildList) {
    if (!Array.isArray(wildList) || typeof pigs === 'undefined') return;
    let now = performance.now();
    let newPigs = [];
    let addedIds = new Set();

    if (player && player.ridingPig) {
        newPigs.push(player.ridingPig);
        if (player.ridingPig.id) addedIds.add(player.ridingPig.id);
    }

    // Zachowaj lokalnie chronione / uciekające znad wody świnie, aby pakiet sieciowy nigdy ich nie cofał do wody ani nie usuwał!
    for (let lp of pigs) {
        if (lp === (player && player.ridingPig)) continue;
        if ((lp.protectedUntil && lp.protectedUntil > now) || (lp.fleeWaterTimer && lp.fleeWaterTimer > 0) || (lp.waterSplashCooldown && lp.waterSplashCooldown > 0)) {
            newPigs.push(lp);
            if (lp.id) addedIds.add(lp.id);
        }
    }

    for (let wp of wildList) {
        if (wp.id && addedIds.has(wp.id)) continue;
        let existing = pigs.find(p => p.id && p.id === wp.id && p !== (player && player.ridingPig));
        if (existing) {
            if (Math.hypot(existing.x - wp.x, existing.y - wp.y) > 80) {
                existing.x = wp.x;
                existing.y = wp.y;
            } else {
                existing.x += (wp.x - existing.x) * 0.3;
                existing.y += (wp.y - existing.y) * 0.3;
            }
            existing.vx = wp.vx;
            existing.vy = wp.vy;
            existing.direction = wp.direction;
            existing.fleeWaterTimer = Math.max(existing.fleeWaterTimer || 0, wp.fleeWaterTimer || 0);
            existing.waterSplashCooldown = Math.max(existing.waterSplashCooldown || 0, wp.waterSplashCooldown || 0);
            newPigs.push(existing);
            if (existing.id) addedIds.add(existing.id);
        } else {
            let created = {
                id: wp.id || ("pig_" + Math.random().toString(36).substring(2, 8)),
                x: wp.x,
                y: wp.y,
                vx: wp.vx,
                vy: wp.vy,
                direction: wp.direction || 1,
                width: 26,
                height: 18,
                wingFlap: wp.wingFlap || 0,
                bombTimer: 1200 + Math.random() * 900,
                fleeWaterTimer: wp.fleeWaterTimer || 0,
                waterSplashCooldown: wp.waterSplashCooldown || 0
            };
            newPigs.push(created);
            if (created.id) addedIds.add(created.id);
        }
    }
    pigs = newPigs;
}

function applyPlayersSnapshot(snapshot) {
    if (!snapshot) return;
    let now = performance.now();
    let changedSkin = false;
    for (let pid in snapshot) {
        if (pid === myPlayerId) continue;
        let pInfo = snapshot[pid];
        let prev = remotePlayers[pid];
        if (!prev && pInfo.nick && isPlaying && typeof addChatMessage === 'function') {
            addChatMessage(null, `➕ Gracz ${pInfo.nick} dołączył do gry!`, 'system');
        }
        if (!prev || prev.skinIndex !== pInfo.skinIndex) changedSkin = true;

        // Jeśli mamy świeży bezpośredni pakiet player_state (młodszy niż 450 ms), nie cofamy pozycji gracza starym snapshotem z roster_sync!
        if (prev && prev.lastDirectStateTime && (now - prev.lastDirectStateTime < 450)) {
            prev.nick = pInfo.nick || prev.nick;
            prev.skinIndex = typeof pInfo.skinIndex === 'number' ? pInfo.skinIndex : prev.skinIndex;
            prev.isAdmin = Boolean(pInfo.isAdmin);
            prev.gameMode = pInfo.gameMode || 0;
            prev.isHost = Boolean(pInfo.isHost);
            prev.lastSeen = now;
            continue;
        }

        remotePlayers[pid] = {
            ...pInfo,
            x: prev ? prev.x : pInfo.x,
            y: prev ? prev.y : pInfo.y,
            targetX: pInfo.x,
            targetY: pInfo.y,
            vx: pInfo.vx || 0,
            vy: pInfo.vy || 0,
            damageEffect: prev && prev.damageEffect > 0 ? prev.damageEffect : 0,
            lastSeen: now,
            lastDirectStateTime: prev ? prev.lastDirectStateTime : 0
        };
    }
    if (changedSkin && typeof updateSkinAvailabilityUI === 'function') {
        updateSkinAvailabilityUI();
    }
}

function sendWorldSyncResponse(targetPlayerId, sourceConn) {
    const welcomePacket = {
        type: 'world_sync',
        pktId: nextPacketId(),
        senderId: myPlayerId,
        targetId: targetPlayerId || null,
        seed: currentWorldSeed,
        worldTime: typeof worldTime === 'number' ? Number(worldTime.toFixed(4)) : 0.34,
        mods: modifiedTiles,
        fruits: typeof cactusFruits !== 'undefined' ? cactusFruits : {},
        playersSnapshot: getActivePlayersSnapshot(targetPlayerId),
        wildPigs: getWildPigsSnapshot(),
        deers: getDeersSnapshot(),
        camels: getCamelsSnapshot(),
        fishes: getFishesSnapshot()
    };
    seenPacketIds.add(welcomePacket.pktId);
    if (sourceConn && sourceConn.open) {
        try { sourceConn.send(welcomePacket); } catch (e) {}
    }
    if (mqttTopic && mqttClients.length > 0) {
        let str = JSON.stringify(welcomePacket);
        for (let mc of mqttClients) {
            if (mc && mc.isRelayOpen) {
                try { mc.publish(mqttTopic, str, { qos: 0 }); } catch (e) {}
            }
        }
    }
    if (localChannel) {
        try { localChannel.postMessage(welcomePacket); } catch (e) {}
    }
}

function handleNetworkPacket(data, sourceConn) {
    if (!data || data.senderId === myPlayerId) return;

    if (data.targetId && data.targetId !== myPlayerId && data.type === 'world_sync') return;

    if (data.pktId) {
        if (seenPacketIds.has(data.pktId)) return;
        seenPacketIds.add(data.pktId);
        if (seenPacketIds.size > 2500) {
            const firstItem = seenPacketIds.values().next().value;
            seenPacketIds.delete(firstItem);
        }
    }

    if (sourceConn && data.senderId) {
        sourceConn.peerPlayerId = data.senderId;
    }

    if (data.type === 'hello_query' && (isRoomHost || (isPlaying && hasReceivedWorldSync))) {
        if (isRoomHost) {
            sendWorldSyncResponse(data.senderId, sourceConn);
        } else {
            setTimeout(() => {
                if (roomCode) sendWorldSyncResponse(data.senderId, sourceConn);
            }, 120);
        }
    } 
    else if (data.type === 'world_sync' && !isRoomHost) {
        let isFirstSync = !hasReceivedWorldSync;
        hasReceivedWorldSync = true;
        if (isFirstSync && data.seed && data.seed !== currentWorldSeed) {
            generateWorld(data.seed);
        }
        if (typeof data.worldTime === 'number') {
            worldTime = data.worldTime;
            currentDayPhaseName = getDayPhaseId(worldTime);
            lastTimeUpdateMs = performance.now();
        }
        if (data.fruits && typeof cactusFruits !== 'undefined') {
            cactusFruits = { ...data.fruits };
        }
        if (data.mods) {
            for (let key in data.mods) {
                let parts = key.split(',');
                let tx = parseInt(parts[0]), ty = parseInt(parts[1]);
                let blk = data.mods[key];
                if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
                    map[tx][ty] = blk;
                    modifiedTiles[key] = blk;
                }
            }
        }
        if (data.playersSnapshot) {
            applyPlayersSnapshot(data.playersSnapshot);
        }
        if (data.wildPigs) {
            applyWildPigsSnapshot(data.wildPigs);
        }
        if (data.deers) {
            applyDeersSnapshot(data.deers);
        }
        if (data.camels) {
            applyCamelsSnapshot(data.camels);
        }
        if (data.fishes) {
            applyFishesSnapshot(data.fishes);
        }
        if (isFirstSync && !isPlaying) {
            respawnPlayerAtSpawn();
        }
        if (typeof updateSkinAvailabilityUI === 'function') {
            updateSkinAvailabilityUI();
        }
    }
    else if (data.type === 'roster_sync' && !isRoomHost) {
        if (!hasReceivedWorldSync && data.seed && data.mods) {
            hasReceivedWorldSync = true;
            if (data.seed !== currentWorldSeed) {
                generateWorld(data.seed);
            }
            for (let key in data.mods) {
                let parts = key.split(',');
                let tx = parseInt(parts[0]), ty = parseInt(parts[1]);
                let blk = data.mods[key];
                if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
                    map[tx][ty] = blk;
                    modifiedTiles[key] = blk;
                }
            }
            if (!isPlaying) respawnPlayerAtSpawn();
        }
        if (data.playersSnapshot) {
            applyPlayersSnapshot(data.playersSnapshot);
        }
        if (typeof data.worldTime === 'number') {
            let diff = Math.abs(worldTime - data.worldTime);
            if (diff > 0.015 && diff < 0.985) {
                worldTime = data.worldTime;
                currentDayPhaseName = getDayPhaseId(worldTime);
            }
        }
        if (data.wildPigs) {
            applyWildPigsSnapshot(data.wildPigs);
        }
        if (data.deers) {
            applyDeersSnapshot(data.deers);
        }
        if (data.camels) {
            applyCamelsSnapshot(data.camels);
        }
        if (data.fishes) {
            applyFishesSnapshot(data.fishes);
        }
    }
    else if (data.type === 'time_sync') {
        if (typeof data.worldTime === 'number') {
            worldTime = data.worldTime;
            currentDayPhaseName = getDayPhaseId(worldTime);
            lastTimeUpdateMs = performance.now();
            if (data.announceText) {
                showSystemNotification(data.announceText, data.color || '#fde047', 220, true);
            }
        }
        relayFromHost(data, sourceConn);
    }
    else if (data.type === 'player_leave') {
        removeRemotePlayer(data.senderId);
        relayFromHost(data, sourceConn);
    }
    else if (data.type === 'block_change') {
        setTile(data.x, data.y, data.block, false, Boolean(data.inStomach));
        relayFromHost(data, sourceConn);
    }
    else if (data.type === 'mob_spawn') {
        if (data.mobType === 'deer' && typeof deers !== 'undefined' && typeof createDeerEntity === 'function') {
            if (!deers.some(d => d.id === data.mobId)) {
                let dObj = createDeerEntity(data.x, data.y, data.variant);
                dObj.id = data.mobId;
                dObj.direction = data.direction || 1;
                deers.push(dObj);
            }
        } else if (data.mobType === 'camel' && typeof camels !== 'undefined' && typeof createCamelEntity === 'function') {
            if (!camels.some(c => c.id === data.mobId)) {
                let cObj = createCamelEntity(data.x, data.y, data.variant);
                cObj.id = data.mobId;
                cObj.direction = data.direction || 1;
                camels.push(cObj);
            }
        } else if (data.mobType === 'fish' && typeof fishes !== 'undefined' && typeof createFishEntity === 'function') {
            if (!fishes.some(f => f.id === data.mobId)) {
                let fObj = createFishEntity(data.x, data.y, data.variant);
                fObj.id = data.mobId;
                fObj.direction = data.direction || 1;
                fishes.push(fObj);
            }
        } else if (data.mobType === 'pig' && typeof pigs !== 'undefined') {
            if (!pigs.some(p => p.id === data.mobId)) {
                pigs.push({
                    id: data.mobId || ("pig_" + Math.random().toString(36).substring(2, 8)),
                    x: data.x,
                    y: data.y,
                    vx: (data.direction || 1) * 1.2,
                    vy: -0.5,
                    direction: data.direction || 1,
                    width: 26,
                    height: 18,
                    wingFlap: 0,
                    bombTimer: 1200 + Math.random() * 600,
                    fleeWaterTimer: 0,
                    waterSplashCooldown: 0,
                    protectedUntil: performance.now() + 5000
                });
            }
        }
        relayFromHost(data, sourceConn);
    }
    else if (data.type === 'opuntia_change') {
        if (typeof setOpuntiaFruit === 'function') {
            setOpuntiaFruit(data.x, data.y, Boolean(data.hasFruit), false);
        }
        relayFromHost(data, sourceConn);
    }
    else if (data.type === 'camel_event') {
        if (typeof camels !== 'undefined') {
            if (data.subtype === 'tame') {
                let target = camels.find(c => c.id === data.camelId);
                if (target) {
                    target.isTamed = true;
                    if (data.variant) target.variant = data.variant;
                }
            } else if (data.subtype === 'mount') {
                for (let i = camels.length - 1; i >= 0; i--) {
                    if (camels[i] === (player && player.ridingCamel)) continue;
                    if (camels[i].id === data.camelId) {
                        camels.splice(i, 1);
                        break;
                    }
                }
            } else if (data.subtype === 'dismount') {
                let existing = camels.find(c => c.id === data.camelId);
                let dims = (typeof getCamelDimensions === 'function') ? getCamelDimensions(data.variant) : { width: 30, height: 25, speed: 0.62 };
                if (existing) {
                    existing.x = data.x;
                    existing.y = data.y;
                    existing.isTamed = true;
                } else {
                    camels.push({
                        id: data.camelId || ("camel_" + Math.random().toString(36).substring(2, 8)),
                        variant: data.variant || 'dromader_samica',
                        x: data.x,
                        y: data.y,
                        vx: 0,
                        vy: 0,
                        width: dims.width,
                        height: dims.height,
                        baseSpeed: dims.speed,
                        direction: data.direction || 1,
                        walkFrame: 0,
                        grounded: true,
                        state: 'idle',
                        stateTimer: 100,
                        grazeProgress: 0,
                        isTamed: true
                    });
                }
            }
        }
        relayFromHost(data, sourceConn);
    } 
    else if (data.type === 'bomb_spawn') {
        bombs.push({
            x: data.x,
            y: data.y,
            vy: data.vy || 0,
            radius: 4,
            ownerId: data.senderId,
            fromNetwork: true
        });
        relayFromHost(data, sourceConn);
    }
    else if (data.type === 'pvp_hit') {
        if (data.targetId === myPlayerId && !player.dead) {
            if (data.dismountPig && player.ridingPig) {
                dismountCurrentPig(true, true, false);
            }
            if (data.swallow && !player.inStomach && !player.isSandworm && typeof enterWormStomach === 'function') {
                if (player.gameMode !== 1) damagePlayer(data.damage || 1);
                enterWormStomach(data.senderNick || "Czerw", data.senderId);
            } else if (player.gameMode !== 1) {
                damagePlayer(data.damage || 1);
                player.vx = data.knockVx || 0;
                player.vy = data.knockVy || -3.2;
            }
        }
        relayFromHost(data, sourceConn);
    }
    // Synchronizacja plusku wody, zrzucenia ze świni i płynnie odlatujących świń!
    else if (data.type === 'pig_event') {
        let now = performance.now();
        if (data.subtype === 'water_flee') {
            if (typeof createWaterSplash === 'function') {
                createWaterSplash(data.splashX || (data.x + 13), data.splashY || (data.y + 18), 28);
            }
            let existing = pigs.find(p => p.id && p.id === data.pigId);
            if (existing && existing !== player.ridingPig) {
                existing.x = data.x;
                existing.y = data.y;
                existing.vx = data.vx;
                existing.vy = data.vy;
                existing.direction = data.direction || 1;
                existing.fleeWaterTimer = data.fleeWaterTimer || 85;
                existing.waterSplashCooldown = 60;
                existing.protectedUntil = now + 5000;
            } else {
                let newP = {
                    id: data.pigId || ("pig_" + Math.random().toString(36).substring(2, 8)),
                    x: data.x,
                    y: data.y,
                    vx: data.vx,
                    vy: data.vy,
                    direction: data.direction || 1,
                    width: 26,
                    height: 18,
                    wingFlap: 0,
                    bombTimer: 1200 + Math.random() * 900,
                    fleeWaterTimer: data.fleeWaterTimer || 85,
                    waterSplashCooldown: 60,
                    protectedUntil: now + 5000
                };
                if (typeof liftPigAboveWater === 'function') liftPigAboveWater(newP);
                pigs.push(newP);
            }
        } else if (data.subtype === 'dismount') {
            let existing = pigs.find(p => p.id && p.id === data.pigId);
            if (existing && existing !== player.ridingPig) {
                existing.x = data.x;
                existing.y = data.y;
                existing.vx = data.vx;
                existing.vy = data.vy;
                existing.direction = data.direction || 1;
                existing.fleeWaterTimer = data.fleeWaterTimer || 50;
                existing.waterSplashCooldown = 45;
                existing.protectedUntil = now + 5000;
            } else {
                pigs.push({
                    id: data.pigId || ("pig_" + Math.random().toString(36).substring(2, 8)),
                    x: data.x,
                    y: data.y,
                    vx: data.vx,
                    vy: data.vy,
                    direction: data.direction || 1,
                    width: 26,
                    height: 18,
                    wingFlap: 0,
                    bombTimer: 1200 + Math.random() * 900,
                    fleeWaterTimer: data.fleeWaterTimer || 50,
                    waterSplashCooldown: 45,
                    protectedUntil: now + 5000
                });
            }
        } else if (data.subtype === 'mount') {
            for (let i = pigs.length - 1; i >= 0; i--) {
                if (pigs[i] === player.ridingPig) continue;
                if ((data.pigId && pigs[i].id === data.pigId) || Math.hypot(pigs[i].x - data.x, pigs[i].y - data.y) < 35) {
                    pigs.splice(i, 1);
                    break;
                }
            }
        } else if (data.subtype === 'splash_only') {
            if (typeof createWaterSplash === 'function') {
                createWaterSplash(data.x, data.y, data.count || 20);
            }
        }
        relayFromHost(data, sourceConn);
    }
    // Synchronizacja Czerwia Pustynnego dla wszystkich graczy!
    else if (data.type === 'sandworm_sync') {
        if (typeof sandworm !== 'undefined' && sandworm.ownerId !== myPlayerId) {
            sandworm.active = Boolean(data.active);
            sandworm.state = data.state || 'idle';
            sandworm.x = data.x || 0;
            sandworm.y = data.y || 0;
            sandworm.targetX = data.targetX || 0;
            sandworm.targetY = data.targetY || 0;
            if (Array.isArray(data.segments)) {
                sandworm.segments = data.segments;
            }
            sandworm.isRemote = Boolean(data.active);
            sandworm.lastSyncTime = performance.now();
        }
        relayFromHost(data, sourceConn);
    }
    // Obsługa komendy /unpig [nick] przez sieć
    else if (data.type === 'unpig_command') {
        let isForMe = (data.targetId === myPlayerId) ||
                      (playerNick && data.targetNick && playerNick.toLowerCase() === data.targetNick.toLowerCase());
        if (isForMe && player && player.ridingPig) {
            dismountCurrentPig(true, true, false);
            showSystemNotification(`🐷 Gracz ${data.senderNick || 'Inny gracz'} zrzucił Cię z latającej świni!`, '#ff9800', 220, true);
        }
        relayFromHost(data, sourceConn);
    }
    // Prywatna wiadomość (Szept /msg [nick] lub z menu PPM)
    else if (data.type === 'whisper_message') {
        let isForMe = (data.targetId === myPlayerId) ||
                      (playerNick && data.targetNick && playerNick.toLowerCase() === data.targetNick.toLowerCase());
        if (isForMe && typeof addChatMessage === 'function') {
            addChatMessage(`[Szept od <- ${data.senderNick || 'Gracz'}]`, data.text || "", 'whisper');
        }
        relayFromHost(data, sourceConn);
    }
    // Interakcja pomachania graczowi z menu PPM
    else if (data.type === 'wave_interaction') {
        let isForMe = (data.targetId === myPlayerId) ||
                      (playerNick && data.targetNick && playerNick.toLowerCase() === data.targetNick.toLowerCase());
        if (isForMe) {
            showSystemNotification(`👋 Gracz ${data.senderNick || 'Gracz'} pomachał Ci!`, '#38bdf8', 200, true);
        }
        relayFromHost(data, sourceConn);
    }
    // Obsługa wiadomości czatu pod klawiszem [T] (z uwzględnieniem rangi ADMIN / Gracz)
    else if (data.type === 'chat_message') {
        if (typeof addChatMessage === 'function') {
            addChatMessage(data.nick || "Gracz", data.text || "", data.msgType || 'chat', Boolean(data.isAdmin));
        }
        relayFromHost(data, sourceConn);
    }
    else if (data.type === 'player_state') {
        let now = performance.now();
        let prev = remotePlayers[data.senderId];
        if (!prev && data.nick && isPlaying && typeof addChatMessage === 'function') {
            addChatMessage(null, `➕ Gracz ${data.nick} dołączył do gry!`, 'system');
        }
        let prevSkin = prev ? prev.skinIndex : null;
        let startX = (prev && typeof prev.x === 'number' && Math.hypot(data.x - prev.x, data.y - prev.y) < 90) ? prev.x : data.x;
        let startY = (prev && typeof prev.y === 'number' && Math.hypot(data.x - prev.x, data.y - prev.y) < 90) ? prev.y : data.y;

        remotePlayers[data.senderId] = {
            nick: data.nick,
            x: startX,
            y: startY,
            targetX: data.x,
            targetY: data.y,
            vx: data.vx || 0,
            vy: data.vy || 0,
            direction: data.direction,
            walkFrame: data.walkFrame,
            skinIndex: data.skinIndex,
            dead: data.dead,
            hp: data.hp,
            maxHp: data.maxHp || 5,
            damageEffect: data.damageEffect || (prev && prev.damageEffect > 0 ? prev.damageEffect - 1 : 0),
            isSwimming: Boolean(data.isSwimming),
            isRiding: Boolean(data.isRiding),
            pigWingFlap: data.pigWingFlap || 0,
            isRidingCamel: Boolean(data.isRidingCamel),
            camelVariant: data.camelVariant || null,
            camelWalkFrame: data.camelWalkFrame || 0,
            passengerOnPlayerId: data.passengerOnPlayerId || null,
            pickaxeAnim: data.pickaxeAnim,
            miningX: typeof data.miningX === 'number' ? data.miningX : -1,
            miningY: typeof data.miningY === 'number' ? data.miningY : -1,
            miningProgress: data.miningProgress || 0,
            grounded: data.grounded,
            gameMode: data.gameMode || 0,
            isAdmin: Boolean(data.isAdmin),
            isSandworm: Boolean(data.isSandworm),
            inStomach: Boolean(data.inStomach),
            isPoisoned: Boolean(data.isPoisoned),
            poisonDamageEffect: data.poisonDamageEffect || (prev && prev.poisonDamageEffect > 0 ? prev.poisonDamageEffect - 1 : 0),
            wormSegments: Array.isArray(data.wormSegments) ? data.wormSegments : (prev && prev.wormSegments ? prev.wormSegments : null),
            isHost: Boolean(data.isHost),
            inGame: true,
            lastSeen: now,
            lastDirectStateTime: now
        };
        if (!prev || prevSkin !== data.skinIndex) {
            if (typeof updateSkinAvailabilityUI === 'function') {
                updateSkinAvailabilityUI();
            }
        }
        relayFromHost(data, sourceConn);
    }
}

function sendMobSpawnPacket(mobType, mobObj) {
    if (!roomCode || !mobObj) return;
    broadcastPacket({
        type: 'mob_spawn',
        senderId: myPlayerId,
        mobType: mobType,
        mobId: mobObj.id,
        variant: mobObj.variant || null,
        x: Math.round(mobObj.x),
        y: Math.round(mobObj.y),
        direction: mobObj.direction || 1
    });
}

function sendOpuntiaChange(x, y, hasFruit) {
    if (!roomCode) return;
    broadcastPacket({
        type: 'opuntia_change',
        senderId: myPlayerId,
        x: x,
        y: y,
        hasFruit: Boolean(hasFruit)
    });
}

function sendCamelEvent(subtype, camelObj) {
    if (!roomCode || !camelObj) return;
    broadcastPacket({
        type: 'camel_event',
        senderId: myPlayerId,
        subtype: subtype,
        camelId: camelObj.id,
        variant: camelObj.variant,
        x: Math.round(camelObj.x),
        y: Math.round(camelObj.y),
        direction: camelObj.direction || 1
    });
}

function sendBlockChange(x, y, block, inStomach = false) {
    if (!roomCode) return;
    broadcastPacket({
        type: 'block_change',
        senderId: myPlayerId,
        x: x,
        y: y,
        block: block,
        inStomach: Boolean(inStomach)
    });
}

function sendBombSpawn(x, y, vy = 0) {
    if (!roomCode) return;
    broadcastPacket({
        type: 'bomb_spawn',
        senderId: myPlayerId,
        x: x,
        y: y,
        vy: vy
    });
}

function sendPigEvent(subtype, pigObj, extra = {}) {
    if (!roomCode) return;
    broadcastPacket({
        type: 'pig_event',
        senderId: myPlayerId,
        subtype: subtype,
        pigId: pigObj ? pigObj.id : null,
        x: pigObj ? Math.round(pigObj.x) : (extra.x || 0),
        y: pigObj ? Math.round(pigObj.y) : (extra.y || 0),
        splashX: extra.splashX || (pigObj ? Math.round(pigObj.x + 13) : 0),
        splashY: extra.splashY || (pigObj ? Math.round(pigObj.y + 18) : 0),
        vx: pigObj ? Number((pigObj.vx || 0).toFixed(2)) : 0,
        vy: pigObj ? Number((pigObj.vy || 0).toFixed(2)) : 0,
        direction: pigObj ? (pigObj.direction || 1) : 1,
        fleeWaterTimer: pigObj ? (pigObj.fleeWaterTimer || 0) : 0,
        count: extra.count || 20
    });
}

function sendSandwormSync() {
    if (!roomCode || typeof sandworm === 'undefined') return;
    broadcastPacket({
        type: 'sandworm_sync',
        senderId: myPlayerId,
        active: sandworm.active,
        state: sandworm.state,
        x: Math.round(sandworm.x),
        y: Math.round(sandworm.y),
        targetX: Math.round(sandworm.targetX),
        targetY: Math.round(sandworm.targetY),
        segments: sandworm.segments.map(s => ({ x: Math.round(s.x), y: Math.round(s.y) }))
    });
}

function sendUnpigCommand(targetId, targetNick) {
    if (!roomCode) return;
    broadcastPacket({
        type: 'unpig_command',
        senderId: myPlayerId,
        senderNick: playerNick || "Gracz",
        targetId: targetId,
        targetNick: targetNick
    });
}

function sendWhisperPacket(targetId, targetNick, text) {
    if (!roomCode) return;
    broadcastPacket({
        type: 'whisper_message',
        senderId: myPlayerId,
        senderNick: playerNick || "Gracz",
        targetId: targetId,
        targetNick: targetNick,
        text: text
    });
}

function sendWaveInteractionPacket(targetId, targetNick) {
    if (!roomCode) return;
    broadcastPacket({
        type: 'wave_interaction',
        senderId: myPlayerId,
        senderNick: playerNick || "Gracz",
        targetId: targetId,
        targetNick: targetNick
    });
}

function sendTimeSyncPacket(newWorldTime, announceText = null, color = '#fde047') {
    if (!roomCode) return;
    broadcastPacket({
        type: 'time_sync',
        senderId: myPlayerId,
        worldTime: Number(newWorldTime.toFixed(4)),
        announceText: announceText,
        color: color
    });
}

function sendChatMessagePacket(text, msgType = 'chat') {
    if (!roomCode) return;
    broadcastPacket({
        type: 'chat_message',
        senderId: myPlayerId,
        nick: playerNick || "Gracz",
        text: text,
        msgType: msgType,
        isAdmin: Boolean(player.isAdmin)
    });
}

function sendPvpHit(targetId, damage, knockVx, knockVy, dismountPig = false, swallow = false) {
    if (!roomCode) return;
    if (remotePlayers[targetId] && remotePlayers[targetId].gameMode !== 1) {
        remotePlayers[targetId].damageEffect = 15;
    }
    broadcastPacket({
        type: 'pvp_hit',
        senderId: myPlayerId,
        senderNick: playerNick || "Czerw",
        targetId: targetId,
        damage: damage,
        knockVx: knockVx,
        knockVy: knockVy,
        dismountPig: Boolean(dismountPig),
        swallow: Boolean(swallow)
    });
}

let lastPlayerStateSentTime = 0;

function sendPlayerState(forceImmediate = false) {
    if (!roomCode || !isPlaying) return;
    let now = performance.now();
    if (!forceImmediate && now - lastPlayerStateSentTime < 26) return; // Optymalne ~38 pakietów/s bez przeciążania łącza
    lastPlayerStateSentTime = now;

    let pickaxeAnim = (isClicking && (miningX !== -1 || pvpHitCooldown > 15) && !showInventory && !isCommandOpen) ? Number(pickaxeSwing.toFixed(2)) : null;
    let curVx = player.ridingPig ? player.ridingPig.vx : (player.ridingCamel ? player.ridingCamel.vx : player.vx);
    let curVy = player.ridingPig ? player.ridingPig.vy : (player.ridingCamel ? player.ridingCamel.vy : player.vy);

    broadcastPacket({
        type: 'player_state',
        senderId: myPlayerId,
        nick: playerNick,
        x: Number(player.x.toFixed(2)),
        y: Number(player.y.toFixed(2)),
        vx: Number((curVx || 0).toFixed(2)),
        vy: Number((curVy || 0).toFixed(2)),
        direction: player.direction,
        walkFrame: Number((player.walkFrame || 0).toFixed(2)),
        skinIndex: selectedSkinIndex,
        dead: player.dead,
        hp: player.hp,
        maxHp: player.maxHp,
        damageEffect: player.damageEffect,
        isSwimming: player.isSwimming,
        isRiding: player.ridingPig !== null,
        pigWingFlap: player.ridingPig ? Number((player.ridingPig.wingFlap || 0).toFixed(2)) : 0,
        isRidingCamel: player.ridingCamel !== null,
        camelVariant: player.ridingCamel ? player.ridingCamel.variant : null,
        camelWalkFrame: player.ridingCamel ? Number((player.ridingCamel.walkFrame || 0).toFixed(2)) : 0,
        passengerOnPlayerId: player.passengerOnPlayerId || null,
        pickaxeAnim: pickaxeAnim,
        miningX: miningX,
        miningY: miningY,
        miningProgress: Number((miningProgress || 0).toFixed(1)),
        grounded: player.grounded,
        gameMode: player.gameMode || 0,
        isAdmin: Boolean(player.isAdmin),
        isSandworm: Boolean(player.isSandworm),
        inStomach: Boolean(player.inStomach),
        isPoisoned: Boolean(player.inAcid || player.acidPoisonTimer > 0),
        poisonDamageEffect: player.poisonDamageEffect || 0,
        wormSegments: (player.isSandworm && Array.isArray(player.wormSegments)) ? player.wormSegments.map(s => ({ x: Math.round(s.x), y: Math.round(s.y) })) : null,
        isHost: isRoomHost
    });
}

function attachConnectionHandlers(conn) {
    conn.on('data', (data) => handleNetworkPacket(data, conn));
    const onDisconnect = () => {
        let idx = peerConnections.indexOf(conn);
        if (idx !== -1) peerConnections.splice(idx, 1);
        if (conn.peerPlayerId) {
            removeRemotePlayer(conn.peerPlayerId);
            if (isRoomHost) {
                broadcastPacket({
                    type: 'player_leave',
                    senderId: conn.peerPlayerId
                });
            }
        }
    };
    conn.on('close', onDisconnect);
    conn.on('error', onDisconnect);
}

function registerHostPeerOnSignalingServer(code, onOpenCallback) {
    if (typeof Peer === 'undefined' || !code) return;
    try {
        if (peerInstance) {
            try { peerInstance.destroy(); } catch (e) {}
            peerInstance = null;
        }
        lastHostPeerRecreateTime = performance.now();
        peerInstance = new Peer('bnw-room-' + code, PEER_ICE_CONFIG);

        peerInstance.on('open', () => {
            if (onOpenCallback) onOpenCallback();
        });

        peerInstance.on('connection', (conn) => {
            peerConnections.push(conn);
            attachConnectionHandlers(conn);
            if (conn.open) {
                sendWorldSyncResponse(conn.peerPlayerId, conn);
            }
            conn.on('open', () => {
                sendWorldSyncResponse(conn.peerPlayerId, conn);
                setTimeout(() => sendWorldSyncResponse(conn.peerPlayerId, conn), 400);
            });
        });

        peerInstance.on('disconnected', () => {
            let now = performance.now();
            if (peerInstance && !peerInstance.destroyed && now - lastPeerReconnectTime > 4500) {
                lastPeerReconnectTime = now;
                try { peerInstance.reconnect(); } catch (e) {}
            }
        });

        peerInstance.on('error', (err) => {
            if (onOpenCallback && err && err.type !== 'unavailable-id') {
                onOpenCallback();
            }
        });
    } catch (e) {
        if (onOpenCallback) onOpenCallback();
    }
}

function promoteSelfToHost() {
    if (isRoomHost || !roomCode) return;
    isRoomHost = true;
    hasReceivedWorldSync = true;
    registerHostPeerOnSignalingServer(roomCode, null);
}

setInterval(() => {
    if (!roomCode) return;
    let now = performance.now();

    if (isRoomHost) {
        if (!peerInstance || peerInstance.destroyed) {
            if (now - lastHostPeerRecreateTime > 6000) {
                registerHostPeerOnSignalingServer(roomCode, null);
            }
        } else if (peerInstance.disconnected) {
            if (now - lastPeerReconnectTime > 5000) {
                lastPeerReconnectTime = now;
                try { peerInstance.reconnect(); } catch (e) {}
            }
        }
    }

    if (isPlaying) {
        sendPlayerState();
    } else if (!isRoomHost && !hasReceivedWorldSync) {
        broadcastPacket({ type: 'hello_query', senderId: myPlayerId });
    }

    if (isRoomHost) {
        broadcastPacket({
            type: 'roster_sync',
            senderId: myPlayerId,
            seed: currentWorldSeed,
            worldTime: typeof worldTime === 'number' ? Number(worldTime.toFixed(4)) : 0.34,
            mods: modifiedTiles,
            playersSnapshot: getActivePlayersSnapshot(null),
            wildPigs: getWildPigsSnapshot(),
        deers: getDeersSnapshot(),
        camels: getCamelsSnapshot(),
        fishes: getFishesSnapshot()
        });
    }

    let removedAny = false;
    let hostStillPresent = isRoomHost;
    for (let id in remotePlayers) {
        if (now - remotePlayers[id].lastSeen > 3500) {
            let leavingNick = remotePlayers[id].nick;
            delete remotePlayers[id];
            removedAny = true;
            if (leavingNick && isPlaying && typeof addChatMessage === 'function') {
                addChatMessage(null, `➖ Gracz ${leavingNick} opuścił grę.`, 'system');
            }
        } else if (remotePlayers[id].isHost) {
            hostStillPresent = true;
        }
    }
    if (!hostStillPresent && !isRoomHost && isPlaying) {
        promoteSelfToHost();
    }
    if (removedAny && typeof updateSkinAvailabilityUI === 'function') {
        updateSkinAvailabilityUI();
    }
}, 250);

function notifyLeaveRoom() {
    if (!roomCode) return;
    broadcastPacket({
        type: 'player_leave',
        senderId: myPlayerId
    });
    if (peerInstance) {
        try { peerInstance.destroy(); } catch (e) {}
    }
}
window.addEventListener('beforeunload', notifyLeaveRoom);
window.addEventListener('pagehide', notifyLeaveRoom);

function startHostMultiplayer(onReady) {
    if (joinQueryInterval) {
        clearInterval(joinQueryInterval);
        joinQueryInterval = null;
    }
    isRoomHost = true;
    hasReceivedWorldSync = true;
    roomCode = String(Math.floor(1000 + Math.random() * 9000));
    remotePlayers = {};
    peerConnections = [];
    setupLocalChannel(roomCode);
    setupWebSocketRelay(roomCode, null);

    const statusEl = document.getElementById('multiStatus');
    statusEl.innerText = "Tworzenie pokoju " + roomCode + "...";

    let hostReadyCalled = false;
    const finishHostReady = () => {
        if (!hostReadyCalled) {
            hostReadyCalled = true;
            statusEl.innerText = "Pokój gotowy! Kod: " + roomCode;
            onReady(roomCode);
        }
    };

    setTimeout(finishHostReady, 1000);
    registerHostPeerOnSignalingServer(roomCode, finishHostReady);
}

function joinMultiplayerRoom(codeInput, onReady) {
    let cleanCode = codeInput.trim().replace(/^bnw-room-/i, '').replace(/[^0-9a-zA-Z]/g, '');
    if (!cleanCode) return;

    if (joinQueryInterval) {
        clearInterval(joinQueryInterval);
        joinQueryInterval = null;
    }

    isRoomHost = false;
    hasReceivedWorldSync = false;
    roomCode = cleanCode;
    remotePlayers = {};
    peerConnections = [];
    setupLocalChannel(roomCode);

    const statusEl = document.getElementById('multiStatus');
    const joinBtn = document.getElementById('btnJoinGame');
    if (joinBtn) joinBtn.disabled = true;
    statusEl.style.color = '#f1c40f';
    statusEl.innerText = "Wyszukiwanie serwera o kodzie " + roomCode + "...";

    let proceedCalled = false;
    const finishConnect = () => {
        if (!proceedCalled) {
            proceedCalled = true;
            if (joinQueryInterval) {
                clearInterval(joinQueryInterval);
                joinQueryInterval = null;
            }
            if (joinBtn) joinBtn.disabled = false;
            onReady(roomCode);
        }
    };

    setupWebSocketRelay(roomCode, () => {
        broadcastPacket({ type: 'hello_query', senderId: myPlayerId });
    });

    if (localChannel) {
        localChannel.postMessage({ type: 'hello_query', senderId: myPlayerId });
    }

    if (typeof Peer !== 'undefined') {
        try {
            if (peerInstance) {
                try { peerInstance.destroy(); } catch (e) {}
            }
            peerInstance = new Peer(PEER_ICE_CONFIG);

            const connectWebRTC = () => {
                if (!peerInstance || peerInstance.destroyed || isRoomHost) return;
                const conn = peerInstance.connect('bnw-room-' + roomCode, {
                    reliable: true,
                    serialization: 'json'
                });
                peerConnections.push(conn);
                attachConnectionHandlers(conn);
                conn.on('open', () => {
                    conn.send({ type: 'hello_query', senderId: myPlayerId });
                });
            };

            peerInstance.on('open', () => {
                connectWebRTC();
            });

            peerInstance.on('error', () => {
                broadcastPacket({ type: 'hello_query', senderId: myPlayerId });
            });
        } catch (err) {}
    }

    let elapsedMs = 0;
    joinQueryInterval = setInterval(() => {
        elapsedMs += 100;
        if (hasReceivedWorldSync) {
            statusEl.style.color = '#2ecc71';
            statusEl.innerText = "Połączono z pokojem " + roomCode + "!";
            finishConnect();
            return;
        }
        if (elapsedMs % 400 === 0) {
            broadcastPacket({ type: 'hello_query', senderId: myPlayerId });
        }
        if (elapsedMs >= 6500 && !hasReceivedWorldSync) {
            clearInterval(joinQueryInterval);
            joinQueryInterval = null;
            if (joinBtn) joinBtn.disabled = false;
            statusEl.style.color = '#ff5252';
            statusEl.innerText = "Nie znaleziono pokoju " + roomCode + " (upewnij się, że gracz jest na serwerze i kliknij ponownie).";
        }
    }, 100);
}
