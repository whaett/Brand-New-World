// ==========================================
// SYSTEM SKINÓW I NATURALNYCH ANIMACJI POSTACI (v1.5)
// ==========================================
const SKINS = [
    { 
        // 0. Domyślny (biało-niebieska koszula)
        name: "Domyślny",
        skin: '#FFDAB9', skinShadow: '#E8BE96', eyes: '#5C4033',
        hair: '#F4D03F', hairShade: '#D4AC0D', hairType: 'short',
        topMain: '#FFFFFF', topSec: '#2980B9', type: 'blue_white_shirt', sleeves: 'short',
        belt: '#2C3E50',
        pants: '#1F618D', pantsShade: '#154360',
        shoes: '#1A1A1A', shoeSole: '#444444', shoeAccent: null,
        glasses: null, powdery: false
    },
    { 
        // 1. Kobieta: brązowe włosy rozpuszczone, okulary, brązowe oczy, szary golf, białe spodnie, biało-zielone buty
        name: "Szary Golf",
        skin: '#FFDAB9', skinShadow: '#E8BE96', eyes: '#5C3317',
        hair: '#4A2511', hairShade: '#32180A', hairType: 'loose',
        topMain: '#7D8085', topSec: '#63666A', type: 'turtleneck', sleeves: 'long',
        belt: '#999EA6',
        pants: '#F2F3F5', pantsShade: '#D8DADF',
        shoes: '#FFFFFF', shoeSole: '#1E8449', shoeAccent: '#2ECC71', shoeCuff: '#27AE60',
        glasses: 'prescription', powdery: false
    },
    { 
        // 2. Kobieta: jasne blond włosy rozpuszczone, zwykłe okulary z jasnobrązową oprawką, niebieski sweterek z wystającą białą koszulą, niebieskie jeansy, ciemne buty
        name: "Niebieski Sweter",
        skin: '#FFDAB9', skinShadow: '#E8BE96', eyes: '#4A3525',
        hair: '#FDE97E', hairShade: '#E5C949', hairType: 'loose',
        topMain: '#2563EB', topSec: '#FFFFFF', type: 'sweater_shirt', sleeves: 'long',
        belt: '#1E293B',
        pants: '#4A89C7', pantsShade: '#356CA3',
        shoes: '#1C1C22', shoeSole: '#0A0A0D', shoeAccent: '#383842',
        glasses: 'light_brown', powdery: false
    },
    { 
        // 3. Kobieta: bardzo jasne platynowe włosy, biała wystająca koszula, jasny beżowy sweter, ciut ciemniejsze spodnie, pudrowa i błyszcząca buźka
        name: "Platynowy Urok",
        skin: '#FFF2F4', skinShadow: '#F5DCE0', eyes: '#5C4033',
        hair: '#FAF8F2', hairShade: '#E6E1D3', hairType: 'loose',
        topMain: '#EADBC0', topSec: '#FFFFFF', type: 'sweater_shirt', sleeves: 'long',
        belt: '#8C6D46',
        pants: '#C2A077', pantsShade: '#A68359',
        shoes: '#5C3820', shoeSole: '#331D0E', shoeAccent: '#784B2C',
        glasses: null, powdery: true
    },
    { 
        // 4. Mężczyzna: czarna skórzana kurtka, brak okularów, krótkie ciemne włosy, jasne jeansy, buty
        name: "Skórzana Kurtka",
        skin: '#F5CBA7', skinShadow: '#DFB18B', eyes: '#3E2723',
        hair: '#1E2224', hairShade: '#111314', hairType: 'short',
        topMain: '#18181B', topSec: '#71717A', type: 'leather_jacket', sleeves: 'long',
        belt: '#3F2716',
        pants: '#7AB8F5', pantsShade: '#5694D1',
        shoes: '#141416', shoeSole: '#333338', shoeAccent: null,
        glasses: null, powdery: false
    },
    { 
        // 5. Mężczyzna: włosy między białymi a blond, niebieska kurtka do narzucenia, ciemnoszary jeans, buty
        name: "Niebieska Kurtka",
        skin: '#FFDAB9', skinShadow: '#E8BE96', eyes: '#4A3525',
        hair: '#F7F1C6', hairShade: '#DFD496', hairType: 'short',
        topMain: '#2563EB', topSec: '#F8FAFC', type: 'blue_jacket', sleeves: 'long',
        belt: '#1E293B',
        pants: '#374151', pantsShade: '#1F2937',
        shoes: '#E2E8F0', shoeSole: '#334155', shoeAccent: '#94A3B8',
        glasses: null, powdery: false
    },
    { 
        // 6. Mężczyzna: długie spięte włosy z tyłu (kucyk/kitka), czarno-biała koszula w kratkę, ciemne spodnie, buty
        name: "Koszula Drwala",
        skin: '#F5CBA7', skinShadow: '#DFB18B', eyes: '#3E2723',
        hair: '#1C1917', hairShade: '#0C0A09', hairType: 'ponytail',
        topMain: '#F8FAFC', topSec: '#18181B', type: 'lumberjack_plaid', sleeves: 'long',
        belt: '#4A2C11',
        pants: '#27272A', pantsShade: '#18181B',
        shoes: '#1C1917', shoeSole: '#09090B', shoeAccent: '#44403C',
        glasses: null, powdery: false
    }
];

let selectedSkinIndex = 0;

let activeCharTint = null; // null | { r, g, b, a }

function blendColorWithTint(col, tint) {
    if (!tint || !col || typeof col !== 'string') return col;
    let r = 0, g = 0, b = 0, a = 1, hasAlpha = false;
    let s = col.trim();
    if (s.startsWith('#')) {
        let hex = s.substring(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length >= 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else {
            return col;
        }
    } else if (s.startsWith('rgb')) {
        let m = s.match(/[\d.]+/g);
        if (!m || m.length < 3) return col;
        r = parseFloat(m[0]);
        g = parseFloat(m[1]);
        b = parseFloat(m[2]);
        if (m.length >= 4) {
            a = parseFloat(m[3]);
            hasAlpha = true;
        }
    } else {
        return col;
    }

    let ta = tint.a;
    let nr = Math.round(r * (1 - ta) + tint.r * ta);
    let ng = Math.round(g * (1 - ta) + tint.g * ta);
    let nb = Math.round(b * (1 - ta) + tint.b * ta);
    if (hasAlpha) {
        return `rgba(${nr}, ${ng}, ${nb}, ${a})`;
    }
    return `rgb(${nr}, ${ng}, ${nb})`;
}

// Oblicza zabarwienie samej postaci (czerwonawe przy uderzeniu, zielonkawe przy truciźnie kwasu)
function getPlayerCharacterTint(isHit, isPoisoned, isPoisonHit = false) {
    if (isHit) {
        return { r: 255, g: 42, b: 42, a: 0.58 };
    }
    if (isPoisoned) {
        if (isPoisonHit) {
            return { r: 115, g: 245, b: 30, a: 0.60 };
        }
        let pulse = 0.42 + Math.sin((typeof globalTick !== 'undefined' ? globalTick : 0) * 0.2) * 0.08;
        return { r: 120, g: 225, b: 35, a: pulse };
    }
    return null;
}

function drawRect(c, x, y, w, h, col) { 
    c.fillStyle = activeCharTint ? blendColorWithTint(col, activeCharTint) : col; 
    c.fillRect(x, y, w, h); 
}

function drawLegAndShoe(ctx, s, isBack) {
    drawRect(ctx, -2, 0, 4, 5.5, isBack ? s.pantsShade : s.pants);
    drawRect(ctx, 1.2, 0, 0.8, 5.5, s.pantsShade);

    if (s.shoeCuff) {
        drawRect(ctx, -2.1, 5.2, 4.3, 0.9, s.shoeCuff);
    } else {
        drawRect(ctx, -2, 5.3, 4, 0.4, 'rgba(0,0,0,0.35)');
    }

    drawRect(ctx, -2.1, 5.7, 5.2, 1.7, s.shoes);
    if (s.shoeAccent) {
        drawRect(ctx, -0.5, 6.0, 2.2, 0.9, s.shoeAccent);
        drawRect(ctx, 1.8, 6.1, 1.1, 1.1, s.shoeAccent);
    }
    drawRect(ctx, -2.2, 7.3, 5.4, 0.7, s.shoeSole || '#111111');
}

function drawCharacter(ctx, x, y, direction, walkPhase, isDead, isRiding, s, pickaxeAnim, isSwimming = false, isAirborne = false, tintEffect = null) {
    activeCharTint = tintEffect;
    ctx.save();
    ctx.translate(x, y);
    if (isDead) {
        ctx.rotate(Math.PI / 2);
    } else if (isSwimming && !isRiding) {
        ctx.rotate(direction * 1.12);
    }
    ctx.scale(direction, 1);
    ctx.translate(0, -1); 

    let limbAngle = 0;
    if (isRiding) {
        limbAngle = -Math.PI / 5;
    } else if (!isDead) {
        if (isSwimming) {
            limbAngle = Math.sin(walkPhase) * 0.35;
        } else if (isAirborne) {
            limbAngle = 0.28;
        } else {
            limbAngle = Math.sin(walkPhase) * 0.42;
        }
    }

    let walkF = limbAngle;
    let walkB = isRiding ? -Math.PI / 6 : -limbAngle;
    let hairWave = !isDead ? Math.sin(walkPhase) * 0.35 : 0;

    // 1. TYLNA NOGA
    ctx.save();
    ctx.translate(0, 4);
    ctx.rotate(walkB);
    drawLegAndShoe(ctx, s, true);
    ctx.restore();

    // 2. TYLNA RĘKA
    ctx.save();
    ctx.translate(0, -3.5);
    ctx.rotate(isSwimming ? (Math.sin(walkPhase) * 0.55 - 2.1) : -walkB);
    drawRect(ctx, -1.5, 0, 3, 7, s.skinShadow);
    if (s.sleeves === 'long') {
        if (s.type === 'sweater_shirt') {
            drawRect(ctx, -1.6, 5.0, 3.2, 1.0, s.topSec);
            drawRect(ctx, -1.6, 0, 3.2, 5.0, s.topMain);
        } else if (s.type === 'lumberjack_plaid') {
            drawRect(ctx, -1.6, 0, 3.2, 5.8, s.topMain);
            drawRect(ctx, -1.6, 1.5, 3.2, 1.2, s.topSec);
            drawRect(ctx, -1.6, 3.8, 3.2, 1.2, s.topSec);
        } else {
            drawRect(ctx, -1.6, 0, 3.2, 5.8, s.topMain);
        }
    } else if (s.sleeves === 'short') {
        drawRect(ctx, -1.6, 0, 3.2, 3.2, s.topSec || s.topMain);
    }
    ctx.restore();

    // 3. TYLNA WARSTWA DŁUGICH WŁOSÓW
    if (s.hairType === 'loose') {
        drawRect(ctx, -5.8, -9.5, 3.2, 10.5, s.hairShade);
        drawRect(ctx, -5.2, -9.5, 2.4, 11.2, s.hair);
    }

    // 4. TUŁÓW
    if (s.type === 'sweater_shirt') {
        drawRect(ctx, -3.2, -4, 6.4, 8, s.topSec);
        drawRect(ctx, -3.2, -3.2, 6.4, 5.8, s.topMain);
        drawRect(ctx, -3.2, -4, 3.8, 1.2, s.topMain);
        drawRect(ctx, 0.4, -4.4, 2.6, 1.4, s.topSec);
        drawRect(ctx, -3.2, 1.8, 6.4, 0.8, 'rgba(0,0,0,0.12)');
    } else if (s.type === 'turtleneck') {
        drawRect(ctx, -3.2, -4, 6.4, 8, s.topMain);
        drawRect(ctx, -3.2, 2.8, 6.4, 1.2, s.topSec);
        drawRect(ctx, -2.4, -5.8, 4.8, 2.2, s.topSec);
        drawRect(ctx, -2.2, -5.6, 4.4, 1.6, s.topMain);
        drawRect(ctx, -1.0, -3.5, 0.6, 6, s.topSec);
        drawRect(ctx, 1.0, -3.5, 0.6, 6, s.topSec);
    } else if (s.type === 'leather_jacket') {
        drawRect(ctx, -3.0, -4, 6.0, 8, s.topSec);
        drawRect(ctx, -3.3, -4, 3.8, 8, s.topMain);
        drawRect(ctx, 1.8, -4, 1.5, 8, s.topMain);
        drawRect(ctx, -2.5, -4.6, 4.5, 1.0, '#27272A');
        drawRect(ctx, -0.5, -3.5, 1.2, 2.5, '#3F3F46');
        drawRect(ctx, 0.3, -2.5, 0.5, 6.2, '#D4D4D8');
    } else if (s.type === 'blue_jacket') {
        drawRect(ctx, -3.0, -4, 6.0, 8, s.topSec);
        drawRect(ctx, -3.3, -4, 3.8, 8, s.topMain);
        drawRect(ctx, 1.7, -4, 1.6, 8, s.topMain);
        drawRect(ctx, -2.6, -4.6, 4.6, 1.1, '#1D4ED8');
        drawRect(ctx, -0.4, -3.6, 1.0, 6.8, '#3B82F6');
        drawRect(ctx, -2.6, 0.6, 2.0, 2.0, '#1E40AF');
    } else if (s.type === 'lumberjack_plaid') {
        drawRect(ctx, -3.2, -4, 6.4, 8, s.topMain);
        for (let py = -4; py < 4; py += 2) drawRect(ctx, -3.2, py, 6.4, 1, '#64748B');
        for (let px = -3; px < 3; px += 2) drawRect(ctx, px, -4, 1, 8, '#64748B');
        for (let py = -4; py < 4; py += 2) {
            for (let px = -3; px < 3; px += 2) {
                drawRect(ctx, px, py, 1.1, 1.1, s.topSec);
            }
        }
        drawRect(ctx, -2.0, -4.5, 4.2, 1.0, s.topSec);
    } else if (s.type === 'blue_white_shirt') {
        drawRect(ctx, -3.2, -4, 6.4, 8, s.topMain);
        for (let py = -4; py < 4; py += 2) drawRect(ctx, -3.2, py, 6.4, 1, 'rgba(41, 128, 185, 0.45)');
        for (let py = -4; py < 4; py += 2) {
            for (let px = -3; px < 3; px += 2) {
                drawRect(ctx, px, py, 1.1, 1.1, s.topSec);
            }
        }
        drawRect(ctx, -2.2, -4.5, 4.4, 1.0, s.topSec);
    } else {
        drawRect(ctx, -3.2, -4, 6.4, 8, s.topMain); 
    }

    if (s.belt && s.type !== 'sweater_shirt') {
        drawRect(ctx, -3.2, 3.4, 6.4, 0.8, s.belt);
    } else if (s.type === 'sweater_shirt') {
        drawRect(ctx, -3.2, 3.6, 6.4, 0.6, s.belt);
    }

    // 5. PRZEDNIA NOGA
    ctx.save();
    ctx.translate(0, 4);
    ctx.rotate(walkF);
    drawLegAndShoe(ctx, s, false);
    ctx.restore();

    // 6. GŁOWA I TWARZ
    ctx.save();
    ctx.translate(0, -5);
    if (isSwimming && !isRiding && !isDead) {
        ctx.rotate(-0.65);
    }
    drawRect(ctx, -1.8, 0.2, 3.6, 1.8, s.skinShadow);
    drawRect(ctx, -4, -7, 8, 8, s.skin); 
    drawRect(ctx, -4, -7, 1.2, 8, s.skinShadow);

    if (s.powdery) {
        drawRect(ctx, -0.8, -2.3, 2.6, 1.3, 'rgba(255, 120, 160, 0.42)');
        drawRect(ctx, -0.4, -2.6, 1.0, 0.6, 'rgba(255, 255, 255, 0.9)');
        drawRect(ctx, 3.2, -3.2, 0.7, 0.7, 'rgba(255, 255, 255, 0.85)');
        drawRect(ctx, 1.6, -0.6, 1.8, 0.7, '#F48FB1');
        drawRect(ctx, 2.0, -0.5, 0.7, 0.4, '#FFFFFF');
    }

    if (!isDead) {
        drawRect(ctx, 0.2, -4.4, 2.8, 2.2, '#FFFFFF');
        drawRect(ctx, 1.3, -4.4, 1.7, 2.2, s.eyes);
        drawRect(ctx, 1.9, -4.0, 0.9, 1.4, '#111111');
        drawRect(ctx, 1.2, -4.3, 0.6, 0.6, '#FFFFFF');
        drawRect(ctx, 0.0, -5.2, 3.0, 0.5, s.hairShade);
    } else {
        ctx.fillStyle = '#000'; 
        ctx.font = 'bold 7px Arial'; 
        ctx.fillText("X", 0.5, -2);
    }
    
    if (s.glasses === 'prescription' || s.glasses === 'light_brown') {
        drawRect(ctx, 0.0, -4.6, 3.2, 2.6, 'rgba(210, 240, 255, 0.18)');
        drawRect(ctx, 0.3, -4.4, 0.6, 1.2, 'rgba(255, 255, 255, 0.55)');
        const frameCol = (s.glasses === 'light_brown') ? '#B87A44' : '#1F2937';
        drawRect(ctx, -0.3, -5.0, 3.8, 0.5, frameCol);
        drawRect(ctx, -0.3, -2.0, 3.8, 0.45, frameCol);
        drawRect(ctx, -0.3, -5.0, 0.5, 3.4, frameCol);
        drawRect(ctx, 3.1, -5.0, 0.45, 3.4, frameCol);
        drawRect(ctx, 3.5, -4.3, 0.6, 0.5, frameCol);
        drawRect(ctx, -3.5, -4.2, 3.2, 0.5, frameCol);
    }

    // WŁOSY
    drawRect(ctx, -4.5, -8.4, 9.0, 2.0, s.hair);
    drawRect(ctx, -4.5, -8.4, 9.0, 0.6, s.hairShade);

    if (s.hairType === 'short') {
        drawRect(ctx, -4.6, -6.8, 2.2, 4.8, s.hair);
        drawRect(ctx, -4.6, -6.8, 1.0, 4.8, s.hairShade);
        drawRect(ctx, -2.4, -6.8, 1.0, 2.2, s.hair);
        drawRect(ctx, 1.8, -7.0, 2.6, 1.2, s.hair);
    } else if (s.hairType === 'loose') {
        drawRect(ctx, 1.5, -7.0, 2.8, 1.4, s.hair);
        drawRect(ctx, -4.8, -6.8, 2.8, 9.5, s.hair);
        drawRect(ctx, -2.8, -6.2, 1.3, 8.2, s.hair);
        drawRect(ctx, -4.8, -6.8, 0.9, 9.0, s.hairShade);
    } else if (s.hairType === 'ponytail') {
        drawRect(ctx, -4.5, -6.8, 2.2, 4.5, s.hair);
        drawRect(ctx, -4.2, -7.2, 5.5, 0.5, s.hairShade);
        drawRect(ctx, -4.2, -5.6, 3.0, 0.5, s.hairShade);
        drawRect(ctx, -5.4, -5.8, 1.1, 2.0, '#7F1D1D');
        drawRect(ctx, -5.4, -5.4, 1.1, 0.5, '#B91C1C');
        drawRect(ctx, -6.8, -5.5, 1.6, 2.2, s.hair);
        drawRect(ctx, -7.6 + hairWave * 0.3, -3.8, 2.0, 3.5, s.hair);
        drawRect(ctx, -8.0 + hairWave * 0.6, -0.8, 1.8, 3.2, s.hair);
        drawRect(ctx, -7.6 + hairWave * 0.8, 2.0, 1.2, 1.8, s.hairShade);
    }
    ctx.restore();

    // 7. PRZEDNIA RĘKA I KILOF
    ctx.save();
    ctx.translate(0, -3.5);
    if (pickaxeAnim !== null && !isDead && !isRiding) {
        ctx.rotate(Math.PI/2 - Math.abs(Math.sin(pickaxeAnim)) * Math.PI/1.5);
    } else if (isSwimming && !isRiding && !isDead) {
        ctx.rotate(-Math.sin(walkPhase) * 0.55 - 2.1);
    } else {
        ctx.rotate(-walkF);
    }
    
    drawRect(ctx, -1.5, 0, 3, 7, s.skin);
    if (s.sleeves === 'long') {
        if (s.type === 'sweater_shirt') {
            drawRect(ctx, -1.6, 5.0, 3.2, 1.0, s.topSec);
            drawRect(ctx, -1.6, 0, 3.2, 5.0, s.topMain);
        } else if (s.type === 'lumberjack_plaid') {
            drawRect(ctx, -1.6, 0, 3.2, 5.8, s.topMain);
            drawRect(ctx, -1.6, 1.2, 3.2, 1.1, s.topSec);
            drawRect(ctx, -1.6, 3.4, 3.2, 1.1, s.topSec);
            drawRect(ctx, -1.6, 5.0, 3.2, 0.8, s.topSec);
        } else {
            drawRect(ctx, -1.6, 0, 3.2, 5.8, s.topMain);
        }
    } else if (s.sleeves === 'short') {
        drawRect(ctx, -1.6, 0, 3.2, 3.2, s.topMain);
        if (s.type === 'blue_white_shirt') {
            drawRect(ctx, -1.6, 1.2, 3.2, 1.0, s.topSec);
        }
    }

    activeCharTint = null;
    if (pickaxeAnim !== null && !isDead && !isRiding) {
        ctx.translate(0, 6);
        drawRect(ctx, -1, -12, 2, 16, '#8B4513'); 
        drawRect(ctx, -6, -12, 12, 4, '#555'); 
        drawRect(ctx, -4, -10, 8, 2, '#777'); 
    }
    ctx.restore();

    ctx.restore();
}

// Bezpieczna aktualizacja dostępności skinów BEZ niszczenia elementów DOM (brak resetowania kliknięć!)
function updateSkinAvailabilityUI() {
    const container = document.getElementById('skinContainer');
    if (!container || container.children.length === 0) return;

    let takenSkins = (typeof getTakenSkinsInSession === 'function') ? getTakenSkinsInSession() : [];

    // Jeśli wybrany przez nas skin został w międzyczasie zajęty przez kogoś innego, przesuń wybór na pierwszy wolny
    if (takenSkins.includes(selectedSkinIndex)) {
        for (let i = 0; i < SKINS.length; i++) {
            if (!takenSkins.includes(i)) {
                selectedSkinIndex = i;
                break;
            }
        }
    }

    const cards = container.querySelectorAll('.skin-card');
    cards.forEach((wrapper, index) => {
        let isTaken = takenSkins.includes(index);
        let badge = wrapper.querySelector('.skin-taken-badge');

        if (isTaken) {
            wrapper.classList.add('taken');
            wrapper.classList.remove('selected');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'skin-taken-badge';
                badge.innerText = 'ZAJĘTY 🔒';
                wrapper.appendChild(badge);
            }
        } else {
            wrapper.classList.remove('taken');
            if (badge) badge.remove();
            if (index === selectedSkinIndex) {
                wrapper.classList.add('selected');
            } else {
                wrapper.classList.remove('selected');
            }
        }
    });
}

function initSkinUI() {
    const container = document.getElementById('skinContainer');
    const skinErrorEl = document.getElementById('skinError');
    if (skinErrorEl) skinErrorEl.innerText = '';

    // Buduj karty DOM tylko raz, aby uniknąć przerywania kliknięć myszką!
    if (container.children.length === 0) {
        SKINS.forEach((skin, index) => {
            let wrapper = document.createElement('div');
            wrapper.className = 'skin-card';
            
            let c = document.createElement('canvas');
            c.width = 88; c.height = 120; 
            let cx = c.getContext('2d');
            cx.imageSmoothingEnabled = false;
            
            cx.scale(4.5, 4.5); 
            cx.translate(10.5, 14.5); 
            drawCharacter(cx, 0, 0, 1, 0, false, false, skin, null, false, false);
            
            let label = document.createElement('div');
            label.className = 'skin-label';
            label.innerText = skin.name;
            
            wrapper.appendChild(c);
            wrapper.appendChild(label);
            
            wrapper.addEventListener('click', () => {
                let currentlyTaken = (typeof getTakenSkinsInSession === 'function') ? getTakenSkinsInSession() : [];
                if (currentlyTaken.includes(index)) {
                    if (skinErrorEl) skinErrorEl.innerText = "Ten skin jest już zajęty przez innego gracza w tej sesji!";
                    return;
                }
                if (skinErrorEl) skinErrorEl.innerText = "";
                selectedSkinIndex = index;
                updateSkinAvailabilityUI();
            });
            
            container.appendChild(wrapper);
        });
    }

    updateSkinAvailabilityUI();
}
