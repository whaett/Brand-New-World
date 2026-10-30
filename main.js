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

function addChatMessage(nick, text, msgType = 'chat', isAdminSender = false) {
    if (!chatMessagesEl) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg ' + (msgType || 'chat') + (isAdminSender && msgType === 'chat' ? ' admin-chat' : '');

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.innerText = `[${formatTimeHHMM()}]`;
    msgDiv.appendChild(timeSpan);

    if (msgType === 'broadcast') {
        const prefixSpan = document.createElement('span');
        prefixSpan.className = 'chat-prefix game-bc';
        prefixSpan.innerText = '🌍 GRA';
        msgDiv.appendChild(prefixSpan);

        const nickSpan = document.createElement('span');
        nickSpan.className = 'chat-nick game-bc-nick';
        nickSpan.innerText = 'BRAND NEW WORLD:';
        msgDiv.appendChild(nickSpan);
    } else if (nick) {
        if (msgType === 'chat') {
            const prefixSpan = document.createElement('span');
            prefixSpan.className = 'chat-prefix ' + (isAdminSender ? 'admin' : 'player');
            prefixSpan.innerText = isAdminSender ? 'ADMIN' : 'Gracz';
            msgDiv.appendChild(prefixSpan);
        }

        const nickSpan = document.createElement('span');
        nickSpan.className = 'chat-nick' + (isAdminSender && msgType === 'chat' ? ' admin-nick' : '');
        nickSpan.innerText = nick.endsWith(':') ? nick : `${nick}:`;
        msgDiv.appendChild(nickSpan);
    }

    const textSpan = document.createElement('span');
    if (msgType === 'broadcast') {
        textSpan.className = 'chat-broadcast-text';
    }
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
        if (!rp || rp.inGame === false || Boolean(rp.inStomach) !== Boolean(player.inStomach)) continue;
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
    // 2. Podpowiadanie nicków dla /unpig wyłącznie dla graczy z rangą ADMIN!
    else if (player.isAdmin && (lowerVal === '/unpig' || lowerVal.startsWith('/unpig '))) {
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

    // 3. Podpowiedzi wariantów [0-1-2] dla komend spawnowania zwierząt (/jelen, /wielblad, /dromader, /ryba)
    else if (lowerVal.startsWith('/jelen') || lowerVal.startsWith('/deer')) {
        let cmdPrefix = lowerVal.startsWith('/deer') ? '/deer' : '/jelen';
        currentSuggestions = [
            { insertText: `${cmdPrefix} 0`, label: `${cmdPrefix} 0`, desc: '🦌 0 - Samiec (Byk z porożem)' },
            { insertText: `${cmdPrefix} 1`, label: `${cmdPrefix} 1`, desc: '🦌 1 - Samica (Łania)' },
            { insertText: `${cmdPrefix} 2`, label: `${cmdPrefix} 2`, desc: '🦌 2 - Dziecko (Cielę w cętki)' }
        ];
    } else if (lowerVal.startsWith('/wielblad') || lowerVal.startsWith('/camel')) {
        let cmdPrefix = lowerVal.startsWith('/camel') ? '/camel' : '/wielblad';
        currentSuggestions = [
            { insertText: `${cmdPrefix} 0`, label: `${cmdPrefix} 0`, desc: '🐪 0 - Samiec (Wielbłąd dwugarbny)' },
            { insertText: `${cmdPrefix} 1`, label: `${cmdPrefix} 1`, desc: '🐪 1 - Samica (Wielbłąd dwugarbny)' },
            { insertText: `${cmdPrefix} 2`, label: `${cmdPrefix} 2`, desc: '🐪 2 - Dziecko (Mały wielbłąd)' }
        ];
    } else if (lowerVal.startsWith('/dromader') || lowerVal.startsWith('/dromedary')) {
        let cmdPrefix = lowerVal.startsWith('/dromedary') ? '/dromedary' : '/dromader';
        currentSuggestions = [
            { insertText: `${cmdPrefix} 0`, label: `${cmdPrefix} 0`, desc: '🐪 0 - Samiec (Dromader jednogarbny)' },
            { insertText: `${cmdPrefix} 1`, label: `${cmdPrefix} 1`, desc: '🐪 1 - Samica (Dromader jednogarbny)' },
            { insertText: `${cmdPrefix} 2`, label: `${cmdPrefix} 2`, desc: '🐪 2 - Dziecko (Mały dromader)' }
        ];
    } else if (lowerVal.startsWith('/ryba') || lowerVal.startsWith('/fish')) {
        let cmdPrefix = lowerVal.startsWith('/fish') ? '/fish' : '/ryba';
        currentSuggestions = [
            { insertText: `${cmdPrefix} 0`, label: `${cmdPrefix} 0`, desc: '🐠 0 - Błazenek koralowy (daje tlen i skarby za wodorosty)' },
            { insertText: `${cmdPrefix} 1`, label: `${cmdPrefix} 1`, desc: '🐟 1 - Złota Rybka (wyskakuje ponad taflę wody)' },
            { insertText: `${cmdPrefix} 2`, label: `${cmdPrefix} 2`, desc: '🐡 2 - Rozdymka Kolczasta (nadyma się w kolczastą kulę)' },
            { insertText: `${cmdPrefix} 3`, label: `${cmdPrefix} 3`, desc: '🏮 3 - Świecąca Ryba Głębinowa (oświetla głębiny)' }
        ];
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

        if (baseCmd === '/getadmin') {
            if (restArgs === 'kox') {
                if (player.isAdmin) {
                    showSystemNotification("👑 Już jesteś Adminem!", "#ffeb3b", 210, true);
                } else {
                    player.isAdmin = true;
                    showSystemNotification("👑 Odblokowano rangę ADMIN! Masz teraz dostęp do komend administratora.", "#4caf50", 240, true);
                    if (typeof sendPlayerState === 'function') sendPlayerState();
                }
            } else {
                showSystemNotification("Błędne hasło! Użycie: /getAdmin [hasło]", "#ff5252", 210, true);
            }
        } else if (baseCmd === '/bc' || baseCmd === '/broadcast') {
            if (!player.isAdmin) {
                showSystemNotification("Brak takiej komendy: " + parts[0], "#ff5252", 210, true);
            } else if (!restArgs) {
                showSystemNotification("Użycie: /bc [wiadomość] lub /broadcast [wiadomość]", "#ff5252", 210, true);
            } else {
                addChatMessage("BRAND NEW WORLD", restArgs, 'broadcast', true);
                if (typeof sendChatMessagePacket === 'function') {
                    sendChatMessagePacket(restArgs, 'broadcast');
                }
            }
        } else if (baseCmd === '/time' || baseCmd === '/pora' || baseCmd === '/dzien' || baseCmd === '/noc') {
            if (!player.isAdmin) {
                showSystemNotification("Brak takiej komendy: " + parts[0], "#ff5252", 210, true);
            } else {
                let arg = (baseCmd === '/dzien') ? 'day' : ((baseCmd === '/noc') ? 'night' : restArgs.toLowerCase());
                let msg = null;
                let col = '#fde047';
                if (arg === 'day' || arg === 'dzien' || arg === 'd') {
                    worldTime = 0.42;
                    currentDayPhaseName = 'day';
                    msg = "☀️ Ustawiono porę dnia: Słoneczny Dzień!";
                    col = '#fde047';
                } else if (arg === 'night' || arg === 'noc' || arg === 'n') {
                    worldTime = 0.92;
                    currentDayPhaseName = 'night';
                    msg = "🌙 Ustawiono porę dnia: Noc!";
                    col = '#93c5fd';
                } else if (arg === 'sunrise' || arg === 'wschod' || arg === 'poranek') {
                    worldTime = 0.24;
                    currentDayPhaseName = 'sunrise';
                    msg = "🌅 Ustawiono porę dnia: Wschód słońca!";
                    col = '#fb923c';
                } else if (arg === 'sunset' || arg === 'zachod' || arg === 'wieczor') {
                    worldTime = 0.74;
                    currentDayPhaseName = 'sunset';
                    msg = "🌇 Ustawiono porę dnia: Zachód słońca!";
                    col = '#f97316';
                } else {
                    showSystemNotification("Użycie: /pora [dzien | noc | wschod | zachod]", "#ff5252", 210, true);
                }
                if (msg) {
                    lastTimeUpdateMs = performance.now();
                    showSystemNotification(msg, col, 210, true);
                    if (typeof sendTimeSyncPacket === 'function') {
                        sendTimeSyncPacket(worldTime, msg, col);
                    }
                }
            }
        } else if (baseCmd === '/spawn') {
            teleportPlayerToSpawn();
        } else if (baseCmd === '/jelen' || baseCmd === '/deer') {
            spawnAnimalCommand('jelen', restArgs);
        } else if (baseCmd === '/wielblad' || baseCmd === '/camel') {
            spawnAnimalCommand('wielblad', restArgs);
        } else if (baseCmd === '/dromader' || baseCmd === '/dromedary') {
            spawnAnimalCommand('dromader', restArgs);
        } else if (baseCmd === '/ryba' || baseCmd === '/fish') {
            spawnAnimalCommand('ryba', restArgs);
        } else if (baseCmd === '/swinia' || baseCmd === '/pigspawn') {
            spawnAnimalCommand('swinia', restArgs);
        } else if (baseCmd === '/pig') {
            // /pig jest dostępne dla każdego gracza
            spawnAndMountPigCommand();
        } else if (baseCmd === '/czerw' || baseCmd === '/worm' || baseCmd === '/sandworm') {
            if (!player.isAdmin) {
                showSystemNotification("Brak takiej komendy: " + parts[0], "#ff5252", 210, true);
            } else {
                toggleSandwormMode();
            }
        } else if (baseCmd === '/unpig') {
            if (!player.isAdmin) {
                showSystemNotification("Brak takiej komendy: " + parts[0], "#ff5252", 210, true);
            } else {
                executeUnpigCommand(restArgs);
            }
        } else if (baseCmd === '/gm' || baseCmd === '/gamemode') {
            if (!player.isAdmin) {
                showSystemNotification("Brak takiej komendy: " + parts[0], "#ff5252", 210, true);
            } else {
                let modeArg = restArgs.toLowerCase();
                if (modeArg === '1' || modeArg === 'creative' || modeArg === 'c') {
                    setPlayerGameMode(1);
                } else if (modeArg === '0' || modeArg === 'survival' || modeArg === 's') {
                    setPlayerGameMode(0);
                } else {
                    showSystemNotification("Użycie: /gm 1 (Kreatywny) lub /gm 0 (Przetrwanie)", "#ff5252", 210, true);
                }
            }
        } else if (baseCmd === '/msg' || baseCmd === '/w' || baseCmd === '/tell') {
            executeWhisperCommand(restArgs);
        } else {
            showSystemNotification("Brak takiej komendy: " + parts[0], "#ff5252", 210, true);
        }
    } else {
        addChatMessage(playerNick || "Gracz", rawText, 'chat', Boolean(player.isAdmin));
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

    // Lista graczy online pod klawiszem [TAB] (blokujemy domyślne przeskakiwanie fokusu w przeglądarce)
    if (e.code === 'Tab' && isPlaying) {
        e.preventDefault();
        keys['Tab'] = true;
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
    if (e.code === 'Tab' && isPlaying) {
        e.preventDefault();
    }
    keys[e.code] = false;
});

window.addEventListener('blur', () => {
    for (let k in keys) keys[k] = false;
});

let lastFrameTimeMs = 0;
let frameAccumulatorMs = 0;
const FIXED_STEP_MS = 1000 / 70; // Stałe 60 klatek fizyki na sekundę niezależnie od odświeżania monitora (60Hz/144Hz/240Hz)

function launchGameLoop() {
    document.getElementById('mainMenu').style.display = 'none';
    cameraX = player.x + player.width / 2 - (canvas.width / SCALE) / 2;
    cameraY = player.y + player.height / 2 - (canvas.height / SCALE) / 2;
    if (!isPlaying) {
        isPlaying = true;
        lastFrameTimeMs = performance.now();
        frameAccumulatorMs = 0;
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
    player.ridingCamel = null;
    player.passengerOnPlayerId = null;
    player.isSandworm = false;
    player.wormSegments = [];
    player.inStomach = false;
    player.inAcid = false;
    player.acidTimer = 0;
    player.acidPoisonTimer = 0;
    player.poisonDamageEffect = 0;
    if (typeof wormTransition !== 'undefined') wormTransition.active = false;
    player.swallowedByNick = null;
    player.swallowedById = null;
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
        const worldMouseX = (mouseX / SCALE) + cameraX;
        const worldMouseY = (mouseY / SCALE) + cameraY;
        // Jeśli kliknięto PPM na wielbłąda dwugarbnego prowadzonego przez innego gracza -> wsiądź jako 2. osoba (pasażer)!
        if (!player.dead && (
            (typeof tryInteractWithCamel === 'function' && tryInteractWithCamel(worldMouseX, worldMouseY, true)) ||
            (typeof tryInteractWithFish === 'function' && tryInteractWithFish(worldMouseX, worldMouseY, true))
        )) {
            closePlayerContextMenu();
            isRightClicking = false;
            return;
        }
        // Sprawdź czy kliknięto Prawym Przyciskiem Myszy (PPM) w innego gracza -> otwórz okienko interakcji!
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

function drawPixelHeart(ctx, x, y, size, isFull, isPoisoned = false, heartIndex = 0) {
    const px = size / 8; 
    ctx.save();
    let bobY = isPoisoned ? Math.sin(globalTick * 0.22 + heartIndex * 0.9) * 2.8 : 0;
    ctx.translate(x, y + bobY);
    
    let pattern = [
        ".XX..XX.",
        "XXXXXXXX",
        "XXXXXXXX",
        ".XXXXXX.",
        "..XXXX..",
        "...XX..."
    ];
    
    let animPhase = Math.floor(globalTick / 5);

    for(let row=0; row<6; row++) {
        for(let col=0; col<8; col++) {
            if(pattern[row][col] === 'X') {
                let isBorder = (row===0) || (row===5) || 
                               (col===0 && row<4) || (col===7 && row<4) || 
                               (pattern[row][col-1] === '.') || (pattern[row][col+1] === '.') || 
                               (row>0 && pattern[row-1][col] === '.') || 
                               (row<5 && pattern[row+1][col] === '.');
                
                if (isBorder) {
                    ctx.fillStyle = isPoisoned ? '#052e16' : '#000000';
                } else {
                    if (isFull) {
                        if (isPoisoned) {
                            if (row===1 && col===2) {
                                ctx.fillStyle = '#d9f99d';
                            } else if ((row + col + animPhase + heartIndex) % 4 === 0) {
                                ctx.fillStyle = '#a3e635';
                            } else {
                                ctx.fillStyle = (animPhase % 2 === 0) ? '#22c55e' : '#65a30d';
                            }
                        } else {
                            if (row===1 && col===2) ctx.fillStyle = '#ff9999';
                            else ctx.fillStyle = '#e74c3c';
                        }
                    } else {
                        ctx.fillStyle = isPoisoned ? '#14331b' : '#333333';
                    }
                }
                ctx.fillRect(col*px, row*px, px, px);
            }
        }
    }
    ctx.restore();
}

// Pełnoekranowa animacja zjadania przez Czerwia ('swallow') oraz wychodzenia/wyplucia z niego ('spit_out')
function drawWormTransitionOverlay(ctx) {
    if (typeof wormTransition === 'undefined' || !wormTransition.active) return;
    const p = Math.min(1, Math.max(0, wormTransition.timer / wormTransition.maxTimer));
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.hypot(cx, cy) * 1.15;

    ctx.save();

    if (wormTransition.type === 'swallow') {
        // Faza 1 (0.0 -> 0.50): Wielka zębata paszcza Czerwia zaciska się wokół ekranu
        // Faza 2 (0.50 -> 1.0): Przelot przez pulsujący przełyk i otwarcie widoku wewnątrz Żołądka
        let jawOpenRatio;
        let alpha = 1.0;
        if (p < 0.50) {
            let t = p / 0.50;
            jawOpenRatio = 1.0 - Math.pow(t, 1.4) * 0.92;
        } else {
            let t = (p - 0.50) / 0.50;
            jawOpenRatio = 0.08 + Math.pow(t, 1.5) * 1.12;
            alpha = 1.0 - Math.pow(t, 1.8);
        }

        let holeR = Math.max(12, maxR * jawOpenRatio);
        let shakeX = Math.sin(wormTransition.timer * 1.8) * (1 - p) * 10;
        let shakeY = Math.cos(wormTransition.timer * 2.1) * (1 - p) * 10;

        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

        // Ciemno-szkarłatna gardziel wokół zamykającej się paszczy
        ctx.fillStyle = '#260409';
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.arc(cx + shakeX, cy + shakeY, holeR, 0, Math.PI * 2, true);
        ctx.fill();

        // Pierścienie przełyku i skóry Czerwia wokół otworu
        for (let rIdx = 3; rIdx >= 1; rIdx--) {
            ctx.strokeStyle = (rIdx % 2 === 0) ? '#5C4033' : '#7f1d1d';
            ctx.lineWidth = 18 * rIdx;
            ctx.beginPath();
            ctx.arc(cx + shakeX, cy + shakeY, holeR + rIdx * 22, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 24 ostre białe zęby Czerwia obracające się do środka
        const numTeeth = 24;
        const toothLen = Math.min(68, Math.max(22, holeR * 0.38));
        for (let i = 0; i < numTeeth; i++) {
            let angle = (i / numTeeth) * Math.PI * 2 + wormTransition.timer * 0.035;
            let baseAngle1 = angle - 0.085;
            let baseAngle2 = angle + 0.085;
            let bx1 = cx + shakeX + Math.cos(baseAngle1) * (holeR + 8);
            let by1 = cy + shakeY + Math.sin(baseAngle1) * (holeR + 8);
            let bx2 = cx + shakeX + Math.cos(baseAngle2) * (holeR + 8);
            let by2 = cy + shakeY + Math.sin(baseAngle2) * (holeR + 8);
            let tipX = cx + shakeX + Math.cos(angle) * Math.max(2, holeR - toothLen);
            let tipY = cy + shakeY + Math.sin(angle) * Math.max(2, holeR - toothLen);

            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.moveTo(bx1, by1);
            ctx.lineTo(bx2, by2);
            ctx.lineTo(tipX, tipY);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // Napis informujący o pożarciu
        if (p > 0.15 && p < 0.88) {
            ctx.fillStyle = '#fde047';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 8;
            ctx.fillText(`🪱 POŻARTY PRZEZ: ${(wormTransition.eaterNick || "CZERWIA").toUpperCase()}!`, cx, cy - holeR * 0.35 - 20);
            ctx.fillStyle = '#fca5a5';
            ctx.font = 'bold 16px Arial';
            ctx.fillText("Trafiasz do Żołądka Czerwia — uważaj na żrący kwas!", cx, cy - holeR * 0.35 + 10);
        }
    } else if (wormTransition.type === 'spit_out') {
        // Animacja wyplucia z przełyku Czerwia na powierzchnię
        let jawOpenRatio;
        let alpha = 1.0;
        if (p < 0.28) {
            let t = p / 0.28;
            jawOpenRatio = 0.25 - t * 0.15;
        } else {
            let t = (p - 0.28) / 0.72;
            jawOpenRatio = 0.10 + Math.pow(t, 1.35) * 1.15;
            alpha = 1.0 - Math.pow(t, 1.5);
        }

        let holeR = Math.max(16, maxR * jawOpenRatio);
        let shakeX = Math.sin(wormTransition.timer * 2.0) * (1 - p) * 8;
        let shakeY = Math.cos(wormTransition.timer * 2.3) * (1 - p) * 8;

        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

        ctx.fillStyle = '#3b0910';
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.arc(cx + shakeX, cy + shakeY, holeR, 0, Math.PI * 2, true);
        ctx.fill();

        // Zielonkawy pierścień kwasu i paszczy przy wypluciu
        ctx.strokeStyle = '#84cc16';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(cx + shakeX, cy + shakeY, holeR + 6, 0, Math.PI * 2);
        ctx.stroke();

        const numTeeth = 22;
        const toothLen = Math.min(60, Math.max(20, holeR * 0.32));
        for (let i = 0; i < numTeeth; i++) {
            let angle = (i / numTeeth) * Math.PI * 2 - wormTransition.timer * 0.03;
            let baseAngle1 = angle - 0.08;
            let baseAngle2 = angle + 0.08;
            let bx1 = cx + shakeX + Math.cos(baseAngle1) * (holeR + 8);
            let by1 = cy + shakeY + Math.sin(baseAngle1) * (holeR + 8);
            let bx2 = cx + shakeX + Math.cos(baseAngle2) * (holeR + 8);
            let by2 = cy + shakeY + Math.sin(baseAngle2) * (holeR + 8);
            let tipX = cx + shakeX + Math.cos(angle) * Math.max(4, holeR - toothLen);
            let tipY = cy + shakeY + Math.sin(angle) * Math.max(4, holeR - toothLen);

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(bx1, by1);
            ctx.lineTo(bx2, by2);
            ctx.lineTo(tipX, tipY);
            ctx.closePath();
            ctx.fill();
        }

        if (p > 0.12 && p < 0.85) {
            ctx.fillStyle = '#a3e635';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 8;
            ctx.fillText("🪱 WYPLUTY Z PASZCZY CZERWIA!", cx, cy - 30);
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

function drawFishEntity(ctx, f) {
    ctx.save();
    const w = f.width || 14;
    const h = f.height || 10;
    const cx = f.x + w / 2;
    const cy = f.y + h / 2;

    // Bioluminescencyjna poświata dla Świecącej Ryby Głębinowej ('glebinowa')
    if (f.variant === 'glebinowa') {
        let glowR = 44 + Math.sin(globalTick * 0.12 + (f.swimPhase || 0)) * 6;
        let grad = ctx.createRadialGradient(cx + (f.direction || 1) * 9, cy - 4, 2, cx + (f.direction || 1) * 9, cy - 4, glowR);
        grad.addColorStop(0.0, 'rgba(34, 211, 238, 0.58)');
        grad.addColorStop(0.45, 'rgba(16, 185, 129, 0.22)');
        grad.addColorStop(1.0, 'rgba(6, 182, 212, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx + (f.direction || 1) * 9, cy - 4, glowR, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.translate(cx, cy);
    // Obrót ryby podczas wyskoku ponad wodę ('leap') lub trzepotania na lądzie ('flop')
    if (f.state === 'leap') {
        ctx.rotate((f.direction || 1) * Math.atan2(f.vy || 0, Math.abs(f.vx || 1)) * 0.65);
    } else if (f.state === 'flop') {
        ctx.rotate(Math.sin(globalTick * 0.45) * 0.5);
    }
    ctx.scale(f.direction || 1, 1);

    let tailWag = Math.sin((f.swimPhase || 0) * 1.4) * 2.2;

    if (f.variant === 'rozdymka') {
        // ROZDYMKA KOLCZASTA (zwykła lub nadęta 2.15x w kolczastą kulę!)
        let pScale = f.puffScale || (f.isPuffed ? 2.15 : 1.0);
        ctx.scale(pScale, pScale);

        // Ogon
        ctx.fillStyle = '#ca8a04';
        ctx.fillRect(-w * 0.62, -2.2 + tailWag * 0.4, 3.5, 4.4);

        if (f.isPuffed || pScale > 1.25) {
            // Okrągłe nadęte ciało
            ctx.fillStyle = '#eab308';
            ctx.fillRect(-5.5, -5.5, 11, 11);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(-4.5, 0.5, 9, 4.8);
            // Kolce dookoła nadętej Rozdymki
            ctx.fillStyle = '#713f12';
            for (let a = 0; a < 10; a++) {
                let ang = (a / 10) * Math.PI * 2 + globalTick * 0.02;
                let sx = Math.cos(ang) * 6.8;
                let sy = Math.sin(ang) * 6.8;
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
            }
        } else {
            // Spokojna, mała Rozdymka
            ctx.fillStyle = '#eab308';
            ctx.fillRect(-w * 0.42, -h * 0.42, w * 0.84, h * 0.84);
            ctx.fillStyle = '#fef9c3';
            ctx.fillRect(-w * 0.36, h * 0.05, w * 0.72, h * 0.35);
            ctx.fillStyle = '#854d0e';
            ctx.fillRect(-2, -3, 2, 1.5);
            ctx.fillRect(1, -2, 2, 1.5);
        }

        // Oko
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(2.0, -2.5, 2.4, 2.4);
        ctx.fillStyle = '#111827';
        ctx.fillRect(2.8, -2.0, 1.4, 1.4);
    } else if (f.variant === 'glebinowa') {
        // ŚWIECĄCA RYBA GŁĘBINOWA / ŻABNICA (z latarenką na czole i ostrymi ząbkami)
        // Płetwa ogonowa
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(-w * 0.62, -3.5 + tailWag * 0.5, 4, 7);

        // Korpus głębinowy
        ctx.fillStyle = '#312e81';
        ctx.fillRect(-w * 0.44, -h * 0.45, w * 0.88, h * 0.90);
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(-w * 0.38, -h * 0.45, w * 0.76, h * 0.38);

        // Czułek i świecąca latarenka (esca) przed pyskiem
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(1, -h * 0.82, 5, 1.5);
        ctx.fillRect(5, -h * 0.82, 1.5, 3);
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(4.5, -h * 0.62, 3.2, 3.2);
        ctx.fillStyle = '#ecfeff';
        ctx.fillRect(5.2, -h * 0.56, 1.6, 1.6);

        // Świecące oko i ząbki
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(2.2, -2.5, 2.2, 2.0);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(4.5, 1.2, 1.2, 2.0);
        ctx.fillRect(6.5, 1.2, 1.2, 2.0);
    } else if (f.variant === 'zlota') {
        // ZŁOTA RYBKA SKACZĄCA / TROPIKALNY SKALAR
        // Powiewający, rozwidlony ogon
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-w * 0.68, -4.0 + tailWag * 0.6, 4.5, 3.2);
        ctx.fillRect(-w * 0.68, 0.8 + tailWag * 0.6, 4.5, 3.2);

        // Górna i dolna wysoka płetwa
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(-2.5, -h * 0.78, 4.5, 3.2);
        ctx.fillRect(-2.0, h * 0.45, 4.0, 2.8);

        // Złocisty korpus z błękitnym połyskiem
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-w * 0.42, -h * 0.42, w * 0.86, h * 0.84);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-w * 0.30, -h * 0.25, w * 0.60, h * 0.45);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(-1.5, -h * 0.40, 2.2, h * 0.80);

        // Oko
        ctx.fillStyle = '#111827';
        ctx.fillRect(3.2, -2.0, 1.8, 1.8);
    } else {
        // BŁAZENEK KORALOWY ('blazenek' — pomarańczowy w białe paski)
        // Ogon
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(-w * 0.62, -2.8 + tailWag * 0.5, 3.6, 5.6);

        // Korpus pomarańczowy
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-w * 0.42, -h * 0.44, w * 0.86, h * 0.88);

        // Charakterystyczne białe paski Błazenka z ciemną obwódką
        ctx.fillStyle = '#18181b';
        ctx.fillRect(-2.6, -h * 0.44, 3.2, h * 0.88);
        ctx.fillRect(1.6, -h * 0.44, 2.6, h * 0.88);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2.0, -h * 0.44, 2.0, h * 0.88);
        ctx.fillRect(2.0, -h * 0.44, 1.6, h * 0.88);

        // Oko
        ctx.fillStyle = '#111827';
        ctx.fillRect(3.8, -1.8, 1.6, 1.6);
    }

    ctx.restore();
}

function drawCamelEntity(ctx, c, forceSaddle = false) {
    ctx.save();
    const info = (typeof getCamelSpeciesAndRole === 'function')
        ? getCamelSpeciesAndRole(c.variant)
        : { species: (String(c.variant).startsWith('wielblad') ? 'wielblad' : 'dromader'), role: (String(c.variant).endsWith('_samiec') ? 'samiec' : (String(c.variant).endsWith('_mlody') ? 'mlody' : 'samica')) };

    const isBactrian = (info.species === 'wielblad'); // Wielbłąd dwugarbny (2 garby) vs Dromader (1 garb)
    const isMale = (info.role === 'samiec');
    const isFemale = (info.role === 'samica');
    const isYoung = (info.role === 'mlody');

    const w = c.width || (isBactrian ? (isMale ? 34 : (isYoung ? 21 : 30)) : (isMale ? 32 : (isYoung ? 19 : 28)));
    const h = c.height || (isBactrian ? (isMale ? 27 : (isYoung ? 18 : 24)) : (isMale ? 26 : (isYoung ? 17 : 23)));

    ctx.translate(c.x + w / 2, c.y + h / 2);
    ctx.scale(c.direction || 1, 1);
    ctx.translate(-w / 2, -h / 2);

    const scaleF = isYoung ? 0.70 : (isMale ? 1.08 : 0.96);

    // Odrębna paleta barw dla Wielbłąda dwugarbnego oraz Dromadera (z rozróżnieniem Samca, Samicy i Młodego)
    let coatMain, coatDark, woolCol, bellyCol;
    if (isBactrian) {
        if (isMale) {
            coatMain = '#8C521E'; // Ciemny, głęboki bursztynowy brąz samca wielbłąda
            coatDark = '#5C330F';
            woolCol  = '#3E1F05'; // Gęsta ciemna grzywa na garbach, szyi i głowie
            bellyCol = '#B57B45';
        } else if (isFemale) {
            coatMain = '#AD6E34'; // Ciepły cynamonowo-brązowy odcień samicy wielbłąda
            coatDark = '#7D4B1E';
            woolCol  = '#633712';
            bellyCol = '#D9A773';
        } else {
            coatMain = '#C98E54'; // Jasne, miękkie futerko młodego wielbłąda dwugarbnego
            coatDark = '#996532';
            woolCol  = '#805124';
            bellyCol = '#F0CAA1';
        }
    } else {
        // Dromader (jednogarbny) — złocisto-piaskowe barwy pustyni
        if (isMale) {
            coatMain = '#C2853E'; // Mocny złocisto-ochrowy samiec dromadera
            coatDark = '#8F5D22';
            woolCol  = '#6E4414';
            bellyCol = '#E3B476';
        } else if (isFemale) {
            coatMain = '#D9A15B'; // Jaśniejsza, smukła piaskowo-kremowa samica dromadera
            coatDark = '#A67538';
            woolCol  = '#8C5E26';
            bellyCol = '#F3D7B0';
        } else {
            coatMain = '#E8BE82'; // Jasnopiaskowe młode dromadera
            coatDark = '#BA8E52';
            woolCol  = '#9E733B';
            bellyCol = '#FFF0D6';
        }
    }

    const legSwing = (c.state === 'walk') ? Math.sin(c.walkFrame * 2.1) * 3.1 : 0;

    // 1. Długie nogi z szerokimi poduszkami stóp przystosowanymi do piasku
    const legTop = h * 0.48;
    const legLen = h * 0.52;
    const legW = Math.max(2.0, (isMale ? 3.0 : 2.5) * scaleF);

    // Nogi dalszego planu
    ctx.fillStyle = coatDark;
    ctx.fillRect(w * 0.18 - legSwing * 0.7, legTop, legW, legLen);
    ctx.fillRect(w * 0.70 + legSwing * 0.7, legTop, legW, legLen);

    // Nogi bliższego planu
    ctx.fillStyle = coatMain;
    ctx.fillRect(w * 0.24 + legSwing, legTop, legW, legLen);
    ctx.fillRect(w * 0.64 - legSwing, legTop, legW, legLen);

    // Szerokie stopy wielbłądzie
    ctx.fillStyle = coatDark;
    ctx.fillRect(w * 0.23 + legSwing, h - 2.2, legW + 1.3, 2.2);
    ctx.fillRect(w * 0.63 - legSwing, h - 2.2, legW + 1.3, 2.2);

    // 2. Tułów i jasne podbrzusze
    ctx.fillStyle = coatMain;
    ctx.fillRect(w * 0.14, h * 0.28, w * 0.66, h * 0.34);
    ctx.fillStyle = bellyCol;
    ctx.fillRect(w * 0.20, h * 0.51, w * 0.52, h * 0.10);

    // 3. GARBY (Zależnie od gatunku: Wielbłąd = 2 garby, Dromader = 1 garb, w wersji męskiej, żeńskiej i małej!)
    if (isBactrian) {
        // WIELBŁĄD DWUGARBNY — zawsze DWA garby (duże u samca, zgrabne u samicy, małe u młodego)
        let humpH = isYoung ? (h * 0.14) : (isMale ? (h * 0.24) : (h * 0.19));
        let humpTopY = h * 0.29 - humpH;
        let humpW = w * 0.20;

        // Przedni garb
        ctx.fillStyle = coatMain;
        ctx.fillRect(w * 0.48, humpTopY, humpW, humpH + 1);
        ctx.fillStyle = woolCol;
        ctx.fillRect(w * 0.49, humpTopY - (isMale ? 2.2 : 1.2), humpW - 2, isMale ? 4 : 2.5);

        // Tylny garb
        ctx.fillStyle = coatMain;
        ctx.fillRect(w * 0.20, humpTopY + 1, humpW, humpH);
        ctx.fillStyle = woolCol;
        ctx.fillRect(w * 0.21, humpTopY - (isMale ? 1.5 : 0.8), humpW - 2, isMale ? 3.8 : 2.5);
    } else {
        // DROMADER JEDNOGARBNY — zawsze JEDEN garb pośrodku grzbietu
        let humpH = isYoung ? (h * 0.15) : (isMale ? (h * 0.25) : (h * 0.20));
        let humpTopY = h * 0.29 - humpH;
        let humpW = isYoung ? (w * 0.26) : (w * 0.34);
        let humpX = w * 0.28;

        ctx.fillStyle = coatMain;
        ctx.fillRect(humpX, humpTopY, humpW, humpH + 1);
        ctx.fillRect(humpX + 2, humpTopY - 2, humpW - 4, 3);
        if (!isYoung) {
            ctx.fillStyle = woolCol;
            ctx.fillRect(humpX + 3, humpTopY - (isMale ? 3 : 2), humpW - 6, isMale ? 3.5 : 2.2);
        }
    }

    // Jasne łatki na boku u młodych osobników
    if (isYoung) {
        ctx.fillStyle = bellyCol;
        ctx.fillRect(w * 0.30, h * 0.35, 2.5, 2.2);
        ctx.fillRect(w * 0.48, h * 0.37, 2.5, 2.2);
    }

    // Siodło / pustynny dywanik na grzbiecie oswojonego Wielbłąda dwugarbnego (2 miejsca) oraz Dromadera (1 miejsce)
    if (!isYoung && (c.isTamed || forceSaddle || (typeof player !== 'undefined' && player.ridingCamel === c))) {
        if (isBactrian) {
            // Dwuosobowy dywanik i 2 siedziska na Wielbłądzie dwugarbnym
            ctx.fillStyle = '#b91c1c';
            ctx.fillRect(w * 0.16, h * 0.24, w * 0.54, h * 0.17);
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(w * 0.18, h * 0.26, w * 0.50, h * 0.05);
            ctx.fillStyle = '#fde047';
            ctx.fillRect(w * 0.18, h * 0.37, w * 0.50, h * 0.03);
            ctx.fillStyle = '#451a03';
            ctx.fillRect(w * 0.49, h * 0.20, w * 0.16, h * 0.06);
            ctx.fillRect(w * 0.21, h * 0.21, w * 0.16, h * 0.06);
        } else {
            // Jednoosobowy dywanik i 1 centralne siedzisko na Dromaderze
            ctx.fillStyle = '#b91c1c';
            ctx.fillRect(w * 0.26, h * 0.25, w * 0.36, h * 0.16);
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(w * 0.28, h * 0.27, w * 0.32, h * 0.05);
            ctx.fillStyle = '#fde047';
            ctx.fillRect(w * 0.28, h * 0.38, w * 0.32, h * 0.03);
            ctx.fillStyle = '#451a03';
            ctx.fillRect(w * 0.35, h * 0.21, w * 0.18, h * 0.06);
        }
    }

    // Ogon z kitką
    ctx.fillStyle = coatDark;
    ctx.fillRect(w * 0.08, h * 0.30, w * 0.06, h * 0.21);
    ctx.fillStyle = woolCol;
    ctx.fillRect(w * 0.07, h * 0.47, w * 0.08, h * 0.08);

    // 4. Wygięta w łuk szyja oraz głowa (pochylają się podczas skubania kaktusów/roślin!)
    ctx.save();
    let shoulderX = w * 0.74;
    let shoulderY = h * 0.38;
    ctx.translate(shoulderX, shoulderY);

    let grazeRatio = c.grazeProgress || (c.state === 'graze' ? 1 : 0);
    let chewBob = (c.state === 'graze') ? Math.sin(globalTick * 0.28) * 0.08 : 0;
    let neckAngle = grazeRatio * 1.05 + chewBob;
    ctx.rotate(neckAngle);

    let neckW = (isMale ? 6.6 : 5.6) * scaleF;
    ctx.fillStyle = coatMain;
    ctx.fillRect(-1 * scaleF, -5 * scaleF, neckW, 9 * scaleF);
    ctx.fillRect(1.5 * scaleF, -13 * scaleF, neckW * 0.92, 10 * scaleF);

    // Bujna broda / grzywa pod szyją u samców (szczególnie gęsta u samca Wielbłąda dwugarbnego, mniejsza u samca Dromadera)
    if (isMale) {
        ctx.fillStyle = woolCol;
        let maneW = isBactrian ? (4.8 * scaleF) : (3.0 * scaleF);
        let maneH = isBactrian ? (11.5 * scaleF) : (8.0 * scaleF);
        ctx.fillRect(3.6 * scaleF, -9.5 * scaleF, maneW, maneH);
    } else if (isBactrian && isFemale) {
        ctx.fillStyle = woolCol;
        ctx.fillRect(3.6 * scaleF, -8.0 * scaleF, 2.8 * scaleF, 7.5 * scaleF);
    }

    // Głowa i pysk
    ctx.fillStyle = coatMain;
    ctx.fillRect(0.5 * scaleF, -17 * scaleF, 10.2 * scaleF, 5.6 * scaleF);
    ctx.fillRect(8.2 * scaleF, -15.8 * scaleF, 4.4 * scaleF, 4.3 * scaleF);

    // Czubek wełny na czole u samca wielbłąda dwugarbnego
    if (isBactrian && isMale) {
        ctx.fillStyle = woolCol;
        ctx.fillRect(1.5 * scaleF, -19.2 * scaleF, 5.2 * scaleF, 2.5 * scaleF);
    }

    // Ucho
    ctx.fillStyle = coatDark;
    ctx.fillRect(0.2 * scaleF, -19.2 * scaleF, 2.6 * scaleF, 2.8 * scaleF);

    // Oko (u samic delikatna rzęsa i jasny błysk, u samców grubszy łuk brwiowy)
    ctx.fillStyle = '#18181B';
    ctx.fillRect(5.2 * scaleF, -15.5 * scaleF, 1.8 * scaleF, 1.6 * scaleF);
    if (isFemale || isYoung) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(5.4 * scaleF, -15.4 * scaleF, 0.7 * scaleF, 0.7 * scaleF);
    }
    ctx.fillStyle = isMale ? woolCol : coatDark;
    ctx.fillRect(4.6 * scaleF, -16.3 * scaleF, 2.8 * scaleF, 0.9 * scaleF);

    // Nozdrza
    ctx.fillStyle = '#27272A';
    ctx.fillRect(11.0 * scaleF, -15.2 * scaleF, 1.3 * scaleF, 1.3 * scaleF);

    ctx.restore();
    ctx.restore();
}

function drawDeerEntity(ctx, d) {
    ctx.save();
    const w = d.width || 24;
    const h = d.height || 20;
    ctx.translate(d.x + w / 2, d.y + h / 2);
    ctx.scale(d.direction || 1, 1);
    ctx.translate(-w / 2, -h / 2);

    const isByk = (d.variant === 'byk');
    const isCiele = (d.variant === 'ciele');
    const scaleF = isByk ? 1.15 : (isCiele ? 0.72 : 0.98);

    const coatMain = isByk ? '#6F3818' : (isCiele ? '#B56B38' : '#8D4E25');
    const coatDark = isByk ? '#4A230D' : (isCiele ? '#8A4B20' : '#653516');
    const bellyCol = isByk ? '#A8744F' : (isCiele ? '#EBD3B7' : '#D2B08C');
    constlegSwing = (d.state === 'walk') ? Math.sin(d.walkFrame * 2.2) * 3.0 : 0;

    // 1. Tylne i przednie nogi (długie, smukłe nogi jelenia z kopytkami)
    const legTop = h * 0.48;
    const legLen = h * 0.52;
    const legW = Math.max(2, 2.5 * scaleF);

    // Nogi dalszego planu
    ctx.fillStyle = coatDark;
    ctx.fillRect(w * 0.18 - constlegSwing * 0.7, legTop, legW, legLen);
    ctx.fillRect(w * 0.72 + constlegSwing * 0.7, legTop, legW, legLen);

    // Nogi bliższego planu
    ctx.fillStyle = coatMain;
    ctx.fillRect(w * 0.24 + constlegSwing, legTop, legW, legLen);
    ctx.fillRect(w * 0.66 - constlegSwing, legTop, legW, legLen);

    // Ciemne kopytka
    ctx.fillStyle = '#1E1B18';
    ctx.fillRect(w * 0.24 + constlegSwing, h - 2, legW + 0.5, 2);
    ctx.fillRect(w * 0.66 - constlegSwing, h - 2, legW + 0.5, 2);

    // 2. Tułów i jasny brzuch
    ctx.fillStyle = coatMain;
    ctx.fillRect(w * 0.14, h * 0.24, w * 0.68, h * 0.38);
    ctx.fillStyle = bellyCol;
    ctx.fillRect(w * 0.20, h * 0.50, w * 0.54, h * 0.12);

    // Ciemniejsza grzywa na karku u Byka
    if (isByk) {
        ctx.fillStyle = '#3D1C08';
        ctx.fillRect(w * 0.58, h * 0.18, w * 0.26, h * 0.26);
    }

    // Białe cętki na grzbiecie u Cielęcia (młodego jelonka)
    if (isCiele) {
        ctx.fillStyle = '#FFF8E7';
        ctx.fillRect(w * 0.24, h * 0.30, 2, 2);
        ctx.fillRect(w * 0.38, h * 0.28, 2, 2);
        ctx.fillRect(w * 0.52, h * 0.31, 2, 2);
        ctx.fillRect(w * 0.31, h * 0.39, 2, 2);
        ctx.fillRect(w * 0.46, h * 0.38, 2, 2);
    }

    // Krótki ogonek z jasnym spodem
    ctx.fillStyle = bellyCol;
    ctx.fillRect(w * 0.06, h * 0.26, w * 0.10, h * 0.12);
    ctx.fillStyle = coatDark;
    ctx.fillRect(w * 0.06, h * 0.24, w * 0.10, h * 0.06);

    // 3. Szyja i głowa (pochylają się w dół do trawy podczas jedzenia 'graze'!)
    ctx.save();
    let shoulderX = w * 0.74;
    let shoulderY = h * 0.32;
    ctx.translate(shoulderX, shoulderY);

    let grazeRatio = d.grazeProgress || (d.state === 'graze' ? 1 : 0);
    let chewBob = (d.state === 'graze') ? Math.sin(globalTick * 0.32) * 0.09 : 0;
    let neckAngle = grazeRatio * 1.18 + chewBob; // Pochylenie szyi ku ziemi przy skubaniu trawy
    ctx.rotate(neckAngle);

    // Szyja
    ctx.fillStyle = isByk ? '#52270F' : coatMain;
    ctx.fillRect(-3 * scaleF, -8 * scaleF, 6 * scaleF, 10 * scaleF);

    // Głowa i pysk
    ctx.fillStyle = coatMain;
    ctx.fillRect(-2 * scaleF, -12 * scaleF, 10 * scaleF, 6 * scaleF);
    ctx.fillRect(6 * scaleF, -10.5 * scaleF, 4.5 * scaleF, 4.2 * scaleF);

    // Ciemny nosek i oko
    ctx.fillStyle = '#18181B';
    ctx.fillRect(9.2 * scaleF, -10.2 * scaleF, 1.8 * scaleF, 1.8 * scaleF);
    ctx.fillRect(3.2 * scaleF, -10.5 * scaleF, 1.6 * scaleF, 1.6 * scaleF);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(3.2 * scaleF, -10.5 * scaleF, 0.7 * scaleF, 0.7 * scaleF);

    // Uszy
    ctx.fillStyle = coatDark;
    ctx.fillRect(-3.5 * scaleF, -14.5 * scaleF, 2.8 * scaleF, 3.5 * scaleF);
    ctx.fillStyle = bellyCol;
    ctx.fillRect(-2.8 * scaleF, -13.8 * scaleF, 1.4 * scaleF, 2.2 * scaleF);

    // 4. Rozłożyste poroże (wieniec) u Byka!
    if (isByk) {
        ctx.fillStyle = '#D9B98B';
        // Główna tyka poroża
        ctx.fillRect(-1.5, -22, 2.4, 10);
        ctx.fillRect(-4.5, -24, 3.5, 2.4);
        // Odnogi poroża (oczniak, opierak i korona)
        ctx.fillRect(1.0, -18, 4.0, 2.0);
        ctx.fillRect(1.0, -22, 4.5, 2.0);
        ctx.fillRect(4.0, -25, 2.2, 4.5);
        ctx.fillRect(-5.5, -27, 2.2, 4.5);
        ctx.fillStyle = '#B08D5B';
        ctx.fillRect(-1.5, -16, 2.4, 4);
    }

    ctx.restore();
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

function drawSandwormEntity(ctx, headX, headY, segments, radius = 12, numSegments = 15, tintEffect = null) {
    let segCol = tintEffect ? blendColorWithTint('#8B7355', tintEffect) : '#8B7355';
    let headCol = tintEffect ? blendColorWithTint('#5C4033', tintEffect) : '#5C4033';
    if (Array.isArray(segments)) {
        for (let i = segments.length - 1; i >= 0; i--) {
            let seg = segments[i];
            if (!seg) continue;
            let segRadius = radius;
            if (i > numSegments - 5) segRadius = radius * (numSegments - i) / 5;

            ctx.fillStyle = segCol;
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, Math.max(segRadius, 2), 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = headCol;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    ctx.fillStyle = headCol;
    ctx.beginPath();
    ctx.arc(headX, headY, radius + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(headX, headY, radius - 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = tintEffect ? blendColorWithTint('#FFFFFF', tintEffect) : 'white';
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        let zx = headX + Math.cos(a) * (radius - 2);
        let zy = headY + Math.sin(a) * (radius - 2);
        ctx.fillRect(zx, zy, 2, 2);
    }
}

// ==========================================
// MINI ZNACZNIKI GRACZY POZA EKRANEM ORAZ LISTA GRACZY [TAB]
// ==========================================
function getDirectionArrowChar(dx, dy) {
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle >= -22.5 && angle < 22.5) return "▶";
    if (angle >= 22.5 && angle < 67.5) return "↘";
    if (angle >= 67.5 && angle < 112.5) return "▼";
    if (angle >= 112.5 && angle < 157.5) return "↙";
    if (angle >= -67.5 && angle < -22.5) return "↗";
    if (angle >= -112.5 && angle < -67.5) return "▲";
    if (angle >= -157.5 && angle < -112.5) return "↖";
    return "◀";
}

function drawOffscreenPlayerMarkers(ctx) {
    if (!roomCode) return;
    const myCenterX = player.x + player.width / 2;
    const myCenterY = player.y + player.height / 2;
    const margin = 18;

    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp || rp.inGame === false) continue;
        // Gracze w żołądku czerwia są w innym wymiarze i są niewidoczni dla świata zewnętrznego
        if (Boolean(rp.inStomach) !== Boolean(player.inStomach)) continue;

        let rpCenterX = rp.x + 8;
        let rpCenterY = rp.y + 12;

        // Pozycja gracza na ekranie w pikselach
        let screenX = (rpCenterX - cameraX) * SCALE;
        let screenY = (rpCenterY - cameraY) * SCALE;

        // Jeśli gracz mieści się w polu widzenia kamery, nie rysujemy znacznika krawędziowego
        if (screenX >= margin && screenX <= canvas.width - margin &&
            screenY >= margin && screenY <= canvas.height - margin) {
            continue;
        }

        let dx = rpCenterX - myCenterX;
        let dy = rpCenterY - myCenterY;
        let distBlocks = Math.max(1, Math.round(Math.hypot(dx, dy) / TILE_SIZE));
        let arrowChar = getDirectionArrowChar(dx, dy);
        let isLeft = screenX < margin;
        let isRight = screenX > canvas.width - margin;

        ctx.save();
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        let nickStr = rp.nick || "Gracz";
        let distStr = `${distBlocks}m`;
        let labelText = isLeft
            ? `${arrowChar} ${nickStr} (${distStr})`
            : (isRight ? `${nickStr} (${distStr}) ${arrowChar}` : `${arrowChar} ${nickStr} (${distStr})`);

        let textW = ctx.measureText(labelText).width;
        let boxW = Math.ceil(textW + 20);
        let boxH = 26;

        // Przytnij pozycję znacznika do końca ekranu, zachowując wysokość (Y) na której znajduje się gracz!
        let padX = boxW / 2 + 12;
        let padY = boxH / 2 + 14;
        let clampedX = Math.max(padX, Math.min(canvas.width - padX, screenX));
        let clampedY = Math.max(padY, Math.min(canvas.height - padY - 75, screenY));

        let boxX = Math.round(clampedX - boxW / 2);
        let boxY = Math.round(clampedY - boxH / 2);

        // Półprzezroczyste tło mini-znacznika
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(boxX, boxY, boxW, boxH);

        ctx.strokeStyle = rp.isAdmin ? '#ef4444' : '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Rysuj tekst znacznika (kierunek, nick oraz odległość w blokach/metrach)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 3;
        ctx.fillStyle = rp.isAdmin ? '#ff7675' : '#e0f2fe';
        ctx.fillText(labelText, clampedX, clampedY);

        ctx.restore();
    }
}

function drawTabPlayerList(ctx) {
    if (!keys['Tab']) return;

    // Zbierz listę graczy online (nas oraz wszystkich z remotePlayers)
    const playersList = [];
    const myBlockX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
    const myBlockY = Math.floor((player.y + player.height / 2) / TILE_SIZE);

    playersList.push({
        nick: playerNick || "Gracz",
        isAdmin: Boolean(player.isAdmin),
        isMe: true,
        hp: player.hp,
        maxHp: player.maxHp || 5,
        dead: Boolean(player.dead),
        gameMode: player.gameMode || 0,
        isSandworm: Boolean(player.isSandworm),
        isRiding: Boolean(player.ridingPig),
        inStomach: Boolean(player.inStomach),
        dist: 0,
        bx: myBlockX,
        by: myBlockY
    });

    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp || rp.inGame === false) continue;
        let rbx = Math.floor((rp.x + 8) / TILE_SIZE);
        let rby = Math.floor((rp.y + 12) / TILE_SIZE);
        let d = Math.round(Math.hypot(rbx - myBlockX, rby - myBlockY));
        playersList.push({
            nick: rp.nick || "Gracz",
            isAdmin: Boolean(rp.isAdmin),
            isMe: false,
            hp: typeof rp.hp === 'number' ? rp.hp : 5,
            maxHp: rp.maxHp || 5,
            dead: Boolean(rp.dead),
            gameMode: rp.gameMode || 0,
            isSandworm: Boolean(rp.isSandworm),
            isRiding: Boolean(rp.isRiding),
            inStomach: Boolean(rp.inStomach),
            dist: d,
            bx: rbx,
            by: rby
        });
    }

    // Sortuj: najpierw Admini, potem alfabetycznie
    playersList.sort((a, b) => {
        if (a.isAdmin !== b.isAdmin) return (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0);
        if (a.isMe !== b.isMe) return (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0);
        return a.nick.localeCompare(b.nick);
    });

    const panelW = 340;
    const rowH = 32;
    const headerH = 44;
    const panelH = headerH + playersList.length * rowH + 12;
    // Umieść półprzezroczysty panel po prawej stronie ekranu
    const panelX = canvas.width - panelW - 26;
    const panelY = 148;

    ctx.save();

    // Tło główne listy [TAB] (półprzezroczyste)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.76)';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    // Pasek nagłówka
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.fillRect(panelX + 2, panelY + 2, panelW - 4, headerH - 4);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    let roomLabel = roomCode ? `Pokój #${roomCode}` : "Gra Lokalna";
    ctx.fillText(`👥 GRACZE ONLINE (${playersList.length})`, panelX + 14, panelY + 26);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(roomLabel, panelX + panelW - 14, panelY + 26);

    // Wiersze poszczególnych graczy
    for (let i = 0; i < playersList.length; i++) {
        let p = playersList[i];
        let ry = panelY + headerH + i * rowH;

        if (i % 2 === 1) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.fillRect(panelX + 4, ry, panelW - 8, rowH - 2);
        }

        // Badge rangi (ADMIN / Gracz)
        let badgeX = panelX + 12;
        let badgeY = ry + 6;
        let badgeW = p.isAdmin ? 52 : 46;
        let badgeH = 18;

        ctx.fillStyle = p.isAdmin ? 'rgba(220, 38, 38, 0.85)' : 'rgba(100, 116, 139, 0.55)';
        ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
        ctx.strokeStyle = p.isAdmin ? '#f87171' : '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

        ctx.fillStyle = p.isAdmin ? '#ffffff' : '#e2e8f0';
        ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.isAdmin ? "ADMIN" : "GRACZ", badgeX + badgeW / 2, badgeY + 13);

        // Nick gracza
        ctx.textAlign = 'left';
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = p.isAdmin ? '#ff7675' : (p.isMe ? '#ffffff' : '#38bdf8');
        let displayNick = p.nick + (p.isMe ? " (Ty)" : "");
        ctx.fillText(displayNick, badgeX + badgeW + 8, ry + 19);

        // Status / Dystans po prawej stronie wiersza
        ctx.textAlign = 'right';
        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        let statusParts = [];
        if (p.dead) statusParts.push("☠️");
        else if (p.inStomach) statusParts.push("🧪 Żołądek");
        else if (p.isSandworm) statusParts.push("🪱 Czerw");
        else if (p.isRiding) statusParts.push("🐷");

        if (p.gameMode === 1) statusParts.push("✨ GM 1");
        else if (!p.dead) statusParts.push(`❤️ ${p.hp}/${p.maxHp}`);

        if (!p.isMe && !p.inStomach && !player.inStomach) {
            statusParts.push(`📍 ${p.dist}m`);
        }

        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(statusParts.join("  "), panelX + panelW - 12, ry + 19);
    }

    ctx.restore();
}

function drawOverheadPlayerName(ctx, centerX, yPos, nick, isAdmin, isLocalPlayer) {
    ctx.save();
    ctx.font = 'bold 7.5px Arial';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 2;
    let prefixText = isAdmin ? "ADMIN " : "Gracz ";
    let nameText = nick || "Gracz";
    let wPrefix = ctx.measureText(prefixText).width;
    let wName = ctx.measureText(nameText).width;
    let totalW = wPrefix + wName;
    let startX = centerX - totalW / 2;

    ctx.textAlign = 'left';
    ctx.fillStyle = isAdmin ? '#ef4444' : '#94a3b8';
    ctx.fillText(prefixText, startX, yPos);

    ctx.fillStyle = isAdmin ? '#ff7675' : (isLocalPlayer ? '#ffffff' : '#38bdf8');
    ctx.fillText(nameText, startX + wPrefix, yPos);
    ctx.restore();
}

// ==========================================
// KLIMATYCZNE NIEBO: GRADIENT PÓR DNIA, SŁOŃCE, KSIĘŻYC, GWIAZDY I CHMURY
// ==========================================
const SKY_KEYFRAMES = [
    { t: 0.00, zenith: [2, 6, 23],    mid: [11, 19, 43],   horizon: [27, 38, 59],   cMain: [30, 41, 59],    cHigh: [71, 85, 105],   cShad: [15, 23, 42],   ambient: [4, 9, 24, 0.56],     starA: 1.00 },
    { t: 0.18, zenith: [9, 13, 28],   mid: [22, 33, 62],   horizon: [67, 56, 202],  cMain: [51, 65, 85],    cHigh: [129, 140, 248], cShad: [30, 41, 59],   ambient: [12, 16, 42, 0.44],   starA: 0.80 },
    { t: 0.24, zenith: [30, 58, 138], mid: [124, 58, 237], horizon: [249, 115, 22], cMain: [254, 215, 170], cHigh: [254, 240, 138], cShad: [154, 52, 18],  ambient: [249, 115, 22, 0.16], starA: 0.18 },
    { t: 0.29, zenith: [37, 99, 235], mid: [96, 165, 250], horizon: [253, 230, 138],cMain: [255, 255, 255], cHigh: [254, 249, 195], cShad: [203, 213, 225],ambient: [255, 220, 140, 0.05],starA: 0.00 },
    { t: 0.36, zenith: [2, 132, 199], mid: [56, 189, 248], horizon: [186, 230, 253],cMain: [255, 255, 255], cHigh: [255, 255, 255], cShad: [203, 213, 225],ambient: [0, 0, 0, 0.00],      starA: 0.00 },
    { t: 0.50, zenith: [3, 105, 161], mid: [56, 189, 248], horizon: [224, 242, 254],cMain: [255, 255, 255], cHigh: [255, 255, 255], cShad: [203, 213, 225],ambient: [0, 0, 0, 0.00],      starA: 0.00 },
    { t: 0.65, zenith: [2, 132, 199], mid: [56, 189, 248], horizon: [186, 230, 253],cMain: [255, 255, 255], cHigh: [255, 255, 255], cShad: [203, 213, 225],ambient: [255, 190, 100, 0.03],starA: 0.00 },
    { t: 0.71, zenith: [29, 78, 216], mid: [234, 88, 12],  horizon: [253, 224, 71], cMain: [254, 215, 170], cHigh: [254, 240, 138], cShad: [180, 83, 9],   ambient: [245, 130, 40, 0.15], starA: 0.05 },
    { t: 0.76, zenith: [30, 27, 75],  mid: [190, 18, 60],  horizon: [249, 115, 22], cMain: [253, 164, 175], cHigh: [253, 224, 71],  cShad: [136, 19, 55],  ambient: [215, 65, 65, 0.22],  starA: 0.38 },
    { t: 0.82, zenith: [9, 13, 22],   mid: [30, 27, 75],   horizon: [76, 29, 149],  cMain: [51, 65, 85],    cHigh: [100, 116, 139], cShad: [15, 23, 42],   ambient: [8, 14, 34, 0.46],    starA: 0.85 },
    { t: 0.90, zenith: [2, 6, 23],    mid: [11, 19, 43],   horizon: [27, 38, 59],   cMain: [30, 41, 59],    cHigh: [71, 85, 105],   cShad: [15, 23, 42],   ambient: [4, 9, 24, 0.56],     starA: 1.00 },
    { t: 1.00, zenith: [2, 6, 23],    mid: [11, 19, 43],   horizon: [27, 38, 59],   cMain: [30, 41, 59],    cHigh: [71, 85, 105],   cShad: [15, 23, 42],   ambient: [4, 9, 24, 0.56],     starA: 1.00 }
];

const SKY_STARS = (function() {
    let arr = [];
    for (let i = 0; i < 95; i++) {
        let s1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
        let s2 = Math.sin(i * 45.164 + 19.13) * 23421.631;
        let s3 = Math.sin(i * 93.712 + 51.7) * 65432.123;
        arr.push({
            xRatio: s1 - Math.floor(s1),
            yRatio: (s2 - Math.floor(s2)) * 0.66,
            size: (i % 7 === 0) ? 3 : ((i % 3 === 0) ? 2 : 1.5),
            twinkleSpeed: 0.03 + (s3 - Math.floor(s3)) * 0.06,
            phase: i * 1.7,
            bright: (i % 9 === 0)
        });
    }
    return arr;
})();

const SKY_CLOUDS = (function() {
    let arr = [];
    const templates = [
        [ { dx: -36, dy: 6, w: 34, h: 18 }, { dx: -16, dy: -6, w: 42, h: 28 }, { dx: 16, dy: 0, w: 36, h: 22 }, { dx: 38, dy: 8, w: 26, h: 14 } ],
        [ { dx: -44, dy: 8, w: 32, h: 16 }, { dx: -22, dy: -4, w: 38, h: 24 }, { dx: 6, dy: -10, w: 44, h: 30 }, { dx: 36, dy: 2, w: 34, h: 20 } ],
        [ { dx: -28, dy: 4, w: 30, h: 16 }, { dx: -6, dy: -5, w: 36, h: 22 }, { dx: 20, dy: 4, w: 28, h: 16 } ]
    ];
    for (let i = 0; i < 14; i++) {
        let layer = i < 7 ? 0 : 1; // 0 = dalszy plan, 1 = bliższy plan
        arr.push({
            baseX: (i / 7) * 2200 + (i % 3) * 110,
            yRatio: layer === 0 ? (0.08 + (i % 4) * 0.07) : (0.12 + (i % 4) * 0.08),
            speed: layer === 0 ? (0.16 + (i % 3) * 0.04) : (0.28 + (i % 3) * 0.06),
            scale: layer === 0 ? (1.05 + (i % 2) * 0.2) : (1.45 + (i % 3) * 0.22),
            layer: layer,
            puffs: templates[i % templates.length]
        });
    }
    return arr;
})();

function lerpArr(a, b, f) {
    return a.map((v, idx) => v + (b[idx] - v) * f);
}

function rgbStr(arr, alpha = 1) {
    if (alpha < 1) return `rgba(${Math.round(arr[0])}, ${Math.round(arr[1])}, ${Math.round(arr[2])}, ${alpha.toFixed(3)})`;
    return `rgb(${Math.round(arr[0])}, ${Math.round(arr[1])}, ${Math.round(arr[2])})`;
}

function getSkyPaletteAtTime(t) {
    let normT = ((t % 1) + 1) % 1;
    let k0 = SKY_KEYFRAMES[0];
    let k1 = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];
    for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
        if (normT >= SKY_KEYFRAMES[i].t && normT <= SKY_KEYFRAMES[i + 1].t) {
            k0 = SKY_KEYFRAMES[i];
            k1 = SKY_KEYFRAMES[i + 1];
            break;
        }
    }
    let span = Math.max(0.0001, k1.t - k0.t);
    let f = Math.max(0, Math.min(1, (normT - k0.t) / span));
    return {
        zenith: lerpArr(k0.zenith, k1.zenith, f),
        mid: lerpArr(k0.mid, k1.mid, f),
        horizon: lerpArr(k0.horizon, k1.horizon, f),
        cMain: lerpArr(k0.cMain, k1.cMain, f),
        cHigh: lerpArr(k0.cHigh, k1.cHigh, f),
        cShad: lerpArr(k0.cShad, k1.cShad, f),
        ambient: lerpArr(k0.ambient, k1.ambient, f),
        starA: k0.starA + (k1.starA - k0.starA) * f
    };
}

function drawCloudCluster(ctx, cx, cy, scale, pal, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    const highCol = rgbStr(pal.cHigh);
    const mainCol = rgbStr(pal.cMain);
    const shadCol = rgbStr(pal.cShad);

    for (let p of pal.puffs) {
        ctx.fillStyle = shadCol;
        ctx.fillRect(p.dx, p.dy + p.h * 0.62, p.w, p.h * 0.38);
        ctx.fillStyle = mainCol;
        ctx.fillRect(p.dx, p.dy + p.h * 0.16, p.w, p.h * 0.54);
        ctx.fillStyle = highCol;
        ctx.fillRect(p.dx + 2, p.dy, p.w - 4, p.h * 0.24);
    }
    ctx.restore();
}

function drawAtmosphericSky(ctx) {
    if (player.inStomach) {
        ctx.fillStyle = '#22060B';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const pal = getSkyPaletteAtTime(worldTime);

    // 1. Wielostopniowy gradient nieba dopasowany do pory dnia
    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0.0, rgbStr(pal.zenith));
    skyGrad.addColorStop(0.52, rgbStr(pal.mid));
    skyGrad.addColorStop(1.0, rgbStr(pal.horizon));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Migoczące gwiazdy nocą oraz o świcie i zmierzchu
    if (pal.starA > 0.01) {
        ctx.save();
        for (let st of SKY_STARS) {
            let sx = ((st.xRatio * canvas.width * 1.4 - cameraX * 0.04) % canvas.width + canvas.width) % canvas.width;
            let sy = st.yRatio * canvas.height;
            let twinkle = 0.45 + 0.55 * Math.sin(globalTick * st.twinkleSpeed + st.phase);
            let a = pal.starA * twinkle;
            ctx.fillStyle = `rgba(248, 250, 252, ${a.toFixed(3)})`;
            ctx.fillRect(sx, sy, st.size, st.size);
            if (st.bright && twinkle > 0.82) {
                ctx.fillStyle = `rgba(186, 230, 253, ${(a * 0.55).toFixed(3)})`;
                ctx.fillRect(sx - 2, sy + 1, st.size + 4, 1);
                ctx.fillRect(sx + 1, sy - 2, 1, st.size + 4);
            }
        }
        ctx.restore();
    }

    // 3. Chmury dalszego planu (warstwa 0)
    const wrapW = Math.max(canvas.width + 420, 1900);
    for (let cl of SKY_CLOUDS) {
        if (cl.layer !== 0) continue;
        let cx = ((cl.baseX + globalTick * cl.speed - cameraX * 0.12) % wrapW + wrapW) % wrapW - 210;
        let cy = cl.yRatio * canvas.height;
        drawCloudCluster(ctx, cx, cy, cl.scale, { ...pal, puffs: cl.puffs }, 0.72);
    }

    // 4. SŁOŃCE (w dzień, o wschodzie i zachodzie: worldTime 0.20 .. 0.80)
    if (worldTime >= 0.20 && worldTime <= 0.80) {
        let sunP = (worldTime - 0.20) / 0.60;
        let sunX = canvas.width * (0.08 + 0.84 * sunP);
        let sunArc = Math.sin(sunP * Math.PI);
        let sunY = canvas.height * 0.56 - sunArc * (canvas.height * 0.41);
        let horizonFactor = 1 - sunArc;
        let sunAlpha = Math.min(1, Math.sin(sunP * Math.PI) * 3.2);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, sunAlpha));

        let haloR = 115 + horizonFactor * 45;
        let haloGrad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, haloR);
        if (horizonFactor > 0.55) {
            haloGrad.addColorStop(0.0, 'rgba(254, 240, 138, 0.85)');
            haloGrad.addColorStop(0.35, 'rgba(249, 115, 22, 0.45)');
            haloGrad.addColorStop(1.0, 'rgba(234, 88, 12, 0.0)');
        } else {
            haloGrad.addColorStop(0.0, 'rgba(254, 249, 195, 0.85)');
            haloGrad.addColorStop(0.35, 'rgba(250, 204, 21, 0.35)');
            haloGrad.addColorStop(1.0, 'rgba(253, 224, 71, 0.0)');
        }
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, haloR, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(sunX, sunY);
        ctx.save();
        ctx.rotate(globalTick * 0.004);
        ctx.fillStyle = horizonFactor > 0.55 ? 'rgba(251, 146, 60, 0.42)' : 'rgba(253, 224, 71, 0.38)';
        let sSize = Math.round(36 + horizonFactor * 8);
        ctx.fillRect(-sSize / 2, -sSize / 2, sSize, sSize);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-sSize / 2, -sSize / 2, sSize, sSize);
        ctx.restore();

        let coreS = Math.round(28 + horizonFactor * 6);
        ctx.fillStyle = horizonFactor > 0.55 ? '#f97316' : '#facc15';
        ctx.fillRect(-coreS / 2 - 3, -coreS / 2 - 3, coreS + 6, coreS + 6);
        ctx.fillStyle = horizonFactor > 0.55 ? '#fde047' : '#fef08a';
        ctx.fillRect(-coreS / 2, -coreS / 2, coreS, coreS);
        ctx.fillStyle = '#fefce8';
        ctx.fillRect(-coreS / 2 + 5, -coreS / 2 + 5, coreS - 10, coreS - 10);
        ctx.restore();
    }

    // 5. KSIĘŻYC (w nocy, późnym zmierzchem i o świcie: worldTime >= 0.76 lub <= 0.24)
    if (worldTime >= 0.76 || worldTime <= 0.24) {
        let nightElapsed = (worldTime >= 0.76) ? (worldTime - 0.76) : (worldTime + 1.0 - 0.76);
        let moonP = nightElapsed / 0.48;
        let moonX = canvas.width * (0.10 + 0.80 * moonP);
        let moonArc = Math.sin(moonP * Math.PI);
        let moonY = canvas.height * 0.54 - moonArc * (canvas.height * 0.39);
        let moonAlpha = Math.min(1, moonArc * 3.0);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, moonAlpha));

        let mHaloR = 105;
        let mGrad = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, mHaloR);
        mGrad.addColorStop(0.0, 'rgba(226, 232, 240, 0.65)');
        mGrad.addColorStop(0.38, 'rgba(148, 163, 184, 0.24)');
        mGrad.addColorStop(1.0, 'rgba(56, 189, 248, 0.0)');
        ctx.fillStyle = mGrad;
        ctx.beginPath();
        ctx.arc(moonX, moonY, mHaloR, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(moonX, moonY);
        const mS = 28;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(-mS / 2 - 2, -mS / 2 - 2, mS + 4, mS + 4);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-mS / 2, -mS / 2, mS, mS);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-mS / 2, -mS / 2, 6, mS);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-5, -7, 6, 5);
        ctx.fillRect(4, 2, 7, 6);
        ctx.fillRect(-7, 5, 5, 4);
        ctx.restore();
    }

    // 6. Puszyste chmury pierwszego planu (warstwa 1)
    for (let cl of SKY_CLOUDS) {
        if (cl.layer !== 1) continue;
        let cx = ((cl.baseX + globalTick * cl.speed - cameraX * 0.25) % wrapW + wrapW) % wrapW - 210;
        let cy = cl.yRatio * canvas.height;
        drawCloudCluster(ctx, cx, cy, cl.scale, { ...pal, puffs: cl.puffs }, 0.90);
    }
}

function drawAtmosphericLightingOverlay(ctx) {
    if (player.inStomach) return;
    const pal = getSkyPaletteAtTime(worldTime);
    const amb = pal.ambient;
    if (!amb || amb[3] <= 0.01) return;

    ctx.save();
    let isNightLight = (worldTime >= 0.78 || worldTime <= 0.22);
    if (isNightLight) {
        let pScreenX = (player.x + player.width / 2 - cameraX) * SCALE;
        let pScreenY = (player.y + player.height / 2 - cameraY) * SCALE;
        let nightGrad = ctx.createRadialGradient(pScreenX, pScreenY, 35, pScreenX, pScreenY, 340);
        let innerA = Math.max(0.08, amb[3] * 0.35);
        nightGrad.addColorStop(0.0, `rgba(${Math.round(amb[0])}, ${Math.round(amb[1])}, ${Math.round(amb[2])}, ${innerA.toFixed(3)})`);
        nightGrad.addColorStop(1.0, `rgba(${Math.round(amb[0])}, ${Math.round(amb[1])}, ${Math.round(amb[2])}, ${amb[3].toFixed(3)})`);
        ctx.fillStyle = nightGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = `rgba(${Math.round(amb[0])}, ${Math.round(amb[1])}, ${Math.round(amb[2])}, ${amb[3].toFixed(3)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
}

// ==========================================
// NIEZNISZCZALNY TOTEM ABORYGEŃSKI NA SPAWNIE (W TLE, NIE PRZESZKADZA W CHODZENIU)
// ==========================================
// ==========================================
// STRUKTURY TŁA NA RÓWNINACH I W LASACH (DREWNIANY DOMEK ZE STUDNIĄ I POLEM ZBOŻA ORAZ NAMIOTY Z OGNISKIEM)
// ==========================================
function drawWorldBackgroundStructures(ctx) {
    if (player.inStomach || typeof worldStructures === 'undefined') return;

    const viewLeft = cameraX - 220;
    const viewRight = cameraX + (canvas.width / SCALE) + 220;
    const isNightOrDusk = (worldTime >= 0.70 || worldTime <= 0.26);

    for (let st of worldStructures) {
        const centerX = st.x * TILE_SIZE + TILE_SIZE / 2;
        if (centerX < viewLeft || centerX > viewRight) continue;
        const groundY = st.y * TILE_SIZE;

        ctx.save();
        ctx.translate(centerX, groundY);
        ctx.scale(st.flip || 1, 1);

        if (st.type === 'homestead') {
            // ==========================================
            // 1. MAŁE POLE UPRAWNE ZŁOCISTEGO ZBOŻA (po lewej stronie siedliska: x od -132 do -50)
            // ==========================================
            const fieldX = -132;
            const fieldW = 80;

            // Zaorana, żyzna ziemia uprawna na powierzchni
            ctx.fillStyle = '#3E2723';
            ctx.fillRect(fieldX, -4, fieldW, 5);
            for (let fx = fieldX + 3; fx < fieldX + fieldW - 3; fx += 6) {
                ctx.fillStyle = '#27160E';
                ctx.fillRect(fx, -4, 3, 3);
            }

            // Drewniany płotek w tle za polem zboża
            ctx.fillStyle = '#6E472B';
            ctx.fillRect(fieldX + 2, -13, fieldW - 4, 2.5);
            ctx.fillRect(fieldX + 2, -7.5, fieldW - 4, 2.2);
            for (let postX = fieldX; postX <= fieldX + fieldW; postX += 16) {
                ctx.fillStyle = '#5C3A21';
                ctx.fillRect(postX - 1.5, -17, 3.2, 15);
                ctx.fillStyle = '#8B5A2B';
                ctx.fillRect(postX - 0.8, -16.5, 1.5, 14);
            }

            // Kołyszące się na wietrze złociste łany i kłosy zboża
            for (let i = 0; i < 24; i++) {
                let wx = fieldX + 4 + i * 3.1;
                let sway = Math.sin(globalTick * 0.055 + i * 0.55 + st.x) * 2.2;
                let stalkH = 15 + (i % 3) * 2.5;

                // Łodyga zboża
                ctx.strokeStyle = (i % 2 === 0) ? '#CA8A04' : '#EAB308';
                ctx.lineWidth = 1.3;
                ctx.beginPath();
                ctx.moveTo(wx, -3);
                ctx.lineTo(wx + sway, -3 - stalkH);
                ctx.stroke();

                // Złocisty kłos na szczycie łodygi
                ctx.fillStyle = '#FDE047';
                ctx.fillRect(wx + sway - 1.3, -3 - stalkH - 4.5, 2.6, 5.2);
                ctx.fillStyle = '#F59E0B';
                ctx.fillRect(wx + sway - 0.8, -3 - stalkH - 3.5, 1.6, 3.2);
                // Wąsy kłosa
                ctx.fillStyle = '#FEF08A';
                ctx.fillRect(wx + sway - 0.5, -3 - stalkH - 6.5, 1.0, 2.0);
            }

            // ==========================================
            // 2. DREWNIANY DOMEK (w centrum siedliska: x od -38 do +54)
            // ==========================================
            const houseX = -38;
            const houseW = 92;
            const houseH = 54;

            // Komin z cegieł po prawej stronie dachu + unoszący się dymek
            const chimX = houseX + houseW - 22;
            const chimY = -houseH - 28;
            for (let s = 0; s < 4; s++) {
                let smokeProgress = ((globalTick * 0.35 + s * 18) % 72) / 72;
                let smX = chimX + 5 + Math.sin(globalTick * 0.04 + s * 1.6) * (4 + smokeProgress * 10);
                let smY = chimY - 4 - smokeProgress * 28;
                let smR = 3.2 + smokeProgress * 5.5;
                let smAlpha = (1 - smokeProgress) * 0.38;
                ctx.fillStyle = `rgba(226, 232, 240, ${smAlpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(smX, smY, smR, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#7F1D1D';
            ctx.fillRect(chimX, chimY, 11, 26);
            ctx.fillStyle = '#991B1B';
            ctx.fillRect(chimX + 1, chimY + 2, 9, 22);
            ctx.fillStyle = '#450A0A';
            ctx.fillRect(chimX - 1.5, chimY, 14, 3);

            // Kamienna podmurówka domku
            ctx.fillStyle = '#4B5563';
            ctx.fillRect(houseX - 2, -8, houseW + 4, 8);
            for (let kx = houseX; kx < houseX + houseW; kx += 10) {
                ctx.fillStyle = (kx % 20 === 0) ? '#6B7280' : '#374151';
                ctx.fillRect(kx, -7, 8, 6);
            }

            // Ściany z drewnianych bali
            ctx.fillStyle = '#78472A';
            ctx.fillRect(houseX, -houseH, houseW, houseH - 8);
            for (let ly = -houseH + 5; ly < -8; ly += 6) {
                ctx.fillStyle = '#5C341D';
                ctx.fillRect(houseX, ly, houseW, 1.5);
                ctx.fillStyle = '#8C5535';
                ctx.fillRect(houseX + 2, ly - 3.5, houseW - 4, 2.2);
            }

            // Pionowe belki narożne i konstrukcyjne
            ctx.fillStyle = '#4A2814';
            ctx.fillRect(houseX, -houseH, 5, houseH - 8);
            ctx.fillRect(houseX + houseW - 5, -houseH, 5, houseH - 8);
            ctx.fillRect(houseX + 38, -houseH, 4, houseH - 8);

            // Drewniane drzwi wejściowe ze schodkiem i okuciami
            const doorX = houseX + 12;
            ctx.fillStyle = '#374151';
            ctx.fillRect(doorX - 3, -3, 24, 3);
            ctx.fillStyle = '#3E200F';
            ctx.fillRect(doorX - 1.5, -39.5, 21, 32.5);
            ctx.fillStyle = '#5C3218';
            ctx.fillRect(doorX, -38, 18, 30);
            ctx.fillStyle = '#4A2611';
            ctx.fillRect(doorX + 5.5, -38, 1.2, 30);
            ctx.fillRect(doorX + 11.5, -38, 1.2, 30);
            // Złota klamka i żelazne zawiasy
            ctx.fillStyle = '#1F2937';
            ctx.fillRect(doorX + 1, -33, 4, 1.8);
            ctx.fillRect(doorX + 1, -16, 4, 1.8);
            ctx.fillStyle = '#FBBF24';
            ctx.fillRect(doorX + 14, -24, 2.5, 2.5);

            // Okno z okiennicami i skrzynką z kwiatami (w nocy świeci ciepłym blaskiem!)
            const winX = houseX + 52;
            const winY = -39;
            const winW = 24;
            const winH = 18;

            if (isNightOrDusk) {
                ctx.save();
                let glowGrad = ctx.createRadialGradient(winX + winW / 2, winY + winH / 2, 3, winX + winW / 2, winY + winH / 2, 42);
                glowGrad.addColorStop(0, 'rgba(253, 224, 71, 0.42)');
                glowGrad.addColorStop(1, 'rgba(249, 115, 22, 0.0)');
                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.arc(winX + winW / 2, winY + winH / 2, 42, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // Okiennice boczne
            ctx.fillStyle = '#3E200F';
            ctx.fillRect(winX - 5, winY, 4.5, winH);
            ctx.fillRect(winX + winW + 0.5, winY, 4.5, winH);
            // Rama i szyba okienna
            ctx.fillStyle = '#2E1608';
            ctx.fillRect(winX - 1, winY - 1, winW + 2, winH + 2);
            ctx.fillStyle = isNightOrDusk ? '#FDE047' : '#7DD3FC';
            ctx.fillRect(winX + 1, winY + 1, winW - 2, winH - 2);
            if (!isNightOrDusk) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.fillRect(winX + 2, winY + 2, 6, 6);
            } else {
                ctx.fillStyle = '#F59E0B';
                ctx.fillRect(winX + 3, winY + 6, winW - 6, winH - 7);
            }
            // Szprosy okienne (krzyż)
            ctx.fillStyle = '#3E200F';
            ctx.fillRect(winX + winW / 2 - 1, winY, 2, winH);
            ctx.fillRect(winX, winY + winH / 2 - 1, winW, 2);

            // Skrzynka z kwiatkami pod oknem
            ctx.fillStyle = '#4A2814';
            ctx.fillRect(winX - 1, winY + winH + 1, winW + 2, 4.5);
            ctx.fillStyle = '#15803D';
            ctx.fillRect(winX + 1, winY + winH - 1.5, winW - 2, 3);
            const flowerCols = ['#EF4444', '#FBBF24', '#F472B6', '#38BDF8'];
            for (let fl = 0; fl < 5; fl++) {
                ctx.fillStyle = flowerCols[fl % flowerCols.length];
                ctx.fillRect(winX + 2 + fl * 4.6, winY + winH - 3.2, 2.6, 2.6);
            }

            // Dwuspadowy drewniany dach z gontów i poddaszem
            ctx.fillStyle = '#3E200F';
            ctx.beginPath();
            ctx.moveTo(houseX - 9, -houseH + 2);
            ctx.lineTo(houseX + houseW / 2, -houseH - 30);
            ctx.lineTo(houseX + houseW + 9, -houseH + 2);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#5C3218';
            ctx.beginPath();
            ctx.moveTo(houseX - 5, -houseH);
            ctx.lineTo(houseX + houseW / 2, -houseH - 26);
            ctx.lineTo(houseX + houseW + 5, -houseH);
            ctx.closePath();
            ctx.fill();

            // Małe okrągłe okienko na poddaszu
            ctx.fillStyle = '#2E1608';
            ctx.beginPath();
            ctx.arc(houseX + houseW / 2, -houseH - 11, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = isNightOrDusk ? '#FDE047' : '#38BDF8';
            ctx.beginPath();
            ctx.arc(houseX + houseW / 2, -houseH - 11, 3.8, 0, Math.PI * 2);
            ctx.fill();

            // ==========================================
            // 3. KAMIENNO-DREWNIANA STUDNIA OBOK DOMKU (po prawej stronie: x od +72 do +112)
            // ==========================================
            const wellX = 76;
            const wellW = 30;

            // Drewniane słupki podtrzymujące daszek studni
            ctx.fillStyle = '#4A2814';
            ctx.fillRect(wellX + 3, -44, 3.5, 30);
            ctx.fillRect(wellX + wellW - 6.5, -44, 3.5, 30);

            // Wałek z korbką, liną i drewnianym wiadrem
            ctx.fillStyle = '#78472A';
            ctx.fillRect(wellX + 6, -34, wellW - 12, 3.2);
            // Korbka z boku
            ctx.fillStyle = '#9CA3AF';
            ctx.fillRect(wellX + wellW - 3, -34, 4, 1.6);
            ctx.fillRect(wellX + wellW, -34, 1.6, 5);
            // Lina i wiadro
            ctx.fillStyle = '#D6D3D1';
            ctx.fillRect(wellX + wellW / 2 - 0.8, -31, 1.6, 12);
            ctx.fillStyle = '#5C341D';
            ctx.fillRect(wellX + wellW / 2 - 4, -20, 8, 6.5);
            ctx.fillStyle = '#9CA3AF';
            ctx.fillRect(wellX + wellW / 2 - 4.2, -18.5, 8.4, 1.3);

            // Kamienna cembrowina studni
            ctx.fillStyle = '#4B5563';
            ctx.fillRect(wellX, -15, wellW, 15);
            for (let wy = -14; wy < -1; wy += 4.5) {
                for (let wx = wellX + 1; wx < wellX + wellW - 2; wx += 7) {
                    ctx.fillStyle = ((wx + Math.floor(wy)) % 2 === 0) ? '#6B7280' : '#374151';
                    ctx.fillRect(wx, wy, 6, 3.5);
                }
            }
            ctx.fillStyle = '#9CA3AF';
            ctx.fillRect(wellX - 1.5, -16.5, wellW + 3, 2.5);

            // Daszek nad studnią
            ctx.fillStyle = '#3E200F';
            ctx.beginPath();
            ctx.moveTo(wellX - 5, -42);
            ctx.lineTo(wellX + wellW / 2, -56);
            ctx.lineTo(wellX + wellW + 5, -42);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#6E3D20';
            ctx.beginPath();
            ctx.moveTo(wellX - 2, -43);
            ctx.lineTo(wellX + wellW / 2, -53.5);
            ctx.lineTo(wellX + wellW + 2, -43);
            ctx.closePath();
            ctx.fill();

        } else if (st.type === 'campsite') {
            // ==========================================
            // OBOZOWISKO W TLE: NAMIOTY Z OGNISKIEM OBOK
            // ==========================================
            // Dobierz kolory płótna namiotów
            let tentMain1 = '#15803D', tentLight1 = '#22C55E', tentDark1 = '#14532D';
            let tentMain2 = '#B45309', tentLight2 = '#D97706', tentDark2 = '#78350F';
            if (st.tentVariant === 1) {
                tentMain1 = '#B45309'; tentLight1 = '#F59E0B'; tentDark1 = '#78350F';
                tentMain2 = '#1D4ED8'; tentLight2 = '#3B82F6'; tentDark2 = '#1E3A8A';
            } else if (st.tentVariant === 2) {
                tentMain1 = '#991B1B'; tentLight1 = '#DC2626'; tentDark1 = '#7F1D1D';
                tentMain2 = '#15803D'; tentLight2 = '#22C55E'; tentDark2 = '#14532D';
            }

            // 1. GŁÓWNY DUŻY NAMIOT (po lewej stronie: x od -82 do -14)
            const t1X = -48;
            const t1HalfW = 32;
            const t1H = 38;

            // Linki odciągowe i śledzie namiotowe
            ctx.strokeStyle = 'rgba(214, 211, 209, 0.65)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(t1X - t1HalfW + 4, -12);
            ctx.lineTo(t1X - t1HalfW - 8, 0);
            ctx.moveTo(t1X + t1HalfW - 4, -12);
            ctx.lineTo(t1X + t1HalfW + 8, 0);
            ctx.stroke();
            ctx.fillStyle = '#78350F';
            ctx.fillRect(t1X - t1HalfW - 9, -3, 2, 3);
            ctx.fillRect(t1X + t1HalfW + 7, -3, 2, 3);

            // Trójkątny korpus głównego namiotu
            ctx.fillStyle = tentDark1;
            ctx.beginPath();
            ctx.moveTo(t1X - t1HalfW, 0);
            ctx.lineTo(t1X, -t1H);
            ctx.lineTo(t1X + t1HalfW, 0);
            ctx.closePath();
            ctx.fill();

            // Jaśniejsza połać materiału
            ctx.fillStyle = tentMain1;
            ctx.beginPath();
            ctx.moveTo(t1X - t1HalfW + 3, 0);
            ctx.lineTo(t1X, -t1H + 2);
            ctx.lineTo(t1X + 4, 0);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = tentLight1;
            ctx.beginPath();
            ctx.moveTo(t1X - t1HalfW + 6, 0);
            ctx.lineTo(t1X, -t1H + 4);
            ctx.lineTo(t1X - 8, 0);
            ctx.closePath();
            ctx.fill();

            // Ciemne wejście do namiotu z podwiniętą płachtą i drewnianym masztem
            ctx.fillStyle = '#111827';
            ctx.beginPath();
            ctx.moveTo(t1X - 9, 0);
            ctx.lineTo(t1X + 2, -24);
            ctx.lineTo(t1X + 13, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#5C341D';
            ctx.fillRect(t1X + 1, -t1H - 3, 2.5, t1H + 3);
            ctx.fillStyle = '#E7E5E4';
            ctx.fillRect(t1X - 10, -14, 3.5, 14);
            ctx.fillRect(t1X + 11, -14, 3.5, 14);

            // 2. DRUGI MNIEJSZY NAMIOT (po prawej stronie za ogniskiem: x od +38 do +88)
            const t2X = 62;
            const t2HalfW = 24;
            const t2H = 29;

            ctx.fillStyle = tentDark2;
            ctx.beginPath();
            ctx.moveTo(t2X - t2HalfW, 0);
            ctx.lineTo(t2X, -t2H);
            ctx.lineTo(t2X + t2HalfW, 0);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = tentMain2;
            ctx.beginPath();
            ctx.moveTo(t2X - t2HalfW + 2, 0);
            ctx.lineTo(t2X, -t2H + 2);
            ctx.lineTo(t2X + 3, 0);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#111827';
            ctx.beginPath();
            ctx.moveTo(t2X - 7, 0);
            ctx.lineTo(t2X, -18);
            ctx.lineTo(t2X + 8, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#5C341D';
            ctx.fillRect(t2X - 1, -t2H - 2, 2.2, t2H + 2);

            // 3. DREWNIANY PIEŃ DO SIEDZENIA ORAZ OGNISKO (w centrum obozowiska: x około +6)
            const fireX = 8;

            // Pień drzewa do siedzenia obok ogniska
            ctx.fillStyle = '#4A2814';
            ctx.fillRect(fireX - 24, -7, 13, 7);
            ctx.fillStyle = '#78472A';
            ctx.fillRect(fireX - 23, -6, 11, 3);
            ctx.fillStyle = '#D97706';
            ctx.fillRect(fireX - 24, -6, 2, 5);

            // Ciepła poświata od ogniska (szczególnie klimatyczna o zachodzie słońca i w nocy!)
            let firePulse = Math.sin(globalTick * 0.22 + st.x) * 4;
            let glowRadius = (isNightOrDusk ? 64 : 34) + firePulse;
            let fireGrad = ctx.createRadialGradient(fireX, -10, 2, fireX, -10, glowRadius);
            fireGrad.addColorStop(0.0, isNightOrDusk ? 'rgba(251, 146, 60, 0.55)' : 'rgba(251, 146, 60, 0.28)');
            fireGrad.addColorStop(0.5, isNightOrDusk ? 'rgba(234, 88, 12, 0.24)' : 'rgba(234, 88, 12, 0.08)');
            fireGrad.addColorStop(1.0, 'rgba(234, 88, 12, 0.0)');
            ctx.fillStyle = fireGrad;
            ctx.beginPath();
            ctx.arc(fireX, -10, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            // Skrzyżowane polana drewna w ognisku
            ctx.fillStyle = '#3E200F';
            ctx.fillRect(fireX - 10, -5, 20, 3.5);
            ctx.fillStyle = '#271206';
            ctx.fillRect(fireX - 8, -7, 16, 3);

            // Kamienny krąg wokół ogniska
            const stones = [-11, -7, -3, 1, 5, 9];
            for (let i = 0; i < stones.length; i++) {
                ctx.fillStyle = (i % 2 === 0) ? '#6B7280' : '#4B5563';
                ctx.fillRect(fireX + stones[i], -3.5, 4.2, 3.5);
            }

            // Animowane, tańczące płomienie ogniska
            let fH1 = 13 + Math.sin(globalTick * 0.28 + st.x) * 3.2;
            let fH2 = 10 + Math.cos(globalTick * 0.34 + st.x) * 2.5;
            let fSway = Math.sin(globalTick * 0.21) * 1.8;

            // Zewnętrzny czerwono-pomarańczowy płomień
            ctx.fillStyle = '#EA580C';
            ctx.beginPath();
            ctx.moveTo(fireX - 8, -3);
            ctx.lineTo(fireX - 3 + fSway, -3 - fH1);
            ctx.lineTo(fireX + 2 - fSway * 0.6, -3 - fH2 * 0.75);
            ctx.lineTo(fireX + 5 + fSway, -3 - fH2);
            ctx.lineTo(fireX + 8, -3);
            ctx.closePath();
            ctx.fill();

            // Środkowy złocisto-pomarańczowy płomień
            ctx.fillStyle = '#F59E0B';
            ctx.beginPath();
            ctx.moveTo(fireX - 5.5, -3);
            ctx.lineTo(fireX - 1 + fSway * 0.8, -3 - fH1 * 0.78);
            ctx.lineTo(fireX + 3.5 + fSway * 0.5, -3 - fH2 * 0.72);
            ctx.lineTo(fireX + 5.5, -3);
            ctx.closePath();
            ctx.fill();

            // Jasnożółte jądro ognia
            ctx.fillStyle = '#FEF08A';
            ctx.beginPath();
            ctx.moveTo(fireX - 3, -3);
            ctx.lineTo(fireX + fSway * 0.5, -3 - fH1 * 0.48);
            ctx.lineTo(fireX + 3, -3);
            ctx.closePath();
            ctx.fill();

            // Unoszące się iskierki nad ogniskiem
            for (let sp = 0; sp < 3; sp++) {
                let spP = ((globalTick * 0.7 + sp * 19 + st.x) % 40) / 40;
                let spX = fireX + Math.sin(globalTick * 0.12 + sp * 2.1) * 6;
                let spY = -8 - spP * 22;
                ctx.fillStyle = (sp % 2 === 0) ? '#FDE047' : '#FB923C';
                ctx.fillRect(spX - 0.8, spY, 1.6, 1.6);
            }
        }

        ctx.restore();
    }
}

function drawSpawnAboriginalTotem(ctx) {
    if (player.inStomach) return;
    const groundY = surfaceHeights[SPAWN_TILE_X] * TILE_SIZE;
    const centerX = SPAWN_TILE_X * TILE_SIZE + TILE_SIZE / 2;

    // Rysuj tylko gdy okolica Spawnu jest w polu widzenia kamery
    if (centerX + 80 < cameraX || centerX - 80 > cameraX + canvas.width / SCALE) return;

    ctx.save();
    ctx.translate(centerX, groundY);

    // 1. Kamienno-ziemny postument rytualny u podstawy (szerokość 38px, wysokość 10px)
    ctx.fillStyle = '#3E2723';
    ctx.fillRect(-19, -10, 38, 10);
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(-17, -9, 34, 4);
    // Kropki aborygeńskie na postumencie (biała kreda i żółta ochra)
    for (let dx = -14; dx <= 14; dx += 4) {
        ctx.fillStyle = (Math.abs(dx) % 8 === 0) ? '#F1C40F' : '#ECF0F1';
        ctx.fillRect(dx - 0.8, -6, 1.6, 1.6);
    }

    // 2. Główny rzeźbiony pień totemu (ciemne drewno żelazne / eukaliptusowe, wysokość 88px)
    const poleW = 20;
    const poleH = 88;
    ctx.fillStyle = '#27160E';
    ctx.fillRect(-poleW / 2 - 1, -poleH - 8, poleW + 2, poleH);
    ctx.fillStyle = '#3E2417';
    ctx.fillRect(-poleW / 2, -poleH - 8, poleW, poleH);
    // Cieniowanie pionowe pnia
    ctx.fillStyle = '#4E3021';
    ctx.fillRect(-poleW / 2 + 2, -poleH - 8, 4, poleH);
    ctx.fillStyle = '#1E100A';
    ctx.fillRect(poleW / 2 - 3, -poleH - 8, 3, poleH);

    // --- SEGMENT DOLNY (-10 do -36): Wąż Tęczowy i Aborygeńskie Kręgi Ziemi ---
    // Pasy czerwonej i żółtej ochry
    ctx.fillStyle = '#B03A2E';
    ctx.fillRect(-poleW / 2, -36, poleW, 4);
    ctx.fillRect(-poleW / 2, -16, poleW, 3);
    ctx.fillStyle = '#D68910';
    ctx.fillRect(-poleW / 2, -32, poleW, 2);

    // Koncentryczny symbol plemienny (miejsce spotkań / święte źródło)
    ctx.fillStyle = '#C0392B';
    ctx.beginPath();
    ctx.arc(0, -24, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F39C12';
    ctx.beginPath();
    ctx.arc(0, -24, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(0, -24, 2.0, 0, Math.PI * 2);
    ctx.fill();
    // Białe kropki wokół kręgu (dot painting)
    for (let a = 0; a < 8; a++) {
        let ang = (a / 8) * Math.PI * 2;
        ctx.fillStyle = '#ECF0F1';
        ctx.fillRect(Math.cos(ang) * 8 - 0.7, -24 + Math.sin(ang) * 8 - 0.7, 1.4, 1.4);
    }

    // --- SEGMENT ŚRODKOWY (-36 do -66): Maska Przodków i Boczne Tarcze Plemienne ---
    // Boczne rzeźbione skrzydła / tarcze aborygeńskie z wzorem kropek
    ctx.fillStyle = '#27160E';
    ctx.fillRect(-26, -62, 16, 20);
    ctx.fillRect(10, -62, 16, 20);
    ctx.fillStyle = '#922B21';
    ctx.fillRect(-24, -60, 12, 16);
    ctx.fillRect(12, -60, 12, 16);
    // Geometryczne pasy i kropki na bocznych tarczach
    ctx.fillStyle = '#F1C40F';
    ctx.fillRect(-22, -54, 8, 2);
    ctx.fillRect(14, -54, 8, 2);
    for (let dy = -58; dy <= -46; dy += 4) {
        ctx.fillStyle = '#ECF0F1';
        ctx.fillRect(-22, dy, 1.5, 1.5);
        ctx.fillRect(-16, dy, 1.5, 1.5);
        ctx.fillRect(15, dy, 1.5, 1.5);
        ctx.fillRect(21, dy, 1.5, 1.5);
    }

    // Twarz / Maska Przodka na pniu środkowym
    ctx.fillStyle = '#78281F';
    ctx.fillRect(-9, -63, 18, 24);
    // Białe plemienne obwódki oczu
    ctx.fillStyle = '#ECF0F1';
    ctx.fillRect(-7.5, -59, 6, 5);
    ctx.fillRect(1.5, -59, 6, 5);
    // Węglowe wnętrze oczu i turkusowy blask duchowy
    ctx.fillStyle = '#111111';
    ctx.fillRect(-6, -58, 3.5, 3);
    ctx.fillRect(2.5, -58, 3.5, 3);
    let glowPulse = 0.75 + Math.sin(globalTick * 0.08) * 0.25;
    ctx.fillStyle = `rgba(56, 189, 248, ${glowPulse.toFixed(2)})`;
    ctx.fillRect(-5, -57.3, 1.8, 1.8);
    ctx.fillRect(3.5, -57.3, 1.8, 1.8);

    // Rzeźbiony nos i rytualne malowanie z kropek na policzkach
    ctx.fillStyle = '#D35400';
    ctx.fillRect(-1.5, -56, 3, 8);
    ctx.fillStyle = '#F1C40F';
    for (let dx = -7; dx <= 7; dx += 3.5) {
        ctx.fillRect(dx - 0.7, -49, 1.4, 1.4);
    }
    // Rytualne usta
    ctx.fillStyle = '#111111';
    ctx.fillRect(-5, -45, 10, 3);
    ctx.fillStyle = '#ECF0F1';
    for (let tx = -4; tx <= 3; tx += 2.3) {
        ctx.fillRect(tx, -44.5, 1.2, 2);
    }

    // --- SEGMENT GÓRNY (-66 do -98): Duch Czasu Snu (Dreamtime) i Korona Piór/Słońca ---
    ctx.fillStyle = '#B03A2E';
    ctx.fillRect(-poleW / 2 - 2, -67, poleW + 4, 3);
    ctx.fillStyle = '#F39C12';
    ctx.fillRect(-poleW / 2 - 1, -96, poleW + 2, 3);

    // Górna głowa strażnika
    ctx.fillStyle = '#3E2417';
    ctx.fillRect(-11, -93, 22, 26);
    // Kropkowany łuk nad głową (symbol Słońca i Gwiazd)
    ctx.fillStyle = '#E67E22';
    ctx.fillRect(-9, -91, 18, 5);
    for (let dx = -8; dx <= 8; dx += 3.2) {
        ctx.fillStyle = '#ECF0F1';
        ctx.fillRect(dx - 0.7, -89.5, 1.4, 1.4);
    }

    // Świecące złocisto oczy górnego ducha
    ctx.fillStyle = '#ECF0F1';
    ctx.fillRect(-7, -82, 5, 4);
    ctx.fillRect(2, -82, 5, 4);
    ctx.fillStyle = '#F1C40F';
    ctx.fillRect(-5.5, -81, 2.5, 2.5);
    ctx.fillRect(3.0, -81, 2.5, 2.5);

    // Plemienne romby poniżej oczu
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-2, -75, 4, 4);
    ctx.fillStyle = '#ECF0F1';
    ctx.fillRect(-7, -74, 2, 2);
    ctx.fillRect(5, -74, 2, 2);

    // Zwieńczenie totemu — rytualny pióropusz / promienie na szczycie
    const feathers = [-10, -5, 0, 5, 10];
    for (let i = 0; i < feathers.length; i++) {
        let fx = feathers[i];
        let fh = (i === 2) ? 12 : ((i === 1 || i === 3) ? 9 : 7);
        ctx.fillStyle = (i % 2 === 0) ? '#C0392B' : '#D68910';
        ctx.fillRect(fx - 1.5, -96 - fh, 3, fh);
        ctx.fillStyle = '#ECF0F1';
        ctx.fillRect(fx - 1.5, -96 - fh, 3, 2.2);
    }

    // Subtelny napis informacyjny nad Totemem Spawnu
    ctx.font = 'bold 6.5px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 3;
    ctx.fillStyle = '#fde047';
    ctx.fillText("🗿 TOTEM SPAWNU", 0, -114);

    ctx.restore();
}

function draw() {
    drawAtmosphericSky(ctx);
    
    ctx.save(); 
    ctx.scale(SCALE, SCALE);
    ctx.translate(-cameraX, -cameraY);

    const curDrawW = player.inStomach ? STOMACH_WIDTH : MAP_WIDTH;
    const curDrawH = player.inStomach ? STOMACH_HEIGHT : MAP_HEIGHT;

    if (player.inStomach) {
        ctx.fillStyle = '#310A12';
        ctx.fillRect(0, 0, curDrawW * TILE_SIZE, curDrawH * TILE_SIZE);
    }

    const startX = Math.max(0, Math.floor(cameraX / TILE_SIZE));
    const endX = Math.min(curDrawW, Math.ceil((cameraX + canvas.width / SCALE) / TILE_SIZE));
    const startY = Math.max(0, Math.floor(cameraY / TILE_SIZE));
    const endY = Math.min(curDrawH, Math.ceil((cameraY + canvas.height / SCALE) / TILE_SIZE));

    for (let x = startX; x < endX; x++) {
        for (let y = startY; y < endY; y++) {
            const block = getTile(x, y);
            if (block !== BLOCKS.AIR) {
                if (block === BLOCKS.KELP && !player.inStomach && isSubmergedTile(x, y)) {
                    ctx.drawImage(TEXTURES[BLOCKS.WATER], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }

                if (TEXTURES[block]) {
                    ctx.drawImage(TEXTURES[block], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                } else {
                    ctx.fillStyle = COLORS[block]; 
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
                
                if (block === BLOCKS.WATER && y > 0 && getTile(x, y - 1) === BLOCKS.AIR) {
                    let waveOffset = Math.sin(globalTick * 0.06 + x * 0.7) * 1.2;
                    ctx.fillStyle = 'rgba(200, 240, 255, 0.65)';
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 1 + waveOffset, TILE_SIZE, 2);
                } else if (block === BLOCKS.ACID && y > 0 && getTile(x, y - 1) === BLOCKS.AIR) {
                    let waveOffset = Math.sin(globalTick * 0.09 + x * 0.9) * 1.4;
                    ctx.fillStyle = 'rgba(217, 249, 157, 0.85)';
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 1 + waveOffset, TILE_SIZE, 2.5);
                }

                if (block !== BLOCKS.WATER && block !== BLOCKS.KELP && block !== BLOCKS.ACID) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; 
                    ctx.lineWidth = 0.5; 
                    ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }

                // Rysowanie małych owoców opuncji na kaktusach!
                if (block === BLOCKS.CACTUS && typeof hasOpuntiaFruit === 'function' && hasOpuntiaFruit(x, y)) {
                    let px = x * TILE_SIZE;
                    let py = y * TILE_SIZE;
                    let isTopCactus = (y > 0 && getTile(x, y - 1) !== BLOCKS.CACTUS);

                    // Lewy owoc opuncji na boku kaktusa
                    ctx.fillStyle = '#be123c';
                    ctx.fillRect(px - 2, py + 5, 5, 6);
                    ctx.fillStyle = '#fb7185';
                    ctx.fillRect(px - 1, py + 6, 3, 4);
                    ctx.fillStyle = '#fde047';
                    ctx.fillRect(px, py + 7, 1, 1);

                    // Prawy owoc opuncji na boku kaktusa
                    ctx.fillStyle = '#be123c';
                    ctx.fillRect(px + TILE_SIZE - 3, py + 9, 5, 6);
                    ctx.fillStyle = '#f43f5e';
                    ctx.fillRect(px + TILE_SIZE - 2, py + 10, 3, 4);
                    ctx.fillStyle = '#fde047';
                    ctx.fillRect(px + TILE_SIZE - 1, py + 11, 1, 1);

                    // Jeśli to czubek kaktusa — narysuj też dorodne owoce opuncji na koronie!
                    if (isTopCactus) {
                        ctx.fillStyle = '#be123c';
                        ctx.fillRect(px + 3, py - 4, 5, 5);
                        ctx.fillStyle = '#f43f5e';
                        ctx.fillRect(px + 4, py - 3, 3, 3);

                        ctx.fillStyle = '#9f1239';
                        ctx.fillRect(px + 11, py - 5, 6, 6);
                        ctx.fillStyle = '#fb7185';
                        ctx.fillRect(px + 12, py - 4, 4, 4);
                        ctx.fillStyle = '#fde047';
                        ctx.fillRect(px + 13, py - 3, 1.2, 1.2);
                    }
                }
            }
        }
    }

    // Rysuj niezniszczalny Totem Aborygeński na Spawnie oraz struktury tła (Drewniane Domki ze studnią i polem zboża oraz Namioty z ogniskiem)
    drawSpawnAboriginalTotem(ctx);
    drawWorldBackgroundStructures(ctx);

    if (player.inStomach) {
        ctx.save();
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 7px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 3;
        ctx.fillText("⬆️ PRZEŁYK (PRZEKOP TKANKĘ, ABY WYJŚĆ)", 19 * TILE_SIZE, 1.5 * TILE_SIZE);
        ctx.restore();
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
        let targetHasOpuntia = (block === BLOCKS.CACTUS && typeof hasOpuntiaFruit === 'function' && hasOpuntiaFruit(miningX, miningY));
        let reqHard = targetHasOpuntia ? BLOCK_HARDNESS[BLOCKS.OPUNTIA] : BLOCK_HARDNESS[block];
        if (block !== BLOCKS.AIR && reqHard) {
            let progressRatio = Math.min(1, miningProgress / reqHard);
            
            ctx.fillStyle = `rgba(0, 0, 0, ${progressRatio * 0.7})`;
            ctx.fillRect(miningX * TILE_SIZE, miningY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            
            ctx.fillStyle = '#000';
            ctx.fillRect(miningX * TILE_SIZE + 2, miningY * TILE_SIZE + TILE_SIZE - 4, TILE_SIZE - 4, 3);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(miningX * TILE_SIZE + 2, miningY * TILE_SIZE + TILE_SIZE - 4, (TILE_SIZE - 4) * progressRatio, 3);
        }
    }

    // Rysowanie postępu kopania bloków przez innych graczy w Multiplayerze
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp || rp.inGame === false || rp.dead || Boolean(rp.inStomach) !== Boolean(player.inStomach)) continue;
        if (typeof rp.miningX === 'number' && rp.miningX !== -1 && typeof rp.miningY === 'number' && rp.miningY !== -1 && rp.miningProgress > 0) {
            let rBlock = getTile(rp.miningX, rp.miningY);
            let rHasOpuntia = (rBlock === BLOCKS.CACTUS && typeof hasOpuntiaFruit === 'function' && hasOpuntiaFruit(rp.miningX, rp.miningY));
            let rReqHard = rHasOpuntia ? BLOCK_HARDNESS[BLOCKS.OPUNTIA] : BLOCK_HARDNESS[rBlock];
            if (rBlock !== BLOCKS.AIR && rReqHard) {
                let rRatio = Math.min(1, rp.miningProgress / rReqHard);
                ctx.fillStyle = `rgba(0, 0, 0, ${rRatio * 0.65})`;
                ctx.fillRect(rp.miningX * TILE_SIZE, rp.miningY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#000';
                ctx.fillRect(rp.miningX * TILE_SIZE + 2, rp.miningY * TILE_SIZE + TILE_SIZE - 4, TILE_SIZE - 4, 3);
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(rp.miningX * TILE_SIZE + 2, rp.miningY * TILE_SIZE + TILE_SIZE - 4, (TILE_SIZE - 4) * rRatio, 3);
            }
        }
    }

    if (!player.inStomach) {
        // Jeśli gracz właśnie wydostał się z czerwia, narysuj w miejscu wyjścia wynurzającą się paszczę Czerwia!
        if (typeof wormTransition !== 'undefined' && wormTransition.active && wormTransition.type === 'spit_out') {
            let exitP = wormTransition.timer / wormTransition.maxTimer;
            let sinkOffset = exitP * 38;
            let exitSegs = [
                { x: wormTransition.worldX, y: wormTransition.worldY + 10 + sinkOffset },
                { x: wormTransition.worldX, y: wormTransition.worldY + 22 + sinkOffset },
                { x: wormTransition.worldX, y: wormTransition.worldY + 34 + sinkOffset }
            ];
            drawSandwormEntity(ctx, wormTransition.worldX, wormTransition.worldY + sinkOffset, exitSegs, 15, 5);
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

        if (typeof deers !== 'undefined') {
            deers.forEach(d => {
                drawDeerEntity(ctx, d);
            });
        }

        if (typeof camels !== 'undefined') {
            camels.forEach(c => {
                drawCamelEntity(ctx, c);
            });
        }

        if (typeof fishes !== 'undefined') {
            fishes.forEach(f => {
                drawFishEntity(ctx, f);
            });
        }

        pigs.forEach(pig => {
            drawPigEntity(ctx, pig.x, pig.y, pig.width, pig.height, pig.direction || 1, pig.wingFlap, player.ridingPig === pig);
        });
    }

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
            let isTargetMinable = (!isSpawnTotemBaseTile(tileX, tileY) && targetTile !== BLOCKS.AIR && targetTile !== BLOCKS.WATER && targetTile !== BLOCKS.ACID && (targetTile !== BLOCKS.STOMACH_WALL || (!player.inStomach && player.gameMode === 1)));
            let canSeeTarget = isBlockVisibleToPlayer(tileX, tileY);
            
            let currentItem = hotbar[selectedSlotIndex];
            let hasItemToPlace = currentItem && currentItem.type !== BLOCKS.AIR && currentItem.count > 0 && hasNeighborBlock(tileX, tileY);
            
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

    // RYSOWANIE INNYCH GRACZY W TRYBIE MULTIPLAYER (gracze w żołądku czerwia znikają dla graczy na zewnątrz!)
    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp || rp.inGame === false || Boolean(rp.inStomach) !== Boolean(player.inStomach)) continue;

        let rpTint = getPlayerCharacterTint(
            Boolean(rp.damageEffect && rp.damageEffect > 0),
            Boolean(rp.isPoisoned || (rp.poisonDamageEffect && rp.poisonDamageEffect > 0)),
            Boolean(rp.poisonDamageEffect && rp.poisonDamageEffect > 0)
        );

        if (rp.isSandworm && !rp.dead) {
            drawSandwormEntity(ctx, rp.x + 8, rp.y + 12, rp.wormSegments, sandworm.radius, sandworm.numSegments, rpTint);
        }

        drawOverheadPlayerName(ctx, rp.x + 8, rp.isSandworm ? rp.y - 11 : rp.y - 9, rp.nick || "Gracz", Boolean(rp.isAdmin), false);

        if (typeof rp.hp === 'number' && !rp.dead && rp.gameMode !== 1) {
            let hpRatio = Math.max(0, Math.min(1, rp.hp / (rp.maxHp || 5)));
            let barYOffset = rp.isSandworm ? rp.y - 9 : rp.y - 7;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(rp.x - 1, barYOffset, 18, 3);
            ctx.fillStyle = hpRatio > 0.4 ? '#2ecc71' : '#e74c3c';
            ctx.fillRect(rp.x, barYOffset + 0.5, 16 * hpRatio, 2);
        }

        if (!rp.isSandworm) {
            let drawRx = rp.x;
            let drawRy = rp.y;
            let drawRDir = rp.direction || 1;

            // Jeśli ten zdalny gracz siedzi jako 2. osoba (pasażer) na wielbłądzie dwugarbnym, dopasuj jego pozycję dokładnie do tylnego siodła kierowcy
            if (rp.passengerOnPlayerId && !rp.dead) {
                if (rp.passengerOnPlayerId === myPlayerId && player.ridingCamel) {
                    drawRDir = player.direction || 1;
                    drawRx = player.x - drawRDir * 11;
                    drawRy = player.y;
                } else if (remotePlayers[rp.passengerOnPlayerId] && remotePlayers[rp.passengerOnPlayerId].isRidingCamel) {
                    let drv = remotePlayers[rp.passengerOnPlayerId];
                    drawRDir = drv.direction || 1;
                    drawRx = drv.x - drawRDir * 11;
                    drawRy = drv.y;
                }
            }

            if (rp.isRiding && !rp.dead) {
                let rFlap = (typeof rp.pigWingFlap === 'number' && rp.pigWingFlap !== 0) ? rp.pigWingFlap : (globalTick * 0.45);
                drawPigEntity(ctx, drawRx - 5, drawRy + 20, 26, 18, drawRDir, rFlap, true);
            } else if (rp.isRidingCamel && !rp.dead) {
                let cVar = rp.camelVariant || 'wielblad_samica';
                let isTwoHumped = String(cVar).startsWith('wielblad');
                let cDims = (typeof getCamelDimensions === 'function') ? getCamelDimensions(cVar) : { width: 32, height: 26 };
                drawCamelEntity(ctx, {
                    variant: cVar,
                    x: drawRx + 8 - cDims.width / 2 - (isTwoHumped ? drawRDir * 5 : 0),
                    y: drawRy + 17,
                    width: cDims.width,
                    height: cDims.height,
                    direction: drawRDir,
                    walkFrame: rp.camelWalkFrame || 0,
                    state: 'walk',
                    isTamed: true
                }, true);
            }

            let rSkin = SKINS[rp.skinIndex] || SKINS[0];
            let rMounted = Boolean(rp.isRiding || rp.isRidingCamel || rp.passengerOnPlayerId);
            let rAirborne = !rp.grounded && !rp.dead && !rMounted && !rp.isSwimming;
            drawCharacter(
                ctx,
                drawRx + 8,
                drawRy + 12,
                drawRDir,
                rp.walkFrame || 0,
                rp.dead,
                rMounted,
                rSkin,
                rp.pickaxeAnim,
                rp.isSwimming,
                rAirborne,
                rpTint
            );
        }

        if (rp.damageEffect && rp.damageEffect > 0) {
            rp.damageEffect--;
        }
        if (rp.poisonDamageEffect && rp.poisonDamageEffect > 0) {
            rp.poisonDamageEffect--;
        }
    }

    // RYSOWANIE WŁASNEJ POSTACI (z zabarwieniem samej sylwetki postaci przy uderzeniu lub truciźnie, bez prostokątnego hitboxa!)
    let myCharTint = getPlayerCharacterTint(
        player.damageEffect > 0,
        Boolean(player.inAcid || player.acidPoisonTimer > 0 || player.poisonDamageEffect > 0),
        player.poisonDamageEffect > 0
    );

    if (player.isSandworm && !player.dead) {
        drawSandwormEntity(ctx, player.x + player.width / 2, player.y + player.height / 2, player.wormSegments, sandworm.radius, sandworm.numSegments, myCharTint);
    }

    drawOverheadPlayerName(ctx, player.x + player.width / 2, player.isSandworm ? player.y - 8 : player.y - 6, playerNick || "Gracz", Boolean(player.isAdmin), true);

    if (!player.isSandworm) {
        let isMounted = (player.ridingPig !== null || player.ridingCamel !== null || player.passengerOnPlayerId !== null);
        let isAirborne = !player.grounded && !player.dead && !isMounted && !player.inWater;
        let pickaxeAnim = ((isClicking && miningX !== -1) || pvpHitCooldown > 14) && !showInventory && !isCommandOpen ? pickaxeSwing : null;
        
        drawCharacter(
            ctx, 
            player.x + player.width / 2, 
            player.y + player.height / 2, 
            player.direction, 
            player.walkFrame, 
            player.dead, 
            isMounted, 
            SKINS[selectedSkinIndex], 
            pickaxeAnim,
            player.isSwimming,
            isAirborne,
            myCharTint
        );
    } 

    ctx.restore(); 

    // Klimatyczne oświetlenie świata dopasowane do pory dnia (ciepły blask zachodu lub nocny półmrok)
    drawAtmosphericLightingOverlay(ctx);

    // Filtr ekranu pod wodą, w żrącym kwasie lub wewnątrz żołądka czerwia
    if (player.inStomach && !showInventory) {
        if (player.inAcid || player.acidPoisonTimer > 0) {
            let acidPulse = 0.24 + Math.sin(globalTick * 0.16) * 0.08;
            ctx.fillStyle = `rgba(101, 163, 13, ${acidPulse.toFixed(2)})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = 'rgba(90, 10, 25, 0.18)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    } else if (player.headSubmerged && !showInventory) {
        ctx.fillStyle = 'rgba(10, 75, 155, 0.22)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!isPlaying) {
        // W menu głównym nie rysujemy pasków HUD, aby odsłonić żywą panoramę świata gry w tle
        ctx.restore();
        return;
    }

    if (showInventory) {
        drawInventoryUI(ctx);
    } else {
        // --- HUD BEZPOŚREDNIO NA EKRANIE ---
        let pTx = Math.floor((player.x + player.width / 2) / TILE_SIZE);
        let pTy = Math.floor((player.y + player.height / 2) / TILE_SIZE);
        let biomeName = player.inStomach ? "Żołądek Czerwia 🪱" : (isOceanAt(pTx) ? "Ocean / Morze" : (isDesertAt(pTx) ? "Pustynia" : (biomeMap[pTx] === 'hills' ? "Wzgórza" : (biomeMap[pTx] === 'forest' ? "Las" : "Równiny"))));

        // Rysuj mini znaczniki graczy znajdujących się poza ekranem
        drawOffscreenPlayerMarkers(ctx);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'right';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillStyle = player.isAdmin ? '#ff7675' : 'white';
        ctx.fillText(`${player.isAdmin ? "ADMIN" : "Gracz"}: ${playerNick || "Gracz"} | v${VERSION}`, canvas.width - 30, 40);
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        let swimStatus = player.inWater ? (player.isSwimming ? " | Pływanie: WŁ [L-Ctrl]" : " | Pływanie: WYŁ [L-Ctrl]") : "";
        ctx.fillText(`Biom: ${biomeName} | [E] Ekwipunek | [T] Czat | [TAB] Gracze${swimStatus}`, canvas.width - 30, 65);

        if (roomCode) {
            let onlineCount = 1 + Object.keys(remotePlayers).length;
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`🌐 Kod Pokoju: ${roomCode} (Gracze: ${onlineCount})`, canvas.width - 30, 90);
        }
        let phaseInfo = getDayPhaseDisplayInfo(worldTime);
        ctx.fillStyle = phaseInfo.color;
        ctx.font = 'bold 15px Arial';
        ctx.fillText(`${phaseInfo.icon} Pora dnia: ${phaseInfo.label} (${phaseInfo.clock})`, canvas.width - 30, roomCode ? 114 : 90);
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
            // Tryb Przetrwania (/gm 0) - Serca HP (zielona animacja zatrucia gdy działają toksyny kwasu!)
            const isPoisonedByAcid = Boolean(player.inAcid || player.acidPoisonTimer > 0);
            for (let i = 0; i < player.maxHp; i++) {
                let hx = 30 + i * 32; 
                let hy = 30;
                drawPixelHeart(ctx, hx, hy, 28, i < player.hp, isPoisonedByAcid, i);
            }

            if (isPoisonedByAcid) {
                // Wskaźnik żrących toksyn kwasu (zamiast paska bąbelków wody!)
                ctx.save();
                ctx.fillStyle = 'rgba(20, 45, 10, 0.85)';
                ctx.fillRect(28, 64, 235, 26);
                ctx.strokeStyle = '#84cc16';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(28, 64, 235, 26);
                ctx.fillStyle = '#a3e635';
                ctx.font = 'bold 13px Arial';
                let toxRatio = Math.max(0.1, Math.min(1, (player.acidPoisonTimer || 180) / 180));
                ctx.fillRect(32, 83, Math.round(227 * toxRatio), 4);
                ctx.fillText("☣️ ŻRĄCE TOKSYNY KWASU!", 36, 80);
                ctx.restore();
            } else if (!player.inStomach && !player.inAcid && (player.headSubmerged || player.air < player.maxAir)) {
                // Pasek bąbelków tlenu wyświetla się WYŁĄCZNIE w zwykłej wodzie (nigdy w kwasie!)
                const totalBubbles = 10;
                const fullBubbles = Math.ceil((player.air / player.maxAir) * totalBubbles);
                for (let i = 0; i < totalBubbles; i++) {
                    let bx = 30 + i * 22;
                    let by = 66;
                    drawAirBubble(ctx, bx, by, 18, i < fullBubbles);
                }
            }
        }

        // Wyświetlanie koordynatów gracza w lewym górnym rogu (pod serduszkami / paskami statusu)
        let coordBoxY = 68;
        if (player.gameMode !== 1 && ((player.inAcid || player.acidPoisonTimer > 0) || (!player.inStomach && (player.headSubmerged || player.air < player.maxAir)))) {
            coordBoxY = 98;
        }
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillRect(28, coordBoxY, 172, 28);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(28, coordBoxY, 172, 28);
        ctx.fillStyle = '#e0f2fe';
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`📍 X: ${pTx} | Y: ${pTy}`, 38, coordBoxY + 18);
        ctx.restore();

        // Półprzezroczysta lista graczy online pod klawiszem [TAB]
        drawTabPlayerList(ctx);

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

    // Rysuj pełnoekranową animację pożarcia lub wyplucia przez Czerwia (jeśli aktywna)
    drawWormTransitionOverlay(ctx);
}

// Ustaw kamerę startową na panoramę Spawnu i Totemu jeszcze przed kliknięciem "Zagraj"
cameraX = (SPAWN_TILE_X * TILE_SIZE + TILE_SIZE / 2) - (canvas.width / SCALE) / 2;
cameraY = (surfaceHeights[SPAWN_TILE_X] * TILE_SIZE - 35) - (canvas.height / SCALE) / 2;

function updateMenuBackgroundPanorama() {
    globalTick++;
    if (globalTick % 4 === 0) {
        updateWaterPhysics(cameraX, cameraY);
    }
    // Płynny, filmowy ruch kamery wokół Totemu Spawnu, lasu i latających świń w tle menu
    let centerSpawnX = SPAWN_TILE_X * TILE_SIZE + TILE_SIZE / 2;
    let centerSpawnY = surfaceHeights[SPAWN_TILE_X] * TILE_SIZE - 38;
    let panOffsetX = Math.sin(globalTick * 0.0045) * 140;
    let panOffsetY = Math.cos(globalTick * 0.0035) * 14;
    cameraX = centerSpawnX + panOffsetX - (canvas.width / SCALE) / 2;
    cameraY = centerSpawnY + panOffsetY - (canvas.height / SCALE) / 2;
}

function gameLoop(timestamp) { 
    if (!timestamp) timestamp = performance.now();
    if (!lastFrameTimeMs) lastFrameTimeMs = timestamp;
    let deltaMs = timestamp - lastFrameTimeMs;
    lastFrameTimeMs = timestamp;
    if (deltaMs > 100) deltaMs = 100;

    frameAccumulatorMs += deltaMs;
    let steps = 0;
    while (frameAccumulatorMs >= FIXED_STEP_MS && steps < 4) {
        if (isPlaying) {
            updateEntities();
        } else {
            updateMenuBackgroundPanorama();
        }
        frameAccumulatorMs -= FIXED_STEP_MS;
        steps++;
    }

    draw(); 
    requestAnimationFrame(gameLoop); 
}

requestAnimationFrame(gameLoop);

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
