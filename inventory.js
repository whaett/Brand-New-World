// ==========================================
// SYSTEM EKWIPUNKU (SURVIVAL /gm 0 ORAZ KREATYWNY KATALOG BLOKÓW /gm 1 POD KLAWISZEM E)
// ==========================================
let hotbar = Array(HOTBAR_SLOTS).fill(null);
let inv = Array(INV_SLOTS).fill(null);
let cursorItem = null;
let showInventory = false;
let selectedSlotIndex = 0; 
let creativeCatalogPage = 0;

const UI_W = 620;
const UI_H = 430;
const CREATIVE_UI_W = 690;
const CREATIVE_UI_H = 460;
const SLOT_SIZE = 42;
const SLOT_STEP = 50;
const CREATIVE_COLS = 7;
const CREATIVE_ROWS = 4;
const CREATIVE_SLOTS_PER_PAGE = CREATIVE_COLS * CREATIVE_ROWS; // 28 slotów na stronę (17 zajętych + 11 wolnych na nowe bloki + obsługa kolejnych stron)

// Wszystkie bloki i przedmioty dostępne w Katalogu Trybu Kreatywnego (/gm 1)
const CREATIVE_ITEMS = [
    BLOCKS.GRASS,
    BLOCKS.DIRT,
    BLOCKS.STONE,
    BLOCKS.WOOD,
    BLOCKS.LEAVES,
    BLOCKS.SAND,
    BLOCKS.CACTUS,
    BLOCKS.DIAMOND,
    BLOCKS.WATER,
    BLOCKS.KELP,
    BLOCKS.CORAL_PINK,
    BLOCKS.CORAL_CYAN,
    BLOCKS.CORAL_GOLD,
    BLOCKS.FLESH,
    BLOCKS.BONE,
    BLOCKS.ACID,
    BLOCKS.STOMACH_WALL
];

// Automatyczne dodawanie ewentualnych przyszłych bloków z obiektu BLOCKS
for (let key in BLOCKS) {
    let val = BLOCKS[key];
    if (val !== BLOCKS.AIR && !CREATIVE_ITEMS.includes(val)) {
        CREATIVE_ITEMS.push(val);
    }
}

function getCreativeTotalPages() {
    return Math.max(1, Math.ceil((CREATIVE_ITEMS.length + 1) / CREATIVE_SLOTS_PER_PAGE));
}

function isCreativeModeActive() {
    return (typeof player !== 'undefined' && player.gameMode === 1);
}

function addToInventory(blockType, amount = 1) {
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
        if (hotbar[i] && hotbar[i].type === blockType && hotbar[i].count < 99) {
            let space = 99 - hotbar[i].count;
            let add = Math.min(space, amount);
            hotbar[i].count += add;
            amount -= add;
            if (amount <= 0) return true;
        }
    }
    for (let i = 0; i < INV_SLOTS; i++) {
        if (inv[i] && inv[i].type === blockType && inv[i].count < 99) {
            let space = 99 - inv[i].count;
            let add = Math.min(space, amount);
            inv[i].count += add;
            amount -= add;
            if (amount <= 0) return true;
        }
    }
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
        if (hotbar[i] === null) {
            hotbar[i] = { type: blockType, count: amount };
            return true;
        }
    }
    for (let i = 0; i < INV_SLOTS; i++) {
        if (inv[i] === null) {
            inv[i] = { type: blockType, count: amount };
            return true;
        }
    }
    return false;
}

function removeSelectedItem() {
    // W trybie kreatywnym (/gm 1) zasoby są nielimitowane!
    if (isCreativeModeActive()) {
        if (hotbar[selectedSlotIndex]) {
            hotbar[selectedSlotIndex].count = 99;
        }
        return;
    }
    if (hotbar[selectedSlotIndex]) {
        hotbar[selectedSlotIndex].count--;
        if (hotbar[selectedSlotIndex].count <= 0) {
            hotbar[selectedSlotIndex] = null;
        }
    }
}

function getInventoryLayout() {
    let w = isCreativeModeActive() ? CREATIVE_UI_W : UI_W;
    let h = isCreativeModeActive() ? CREATIVE_UI_H : UI_H;
    let startX = Math.floor(canvas.width / 2 - w / 2);
    let startY = Math.floor(canvas.height / 2 - h / 2);
    return {
        w,
        h,
        startX,
        startY,
        invX: startX + 320,
        invY: startY + 150,
        hotY: isCreativeModeActive() ? (startY + 395) : (startY + 365),
        craftX: startX + 320,
        craftY: startY + 42,
        armorX: startX + 35,
        talX: startX + 235,
        equipY: startY + 65,
        // Rozszerzony układ dla Trybu Kreatywnego (/gm 1) - 28 slotów katalogu (7x4) + miejsce na kolejne strony
        creativeCatalogX: startX + 305,
        creativeCatalogY: startY + 50,
        creativeStep: 48,
        creativeInvX: startX + 305,
        creativeInvY: startY + 272,
        trashX: startX + 225,
        trashY: startY + 395,
        prevPageBtn: { x: startX + 565, y: startY + 18, w: 32, h: 22 },
        nextPageBtn: { x: startX + 615, y: startY + 18, w: 32, h: 22 }
    };
}

function swapSlot(target, idx, button) {
    let arr = target === 'inv' ? inv : hotbar;
    let clicked = arr[idx];

    if (isCreativeModeActive() && cursorItem) {
        cursorItem.count = 99;
    }
    
    if (button === 2) {
        if (!cursorItem && clicked) {
            if (isCreativeModeActive()) {
                cursorItem = { type: clicked.type, count: 99 };
            } else {
                let half = Math.ceil(clicked.count / 2);
                cursorItem = { type: clicked.type, count: half };
                clicked.count -= half;
                if (clicked.count <= 0) arr[idx] = null;
            }
        } else if (cursorItem) {
            if (isCreativeModeActive()) {
                arr[idx] = { type: cursorItem.type, count: 99 };
            } else if (!clicked) {
                arr[idx] = { type: cursorItem.type, count: 1 };
                cursorItem.count--;
                if (cursorItem.count <= 0) cursorItem = null;
            } else if (clicked.type === cursorItem.type && clicked.count < 99) {
                clicked.count++;
                cursorItem.count--;
                if (cursorItem.count <= 0) cursorItem = null;
            }
        }
        return;
    }

    if (cursorItem) {
        if (clicked && clicked.type === cursorItem.type) {
            if (isCreativeModeActive()) {
                clicked.count = 99;
                cursorItem = null;
            } else {
                let space = 99 - clicked.count;
                if (space > 0) {
                    let amount = Math.min(space, cursorItem.count);
                    clicked.count += amount;
                    cursorItem.count -= amount;
                    if (cursorItem.count <= 0) cursorItem = null;
                }
            }
        } else {
            arr[idx] = isCreativeModeActive() ? { type: cursorItem.type, count: 99 } : cursorItem;
            cursorItem = clicked;
        }
    } else {
        if (clicked) {
            cursorItem = clicked;
            arr[idx] = null;
        }
    }
}

function handleInventoryClick(button) {
    const L = getInventoryLayout();

    if (isCreativeModeActive()) {
        const totalPages = getCreativeTotalPages();
        if (creativeCatalogPage >= totalPages) creativeCatalogPage = totalPages - 1;

        // 0. Przyciski zmiany strony katalogu (jeśli jest więcej stron)
        if (totalPages > 1) {
            if (mouseX >= L.prevPageBtn.x && mouseX <= L.prevPageBtn.x + L.prevPageBtn.w &&
                mouseY >= L.prevPageBtn.y && mouseY <= L.prevPageBtn.y + L.prevPageBtn.h) {
                creativeCatalogPage = (creativeCatalogPage - 1 + totalPages) % totalPages;
                return;
            }
            if (mouseX >= L.nextPageBtn.x && mouseX <= L.nextPageBtn.x + L.nextPageBtn.w &&
                mouseY >= L.nextPageBtn.y && mouseY <= L.nextPageBtn.y + L.nextPageBtn.h) {
                creativeCatalogPage = (creativeCatalogPage + 1) % totalPages;
                return;
            }
        }

        // 1. Kliknięcie w Katalog Bloków Trybu Kreatywnego (siatka 4x7 = 28 slotów na stronę)
        for (let r = 0; r < CREATIVE_ROWS; r++) {
            for (let c = 0; c < CREATIVE_COLS; c++) {
                let idx = creativeCatalogPage * CREATIVE_SLOTS_PER_PAGE + r * CREATIVE_COLS + c;
                let sx = L.creativeCatalogX + c * L.creativeStep;
                let sy = L.creativeCatalogY + r * L.creativeStep;
                if (mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
                    if (idx < CREATIVE_ITEMS.length) {
                        let bType = CREATIVE_ITEMS[idx];
                        if (button === 2 || keys['ShiftLeft'] || keys['ShiftRight']) {
                            // PPM lub Shift+LPM od razu wrzuca blok na pasek szybkiego wyboru!
                            let targetHotIdx = selectedSlotIndex;
                            for (let h = 0; h < HOTBAR_SLOTS; h++) {
                                if (hotbar[h] && hotbar[h].type === bType) {
                                    hotbar[h].count = 99;
                                    selectedSlotIndex = h;
                                    return;
                                }
                            }
                            for (let h = 0; h < HOTBAR_SLOTS; h++) {
                                if (hotbar[h] === null) {
                                    targetHotIdx = h;
                                    break;
                                }
                            }
                            hotbar[targetHotIdx] = { type: bType, count: 99 };
                            selectedSlotIndex = targetHotIdx;
                        } else {
                            // LPM bierze nielimitowany blok na kursor
                            if (cursorItem && cursorItem.type === bType) {
                                cursorItem = null;
                            } else {
                                cursorItem = { type: bType, count: 99 };
                            }
                        }
                    } else {
                        // Kliknięcie w wolny slot katalogu odkłada/kasuje przedmiot z kursora
                        cursorItem = null;
                    }
                    return;
                }
            }
        }

        // 2. Kliknięcie w Kosz 🗑️ (Niszczenie przedmiotu jak w Minecrafcie)
        if (mouseX >= L.trashX && mouseX <= L.trashX + SLOT_SIZE && mouseY >= L.trashY && mouseY <= L.trashY + SLOT_SIZE) {
            if (cursorItem) {
                cursorItem = null;
            } else if (button === 2 || keys['ShiftLeft'] || keys['ShiftRight']) {
                // Shift+LPM lub PPM na kosz czyści cały ekwipunek
                for (let i = 0; i < INV_SLOTS; i++) inv[i] = null;
                for (let i = 0; i < HOTBAR_SLOTS; i++) hotbar[i] = null;
            }
            return;
        }

        // 3. Kliknięcie w podręczny ekwipunek w Creative (2 rzędy po 5 slotów)
        for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 5; c++) {
                let sx = L.creativeInvX + c * SLOT_STEP;
                let sy = L.creativeInvY + r * L.creativeStep;
                if (mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
                    swapSlot('inv', r * 5 + c, button);
                    return;
                }
            }
        }

        // 4. Kliknięcie w Pasek Szybkiego Wyboru (5 slotów)
        for (let c = 0; c < 5; c++) {
            let sx = L.creativeInvX + c * SLOT_STEP;
            let sy = L.hotY;
            if (mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
                swapSlot('hotbar', c, button);
                selectedSlotIndex = c;
                return;
            }
        }
        return;
    }

    // --- TRYB SURVIVAL (/gm 0) ---
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
            let sx = L.invX + c * SLOT_STEP;
            let sy = L.invY + r * SLOT_STEP;
            if (mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
                swapSlot('inv', r * 5 + c, button);
                return;
            }
        }
    }
    
    for (let c = 0; c < 5; c++) {
        let sx = L.invX + c * SLOT_STEP;
        let sy = L.hotY;
        if (mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
            swapSlot('hotbar', c, button);
            selectedSlotIndex = c;
            return;
        }
    }
}

function drawInvSlot(ctx, x, y, item, isSelected, labelHint = null, isCreativeCatalogSlot = false) {
    ctx.fillStyle = isCreativeCatalogSlot ? (item ? '#7A8B99' : '#64748B') : '#8B8B8B';
    ctx.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);
    
    ctx.fillStyle = '#373737';
    ctx.fillRect(x, y, SLOT_SIZE, 2);
    ctx.fillRect(x, y, 2, SLOT_SIZE);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y + SLOT_SIZE - 2, SLOT_SIZE, 2);
    ctx.fillRect(x + SLOT_SIZE - 2, y, 2, SLOT_SIZE);
    
    if (isSelected) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - 1, y - 1, SLOT_SIZE + 2, SLOT_SIZE + 2);
    }
    
    if (item) {
        drawItemIcon(ctx, x + 5, y + 5, item, SLOT_SIZE - 10, isCreativeCatalogSlot || isCreativeModeActive());
    } else if (labelHint) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = 'bold 11px Arial';
        ctx.fillText(labelHint, x + 4, y + 13);
    }
}

function drawLockedSlot(ctx, x, y) {
    drawInvSlot(ctx, x, y, null, false);
    ctx.fillStyle = 'rgba(30, 30, 30, 0.55)';
    ctx.fillRect(x + 2, y + 2, SLOT_SIZE - 4, SLOT_SIZE - 4);
    ctx.fillStyle = '#DDD';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText("🔒", x + SLOT_SIZE / 2, y + SLOT_SIZE / 2 + 6);
    ctx.textAlign = 'left';
}

function drawTrashSlot(ctx, x, y) {
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);
    ctx.fillStyle = '#450a0a';
    ctx.fillRect(x, y, SLOT_SIZE, 2);
    ctx.fillRect(x, y, 2, SLOT_SIZE);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(x, y + SLOT_SIZE - 2, SLOT_SIZE, 2);
    ctx.fillRect(x + SLOT_SIZE - 2, y, 2, SLOT_SIZE);

    ctx.fillStyle = '#fecaca';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText("🗑️", x + SLOT_SIZE / 2, y + SLOT_SIZE / 2 + 7);
    ctx.textAlign = 'left';
}

function drawItemIcon(ctx, x, y, item, size, showInfinity = false) {
    if (TEXTURES[item.type]) {
        ctx.drawImage(TEXTURES[item.type], x, y, size, size);
    } else {
        ctx.fillStyle = COLORS[item.type];
        ctx.fillRect(x, y, size, size);
    }
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, size, size);

    ctx.fillStyle = showInfinity ? '#fde047' : 'white';
    ctx.font = showInfinity ? 'bold 15px Arial' : 'bold 13px Arial';
    ctx.shadowColor = 'black'; 
    ctx.shadowBlur = 3;
    ctx.textAlign = 'right';
    ctx.fillText(showInfinity ? '∞' : item.count, x + size + 2, y + size + 2);
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
}

function drawMinecraftTooltip(ctx, text, subText, mx, my) {
    ctx.save();
    ctx.font = 'bold 14px Arial';
    let w1 = ctx.measureText(text).width;
    ctx.font = '12px Arial';
    let w2 = subText ? ctx.measureText(subText).width : 0;
    let boxW = Math.max(w1, w2) + 20;
    let boxH = subText ? 44 : 26;
    let bx = mx + 14;
    let by = my - boxH - 6;
    if (bx + boxW > canvas.width - 10) bx = mx - boxW - 10;
    if (by < 10) by = my + 18;

    ctx.fillStyle = 'rgba(16, 0, 16, 0.94)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = '#5000ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, boxW - 2, boxH - 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(text, bx + 10, by + 18);

    if (subText) {
        ctx.fillStyle = '#a855f7';
        ctx.font = '12px Arial';
        ctx.fillText(subText, bx + 10, by + 35);
    }
    ctx.restore();
}

function drawInventoryUI(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const L = getInventoryLayout();
    let hoveredBlockType = null;
    let hoveredTrash = false;

    if (isCreativeModeActive()) {
        // ==========================================
        // GUI TRYBU KREATYWNEGO (/gm 1 - WSZYSTKIE BLOKI + WOLNE SLOTY NA NOWE)
        // ==========================================
        const totalPages = getCreativeTotalPages();
        if (creativeCatalogPage >= totalPages) creativeCatalogPage = totalPages - 1;

        // Zakładka na górze okna
        ctx.fillStyle = '#8B8B8B';
        ctx.fillRect(L.startX + 16, L.startY - 32, 320, 34);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3;
        ctx.strokeRect(L.startX + 16, L.startY - 32, 320, 34);
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`✨ Tryb Kreatywny - Katalog (${CREATIVE_ITEMS.length} bloków)`, L.startX + 26, L.startY - 10);

        // Główne tło okna Creative
        ctx.fillStyle = '#C6C6C6';
        ctx.fillRect(L.startX, L.startY, L.w, L.h);
        ctx.strokeStyle = '#333'; 
        ctx.lineWidth = 4;
        ctx.strokeRect(L.startX, L.startY, L.w, L.h);

        // Lewa kolumna - Podgląd Gracza i status Nieśmiertelności
        ctx.fillStyle = '#222';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(playerNick || "Gracz", L.startX + 148, L.startY + 32);

        ctx.fillStyle = '#15803d';
        ctx.font = 'bold 12px Arial';
        ctx.fillText("★ NIEŚMIERTELNOŚĆ AKTYWNA (/gm 1)", L.startX + 148, L.startY + 52);
        ctx.textAlign = 'left';

        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(L.startX + 83, L.startY + 65, 130, 190);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.strokeRect(L.startX + 83, L.startY + 65, 130, 190);

        ctx.save();
        ctx.translate(L.startX + 148, L.startY + 170); 
        ctx.scale(5, 5); 
        drawCharacter(ctx, 0, 0, 1, 0, false, false, SKINS[selectedSkinIndex], null, false, false);
        ctx.restore();

        ctx.fillStyle = '#333';
        ctx.font = '13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("LPM - Weź nielimitowany blok (∞)", L.startX + 148, L.startY + 285);
        ctx.fillText("PPM / Shift+LPM - Od razu na pasek", L.startX + 148, L.startY + 308);
        ctx.fillText("Klawisz [E] - Zamknij katalog", L.startX + 148, L.startY + 331);
        ctx.textAlign = 'left';

        // Slot Kosza (Niszczenie przedmiotu jak w Minecrafcie)
        ctx.fillStyle = '#7f1d1d';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("Usuń", L.trashX + SLOT_SIZE / 2, L.trashY - 6);
        ctx.textAlign = 'left';
        drawTrashSlot(ctx, L.trashX, L.trashY);
        if (mouseX >= L.trashX && mouseX <= L.trashX + SLOT_SIZE && mouseY >= L.trashY && mouseY <= L.trashY + SLOT_SIZE) {
            hoveredTrash = true;
        }

        // Prawa kolumna - Katalog Wszystkich Bloków (siatka 4x7 = 28 slotów na stronę)
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 15px Arial';
        ctx.fillText(`Katalog Bloków i Zasobów (∞) — Sloty: ${CREATIVE_ITEMS.length}/${CREATIVE_SLOTS_PER_PAGE * totalPages}`, L.creativeCatalogX, L.creativeCatalogY - 12);

        if (totalPages > 1) {
            ctx.fillStyle = '#334155';
            ctx.fillRect(L.prevPageBtn.x, L.prevPageBtn.y, L.prevPageBtn.w, L.prevPageBtn.h);
            ctx.fillRect(L.nextPageBtn.x, L.nextPageBtn.y, L.nextPageBtn.w, L.nextPageBtn.h);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText("◀", L.prevPageBtn.x + L.prevPageBtn.w / 2, L.prevPageBtn.y + 15);
            ctx.fillText("▶", L.nextPageBtn.x + L.nextPageBtn.w / 2, L.nextPageBtn.y + 15);
            ctx.fillStyle = '#1e293b';
            ctx.fillText(`${creativeCatalogPage + 1}/${totalPages}`, (L.prevPageBtn.x + L.nextPageBtn.x + L.prevPageBtn.w) / 2, L.prevPageBtn.y + 15);
            ctx.textAlign = 'left';
        }

        for (let r = 0; r < CREATIVE_ROWS; r++) {
            for (let c = 0; c < CREATIVE_COLS; c++) {
                let idx = creativeCatalogPage * CREATIVE_SLOTS_PER_PAGE + r * CREATIVE_COLS + c;
                let sx = L.creativeCatalogX + c * L.creativeStep;
                let sy = L.creativeCatalogY + r * L.creativeStep;
                let catItem = idx < CREATIVE_ITEMS.length ? { type: CREATIVE_ITEMS[idx], count: 99 } : null;
                drawInvSlot(ctx, sx, sy, catItem, false, null, true);
                if (catItem && mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
                    hoveredBlockType = catItem.type;
                }
            }
        }

        // Podręczny ekwipunek gracza (2 rzędy po 5 slotów)
        ctx.fillStyle = '#222';
        ctx.font = 'bold 14px Arial';
        ctx.fillText("Ekwipunek podręczny", L.creativeInvX, L.creativeInvY - 6);
        for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 5; c++) {
                let idx = r * 5 + c;
                let sx = L.creativeInvX + c * SLOT_STEP;
                let sy = L.creativeInvY + r * L.creativeStep;
                drawInvSlot(ctx, sx, sy, inv[idx], false);
                if (inv[idx] && mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
                    hoveredBlockType = inv[idx].type;
                }
            }
        }

        // Pasek szybkiego wyboru (5 slotów)
        ctx.fillStyle = '#222';
        ctx.font = 'bold 14px Arial';
        ctx.fillText("Pasek szybkiego wyboru", L.creativeInvX, L.hotY - 6);
        for (let c = 0; c < 5; c++) {
            let sx = L.creativeInvX + c * SLOT_STEP;
            let sy = L.hotY;
            drawInvSlot(ctx, sx, sy, hotbar[c], selectedSlotIndex === c, String(c + 1));
            if (hotbar[c] && mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
                hoveredBlockType = hotbar[c].type;
            }
        }

        if (cursorItem) {
            drawItemIcon(ctx, mouseX - 16, mouseY - 16, cursorItem, 32, true);
        } else if (hoveredBlockType !== null) {
            drawMinecraftTooltip(ctx, BLOCK_NAMES[hoveredBlockType] || "Blok", "Tryb Kreatywny - Nielimitowane (∞)", mouseX, mouseY);
        } else if (hoveredTrash) {
            drawMinecraftTooltip(ctx, "Zniszcz przedmiot 🗑️", "Kliknij z przedmiotem lub Shift+Klik aby wyczyścić", mouseX, mouseY);
        }
        return;
    }

    // ==========================================
    // GUI TRYBU PRZETRWANIA (/gm 0 - KLASYCZNY)
    // ==========================================
    ctx.fillStyle = '#C6C6C6';
    ctx.fillRect(L.startX, L.startY, L.w, L.h);
    ctx.strokeStyle = '#333'; 
    ctx.lineWidth = 4;
    ctx.strokeRect(L.startX, L.startY, L.w, L.h);
    
    ctx.fillStyle = '#222';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(playerNick || "Gracz", L.startX + 155, L.startY + 34);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(L.startX + 90, L.startY + 65, 130, 190);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(L.startX + 90, L.startY + 65, 130, 190);

    ctx.save();
    ctx.translate(L.startX + 155, L.startY + 170); 
    ctx.scale(5, 5); 
    drawCharacter(ctx, 0, 0, 1, 0, false, false, SKINS[selectedSkinIndex], null, false, false);
    ctx.restore();
    
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText("Zbroja", L.armorX + SLOT_SIZE/2, L.equipY - 8);
    ctx.fillText("Talizmany", L.talX + SLOT_SIZE/2, L.equipY - 8);
    ctx.textAlign = 'left';

    for (let i = 0; i < 4; i++) {
        drawLockedSlot(ctx, L.armorX, L.equipY + i * SLOT_STEP);
        drawLockedSlot(ctx, L.talX, L.equipY + i * SLOT_STEP);
    }

    ctx.fillStyle = '#444';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText("Zbroje i talizmany: Wkrótce 🔒", L.startX + 155, L.startY + 295);
    ctx.fillText("LPM - Przenieś | PPM - Rozdziel", L.startX + 155, L.startY + 325);
    ctx.fillText("Klawisz [E] - Zamknij ekwipunek", L.startX + 155, L.startY + 350);
    ctx.textAlign = 'left';
    
    ctx.fillStyle = '#222';
    ctx.font = 'bold 15px Arial';
    ctx.fillText("Mini Crafting (Wkrótce 🔒)", L.craftX, L.craftY - 10);
    
    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
            drawLockedSlot(ctx, L.craftX + c * SLOT_STEP, L.craftY + r * SLOT_STEP);
        }
    }
    ctx.fillStyle = '#444';
    ctx.font = 'bold 26px Arial';
    ctx.fillText("➔", L.craftX + 108, L.craftY + 55);
    drawLockedSlot(ctx, L.craftX + 150, L.craftY + 25);
    
    ctx.fillStyle = '#222';
    ctx.font = 'bold 14px Arial';
    ctx.fillText("Ekwipunek", L.invX, L.invY - 6);
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
            let idx = r * 5 + c;
            let sx = L.invX + c * SLOT_STEP;
            let sy = L.invY + r * SLOT_STEP;
            drawInvSlot(ctx, sx, sy, inv[idx], false);
            if (inv[idx] && mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
                hoveredBlockType = inv[idx].type;
            }
        }
    }
    
    ctx.fillStyle = '#222';
    ctx.font = 'bold 14px Arial';
    ctx.fillText("Pasek szybkiego wyboru", L.invX, L.hotY - 6);
    for (let c = 0; c < 5; c++) {
        let sx = L.invX + c * SLOT_STEP;
        let sy = L.hotY;
        drawInvSlot(ctx, sx, sy, hotbar[c], selectedSlotIndex === c, String(c + 1));
        if (hotbar[c] && mouseX >= sx && mouseX <= sx + SLOT_SIZE && mouseY >= sy && mouseY <= sy + SLOT_SIZE) {
            hoveredBlockType = hotbar[c].type;
        }
    }
    
    if (cursorItem) {
        drawItemIcon(ctx, mouseX - 16, mouseY - 16, cursorItem, 32, false);
    } else if (hoveredBlockType !== null) {
        drawMinecraftTooltip(ctx, BLOCK_NAMES[hoveredBlockType] || "Blok", null, mouseX, mouseY);
    }
}
