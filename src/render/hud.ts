// Hud: all DOM-based UI overlays.
// Manages the player HUD panel, cast bar, action bar, floating entity name bars,
// floating damage numbers, portal prompt, and portal list.
// Reads sim state; never writes it.

import * as THREE from 'three';
import type { Player, Mob, SpellCast, CombatEvent } from '../sim/sim';
import type { PortalDef } from '../sim/world';
import type { CharacterVisual } from './character';
import spellDefinitions from '../data/spell_definitions.json';

interface DamageNumber {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  age: number;
  maxAge: number;
}

export class Hud {
  private uiContainer: HTMLDivElement;
  private castBarContainer!: HTMLDivElement;
  private castBarFill!: HTMLDivElement;
  private castBarText!: HTMLDivElement;
  private entityUIs = new Map<string, HTMLElement>();
  private damageNumbers: DamageNumber[] = [];
  private actionSlots: HTMLElement[] = [];
  private hudPanel!: HTMLDivElement;
  private hudLevelEl!: HTMLDivElement;
  private hudHealthFill!: HTMLDivElement;
  private hudHealthText!: HTMLDivElement;
  private hudManaFill!: HTMLDivElement;
  private hudManaText!: HTMLDivElement;
  private hudStaminaFill!: HTMLDivElement;
  private hudStaminaText!: HTMLDivElement;
  private hudXpFill!: HTMLDivElement;
  private hudXpText!: HTMLDivElement;
  private portalPrompt!: HTMLDivElement;
  private portalListContainer!: HTMLDivElement;
  private _portalListVisible = false;
  private hudMessageEl!: HTMLDivElement;
  private hudMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private keyDownBound!: (e: KeyboardEvent) => void;

  /** Reused across projection calls to avoid per-frame allocation. */
  private readonly proj = new THREE.Vector3();

  get portalListVisible(): boolean { return this._portalListVisible; }

  constructor() {
    this.uiContainer = this.ensureOverlay();
    this.injectStyles();
    this.buildCastBar();
    this.buildActionBar();
    this.buildHudPanel();
    this.buildPortalUI();
    this.buildHudMessage();

    // Close portal list on Escape (owned here since the list is our DOM)
    this.keyDownBound = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this._portalListVisible) {
        this.portalListContainer.style.display = 'none';
        this._portalListVisible = false;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', this.keyDownBound);
  }

  // ── Initialisation helpers ──────────────────────────────────────────────

  private ensureOverlay(): HTMLDivElement {
    let overlay = document.getElementById('ui-overlay') as HTMLDivElement;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ui-overlay';
      overlay.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  private injectStyles(): void {
    if (document.getElementById('rpgcraft-styles')) return;
    const s = document.createElement('style');
    s.id = 'rpgcraft-styles';
    s.textContent = [
      '.floating-ui-bar{position:absolute;width:80px;background:rgba(10,10,20,0.85);border:1px solid rgba(184,134,11,0.6);border-radius:4px;padding:2px;box-shadow:0 4px 6px rgba(0,0,0,0.6);pointer-events:none;transform:translate(-50%,-100%);font-family:sans-serif;display:flex;flex-direction:column;gap:2px;z-index:10}',
      '.floating-ui-bar .name-label{font-size:9px;font-weight:bold;color:#fff;text-align:center;text-shadow:1px 1px 1px #000}',
      '.floating-ui-bar .bar-fill-wrapper{height:6px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;border:0.5px solid rgba(0,0,0,0.5)}',
      '.floating-ui-bar .bar-fill{height:100%;width:100%;transition:width 0.1s ease-out}',
      '.floating-ui-bar .health-fill{background:linear-gradient(to right,#22c55e,#15803d)}',
      '.floating-ui-bar .mana-fill{background:linear-gradient(to right,#3b82f6,#1d4ed8)}',
      '.floating-ui-bar .stamina-fill{background:linear-gradient(to right,#facc15,#a16207)}',
      '.floating-ui-bar .xp-fill{background:linear-gradient(to right,#a855f7,#7c3aed)}',
      '.floating-damage-number{position:absolute;font-family:Impact,sans-serif;font-size:24px;font-weight:900;color:#ff3b30;text-shadow:2px 2px 0 #000;pointer-events:none;transform:translate(-50%,-50%);z-index:20}',
      '.floating-damage-number.xp-gain{color:#a855f7}',
      '.floating-damage-number.level-up{color:#facc15;font-size:32px}',
      '.action-bar{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:8px;background:rgba(10,10,20,0.85);border:2px solid #b8860b;border-radius:8px;padding:6px;box-shadow:0 6px 15px rgba(0,0,0,0.8);z-index:10;pointer-events:auto}',
      '.action-slot{position:relative;width:46px;height:46px;background:rgba(0,0,0,0.6);border:1px solid rgba(184,134,11,0.4);border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer}',
      '.action-slot:hover{border-color:#b8860b}',
      '.action-slot.disabled{opacity:0.35;filter:grayscale(0.8)}',
      '.action-slot .keybind{position:absolute;top:2px;left:3px;font-size:9px;color:rgba(255,255,255,0.6);font-family:monospace}',
      '.action-slot .icon-fireball{width:26px;height:26px;background:radial-gradient(circle,#ff8c00,#d00000);border-radius:50%;box-shadow:0 0 10px #ff4500}',
      '.action-slot .icon-frostbolt{width:26px;height:26px;background:radial-gradient(circle,#e0ffff,#00bfff);border-radius:50%;box-shadow:0 0 10px #1e90ff}',
      '.action-slot .icon-empty{width:20px;height:20px;border:1px dashed rgba(255,255,255,0.15);border-radius:4px}',
      '.action-slot .mana-cost{position:absolute;bottom:2px;right:3px;font-size:8px;color:#60a5fa;font-family:monospace}',
      '.action-slot .slot-tooltip{position:absolute;bottom:56px;background:rgba(10,10,20,0.95);border:1px solid #b8860b;color:#fff;padding:6px 10px;font-size:10px;border-radius:4px;white-space:nowrap;pointer-events:none;display:none}',
      '.action-slot:hover .slot-tooltip{display:block}',
      '.player-hud{position:absolute;bottom:100px;left:16px;background:rgba(10,10,20,0.85);border:2px solid #b8860b;border-radius:8px;padding:10px 14px;min-width:200px;box-shadow:0 6px 15px rgba(0,0,0,0.8);pointer-events:none;font-family:sans-serif;z-index:10}',
      '.player-hud .hud-level{font-size:13px;font-weight:bold;color:#facc15;margin-bottom:4px}',
      '.player-hud .hud-bar-row{display:flex;align-items:center;gap:6px;margin-bottom:3px}',
      '.player-hud .hud-bar-label{font-size:10px;font-weight:bold;color:#fff;width:20px}',
      '.player-hud .hud-bar-wrapper{flex:1;height:10px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;border:0.5px solid rgba(0,0,0,0.5)}',
      '.player-hud .hud-bar-fill{height:100%;width:100%;transition:width 0.15s ease-out;border-radius:2px}',
      '.player-hud .hud-bar-fill.health-fill{background:linear-gradient(to right,#dc2626,#ef4444)}',
      '.player-hud .hud-bar-fill.mana-fill{background:linear-gradient(to right,#2563eb,#3b82f6)}',
      '.player-hud .hud-bar-fill.stamina-fill{background:linear-gradient(to right,#eab308,#facc15)}',
      '.player-hud .hud-bar-fill.xp-fill{background:linear-gradient(to right,#16a34a,#22c55e)}',
      '.player-hud .hud-bar-text{font-size:9px;color:rgba(255,255,255,0.7);min-width:36px;text-align:right;font-family:monospace}',
      '.portal-prompt{position:absolute;bottom:140px;left:50%;transform:translateX(-50%);background:rgba(10,10,20,0.9);border:2px solid #8b5cf6;border-radius:8px;padding:8px 16px;color:#c4b5fd;font-size:14px;font-weight:bold;text-align:center;z-index:15;pointer-events:none;display:none;box-shadow:0 0 20px rgba(139,92,246,0.4)}',
      '.portal-prompt .key-hint{color:#facc15}',
      '.portal-list{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(10,10,20,0.95);border:2px solid #8b5cf6;border-radius:12px;padding:20px;min-width:280px;box-shadow:0 0 40px rgba(139,92,246,0.3);z-index:30;pointer-events:auto;display:none;font-family:sans-serif}',
      '.portal-list .portal-title{font-size:18px;font-weight:bold;color:#c4b5fd;text-align:center;margin-bottom:12px}',
      '.portal-list .portal-entry{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid rgba(139,92,246,0.3);border-radius:6px;padding:10px 14px;margin-bottom:6px;cursor:pointer}',
      '.portal-list .portal-entry:hover{background:rgba(139,92,246,0.2)}',
      '.portal-list .portal-entry .portal-name{color:#fff;font-size:14px;font-weight:bold}',
      '.portal-list .portal-entry .portal-action{color:#8b5cf6;font-size:12px}',
      '.portal-list .portal-close{text-align:center;margin-top:8px;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer}',
    ].join('');
    document.head.appendChild(s);
  }

  private buildCastBar(): void {
    this.castBarContainer = document.createElement('div');
    this.castBarContainer.style.cssText =
      'position:absolute;bottom:90px;left:50%;transform:translateX(-50%);width:240px;height:24px;' +
      'background:rgba(10,10,20,0.85);border:2px solid #b8860b;border-radius:6px;display:none;' +
      'overflow:hidden;pointer-events:none;font-family:monospace;font-size:12px;color:#fff;' +
      'text-align:center;box-shadow:0 4px 10px rgba(0,0,0,0.8)';
    this.castBarFill = document.createElement('div');
    this.castBarFill.style.cssText =
      'height:100%;width:0%;background:linear-gradient(to right,#ff4500,#ff8c00);' +
      'position:absolute;top:0;left:0;z-index:0';
    this.castBarContainer.appendChild(this.castBarFill);
    this.castBarText = document.createElement('div');
    this.castBarText.style.cssText = 'position:relative;z-index:1;font-weight:bold';
    this.castBarContainer.appendChild(this.castBarText);
    this.uiContainer.appendChild(this.castBarContainer);
  }

  private buildActionBar(): void {
    const actionBar = document.createElement('div');
    actionBar.className = 'action-bar';
    const spells = spellDefinitions.map(s => ({
      k: s.keybind,
      c: s.iconClass,
      n: s.name,
      co: `${s.manaCost}m`,
      d: s.tooltip
    }));
    while (spells.length < 5) {
      const k = (spells.length + 1).toString();
      spells.push({ k, c: 'icon-empty', n: 'Empty', co: '', d: '' });
    }
    for (const sp of spells) {
      const slot = document.createElement('div');
      slot.className = 'action-slot' + (sp.c === 'icon-empty' ? ' disabled' : '');
      const kb = document.createElement('span');
      kb.className = 'keybind';
      kb.textContent = sp.k;
      slot.appendChild(kb);
      const icon = document.createElement('div');
      icon.className = sp.c;
      slot.appendChild(icon);
      if (sp.co) {
        const c = document.createElement('span');
        c.className = 'mana-cost';
        c.textContent = sp.co;
        slot.appendChild(c);
      }
      const tip = document.createElement('div');
      tip.className = 'slot-tooltip';
      tip.innerHTML = `<strong>${sp.n}</strong>${sp.d ? '<br>' + sp.d : ''}`;
      slot.appendChild(tip);
      actionBar.appendChild(slot);
      this.actionSlots.push(slot);
    }
    // Allow clicking action bar slots as an alternative to keyboard
    if (this.actionSlots[0]) {
      this.actionSlots[0].addEventListener('click', () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' })));
    }
    if (this.actionSlots[1]) {
      this.actionSlots[1].addEventListener('click', () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' })));
    }
    this.uiContainer.appendChild(actionBar);
  }

  private hudBarRow(
    label: string,
    cls: string,
  ): { row: HTMLDivElement; fill: HTMLDivElement; text: HTMLDivElement } {
    const row = document.createElement('div');
    row.className = 'hud-bar-row';
    const lbl = document.createElement('div');
    lbl.className = 'hud-bar-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    const wrap = document.createElement('div');
    wrap.className = 'hud-bar-wrapper';
    const fill = document.createElement('div');
    fill.className = `hud-bar-fill ${cls}`;
    wrap.appendChild(fill);
    row.appendChild(wrap);
    const txt = document.createElement('div');
    txt.className = 'hud-bar-text';
    txt.textContent = '100/100';
    row.appendChild(txt);
    return { row, fill, text: txt };
  }

  private buildHudPanel(): void {
    this.hudPanel = document.createElement('div');
    this.hudPanel.className = 'player-hud';

    this.hudLevelEl = document.createElement('div');
    this.hudLevelEl.className = 'hud-level';
    this.hudLevelEl.textContent = 'Level 1';
    this.hudPanel.appendChild(this.hudLevelEl);

    const hr = this.hudBarRow('\u2665', 'health-fill');
    this.hudHealthFill = hr.fill; this.hudHealthText = hr.text;
    this.hudPanel.appendChild(hr.row);

    const mr = this.hudBarRow('\u2666', 'mana-fill');
    this.hudManaFill = mr.fill; this.hudManaText = mr.text;
    this.hudPanel.appendChild(mr.row);

    const sr = this.hudBarRow('\u26A1', 'stamina-fill');
    this.hudStaminaFill = sr.fill; this.hudStaminaText = sr.text;
    this.hudPanel.appendChild(sr.row);

    const xr = this.hudBarRow('\u2606', 'xp-fill');
    this.hudXpFill = xr.fill; this.hudXpText = xr.text;
    this.hudPanel.appendChild(xr.row);

    this.uiContainer.appendChild(this.hudPanel);
  }

  private buildPortalUI(): void {
    this.portalPrompt = document.createElement('div');
    this.portalPrompt.className = 'portal-prompt';
    this.portalPrompt.innerHTML = 'Press <span class="key-hint">E</span> to open portal list';
    this.uiContainer.appendChild(this.portalPrompt);

    this.portalListContainer = document.createElement('div');
    this.portalListContainer.className = 'portal-list';
    this.portalListContainer.style.display = 'none';
    this.uiContainer.appendChild(this.portalListContainer);
  }

  private buildHudMessage(): void {
    this.hudMessageEl = document.createElement('div');
    this.hudMessageEl.style.cssText = [
      'position:absolute',
      'bottom:20px',
      'right:20px',
      'background:rgba(10,10,20,0.92)',
      'border:2px solid #22c55e',
      'border-radius:8px',
      'padding:10px 18px',
      'color:#bbf7d0',
      'font-size:14px',
      'font-weight:bold',
      'font-family:sans-serif',
      'z-index:60',
      'pointer-events:none',
      'opacity:0',
      'transform:translateY(8px)',
      'transition:opacity 0.25s ease-out, transform 0.25s ease-out',
      'box-shadow:0 4px 15px rgba(0,0,0,0.7)',
      'white-space:nowrap',
    ].join(';');
    this.uiContainer.appendChild(this.hudMessageEl);
  }

  /**
   * Show a brief toast notification (bottom-right).
   * @param text     Message text, supports a leading emoji e.g. '✔ Game Saved'
   * @param duration Milliseconds before the toast fades out (default 2000)
   * @param color    Optional CSS border/text accent color (default green)
   */
  showMessage(text: string, duration = 2000, color = '#22c55e'): void {
    const el = this.hudMessageEl;
    // Update colour in case previous was a different accent
    el.style.borderColor = color;
    el.style.color = color === '#22c55e' ? '#bbf7d0' : '#fff';
    el.textContent = text;
    // Force reflow so the transition plays even when re-triggered quickly
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    void el.offsetWidth;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    if (this.hudMessageTimer !== null) clearTimeout(this.hudMessageTimer);
    this.hudMessageTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      this.hudMessageTimer = null;
    }, duration);
  }

  // ── Per-frame update methods ────────────────────────────────────────────

  /** Update the portal proximity prompt visibility. */
  updatePortalPrompt(nearPortalIndex: number): void {
    this.portalPrompt.style.display =
      (nearPortalIndex >= 0 && !this._portalListVisible) ? 'block' : 'none';
  }

  /** Build and show the portal travel list. Dispatches 'portal-select' CustomEvent on click. */
  showPortalList(portals: PortalDef[]): void {
    if (portals.length === 0) return;

    let html = '<div class="portal-title">Where do you want to go?</div>';
    for (let i = 0; i < portals.length; i++) {
      html += `<div class="portal-entry" data-index="${i}">` +
              `<span class="portal-name">${portals[i].label}</span>` +
              `<span class="portal-action">\u25B6 Travel</span></div>`;
    }
    html += '<div class="portal-close">Close (Esc)</div>';
    this.portalListContainer.innerHTML = html;
    this.portalListContainer.style.display = 'block';
    this._portalListVisible = true;

    for (const entry of this.portalListContainer.querySelectorAll('.portal-entry')) {
      entry.addEventListener('click', () => {
        const idx = parseInt((entry as HTMLElement).dataset.index ?? '0', 10);
        if (idx >= 0 && idx < portals.length) {
          window.dispatchEvent(new CustomEvent('portal-select', { detail: { portalIndex: idx } }));
          this.portalListContainer.style.display = 'none';
          this._portalListVisible = false;
        }
      });
    }
    const close = this.portalListContainer.querySelector('.portal-close');
    if (close) {
      close.addEventListener('click', () => {
        this.portalListContainer.style.display = 'none';
        this._portalListVisible = false;
      });
    }
  }

  /**
   * Update player HUD panel bars and the floating name bar above the player.
   * @param playerHeight - world-unit height of the player model (for bar projection).
   */
  updatePlayer(
    p: Player,
    playerHeight: number,
    camera: THREE.Camera,
    rendEl: HTMLElement,
  ): void {
    // Static HUD panel (bottom-left)
    this.hudLevelEl.textContent = `Level ${p.level}`;
    this.hudHealthFill.style.width  = `${Math.max(0, (p.health  / p.maxHealth)  * 100)}%`;
    this.hudHealthText.textContent  = `${Math.floor(p.health)}/${p.maxHealth}`;
    this.hudManaFill.style.width    = `${Math.max(0, (p.mana    / p.maxMana)    * 100)}%`;
    this.hudManaText.textContent    = `${Math.floor(p.mana)}/${p.maxMana}`;
    this.hudStaminaFill.style.width = `${Math.max(0, (p.stamina / p.maxStamina) * 100)}%`;
    this.hudStaminaText.textContent = `${Math.floor(p.stamina)}/${p.maxStamina}`;
    this.hudXpFill.style.width      = `${Math.max(0, (p.experience / p.nextLevelExp) * 100)}%`;
    this.hudXpText.textContent      = `${Math.floor(p.experience)}/${p.nextLevelExp}`;

    // Floating bar above player's head
    let pBar = this.entityUIs.get('player');
    if (!pBar) {
      pBar = document.createElement('div');
      pBar.className = 'floating-ui-bar';
      pBar.innerHTML =
        '<div class="name-label">Mage (Lv 1)</div>' +
        '<div class="bar-fill-wrapper"><div class="bar-fill health-fill"></div></div>' +
        '<div class="bar-fill-wrapper"><div class="bar-fill mana-fill"></div></div>';
      this.uiContainer.appendChild(pBar);
      this.entityUIs.set('player', pBar);
    }
    const pLabel = pBar.querySelector('.name-label') as HTMLElement;
    if (pLabel) pLabel.textContent = `Mage (Lv ${p.level})`;

    this.proj.set(p.x, playerHeight + 0.3, p.z);
    this.proj.project(camera);
    if (this.proj.z > 1) {
      pBar.style.display = 'none';
    } else {
      const sx = (this.proj.x * 0.5 + 0.5) * rendEl.clientWidth;
      const sy = (-(this.proj.y * 0.5) + 0.5) * rendEl.clientHeight;
      pBar.style.cssText = `left:${sx}px;top:${sy}px;display:flex;`;
      const hf = pBar.querySelector('.health-fill') as HTMLElement;
      if (hf) hf.style.width = `${Math.max(0, (p.health / p.maxHealth) * 100)}%`;
      const mf = pBar.querySelector('.mana-fill') as HTMLElement;
      if (mf) mf.style.width = `${Math.max(0, (p.mana / p.maxMana) * 100)}%`;
    }
  }

  /** Update floating name bars above all mobs. */
  updateMobs(
    mobs: Mob[],
    visuals: CharacterVisual[],
    camera: THREE.Camera,
    rendEl: HTMLElement,
  ): void {
    // Remove bars for mobs that no longer exist
    const midSet = new Set(mobs.map(m => m.id));
    for (const [id, el] of this.entityUIs) {
      if (id !== 'player' && !midSet.has(id)) {
        el.remove();
        this.entityUIs.delete(id);
      }
    }

    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      const v = visuals[i];
      if (!v) continue; // visual not yet spawned

      let el = this.entityUIs.get(m.id);
      if (m.health <= 0) {
        if (el) el.style.display = 'none';
        continue;
      }
      const tn = m.type.charAt(0).toUpperCase() + m.type.slice(1);
      if (!el) {
        el = document.createElement('div');
        el.className = 'floating-ui-bar';
        el.innerHTML =
          `<div class="name-label">${tn} (Lv ${m.level})</div>` +
          '<div class="bar-fill-wrapper"><div class="bar-fill health-fill"></div></div>';
        this.uiContainer.appendChild(el);
        this.entityUIs.set(m.id, el);
      } else {
        const ml = el.querySelector('.name-label') as HTMLElement;
        if (ml) ml.textContent = `${tn} (Lv ${m.level})`;
      }

      this.proj.set(m.x, v.height + 0.3, m.z);
      this.proj.project(camera);
      if (this.proj.z > 1) {
        el.style.display = 'none';
      } else {
        const sx = (this.proj.x * 0.5 + 0.5) * rendEl.clientWidth;
        const sy = (-(this.proj.y * 0.5) + 0.5) * rendEl.clientHeight;
        el.style.cssText = `left:${sx}px;top:${sy}px;display:flex;`;
        const hf = el.querySelector('.health-fill') as HTMLElement;
        if (hf) hf.style.width = `${Math.max(0, (m.health / m.maxHealth) * 100)}%`;
      }
    }
  }

  /** Show or hide the cast-bar with current progress. */
  updateCastBar(activeCast: SpellCast | null): void {
    if (activeCast) {
      this.castBarContainer.style.display = 'flex';
      this.castBarFill.style.width =
        `${(activeCast.timer / activeCast.duration) * 100}%`;
      this.castBarText.textContent =
        `${activeCast.name} (${activeCast.timer.toFixed(1)}s / ${activeCast.duration.toFixed(1)}s)`;
    } else {
      this.castBarContainer.style.display = 'none';
    }
  }

  /** Gray out / re-enable action slots based on target and mana. */
  updateActionSlots(player: Player, hasTarget: boolean): void {
    if (this.actionSlots[0]) {
      const spell = spellDefinitions.find(s => s.keybind === '1');
      const cost = spell ? spell.manaCost : 15;
      if (!hasTarget || player.mana < cost) this.actionSlots[0].classList.add('disabled');
      else                                  this.actionSlots[0].classList.remove('disabled');
    }
    if (this.actionSlots[1]) {
      const spell = spellDefinitions.find(s => s.keybind === '2');
      const cost = spell ? spell.manaCost : 10;
      if (!hasTarget || player.mana < cost) this.actionSlots[1].classList.add('disabled');
      else                                  this.actionSlots[1].classList.remove('disabled');
    }
  }

  /**
   * Spawn DOM elements for new combat events and animate all in-flight numbers.
   * Must be called every frame even when `events` is empty so animations progress.
   */
  updateDamageNumbers(
    events: CombatEvent[],
    dt: number,
    camera: THREE.Camera,
    rendEl: HTMLElement,
  ): void {
    // Create new numbers for this frame's events
    for (const evt of events) {
      let cls = 'floating-damage-number';
      let txt = `-${evt.value}`;
      let yy = 2.2;
      let ma = 0.8;
      if (evt.targetId === 'player' && evt.value === 0) {
        cls += ' level-up'; txt = '\u2B06 LEVEL UP!'; yy = 3.0; ma = 2.0;
      } else if (evt.targetId === 'player' && evt.value > 0) {
        cls += ' xp-gain';  txt = `+${evt.value} XP`; yy = 2.8; ma = 1.2;
      }
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = txt;
      this.uiContainer.appendChild(el);
      this.damageNumbers.push({ el, x: evt.x, y: yy, z: evt.z, age: 0, maxAge: ma });
    }

    // Animate and expire
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.age += dt;
      if (dn.age >= dn.maxAge) {
        dn.el.remove();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      dn.y += dt * 1.5;
      this.proj.set(dn.x, dn.y, dn.z);
      this.proj.project(camera);
      if (this.proj.z > 1) {
        dn.el.style.display = 'none';
      } else {
        const sx = (this.proj.x * 0.5 + 0.5) * rendEl.clientWidth;
        const sy = (-(this.proj.y * 0.5) + 0.5) * rendEl.clientHeight;
        dn.el.style.cssText =
          `left:${sx}px;top:${sy}px;display:block;opacity:${1 - dn.age / dn.maxAge}`;
      }
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyDownBound);
    if (this.uiContainer) this.uiContainer.innerHTML = '';
    this.entityUIs.clear();
    this.damageNumbers = [];
    this.actionSlots = [];
  }
}
