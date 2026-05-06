/**
 * PET EVOLUTION TYCOON - FAILSAFE EDITION
 * Guaranteed start. Zero external dependencies. Inline fallbacks.
 */

// --- 1. FAILSAFE LOADER & ASSET SYSTEM ---
const Loader = {
    el: null, statusEl: null, fillEl: null,
    startTime: Date.now(),
    maxTime: 2000,
    assetsLoaded: false,

    init() {
        this.el = document.getElementById('loading-screen');
        this.statusEl = document.getElementById('loader-status');
        this.fillEl = document.querySelector('.fill');
        console.log('[Loader] Initialized. Starting asset check...');
        
        // Start progress simulation (just visual)
        this.animateProgress();
        
        // Hard timeout: Force start after 2s regardless of asset state
        setTimeout(() => this.forceStart(), this.maxTime);
    },

    animateProgress() {
        const interval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const pct = Math.min(95, (elapsed / this.maxTime) * 100);
            if (this.fillEl) this.fillEl.style.width = `${pct}%`;
            if (pct >= 95 || this.assetsLoaded) clearInterval(interval);
        }, 50);
    },

    forceStart() {
        console.warn('[Loader] Max time reached. Forcing startup.');
        this.statusEl.textContent = 'Failsafe: Starting Game';
        if (this.fillEl) this.fillEl.style.width = '100%';
        setTimeout(() => {
            this.el.style.opacity = '0';
            this.el.style.pointerEvents = 'none';
            document.getElementById('game-container').classList.remove('hidden');
        }, 200);
        Game.start();
    },

    markAssetsReady() {
        if (this.assetsLoaded) return;
        this.assetsLoaded = true;
        this.statusEl.textContent = 'Assets Ready';
        if (this.fillEl) this.fillEl.style.width = '100%';
        setTimeout(() => this.forceStart(), 300);
    }
};

const Assets = {
    cache: new Map(),
    // Generates a clean SVG data URI as 100% reliable fallback
    fallbackSVG(level) {
        const hue = (level * 45) % 360;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <defs><radialGradient id="g${level}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="hsl(${hue},80%,65%)"/><stop offset="100%" stop-color="hsl(${hue},70%,45%)"/></radialGradient></defs>
            <circle cx="50" cy="50" r="42" fill="url(#g${level})"/>
            <circle cx="35" cy="42" r="6" fill="white"/><circle cx="65" cy="42" r="6" fill="white"/>
            <circle cx="35" cy="42" r="3" fill="#222"/><circle cx="65" cy="42" r="3" fill="#222"/>
            <text x="50" y="68" font-family="system-ui" font-weight="bold" font-size="28" text-anchor="middle" fill="white">${level}</text>
        </svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },

    async load(path) {
        if (this.cache.has(path)) return this.cache.get(path);
        try {
            return new Promise((resolve) => {
                const img = new Image();
                const timeout = setTimeout(() => {
                    console.warn(`[Assets] Timeout: ${path}. Using fallback.`);
                    const fb = this.fallbackSVG(Math.floor(Math.random() * 20));
                    resolve(fb);
                }, 1500);

                img.onload = () => {
                    clearTimeout(timeout);
                    this.cache.set(path, img.src);
                    resolve(img.src);
                };
                img.onerror = () => {
                    clearTimeout(timeout);
                    console.warn(`[Assets] Failed: ${path}. Using fallback.`);
                    const fb = this.fallbackSVG(Math.floor(Math.random() * 20));
                    resolve(fb);
                };
                img.src = path;
            });
        } catch (e) {
            console.error(`[Assets] Critical: ${e.message}`);
            return this.fallbackSVG(0);
        }
    },

    // Preload any external assets (optional, runs non-blocking)
    async preloadAll() {
        // Example: const icon = await this.load('./assets/egg.svg');
        // For this build, we rely on procedural generation, so we mark ready immediately
        console.log('[Assets] No external dependencies. Ready.');
        Loader.markAssetsReady();
    }
};

// --- 2. GAME CORE ---
const Game = {
    state: {
        coins: 0,
        pets: [],
        upgrades: { speed: 0, income: 0, slots: 0 },
        lastSave: Date.now()
    },
    runtime: {
        lastTick: Date.now(),
        lastSpawn: Date.now(),
        dragId: null,
        audioCtx: null
    },
    started: false,

    async start() {
        if (this.started) return;
        this.started = true;
        console.log('[Game] Booting...');

        // Load save safely
        try {
            const saved = localStorage.getItem('petTycoonSave_v2');
            if (saved) this.state = { ...this.state, ...JSON.parse(saved) };
        } catch (e) { console.warn('[Game] Save corrupted. Starting fresh.'); }

        // Offline earnings calc
        const away = (Date.now() - this.state.lastSave) / 1000;
        if (away > 60) {
            const rate = this.calcIncome();
            const earned = Math.floor(rate * away * 0.5); // 50% penalty for offline
            if (earned > 0) {
                this.state.coins += earned;
                UI.showOfflineModal(earned);
            }
        }

        UI.init();
        UI.updateShop();
        UI.updateHeader();

        // Loops
        requestAnimationFrame(this.loop.bind(this));
        setInterval(() => this.save(), 5000);
        
        console.log('[Game] Fully operational.');
    },

    loop() {
        if (!this.started) return;
        const now = Date.now();
        const dt = Math.min((now - this.runtime.lastTick) / 1000, 0.1); // Cap dt
        this.runtime.lastTick = now;

        // Idle Income
        const income = this.calcIncome();
        if (income > 0) this.state.coins += income * dt;
        UI.updateHeader();

        // Egg Spawner
        const spawnMs = Math.max(800, 4000 * Math.pow(0.85, this.state.upgrades.speed));
        if (now - this.runtime.lastSpawn > spawnMs) {
            Logic.spawnPet(1);
            this.runtime.lastSpawn = now;
        }

        UI.checkShopButtons();
        requestAnimationFrame(this.loop.bind(this));
    },

    calcIncome() {
        const mult = 1 + (this.state.upgrades.income * 0.15);
        let base = 0;
        this.state.pets.forEach(p => base += Math.pow(1.6, p.level - 1));
        return base * mult;
    },

    save() {
        this.state.lastSave = Date.now();
        try { localStorage.setItem('petTycoonSave_v2', JSON.stringify(this.state)); } catch(e){}
    },

    playSound(type) {
        if (!this.runtime.audioCtx) this.runtime.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = this.runtime.audioCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        const now = ctx.currentTime;
        if (type === 'merge') {
            o.type = 'sine'; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(600, now+0.15);
            g.gain.setValueAtTime(0.08, now); g.gain.exponentialRampToValueAtTime(0.001, now+0.15);
            o.start(now); o.stop(now+0.15);
        }
    }
};

// --- 3. GAME LOGIC ---
const Logic = {
    spawnPet(level) {
        const slots = parseInt(document.querySelectorAll('.slot').length);
        const occupied = Game.state.pets.map(p => p.slotIndex);
        const empty = [];
        for(let i=0; i<slots; i++) if(!occupied.includes(i)) empty.push(i);
        
        if (empty.length === 0) return; // Full
        const slot = empty[Math.floor(Math.random() * empty.length)];
        const newPet = { id: Date.now() + Math.random(), level, slotIndex: slot };
        Game.state.pets.push(newPet);
        UI.renderPet(newPet, true);
    },

    buyEgg() {
        const cost = 50;
        if (Game.state.coins >= cost) {
            Game.state.coins -= cost;
            this.spawnPet(1);
            UI.updateHeader();
        }
    },

    buyUpgrade(type) {
        const mults = { speed: 1.4, income: 1.6, slots: 2.5 };
        const baseCost = { speed: 100, income: 150, slots: 400 };
        const lvl = Game.state.upgrades[type];
        const cost = Math.floor(baseCost[type] * Math.pow(mults[type], lvl));
        
        if (Game.state.coins >= cost) {
            Game.state.coins -= cost;
            Game.state.upgrades[type]++;
            if (type === 'slots') UI.expandGrid();
            UI.updateShop();
            UI.updateHeader();
            FX.floatText('Upgraded!', window.innerWidth/2, window.innerHeight - 150);
        }
    },

    merge(sourceId, targetSlot) {
        const src = Game.state.pets.find(p => p.id === sourceId);
        const tgt = Game.state.pets.find(p => p.slotIndex === targetSlot);

        if (!src) return;
        // Move to empty
        if (!tgt) {
            src.slotIndex = targetSlot;
            UI.movePet(src);
            return;
        }
        // Swap if different levels
        if (src.level !== tgt.level) {
            [src.slotIndex, tgt.slotIndex] = [tgt.slotIndex, src.slotIndex];
            UI.movePet(src); UI.movePet(tgt);
            return;
        }
        // Merge
        if (src.level === tgt.level) {
            Game.state.pets = Game.state.pets.filter(p => p.id !== src.id && p.id !== tgt.id);
            const evolved = { id: Date.now(), level: src.level + 1, slotIndex: targetSlot };
            Game.state.pets.push(evolved);
            UI.renderPet(evolved, false, true);
            Game.playSound('merge');
            FX.floatText(`Evolved Lv.${evolved.level}!`, window.innerWidth/2, window.innerHeight/2);
        }
    }
};

// --- 4. UI MANAGER ---
const UI = {
    gridEl: null,
    
    init() {
        this.gridEl = document.getElementById('grid-area');
        this.buildGrid(16 + Game.state.upgrades.slots * 4);
        
        // Tabs
        document.querySelectorAll('.tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.shop-list').forEach(l => l.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`shop-${btn.dataset.tab}`).classList.add('active');
            });
        });

        // Buttons
        document.getElementById('btn-close-offline').onclick = () => document.getElementById('offline-modal').classList.add('hidden');
        document.getElementById('btn-settings').onclick = () => { if(confirm('Reset Progress?')) { localStorage.clear(); location.reload(); }};

        // Render existing
        Game.state.pets.forEach(p => this.renderPet(p));
    },

    buildGrid(count) {
        this.gridEl.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.dataset.index = i;
            // Desktop
            slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
            slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
            slot.addEventListener('drop', e => { e.preventDefault(); slot.classList.remove('drag-over'); Logic.merge(Game.runtime.dragId, parseInt(slot.dataset.index)); });
            // Touch
            slot.addEventListener('touchstart', e => TouchHandler.start(e, i), {passive:false});
            slot.addEventListener('touchmove', TouchHandler.move, {passive:false});
            slot.addEventListener('touchend', TouchHandler.end);
            this.gridEl.appendChild(slot);
        }
    },

    expandGrid() {
        const current = document.querySelectorAll('.slot').length;
        const extra = 4;
        for (let i = 0; i < extra; i++) {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.dataset.index = current + i;
            // (Attach events same as buildGrid - simplified for brevity, assumes rebuild or manual attach)
            // In production, rebuild is cleaner:
        }
        this.buildGrid(current + extra);
        Game.state.pets.forEach(p => this.renderPet(p)); // Reattach pets to new slots
    },

    renderPet(pet, isNew=false, isEvo=false) {
        const slot = this.gridEl.querySelector(`.slot[data-index="${pet.slotIndex}"]`);
        if (!slot) return;
        
        const card = document.createElement('div');
        card.className = `pet-card ${isNew ? 'anim-pop' : ''} ${isEvo ? 'anim-evolve' : ''}`;
        card.draggable = true;
        card.dataset.id = pet.id;
        
        // Inline SVG for instant load, zero network
        const hue = ((pet.level-1) * 45) % 360;
        card.innerHTML = `
            <svg viewBox="0 0 100 100" class="pet-svg">
                <circle cx="50" cy="50" r="42" fill="hsl(${hue},75%,60%)"/>
                <circle cx="35" cy="42" r="5" fill="white"/><circle cx="65" cy="42" r="5" fill="white"/>
                <circle cx="35" cy="42" r="2.5" fill="#222"/><circle cx="65" cy="42" r="2.5" fill="#222"/>
                <path d="M40 60 Q50 70 60 60" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/>
            </svg>
            <div class="pet-lvl">Lv.${pet.level}</div>
        `;

        card.addEventListener('dragstart', e => { 
            Game.runtime.dragId = parseFloat(card.dataset.id); 
            e.dataTransfer.effectAllowed = 'move'; 
            card.style.opacity = 0.4; 
        });
        card.addEventListener('dragend', () => { card.style.opacity = 1; Game.runtime.dragId = null; });

        slot.innerHTML = '';
        slot.appendChild(card);
    },

    movePet(pet) { this.renderPet(pet); },
    updateHeader() {
        document.getElementById('coin-count').innerText = Math.floor(Game.state.coins).toLocaleString();
        document.getElementById('income-rate').innerText = Game.calcIncome().toFixed(1);
    },
    checkShopButtons() {
        document.querySelectorAll('.btn-buy').forEach(btn => {
            const cost = parseInt(btn.dataset.cost || 0);
            btn.disabled = Game.state.coins < cost;
        });
    },
    updateShop() {
        // Eggs
        document.getElementById('shop-eggs').innerHTML = `
            <div class="shop-item">
                <div><h4>Mystery Egg</h4><p>Hatches Tier 1</p></div>
                <button class="btn-buy" onclick="Logic.buyEgg()" data-cost="50">50 💰</button>
            </div>`;
        // Upgrades
        const ups = [
            { id:'speed', name:'Faster Spawns', desc:'-15% spawn time' },
            { id:'income', name:'Profit Boost', desc:'+15% income' },
            { id:'slots', name:'Expand Grid', desc:'+4 slots' }
        ];
        const mults = { speed: 1.4, income: 1.6, slots: 2.5 };
        const baseCost = { speed: 100, income: 150, slots: 400 };
        
        const html = ups.map(u => {
            const lvl = Game.state.upgrades[u.id];
            const cost = Math.floor(baseCost[u.id] * Math.pow(mults[u.id], lvl));
            return `<div class="shop-item">
                <div><h4>${u.name} <small>(Lvl ${lvl})</small></h4><p>${u.desc}</p></div>
                <button class="btn-buy" onclick="Logic.buyUpgrade('${u.id}')" data-cost="${cost}">${cost.toLocaleString()} 💰</button>
            </div>`;
        }).join('');
        document.getElementById('shop-upgrades').innerHTML = html;
    },
    showOfflineModal(amt) {
        document.getElementById('offline-earnings').innerText = amt.toLocaleString();
        document.getElementById('offline-modal').classList.remove('hidden');
    }
};

// --- 5. TOUCH HANDLER (Robust Drag) ---
const TouchHandler = {
    activeId: null,
    startX: 0, startY: 0,
    el: null,

    start(e, slotIndex) {
        const card = e.currentTarget.querySelector('.pet-card');
        if (!card) return;
        e.preventDefault();
        this.activeId = parseFloat(card.dataset.id);
        const touch = e.touches[0];
        this.startX = touch.clientX; this.startY = touch.clientY;
        
        // Create drag clone
        this.el = card.cloneNode(true);
        this.el.style.position = 'fixed'; this.el.style.zIndex = 1000; this.el.style.pointerEvents = 'none';
        this.el.style.opacity = 0.9; this.el.style.transform = 'scale(1.1)';
        this.el.style.width = card.offsetWidth + 'px'; this.el.style.height = card.offsetHeight + 'px';
        this.el.style.left = (touch.clientX - card.offsetWidth/2) + 'px';
        this.el.style.top = (touch.clientY - card.offsetHeight/2) + 'px';
        document.body.appendChild(this.el);
        card.style.opacity = 0.2;
    },
    move(e) {
        if (!this.el) return; e.preventDefault();
        const t = e.touches[0];
        this.el.style.left = (t.clientX - this.el.offsetWidth/2) + 'px';
        this.el.style.top = (t.clientY - this.el.offsetHeight/2) + 'px';
        
        document.querySelectorAll('.slot').forEach(s => s.classList.remove('drag-over'));
        const target = document.elementFromPoint(t.clientX, t.clientY);
        if (target) {
            const slot = target.closest('.slot');
            if (slot) slot.classList.add('drag-over');
        }
    },
    end(e) {
        if (!this.el) return;
        const t = e.changedTouches[0];
        const target = document.elementFromPoint(t.clientX, t.clientY);
        const slot = target ? target.closest('.slot') : null;
        
        if (slot) {
            Logic.merge(this.activeId, parseInt(slot.dataset.index));
        } else {
            const card = UI.gridEl.querySelector(`.pet-card[data-id="${this.activeId}"]`);
            if (card) card.style.opacity = 1;
        }
        
        this.el.remove(); this.el = null;
        document.querySelectorAll('.slot').forEach(s => s.classList.remove('drag-over'));
    }
};

// --- 6. FX ---
const FX = {
    floatText(text, x, y) {
        const el = document.createElement('div');
        el.className = 'float-text';
        el.textContent = text;
        el.style.left = x + 'px'; el.style.top = y + 'px';
        document.getElementById('fx-layer').appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }
};

// --- BOOTSTRAP (Failsafe) ---
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Bootstrap] DOM Ready.');
    Loader.init();
    // Start asset check (non-blocking)
    Assets.preloadAll();
});
