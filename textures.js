// ==========================================
// GENERATOR PROCEDURALNYCH TEKSTUR 16-BIT
// ==========================================
const TEXTURES = {};

function initTextures() {
    let c, cx;
    
    // Ziemia
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#654321'; cx.fillRect(0,0,20,20);
    for(let i=0; i<40; i++) { 
        cx.fillStyle = Math.random()>0.5 ? '#5C4033' : '#8B5A2B'; 
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 2); 
    }
    TEXTURES[BLOCKS.DIRT] = c;

    // Trawa
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.drawImage(TEXTURES[BLOCKS.DIRT], 0, 0);
    cx.fillStyle = '#228B22';
    for(let x=0; x<20; x+=2) { 
        let h = 4 + Math.floor(Math.random()*3)*2;
        cx.fillRect(x, 0, 2, h); 
    }
    for(let i=0; i<15; i++) { 
        cx.fillStyle = '#32CD32'; 
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*3)*2, 2, 2); 
    }
    TEXTURES[BLOCKS.GRASS] = c;

    // Kamień
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#707070'; cx.fillRect(0,0,20,20);
    for(let i=0; i<50; i++) { 
        cx.fillStyle = Math.random()>0.5 ? '#505050' : '#909090'; 
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 2); 
    }
    TEXTURES[BLOCKS.STONE] = c;

    // Drewno
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#6b4226'; cx.fillRect(0,0,20,20);
    cx.fillStyle = '#4a2f1d';
    for(let x=2; x<20; x+=4) { cx.fillRect(x, 0, 2, 20); }
    for(let i=0; i<10; i++) {
        cx.fillStyle = '#3e2723';
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 4);
    }
    TEXTURES[BLOCKS.WOOD] = c;

    // Liście
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = 'rgba(34, 139, 34, 0.75)'; cx.fillRect(0,0,20,20);
    for(let i=0; i<30; i++) { 
        cx.fillStyle = Math.random()>0.5 ? 'rgba(0, 100, 0, 0.9)' : 'rgba(50, 205, 50, 0.9)'; 
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 2); 
    }
    TEXTURES[BLOCKS.LEAVES] = c;

    // Diament
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.drawImage(TEXTURES[BLOCKS.STONE], 0, 0);
    for(let i=0; i<8; i++) { 
        cx.fillStyle = Math.random()>0.5 ? '#00FFFF' : '#E0FFFF'; 
        cx.fillRect(4 + Math.floor(Math.random()*6)*2, 4 + Math.floor(Math.random()*6)*2, 2, 2); 
    }
    TEXTURES[BLOCKS.DIAMOND] = c;

    // Piasek
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#EDC9AF'; cx.fillRect(0,0,20,20);
    for(let i=0; i<30; i++) { 
        cx.fillStyle = Math.random()>0.5 ? '#DEB887' : '#D2B48C'; 
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 4, 2); 
    }
    TEXTURES[BLOCKS.SAND] = c;

    // Kaktus
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#2E8B57'; cx.fillRect(0,0,20,20);
    cx.fillStyle = '#006400';
    for(let x=2; x<20; x+=4) cx.fillRect(x, 0, 2, 20);
    cx.fillStyle = '#000000'; 
    for(let i=0; i<12; i++) cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 2);
    TEXTURES[BLOCKS.CACTUS] = c;

    // Woda (półprzezroczysta z subtelnymi falami)
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = 'rgba(20, 105, 205, 0.52)'; cx.fillRect(0,0,20,20);
    cx.fillStyle = 'rgba(120, 200, 255, 0.38)';
    cx.fillRect(2, 4, 6, 2);
    cx.fillRect(10, 12, 8, 2);
    TEXTURES[BLOCKS.WATER] = c;

    // Wodorosty (Kelp - czysta roślina bez wody w tle)
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#155D27';
    cx.fillRect(8, 0, 4, 20);
    cx.fillStyle = '#2ECC71';
    cx.fillRect(9, 2, 2, 16);
    cx.fillStyle = '#1E8449';
    cx.fillRect(4, 3, 4, 3);
    cx.fillRect(12, 8, 4, 3);
    cx.fillRect(5, 14, 3, 3);
    TEXTURES[BLOCKS.KELP] = c;

    // Rafa Koralowa - Różowy Koral
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#E63976'; cx.fillRect(0,0,20,20);
    for(let i=0; i<35; i++) {
        cx.fillStyle = Math.random()>0.5 ? '#FF7AA2' : '#B51756';
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 2);
    }
    TEXTURES[BLOCKS.CORAL_PINK] = c;

    // Rafa Koralowa - Błękitny Koral
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#0096C7'; cx.fillRect(0,0,20,20);
    for(let i=0; i<35; i++) {
        cx.fillStyle = Math.random()>0.5 ? '#48CAE4' : '#023E8A';
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 2);
    }
    TEXTURES[BLOCKS.CORAL_CYAN] = c;

    // Rafa Koralowa - Złoty Koral
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#F4A200'; cx.fillRect(0,0,20,20);
    for(let i=0; i<35; i++) {
        cx.fillStyle = Math.random()>0.5 ? '#FFD166' : '#C97A00';
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 2);
    }
    TEXTURES[BLOCKS.CORAL_GOLD] = c;

    // Tkanka Żołądka (Flesh)
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#8B1E24'; cx.fillRect(0,0,20,20);
    for(let i=0; i<40; i++) {
        cx.fillStyle = Math.random()>0.4 ? '#B23A48' : '#5E1116';
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 4, 2);
    }
    TEXTURES[BLOCKS.FLESH] = c;

    // Kość (Bone - żebra w żołądku)
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#EAE0C8'; cx.fillRect(0,0,20,20);
    for(let i=0; i<30; i++) {
        cx.fillStyle = Math.random()>0.5 ? '#D4C5A1' : '#FFFDF7';
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 2);
    }
    TEXTURES[BLOCKS.BONE] = c;

    // Kwas Żołądkowy (Acid)
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = 'rgba(115, 195, 15, 0.72)'; cx.fillRect(0,0,20,20);
    cx.fillStyle = 'rgba(210, 255, 90, 0.65)';
    cx.fillRect(2, 4, 6, 2);
    cx.fillRect(11, 12, 6, 2);
    cx.fillRect(6, 16, 4, 2);
    TEXTURES[BLOCKS.ACID] = c;

    // Ściana Żołądka (Niezniszczalna powłoka zewnętrzna)
    c = document.createElement('canvas'); c.width = 20; c.height = 20; cx = c.getContext('2d');
    cx.fillStyle = '#38070E'; cx.fillRect(0,0,20,20);
    for(let i=0; i<45; i++) {
        cx.fillStyle = Math.random()>0.5 ? '#240308' : '#520E18';
        cx.fillRect(Math.floor(Math.random()*10)*2, Math.floor(Math.random()*10)*2, 2, 2);
    }
    TEXTURES[BLOCKS.STOMACH_WALL] = c;
}
initTextures();
