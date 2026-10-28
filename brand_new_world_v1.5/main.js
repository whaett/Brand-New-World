// ==========================================
// GŁÓWNA PĘTLA GRY, CZAT POD [T], SZEPTY /MSG, MENU INTERAKCJI PPM I HUD (v1.5)
// ==========================================
const chatWrapperEl = document.getElementById('chatWrapper');
const chatMessagesEl = document.getElementById('chatMessages');
const chatSuggestionsEl = document.getElementById('chatSuggestions');
const commandBarEl = document.getElementById('commandBar');
const commandInputEl = document.getElementById('commandInput');
const chatSendBtnEl = document.getElementById('chatSendBtn');

// Elementy okienka interakcji pod PPM na graczu
const playerContextMenuEl = document.getElementById('playerContextMenu');
const contextMenuHeaderEl = document.getElementById('contextMenuHeader');
const btnContextWhisperEl = document.getElementById('btnContextWhisper');
const btnContextWaveEl = document.getElementById('btnContextWave');
const btnContextCloseEl = document.getElementById('btnContextClose');

let currentSuggestions = [];
let activeSuggestionIndex = 0;
let contextTargetPlayer = null; // { id, nick }

function formatTimeHHMM() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function addChatMessage(nick, text, msgType = 'chat') {
    if (!chatMessagesEl) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg ' + (msgType || 'chat');

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.innerText = `[${formatTimeHHMM()}]`;
    msgDiv.appendChild(timeSpan);

    if (nick) {
        const nickSpan = document.createElement('span');
        nickSpan.className = 'chat-nick';
        nickSpan.innerText = nick.endsWith(':') ? nick : `${nick}:`;
        msgDiv.appendChild(nickSpan);
    }

    const textSpan = document.createElement('span');
    textSpan.innerText = text;
    msgDiv.appendChild(textSpan);

    chatMessagesEl.appendChild(msgDiv);

    while (chatMessagesEl.children.length > 60) {
        chatMessagesEl.removeChild(chatMessagesEl.firstChild);
    }

    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

    setTimeout(() => {
        msgDiv.classList.add('faded');
    }, 9000);
}

// ==========================================
// OKIENKO INTERAKCJI Z GRACZEM POD PPM
// ==========================================
function openPlayerContextMenu(targetId, targetNick, screenX, screenY) {
    if (!playerContextMenuEl) return;
    contextTargetPlayer = { id: targetId, nick: targetNick };
    contextMenuHeaderEl.innerText = `👤 ${targetNick}`;
    playerContextMenuEl.style.display = 'flex';

    // Dopasuj pozycję okienka, aby nie wychodziło poza ekran
    let menuW = 225;
    let menuH = 145;
    let leftPos = Math.min(window.innerWidth - menuW - 12, Math.max(12, screenX + 8));
    let topPos = Math.min(window.innerHeight - menuH - 12, Math.max(12, screenY + 8));
    playerContextMenuEl.style.left = leftPos + 'px';
    playerContextMenuEl.style.top = topPos + 'px';
}

function closePlayerContextMenu() {
    if (!playerContextMenuEl) return;
    playerContextMenuEl.style.display = 'none';
    contextTargetPlayer = null;
}

if (btnContextWhisperEl) {
    btnContextWhisperEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (contextTargetPlayer && contextTargetPlayer.nick) {
            let targetNick = contextTargetPlayer.nick;
            closePlayerContextMenu();
            openChatOrCommandBar(`/msg ${targetNick} `);
        }
    });
}

if (btnContextWaveEl) {
    btnContextWaveEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (contextTargetPlayer && contextTargetPlayer.nick) {
            let targetId = contextTargetPlayer.id;
            let targetNick = contextTargetPlayer.nick;
            closePlayerContextMenu();
            sendWaveInteractionPacket(targetId, targetNick);
            showSystemNotification(`👋 Pomachałeś graczowi ${targetNick}!`, '#38bdf8', 180, true);
        }
    });
}

if (btnContextCloseEl) {
    btnContextCloseEl.addEventListener('click', (e) => {
        e.stopPropagation();
        closePlayerContextMenu();
    });
}

// Sprawdza czy kliknięto PPM na innego gracza w świecie gry
function findRemotePlayerAtWorldPos(wx, wy) {
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp || rp.inGame === false) continue;
        if (wx >= rp.x - 12 && wx <= rp.x + 28 && wy >= rp.y - 14 && wy <= rp.y + 34) {
            return { id: id, nick: rp.nick || "Gracz" };
        }
    }
    return null;
}

// ==========================================
// PODPOWIEDZI NICKÓW W CZACIE (UKRYTE /PIG I /UNPIG ZANIM SIĘ JE WPISZE!)
// ==========================================
function updateCommandSuggestions() {
    if (!isCommandOpen) {
        chatSuggestionsEl.style.display = 'none';
        currentSuggestions = [];
        return;
    }

    const val = commandInputEl.value;
    if (!val.startsWith('/')) {
        chatSuggestionsEl.style.display = 'none';
        currentSuggestions = [];
        return;
    }

    const lowerVal = val.toLowerCase();
    currentSuggestions = [];

    // 1. Podpowiadanie nicków dla prywatnej wiadomości: /msg [nick] [wiadomość]
    if (lowerVal.startsWith('/msg')) {
        let afterCmd = val.substring(4);
        // Pokazuj podpowiedzi nicków tylko gdy wpisujemy pierwszy argument (nick), a nie samą treść wiadomości
        let trimmedAfter = afterCmd.trimStart();
        if (!trimmedAfter.includes(' ')) {
            let filterLower = trimmedAfter.toLowerCase();
            let allPlayers = (typeof getAllSessionPlayersList === 'function') ? getAllSessionPlayersList() : [];
            for (let p of allPlayers) {
                if (p.isMe) continue;
                if (!filterLower || p.nick.toLowerCase().includes(filterLower)) {
                    currentSuggestions.push({
                        insertText: `/msg ${p.nick} `,
                        label: `/msg ${p.nick}`,
                        desc: '💬 Napisz prywatną wiadomość'
                    });
                }
            }
        }
    }
    // 2. Podpowiadanie nicków dla /unpig DOPIERO po wpisaniu całego "/unpig" (komenda pozostaje tajna przy wpisaniu "/"!)
    else if (lowerVal === '/unpig' || lowerVal.startsWith('/unpig ')) {
        let afterCmd = val.substring(6).trimStart();
        if (!afterCmd.includes(' ')) {
            let filterLower = afterCmd.toLowerCase();
            let allPlayers = (typeof getAllSessionPlayersList === 'function') ? getAllSessionPlayersList() : [];
            allPlayers.sort((a, b) => (b.isRiding ? 1 : 0) - (a.isRiding ? 1 : 0));

            for (let p of allPlayers) {
                if (!filterLower || p.nick.toLowerCase().includes(filterLower)) {
                    let statusBadge = p.isRiding ? "🐷 Leci na świni!" : (p.isMe ? "Ty" : "Gracz w sesji");
                    currentSuggestions.push({
                        insertText: `/unpig ${p.nick}`,
                        label: `/unpig ${p.nick}`,
                        desc: statusBadge
                    });
                }
            }
        }
    }

    if (currentSuggestions.length === 0) {
        chatSuggestionsEl.style.display = 'none';
        return;
    }

    if (activeSuggestionIndex >= currentSuggestions.length) {
        activeSuggestionIndex = 0;
    }

    chatSuggestionsEl.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'suggestion-header';
    header.innerText = 'Wybierz gracza (Tab lub kliknij):';
    chatSuggestionsEl.appendChild(header);

    currentSuggestions.forEach((sug, idx) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item' + (idx === activeSuggestionIndex ? ' active' : '');

        const leftSpan = document.createElement('span');
        leftSpan.innerText = sug.label;

        const rightSpan = document.createElement('span');
        rightSpan.className = 'suggestion-desc';
        rightSpan.innerText = sug.desc;

        item.appendChild(leftSpan);
        item.appendChild(rightSpan);

        item.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            applySuggestion(idx);
        });

        chatSuggestionsEl.appendChild(item);
    });

    chatSuggestionsEl.style.display = 'block';
}

function applySuggestion(idx) {
    if (idx < 0 || idx >= currentSuggestions.length) return;
    const chosen = currentSuggestions[idx];
    commandInputEl.value = chosen.insertText;
    commandInputEl.focus();
    let len = commandInputEl.value.length;
    commandInputEl.setSelectionRange(len, len);
    activeSuggestionIndex = 0;
    updateCommandSuggestions();
}

function openChatOrCommandBar(initialText = '') {
    if (!isPlaying || player.dead) return;
    closePlayerContextMenu();
    showInventory = false;
    isCommandOpen = true;
    isClicking = false;
    isRightClicking = false;
    for (let k in keys) keys[k] = false;

    chatWrapperEl.classList.add('chat-active');
    commandBarEl.style.display = 'flex';
    commandInputEl.value = initialText;
    activeSuggestionIndex = 0;
    updateCommandSuggestions();

    setTimeout(() => {
        commandInputEl.focus();
        let len = commandInputEl.value.length;
        commandInputEl.setSelectionRange(len, len);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }, 10);
}

function closeCommandBar() {
    isCommandOpen = false;
    chatWrapperEl.classList.remove('chat-active');
    commandBarEl.style.display = 'none';
    chatSuggestionsEl.style.display = 'none';
    currentSuggestions = [];
    commandInputEl.blur();
}

function executeWhisperCommand(argsStr) {
    let trimmed = (argsStr || "").trim();
    if (!trimmed) {
        showSystemNotification("Użycie: /msg [nick] [wiadomość]", "#ff5252", 210, true);
        return;
    }
    let spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
        showSystemNotification("Wpisz treść wiadomości: /msg [nick] [wiadomość]", "#ff5252", 210, true);
        return;
    }
    let targetNick = trimmed.substring(0, spaceIdx).trim();
    let msgText = trimmed.substring(spaceIdx + 1).trim();
    if (!msgText) {
        showSystemNotification("Wpisz treść wiadomości: /msg [nick] [wiadomość]", "#ff5252", 210, true);
        return;
    }

    if (playerNick && targetNick.toLowerCase() === playerNick.toLowerCase()) {
        showSystemNotification("Nie możesz wysłać prywatnej wiadomości samemu sobie!", "#ff9800", 200, true);
        return;
    }

    let foundId = null;
    let foundPlayer = null;
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (rp && rp.nick && rp.nick.toLowerCase() === targetNick.toLowerCase()) {
            foundId = id;
            foundPlayer = rp;
            break;
        }
    }

    if (!foundPlayer) {
        showSystemNotification(`Nie znaleziono gracza o nicku: ${targetNick}`, "#ff5252", 210, true);
        return;
    }

    sendWhisperPacket(foundId, foundPlayer.nick, msgText);
    addChatMessage(`[Do -> ${foundPlayer.nick}]`, msgText, 'whisper');
}

function submitChatOrCommand() {
    let rawText = commandInputEl.value.trim();
    if (!rawText) {
        closeCommandBar();
        return;
    }

    if (rawText.startsWith('/')) {
        let parts = rawText.split(/\s+/);
        let baseCmd = parts[0].toLowerCase();
        let restArgs = rawText.substring(parts[0].length).trim();

        if (baseCmd === '/pig') {
            spawnAndMountPigCommand();
        } else if (baseCmd === '/czerw' || baseCmd === '/worm' || baseCmd === '/sandworm') {
            toggleSandwormMode();
        } else if (baseCmd === '/unpig') {
            executeUnpigCommand(restArgs);
        } else if (baseCmd === '/gm' || baseCmd === '/gamemode') {
            let modeArg = restArgs.toLowerCase();
            if (modeArg === '1' || modeArg === 'creative' || modeArg === 'c') {
                setPlayerGameMode(1);
            } else if (modeArg === '0' || modeArg === 'survival' || modeArg === 's') {
                setPlayerGameMode(0);
            } else {
                showSystemNotification("Użycie: /gm 1 (Kreatywny) lub /gm 0 (Przetrwanie)", "#ff5252", 210, true);
            }
        } else if (baseCmd === '/msg' || baseCmd === '/w' || baseCmd === '/tell') {
            executeWhisperCommand(restArgs);
        } else {
            showSystemNotification("Brak takiej komendy: " + baseCmd, "#ff5252", 210, true);
        }
    } else {
        addChatMessage(playerNick || "Gracz", rawText, 'chat');
        if (typeof sendChatMessagePacket === 'function') {
            sendChatMessagePacket(rawText, 'chat');
        }
    }

    closeCommandBar();
}

commandInputEl.addEventListener('input', () => {
    activeSuggestionIndex = 0;
    updateCommandSuggestions();
});

chatSendBtnEl.addEventListener('click', () => {
    submitChatOrCommand();
});

window.addEventListener('keydown', e => {
    if (isCommandOpen) {
        if (e.code === 'Tab') {
            e.preventDefault();
            if (currentSuggestions.length > 0) {
                applySuggestion(activeSuggestionIndex);
            }
            return;
        }
        if (e.code === 'ArrowDown' && currentSuggestions.length > 0) {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
            updateCommandSuggestions();
            return;
        }
        if (e.code === 'ArrowUp' && currentSuggestions.length > 0) {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
            updateCommandSuggestions();
            return;
        }
        if (e.code === 'Enter') {
            e.preventDefault();
            submitChatOrCommand();
            return;
        }
        if (e.code === 'Escape') {
            e.preventDefault();
            closeCommandBar();
            return;
        }
        return;
    }

    if (e.code === 'Escape' && contextTargetPlayer) {
        closePlayerContextMenu();
        return;
    }

    // Otwieranie czatu klawiszem [T] podczas rozgrywki
    if (e.code === 'KeyT' && isPlaying && !player.dead && !showInventory) {
        e.preventDefault();
        openChatOrCommandBar('');
        return;
    }

    // Otwieranie paska komend klawiszem [/] podczas rozgrywki
    if ((e.key === '/' || e.code === 'Slash') && isPlaying && !player.dead && !showInventory) {
        e.preventDefault();
        openChatOrCommandBar('/');
        return;
    }

    keys[e.code] = true;

    // Pojedyncze naciśnięcie Left Ctrl przełącza tryb pływania w wodzie
    if (!e.repeat && (e.code === 'ControlLeft' || e.key === 'Control') && player.inWater && !player.dead && !showInventory) {
        player.swimToggle = !player.swimToggle;
        player.isSwimming = player.swimToggle;
    }

    if (e.code === 'KeyE' && isPlaying && !player.dead) {
        closePlayerContextMenu();
        showInventory = !showInventory;
        if (!showInventory && cursorItem) {
            if (player.gameMode !== 1) {
                addToInventory(cursorItem.type, cursorItem.count);
            }
            cursorItem = null;
        }
        isClicking = false;
        isRightClicking = false;
        miningProgress = 0;
    }
    
    if (!showInventory) {
        let num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= HOTBAR_SLOTS) {
            selectedSlotIndex = num - 1;
        }
    }
});

window.addEventListener('keyup', e => {
    keys[e.code] = false;
});

function launchGameLoop() {
    document.getElementById('mainMenu').style.display = 'none';
    cameraX = player.x + player.width / 2 - (canvas.width / SCALE) / 2;
    cameraY = player.y + player.height / 2 - (canvas.height / SCALE) / 2;
    if (!isPlaying) {
        isPlaying = true;
        requestAnimationFrame(gameLoop); 
    }
    // Brak domyślnych komunikatów pomocy na czacie!
    if (isMultiplayerMode && roomCode) {
        updateUrlWithRoomCode(roomCode);
        sendPlayerState();
    } else {
        if (btnCopyInviteEl) btnCopyInviteEl.style.display = 'none';
    }
}

// MENU NAWIGACJA I WALIDACJA NICKU
document.getElementById('btnPlay').addEventListener('click', () => {
    document.getElementById('screen1').style.display = 'none';
    document.getElementById('screen2').style.display = 'flex';
});

document.getElementById('btnSingle').addEventListener('click', () => {
    isMultiplayerMode = false;
    roomCode = null;
    remotePlayers = {};
    document.getElementById('screen2').style.display = 'none';
    document.getElementById('screen3').style.display = 'flex';
    document.getElementById('nickError').innerText = '';
    document.getElementById('nickInput').focus();
});

document.getElementById('btnMulti').addEventListener('click', () => {
    isMultiplayerMode = true;
    document.getElementById('screen2').style.display = 'none';
    document.getElementById('screenMulti').style.display = 'flex';
    document.getElementById('multiStatus').innerText = '';
});

document.getElementById('btnBackFromMulti').addEventListener('click', () => {
    document.getElementById('screenMulti').style.display = 'none';
    document.getElementById('screen2').style.display = 'flex';
});

document.getElementById('btnHostGame').addEventListener('click', () => {
    startHostMultiplayer(() => {
        document.getElementById('screenMulti').style.display = 'none';
        document.getElementById('screen3').style.display = 'flex';
        document.getElementById('nickError').innerText = '';
        document.getElementById('nickInput').focus();
    });
});

document.getElementById('btnJoinGame').addEventListener('click', () => {
    let code = document.getElementById('roomCodeInput').value;
    if (!code.trim()) {
        document.getElementById('multiStatus').innerText = "Wpisz kod pokoju!";
        return;
    }
    joinMultiplayerRoom(code, () => {
        document.getElementById('screenMulti').style.display = 'none';
        document.getElementById('screen3').style.display = 'flex';
        document.getElementById('nickError').innerText = '';
        document.getElementById('nickInput').focus();
    });
});

const nickInputEl = document.getElementById('nickInput');
nickInputEl.addEventListener('input', () => {
    nickInputEl.value = nickInputEl.value.replace(/[^a-zA-Z0-9]/g, '');
});

document.getElementById('btnNextToSkins').addEventListener('click', () => {
    let rawNick = nickInputEl.value.trim();
    const errEl = document.getElementById('nickError');

    if (!/^[a-zA-Z0-9]{4,12}$/.test(rawNick)) {
        errEl.innerText = "Nick musi mieć od 4 do 12 znaków (tylko litery A-Z i cyfry 0-9)!";
        return;
    }

    if (isNickTakenInSession(rawNick)) {
        errEl.innerText = "Ten nick jest już zajęty przez innego gracza w tej sesji!";
        return;
    }

    errEl.innerText = "";
    playerNick = rawNick;
    document.getElementById('screen3').style.display = 'none';
    document.getElementById('screen4').style.display = 'flex';
    initSkinUI();
});

document.getElementById('btnStartGame').addEventListener('click', () => {
    let takenSkins = getTakenSkinsInSession();
    if (isMultiplayerMode && takenSkins.includes(selectedSkinIndex)) {
        document.getElementById('skinError').innerText = "Ten skin został już wybrany przez innego gracza! Wybierz wolny skin.";
        updateSkinAvailabilityUI();
        return;
    }
    if (isMultiplayerMode && isNickTakenInSession(playerNick)) {
        document.getElementById('screen4').style.display = 'none';
        document.getElementById('screen3').style.display = 'flex';
        document.getElementById('nickError').innerText = "Twój nick został zajęty! Wybierz inny.";
        return;
    }
    launchGameLoop();
});

document.getElementById('respawnBtn').addEventListener('click', () => {
    player.hp = player.maxHp; 
    player.dead = false;
    player.x = spawnTileX * TILE_SIZE; 
    player.y = getSurfaceY(spawnTileX);
    player.vx = 0; 
    player.vy = 0; 
    player.fallStartY = player.y; 
    player.damageEffect = 0; 
    player.invulTimer = 60; 
    player.ridingPig = null;
    player.isSandworm = false;
    player.wormSegments = [];
    player.isSwimming = false;
    player.swimToggle = false;
    player.air = player.maxAir;
    player.drownTimer = 0;
    if (!sandworm.isRemote) {
        sandworm.active = false; 
        sandworm.state = 'idle';
    }
    miningX = -1; 
    miningY = -1; 
    miningProgress = 0;
    cameraX = player.x + player.width / 2 - (canvas.width / SCALE) / 2;
    cameraY = player.y + player.height / 2 - (canvas.height / SCALE) / 2;
    
    showInventory = false;
    if (cursorItem) {
        addToInventory(cursorItem.type, cursorItem.count);
        cursorItem = null;
    }
    
    document.getElementById('gameOver').style.display = 'none';
});

canvas.addEventListener('mousemove', e => { 
    const rect = canvas.getBoundingClientRect(); 
    mouseX = e.clientX - rect.left; 
    mouseY = e.clientY - rect.top; 
});

canvas.addEventListener('mousedown', e => { 
    if (isCommandOpen) return;
    if (showInventory) {
        if (e.button === 0 || e.button === 2) {
            handleInventoryClick(e.button);
        }
        return;
    }

    if (e.button === 0) {
        closePlayerContextMenu();
        isClicking = true;
    }
    if (e.button === 2) {
        // Sprawdź czy kliknięto Prawym Przyciskiem Myszy (PPM) w innego gracza -> otwórz okienko interakcji!
        const worldMouseX = (mouseX / SCALE) + cameraX;
        const worldMouseY = (mouseY / SCALE) + cameraY;
        const clickedPlayer = findRemotePlayerAtWorldPos(worldMouseX, worldMouseY);
        if (clickedPlayer && !player.dead) {
            isRightClicking = false;
            openPlayerContextMenu(clickedPlayer.id, clickedPlayer.nick, e.clientX, e.clientY);
            return;
        }
        closePlayerContextMenu();
        isRightClicking = true; 
    }
});

canvas.addEventListener('mouseup', e => { 
    if (e.button === 0) isClicking = false; 
    if (e.button === 2) isRightClicking = false; 
});
canvas.addEventListener('mouseleave', e => { 
    isClicking = false; 
    isRightClicking = false; 
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

function drawPixelHeart(ctx, x, y, size, isFull) {
    const px = size / 8; 
    ctx.save();
    ctx.translate(x, y);
    
    let pattern = [
        ".XX..XX.",
        "XXXXXXXX",
        "XXXXXXXX",
        ".XXXXXX.",
        "..XXXX..",
        "...XX..."
    ];
    
    for(let row=0; row<6; row++) {
        for(let col=0; col<8; col++) {
            if(pattern[row][col] === 'X') {
                let isBorder = (row===0) || (row===5) || 
                               (col===0 && row<4) || (col===7 && row<4) || 
                               (pattern[row][col-1] === '.') || (pattern[row][col+1] === '.') || 
                               (row>0 && pattern[row-1][col] === '.') || 
                               (row<5 && pattern[row+1][col] === '.');
                
                if (isBorder) {
                    ctx.fillStyle = '#000000';
                } else {
                    if(isFull) {
                        if (row===1 && col===2) ctx.fillStyle = '#ff9999';
                        else ctx.fillStyle = '#e74c3c';
                    } else {
                        ctx.fillStyle = '#333333';
                    }
                }
                ctx.fillRect(col*px, row*px, px, px);
            }
        }
    }
    ctx.restore();
}

function drawAirBubble(ctx, x, y, size, isFull) {
    ctx.save();
    ctx.translate(x, y);
    if (isFull) {
        ctx.fillStyle = 'rgba(0, 40, 90, 0.85)';
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(size * 0.28, size * 0.25, 3, 3);
    } else {
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

function drawPigEntity(ctx, px, py, width, height, direction, wingFlap, hasSaddle) {
    ctx.save();
    ctx.translate(px + width / 2, py + height / 2);
    ctx.scale(direction || 1, 1);
    ctx.translate(-width / 2, -height / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.save();
    ctx.translate(width / 2, 0);
    ctx.rotate(Math.sin(wingFlap) * 0.5 - 0.2);
    ctx.beginPath(); ctx.ellipse(0, -6, 4, 10, Math.PI / 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFC0CB'; ctx.fillRect(0, 4, width, height - 4);
    ctx.fillStyle = '#FF69B4'; ctx.fillRect(width - 2, 8, 6, 8);
    ctx.fillStyle = 'black'; ctx.fillRect(width - 6, 6, 3, 3);
    ctx.fillStyle = 'white';
    ctx.save();
    ctx.translate(width / 2 - 2, 2);
    ctx.rotate(Math.sin(wingFlap) * 0.6);
    ctx.beginPath(); ctx.ellipse(0, -8, 5, 12, Math.PI / 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#eee'; ctx.stroke();
    ctx.restore();
    if (hasSaddle) {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(6, 2, 10, 4);
    }
    ctx.restore();
}

function drawSandwormEntity(ctx, headX, headY, segments, radius = 12, numSegments = 15) {
    if (Array.isArray(segments)) {
        for (let i = segments.length - 1; i >= 0; i--) {
            let seg = segments[i];
            if (!seg) continue;
            let segRadius = radius;
            if (i > numSegments - 5) segRadius = radius * (numSegments - i) / 5;
            ctx.fillStyle = '#8B7355';
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, Math.max(segRadius, 2), 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#5C4033';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
    ctx.fillStyle = '#5C4033';
    ctx.beginPath();
    ctx.arc(headX, headY, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(headX, headY, radius - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        let zx = headX + Math.cos(a) * (radius - 2);
        let zy = headY + Math.sin(a) * (radius - 2);
        ctx.fillRect(zx, zy, 2, 2);
    }
}

function draw() {
    ctx.fillStyle = COLORS[BLOCKS.AIR]; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save(); 
    ctx.scale(SCALE, SCALE);
    ctx.translate(-cameraX, -cameraY);

    const startX = Math.max(0, Math.floor(cameraX / TILE_SIZE));
    const endX = Math.min(MAP_WIDTH, Math.ceil((cameraX + canvas.width / SCALE) / TILE_SIZE));
    const startY = Math.max(0, Math.floor(cameraY / TILE_SIZE));
    const endY = Math.min(MAP_HEIGHT, Math.ceil((cameraY + canvas.height / SCALE) / TILE_SIZE));

    for (let x = startX; x < endX; x++) {
        for (let y = startY; y < endY; y++) {
            const block = map[x][y];
            if (block !== BLOCKS.AIR) {
                if (block === BLOCKS.KELP && isSubmergedTile(x, y)) {
                    ctx.drawImage(TEXTURES[BLOCKS.WATER], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }

                if (TEXTURES[block]) {
                    ctx.drawImage(TEXTURES[block], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                } else {
                    ctx.fillStyle = COLORS[block]; 
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
                
                if (block === BLOCKS.WATER && y > 0 && map[x][y - 1] === BLOCKS.AIR) {
                    let waveOffset = Math.sin(globalTick * 0.06 + x * 0.7) * 1.2;
                    ctx.fillStyle = 'rgba(200, 240, 255, 0.65)';
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 1 + waveOffset, TILE_SIZE, 2);
                }

                if (block !== BLOCKS.WATER && block !== BLOCKS.KELP) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; 
                    ctx.lineWidth = 0.5; 
                    ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }

    ctx.fillStyle = 'rgba(220, 248, 255, 0.8)';
    for (let b of waterBubbles) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let sp of splashParticles) {
        ctx.fillStyle = sp.color;
        ctx.fillRect(sp.x, sp.y, sp.size, sp.size);
    }
    
    if (miningX !== -1 && miningY !== -1) {
        let block = getTile(miningX, miningY);
        if (block !== BLOCKS.AIR && BLOCK_HARDNESS[block]) {
            let progressRatio = miningProgress / BLOCK_HARDNESS[block];
            
            ctx.fillStyle = `rgba(0, 0, 0, ${progressRatio * 0.7})`;
            ctx.fillRect(miningX * TILE_SIZE, miningY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            
            ctx.fillStyle = '#000';
            ctx.fillRect(miningX * TILE_SIZE + 2, miningY * TILE_SIZE + TILE_SIZE - 4, TILE_SIZE - 4, 3);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(miningX * TILE_SIZE + 2, miningY * TILE_SIZE + TILE_SIZE - 4, (TILE_SIZE - 4) * progressRatio, 3);
        }
    }

    if (sandworm.active && Array.isArray(sandworm.segments)) {
        drawSandwormEntity(ctx, sandworm.x, sandworm.y, sandworm.segments, sandworm.radius, sandworm.numSegments);
    }

    bombs.forEach(bomb => {
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(bomb.x, bomb.y, bomb.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bomb.x, bomb.y - bomb.radius); ctx.lineTo(bomb.x + 3, bomb.y - bomb.radius - 5); ctx.stroke();
        ctx.fillStyle = 'orange'; ctx.fillRect(bomb.x + 1, bomb.y - bomb.radius - 7, 4, 4);
        ctx.fillStyle = 'yellow'; ctx.fillRect(bomb.x + 2, bomb.y - bomb.radius - 6, 2, 2);
    });

    pigs.forEach(pig => {
        drawPigEntity(ctx, pig.x, pig.y, pig.width, pig.height, pig.direction || 1, pig.wingFlap, player.ridingPig === pig);
    });

    if (!player.dead && !player.isSandworm && !showInventory && !isCommandOpen) {
        const worldMouseX = (mouseX / SCALE) + cameraX;
        const worldMouseY = (mouseY / SCALE) + cameraY;
        const tileX = Math.floor(worldMouseX / TILE_SIZE);
        const tileY = Math.floor(worldMouseY / TILE_SIZE);
        
        const targetCenterX = tileX * TILE_SIZE + TILE_SIZE / 2;
        const targetCenterY = tileY * TILE_SIZE + TILE_SIZE / 2;
        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;
        
        let maxDist = player.ridingPig ? 2.25 * TILE_SIZE : 4.5 * TILE_SIZE;
        const distToPlayer = Math.hypot(targetCenterX - playerCenterX, targetCenterY - playerCenterY);

        if (distToPlayer < maxDist) {
            let targetTile = getTile(tileX, tileY);
            let isTargetMinable = (targetTile !== BLOCKS.AIR && targetTile !== BLOCKS.WATER);
            let canSeeTarget = isBlockVisibleToPlayer(tileX, tileY);
            
            let currentItem = hotbar[selectedSlotIndex];
            let hasItemToPlace = currentItem && currentItem.type !== BLOCKS.AIR && currentItem.count > 0;
            
            if (canSeeTarget) {
                if (isTargetMinable || hasItemToPlace) {
                    ctx.strokeStyle = 'white'; 
                    ctx.lineWidth = 0.5; 
                    ctx.strokeRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            } else if (isTargetMinable) {
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; 
                ctx.lineWidth = 1; 
                ctx.strokeRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.beginPath();
                ctx.moveTo(tileX * TILE_SIZE, tileY * TILE_SIZE);
                ctx.lineTo(tileX * TILE_SIZE + TILE_SIZE, tileY * TILE_SIZE + TILE_SIZE);
                ctx.moveTo(tileX * TILE_SIZE + TILE_SIZE, tileY * TILE_SIZE);
                ctx.lineTo(tileX * TILE_SIZE, tileY * TILE_SIZE + TILE_SIZE);
                ctx.stroke();
            }
        }
    }

    // RYSOWANIE INNYCH GRACZY W TRYBIE MULTIPLAYER (w tym graczy przemienionych w Czerwia /czerw!)
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp || rp.inGame === false) continue;

        if (rp.isSandworm && !rp.dead) {
            drawSandwormEntity(ctx, rp.x + 8, rp.y + 12, rp.wormSegments, sandworm.radius, sandworm.numSegments);
        }

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 2;
        ctx.fillText(rp.nick || "Gracz", rp.x + 8, rp.isSandworm ? rp.y - 11 : rp.y - 9);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';

        if (typeof rp.hp === 'number' && !rp.dead && rp.gameMode !== 1) {
            let hpRatio = Math.max(0, Math.min(1, rp.hp / (rp.maxHp || 5)));
            let barYOffset = rp.isSandworm ? rp.y - 9 : rp.y - 7;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(rp.x - 1, barYOffset, 18, 3);
            ctx.fillStyle = hpRatio > 0.4 ? '#2ecc71' : '#e74c3c';
            ctx.fillRect(rp.x, barYOffset + 0.5, 16 * hpRatio, 2);
        }

        if (!rp.isSandworm) {
            if (rp.isRiding && !rp.dead) {
                let rFlap = (typeof rp.pigWingFlap === 'number' && rp.pigWingFlap !== 0) ? rp.pigWingFlap : (globalTick * 0.45);
                drawPigEntity(ctx, rp.x - 5, rp.y + 20, 26, 18, rp.direction || 1, rFlap, true);
            }

            let rSkin = SKINS[rp.skinIndex] || SKINS[0];
            let rAirborne = !rp.grounded && !rp.dead && !rp.isRiding && !rp.isSwimming;
            drawCharacter(
                ctx,
                rp.x + 8,
                rp.y + 12,
                rp.direction || 1,
                rp.walkFrame || 0,
                rp.dead,
                rp.isRiding,
                rSkin,
                rp.pickaxeAnim,
                rp.isSwimming,
                rAirborne
            );
        }

        if (rp.damageEffect && rp.damageEffect > 0) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.fillRect(rp.x - 4, rp.y, 24, 24);
            rp.damageEffect--;
        }
    }

    // RYSOWANIE WŁASNEJ POSTACI (lub własnego Czerwia po wpisaniu /czerw)
    if (player.isSandworm && !player.dead) {
        drawSandwormEntity(ctx, player.x + player.width / 2, player.y + player.height / 2, player.wormSegments, sandworm.radius, sandworm.numSegments);
    }

    ctx.fillStyle = 'white';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 2; 
    ctx.fillText(playerNick || "Gracz", player.x + player.width / 2, player.isSandworm ? player.y - 8 : player.y - 6);
    ctx.shadowBlur = 0; 
    ctx.textAlign = 'left';

    if (!player.isSandworm) {
        let isAirborne = !player.grounded && !player.dead && !player.ridingPig && !player.inWater;
        let pickaxeAnim = ((isClicking && miningX !== -1) || pvpHitCooldown > 14) && !showInventory && !isCommandOpen ? pickaxeSwing : null;
        
        drawCharacter(
            ctx, 
            player.x + player.width / 2, 
            player.y + player.height / 2, 
            player.direction, 
            player.walkFrame, 
            player.dead, 
            player.ridingPig !== null, 
            SKINS[selectedSkinIndex], 
            pickaxeAnim,
            player.isSwimming,
            isAirborne
        );
    }

    if (player.damageEffect > 0) { 
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; 
        ctx.fillRect(player.x - 4, player.y, 24, 24); 
    } 

    ctx.restore(); 

    // Lekki błękitny filtr ekranu pod wodą
    if (player.headSubmerged && !showInventory) {
        ctx.fillStyle = 'rgba(10, 75, 155, 0.22)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (showInventory) {
        drawInventoryUI(ctx);
    } else {
        // --- HUD BEZPOŚREDNIO NA EKRANIE ---
        let pTx = Math.floor((player.x + player.width / 2) / TILE_SIZE);
        let biomeName = isOceanAt(pTx) ? "Ocean / Morze" : (isDesertAt(pTx) ? "Pustynia" : (biomeMap[pTx] === 'hills' ? "Wzgórza" : (biomeMap[pTx] === 'forest' ? "Las" : "Równiny")));

        ctx.fillStyle = 'white';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'right';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(`Gracz: ${playerNick || "Gracz"} | v${VERSION}`, canvas.width - 30, 40);
        ctx.font = '14px Arial';
        let swimStatus = player.inWater ? (player.isSwimming ? " | Pływanie: WŁ [L-Ctrl]" : " | Pływanie: WYŁ [L-Ctrl]") : "";
        ctx.fillText(`Biom: ${biomeName} | [E] Ekwipunek | [T] Czat${swimStatus}`, canvas.width - 30, 65);

        if (roomCode) {
            let onlineCount = 1 + Object.keys(remotePlayers).length;
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`🌐 Kod Pokoju: ${roomCode} (Gracze: ${onlineCount})`, canvas.width - 30, 90);
        }
        ctx.shadowBlur = 0; 
        ctx.textAlign = 'left';

        if (player.gameMode === 1) {
            // W Trybie Kreatywnym (/gm 1) zamiast serduszek i tlenu wyświetlamy status Nieśmiertelności
            ctx.save();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
            ctx.fillRect(26, 24, 330, 36);
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 2;
            ctx.strokeRect(26, 24, 330, 36);
            ctx.fillStyle = '#fde047';
            ctx.font = 'bold 15px Arial';
            ctx.fillText("✨ TRYB KREATYWNY — Nieśmiertelność [E]", 38, 47);
            ctx.restore();
        } else {
            // Tryb Przetrwania (/gm 0) - Serca HP oraz Pasek Powietrza
            for (let i = 0; i < player.maxHp; i++) {
                let hx = 30 + i * 32; 
                let hy = 30;
                drawPixelHeart(ctx, hx, hy, 28, i < player.hp);
            }

            if (player.headSubmerged || player.air < player.maxAir) {
                const totalBubbles = 10;
                const fullBubbles = Math.ceil((player.air / player.maxAir) * totalBubbles);
                for (let i = 0; i < totalBubbles; i++) {
                    let bx = 30 + i * 22;
                    let by = 66;
                    drawAirBubble(ctx, bx, by, 18, i < fullBubbles);
                }
            }
        }

        let HUD_SLOT_SIZE = 60;
        let barWidth = HOTBAR_SLOTS * HUD_SLOT_SIZE; 
        let barX = (canvas.width - barWidth) / 2;
        let barY = canvas.height - HUD_SLOT_SIZE - 20;
        
        ctx.fillStyle = '#8B8B8B'; 
        ctx.fillRect(barX - 4, barY - 4, barWidth + 8, HUD_SLOT_SIZE + 8);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX - 4, barY - 4, barWidth + 8, HUD_SLOT_SIZE + 8);
        
        for (let i = 0; i < HOTBAR_SLOTS; i++) {
            let slotX = barX + i * HUD_SLOT_SIZE;
            let slotY = barY;
            let item = hotbar[i];
            let isSelected = (i === selectedSlotIndex);

            ctx.fillStyle = '#373737'; 
            ctx.fillRect(slotX + 2, slotY + 2, HUD_SLOT_SIZE - 4, HUD_SLOT_SIZE - 4);
            ctx.fillStyle = '#8B8B8B'; 
            ctx.fillRect(slotX + 4, slotY + 4, HUD_SLOT_SIZE - 6, HUD_SLOT_SIZE - 6);
            
            if (isSelected) {
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 4;
                ctx.strokeRect(slotX, slotY, HUD_SLOT_SIZE, HUD_SLOT_SIZE);
            }

            if (item !== null) {
                ctx.save();
                ctx.translate(slotX + 15, slotY + 15);
                
                if (TEXTURES[item.type]) {
                    ctx.drawImage(TEXTURES[item.type], 0, 0, 30, 30);
                } else {
                    ctx.fillStyle = COLORS[item.type]; 
                    ctx.fillRect(0, 0, 30, 30); 
                }
                
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2; 
                ctx.strokeRect(0, 0, 30, 30);
                ctx.restore();
                
                ctx.fillStyle = (player.gameMode === 1) ? '#fde047' : 'white'; 
                ctx.font = (player.gameMode === 1) ? 'bold 18px Arial' : 'bold 16px Arial'; 
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 3;
                
                ctx.textAlign = 'right';
                ctx.fillText((player.gameMode === 1) ? '∞' : item.count, slotX + HUD_SLOT_SIZE - 6, slotY + HUD_SLOT_SIZE - 6);
                ctx.textAlign = 'left';
                
                ctx.shadowBlur = 0;
            }
            
            ctx.fillStyle = '#ddd'; 
            ctx.font = '12px Arial'; 
            ctx.shadowColor = 'black'; ctx.shadowBlur = 2;
            ctx.fillText(i + 1, slotX + 5, slotY + 15);
            ctx.shadowBlur = 0;
        }
    }
}

draw();

function gameLoop() { 
    if (isPlaying) {
        updateEntities(); 
    }
    draw(); 
    requestAnimationFrame(gameLoop); 
}

// ==========================================
// OBSŁUGA LINKÓW ZAPROSZENIA (?room=KOD)
// ==========================================
const btnCopyInviteEl = document.getElementById('btnCopyInviteLink');
const inviteBannerEl = document.getElementById('inviteBanner');
const inviteBannerTextEl = document.getElementById('inviteBannerText');
const btnQuickJoinInviteEl = document.getElementById('btnQuickJoinInvite');

function getUrlRoomParam() {
    try {
        const params = new URLSearchParams(window.location.search);
        const r = params.get('room');
        if (r && r.trim()) {
            return r.trim().replace(/[^0-9a-zA-Z]/g, '');
        }
    } catch (e) {}
    return null;
}

function updateUrlWithRoomCode(code) {
    if (!code) return;
    try {
        if (window.location.protocol !== 'file:') {
            const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + code;
            window.history.replaceState({ path: newUrl }, '', newUrl);
        }
    } catch (e) {}
    if (btnCopyInviteEl) {
        btnCopyInviteEl.style.display = 'block';
    }
}

if (btnCopyInviteEl) {
    btnCopyInviteEl.addEventListener('click', () => {
        if (!roomCode) return;
        let baseUrl = window.location.href.split('?')[0].split('#')[0];
        let inviteUrl = baseUrl + '?room=' + roomCode;

        if (window.location.protocol === 'file:') {
            showSystemNotification(`Kod pokoju: ${roomCode} (Aby wysłać klikalny link, uruchom serwer lub wrzuć grę na hosting!)`, '#ffeb3b', 260, true);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(inviteUrl).then(() => {
                showSystemNotification(`🔗 Skopiowano link zaproszenia: ${inviteUrl}`, '#4caf50', 220, true);
            }).catch(() => {
                prompt("Skopiuj poniższy link zaproszenia dla znajomych:", inviteUrl);
            });
        } else {
            prompt("Skopiuj poniższy link zaproszenia dla znajomych:", inviteUrl);
        }
    });
}

const initialUrlRoom = getUrlRoomParam();
if (initialUrlRoom && inviteBannerEl && inviteBannerTextEl && btnQuickJoinInviteEl) {
    inviteBannerEl.style.display = 'block';
    inviteBannerTextEl.innerText = `🔗 Otrzymałeś zaproszenie do pokoju #${initialUrlRoom}!`;
    const roomInput = document.getElementById('roomCodeInput');
    if (roomInput) roomInput.value = initialUrlRoom;

    btnQuickJoinInviteEl.addEventListener('click', () => {
        isMultiplayerMode = true;
        document.getElementById('screen1').style.display = 'none';
        document.getElementById('screenMulti').style.display = 'flex';
        joinMultiplayerRoom(initialUrlRoom, () => {
            updateUrlWithRoomCode(initialUrlRoom);
            document.getElementById('screenMulti').style.display = 'none';
            document.getElementById('screen3').style.display = 'flex';
            document.getElementById('nickError').innerText = '';
            document.getElementById('nickInput').focus();
        });
    });
}
