// Hud: all DOM-based UI overlays.
// Manages the player HUD panel, cast bar, action bar, floating entity name bars,
// floating damage numbers, portal prompt, and portal list.
// Reads sim state; never writes it.

import * as THREE from 'three';
import type { Player, Mob, SpellCast, CombatEvent } from '../sim/sim';
import type { PortalDef } from '../sim/world';
import type { CharacterVisual } from './character';
import spellDefinitions from '../data/spell_definitions.json';
import itemDefinitions from '../data/item_definitions.json';

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
  private lootPrompt!: HTMLDivElement;
  private lootContainerEl!: HTMLDivElement;
  private _lootVisible = false;
  private inventoryPanel!: HTMLDivElement;
  private _inventoryVisible = false;
  private npcPrompt!: HTMLDivElement;
  private dialogueContainerEl!: HTMLDivElement;
  private _dialogueVisible = false;
  private currentDialoguePage = 0;
  private activeDialogueNpc: any = null;
  private shopPanel!: HTMLDivElement;
  private _shopVisible = false;
  private activeShopNpc: any = null;
  private sim: any = null;

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
    this.buildLootUI();
    this.buildInventoryUI();
    this.buildNpcUI();
    this.buildShopUI();
    this.buildHudMessage();

    // Close panels on Escape, toggle inventory on B/I
    this.keyDownBound = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        let handeld = false;
        if (this._portalListVisible) {
          this.portalListContainer.style.display = 'none';
          this._portalListVisible = false;
          handeld = true;
        }
        if (this._lootVisible) {
          this.closeLoot();
          handeld = true;
        }
        if (this._dialogueVisible) {
          this.closeDialogue();
          handeld = true;
        }
        if (this._shopVisible) {
          this.closeShop();
          handeld = true;
        }
        if (this._inventoryVisible) {
          this.closeInventory();
          handeld = true;
        }
        if (handeld) e.preventDefault();
      } else if (e.code === 'KeyB' || e.code === 'KeyI' || e.key === 'b' || e.key === 'i' || e.key === 'B' || e.key === 'I') {
        // Toggle inventory
        if (!this._portalListVisible && !this._lootVisible && !this._shopVisible) {
          this.toggleInventory();
          e.preventDefault();
        }
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
      '.loot-prompt{position:absolute;bottom:140px;left:50%;transform:translateX(-50%);background:rgba(10,10,20,0.9);border:2px solid #f97316;border-radius:8px;padding:8px 16px;color:#ffedd5;font-size:14px;font-weight:bold;text-align:center;z-index:15;pointer-events:none;display:none;box-shadow:0 0 20px rgba(249,115,22,0.4)}',
      '.loot-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(10,10,20,0.95);border:2px solid #f97316;border-radius:12px;padding:20px;min-width:300px;box-shadow:0 0 40px rgba(249,115,22,0.3);z-index:30;pointer-events:auto;display:none;font-family:sans-serif}',
      '.loot-title{font-size:18px;font-weight:bold;color:#ffedd5;text-align:center;margin-bottom:12px}',
      '.loot-gold-row{display:flex;align-items:center;justify-content:center;font-weight:bold;color:#facc15;margin-bottom:10px;font-size:14px;gap:6px}',
      '.loot-item-list{display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;margin-bottom:12px;padding-right:4px}',
      '.loot-item-entry{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid rgba(249,115,22,0.3);border-radius:6px;padding:8px 12px;cursor:pointer}',
      '.loot-item-entry:hover{background:rgba(249,115,22,0.2)}',
      '.loot-item-entry.rarity-junk{border-color:rgba(156,163,175,0.4)}',
      '.loot-item-entry.rarity-common{border-color:rgba(255,255,255,0.4)}',
      '.loot-item-entry.rarity-uncommon{border-color:rgba(34,197,94,0.4)}',
      '.loot-item-entry.rarity-rare{border-color:rgba(59,130,246,0.4)}',
      '.loot-item-entry.rarity-epic{border-color:rgba(168,85,247,0.4)}',
      '.loot-item-name{font-size:14px;font-weight:bold}',
      '.loot-item-name.rarity-junk{color:#9ca3af}',
      '.loot-item-name.rarity-common{color:#fff}',
      '.loot-item-name.rarity-uncommon{color:#22c55e}',
      '.loot-item-name.rarity-rare{color:#3b82f6}',
      '.loot-item-name.rarity-epic{color:#a855f7}',
      '.loot-item-count{color:rgba(255,255,255,0.6);font-size:12px;font-family:monospace}',
      '.loot-action-btn{width:100%;padding:10px;background:#f97316;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;margin-bottom:8px;outline:none}',
      '.loot-action-btn:hover{background:#ea580c}',
      '.loot-close{text-align:center;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer}',
      '.inventory-panel{position:absolute;bottom:100px;right:16px;background:rgba(10,10,20,0.92);border:2px solid #b8860b;border-radius:8px;padding:12px;min-width:240px;box-shadow:0 6px 15px rgba(0,0,0,0.8);pointer-events:auto;font-family:sans-serif;z-index:10;display:none;flex-direction:column}',
      '.inventory-title{font-size:14px;font-weight:bold;color:#facc15;margin-bottom:8px;border-bottom:1px solid rgba(184,134,11,0.4);padding-bottom:4px;display:flex;justify-content:space-between}',
      '.inventory-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}',
      '.inventory-slot{position:relative;width:48px;height:48px;background:rgba(0,0,0,0.6);border:1px solid rgba(184,134,11,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer}',
      '.inventory-slot:hover{border-color:#b8860b}',
      '.inventory-slot.empty{border:1px dashed rgba(255,255,255,0.15);cursor:default}',
      '.inventory-slot .slot-count{position:absolute;bottom:2px;right:4px;font-size:10px;color:#fff;text-shadow:1px 1px 1px #000;font-family:monospace;font-weight:bold}',
      '.inventory-money{display:flex;align-items:center;justify-content:flex-end;gap:6px;font-size:11px;font-weight:bold;color:#e5e7eb}',
      '.inventory-slot .icon-tooth{width:26px;height:26px;background:radial-gradient(circle,#fff,#d1d5db);border-radius:50%}',
      '.inventory-slot .icon-pelt{width:26px;height:26px;background:radial-gradient(circle,#b45309,#78350f);border-radius:20%}',
      '.inventory-slot .icon-ear{width:26px;height:26px;background:radial-gradient(circle,#86efac,#15803d);border-radius:40%}',
      '.inventory-slot .icon-potion{width:26px;height:26px;background:radial-gradient(circle,#f87171,#b91c1c);border-radius:50%}',
      '.inventory-slot .icon-potion-blue{width:26px;height:26px;background:radial-gradient(circle,#60a5fa,#1d4ed8);border-radius:50%}',
      '.inventory-slot .icon-sword{width:26px;height:26px;background:radial-gradient(circle,#cbd5e1,#475569);border-radius:4px}',
      '.inventory-slot .icon-shield{width:26px;height:26px;background:radial-gradient(circle,#fbbf24,#b45309);clip-path:polygon(50% 0%, 100% 25%, 80% 80%, 50% 100%, 20% 80%, 0% 25%)}',
      '.inventory-slot .icon-ring{width:26px;height:26px;background:radial-gradient(circle,#facc15,#ca8a04);border-radius:50%;border:2px solid #78350f}',
      '.inventory-slot .icon-sand{width:26px;height:26px;background:radial-gradient(circle,#fef08a,#eab308);border-radius:10%}',
      '.dialogue-panel{position:absolute;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(10,10,20,0.95);border:2px solid #22c55e;border-radius:12px;padding:18px 24px;width:440px;box-shadow:0 6px 25px rgba(0,0,0,0.8);z-index:30;pointer-events:auto;display:none;flex-direction:column;color:#fff}',
      '.dialogue-title{font-size:16px;font-weight:bold;color:#86efac;margin-bottom:2px}',
      '.dialogue-subtitle{font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}',
      '.dialogue-text{font-size:13px;color:#fff;line-height:1.5;margin-bottom:14px;min-height:48px}',
      '.dialogue-footer{display:flex;justify-content:flex-end;gap:10px}',
      '.dialogue-btn{padding:6px 16px;background:#22c55e;color:#fff;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;outline:none}',
      '.dialogue-btn:hover{background:#16a34a}',
      '.shop-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(10,10,20,0.96);border:2px solid #ffd700;border-radius:12px;padding:20px;width:580px;box-shadow:0 10px 30px rgba(0,0,0,0.9);z-index:30;pointer-events:auto;display:none;flex-direction:column;font-family:sans-serif;color:#fff}',
      '.shop-header{font-size:16px;font-weight:bold;color:#ffd700;text-align:center;margin-bottom:12px;border-bottom:1px solid rgba(255,215,0,0.4);padding-bottom:6px;display:flex;justify-content:space-between;align-items:center}',
      '.shop-body{display:flex;gap:20px;flex:1}',
      '.shop-merchant-side{flex:1.2;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,0.1);padding-right:16px}',
      '.shop-player-side{flex:1;display:flex;flex-direction:column}',
      '.shop-section-title{font-size:11px;font-weight:bold;color:rgba(255,255,255,0.7);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}',
      '.shop-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:240px;overflow-y:auto;padding-right:4px}',
      '.shop-slot{position:relative;background:rgba(0,0,0,0.6);border:1px solid rgba(255,215,0,0.2);border-radius:6px;padding:6px;display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;min-height:90px;justify-content:space-between}',
      '.shop-slot:hover{border-color:#ffd700;background:rgba(255,215,0,0.05)}',
      '.shop-slot-name{font-size:10px;font-weight:bold;color:#fff;margin-top:4px;word-break:break-word}',
      '.shop-slot-price{font-size:9px;margin-top:2px}',
      '.shop-close{text-align:center;margin-top:14px;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer}',
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
    this.updateInventoryUI(p);
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

  /** Update floating nameplates above buildings. */
  updateBuildings(
    buildings: any[],
    camera: THREE.Camera,
    rendEl: HTMLElement,
  ): void {
    const activeBuildingIds = new Set(buildings.map((_, i) => `building_${i}`));
    for (const [id, el] of this.entityUIs) {
      if (id.startsWith('building_') && !activeBuildingIds.has(id)) {
        el.remove();
        this.entityUIs.delete(id);
      }
    }

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (!b.label) continue;

      const id = `building_${i}`;
      let el = this.entityUIs.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'floating-ui-bar';
        el.innerHTML = `<div class="name-label" style="color:#ffd700; font-size:10px; font-weight:bold; letter-spacing:0.5px; text-shadow:1px 1px 1px #000">${b.label}</div>`;
        this.uiContainer.appendChild(el);
        this.entityUIs.set(id, el);
      }

      const height = b.labelHeight || 5.0;
      this.proj.set(b.x, height, b.z);
      this.proj.project(camera);
      if (this.proj.z > 1) {
        el.style.display = 'none';
      } else {
        const sx = (this.proj.x * 0.5 + 0.5) * rendEl.clientWidth;
        const sy = (-(this.proj.y * 0.5) + 0.5) * rendEl.clientHeight;
        el.style.cssText = `left:${sx}px;top:${sy}px;display:flex; border-color: rgba(184,134,11,0.3); background: rgba(10,10,20,0.7); padding: 3px 6px; width: auto; transform: translate(-50%, -100%)`;
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

  // ── Loot and Inventory UI Methods ────────────────────────────────────────

  private buildLootUI(): void {
    this.lootPrompt = document.createElement('div');
    this.lootPrompt.className = 'loot-prompt';
    this.lootPrompt.innerHTML = 'Press <span class="key-hint" style="color:#f97316">E</span> to open chest';
    this.uiContainer.appendChild(this.lootPrompt);

    this.lootContainerEl = document.createElement('div');
    this.lootContainerEl.className = 'loot-panel';
    this.lootContainerEl.style.display = 'none';
    this.uiContainer.appendChild(this.lootContainerEl);
  }

  private buildInventoryUI(): void {
    this.inventoryPanel = document.createElement('div');
    this.inventoryPanel.className = 'inventory-panel';
    this.inventoryPanel.style.display = 'none';
    this.uiContainer.appendChild(this.inventoryPanel);
  }

  private buildNpcUI(): void {
    this.npcPrompt = document.createElement('div');
    this.npcPrompt.className = 'portal-prompt';
    this.npcPrompt.style.borderColor = '#22c55e';
    this.npcPrompt.style.color = '#bbf7d0';
    this.npcPrompt.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.4)';
    this.uiContainer.appendChild(this.npcPrompt);

    this.dialogueContainerEl = document.createElement('div');
    this.dialogueContainerEl.className = 'dialogue-panel';
    this.dialogueContainerEl.style.display = 'none';
    this.uiContainer.appendChild(this.dialogueContainerEl);
  }

  isLootOpen(): boolean { return this._lootVisible; }

  updateLootPrompt(nearLootIndex: number): void {
    this.lootPrompt.style.display =
      (nearLootIndex >= 0 && !this._lootVisible) ? 'block' : 'none';
  }

  isDialogueOpen(): boolean { return this._dialogueVisible; }

  updateNpcPrompt(nearNpcIndex: number, npcs: any[]): void {
    const npc = npcs[nearNpcIndex];
    if (npc && !this._dialogueVisible) {
      this.npcPrompt.innerHTML = `Press <span class="key-hint" style="color:#22c55e">E</span> to talk to ${npc.name}`;
      this.npcPrompt.style.display = 'block';
    } else {
      this.npcPrompt.style.display = 'none';
      if (this._dialogueVisible && this.activeDialogueNpc) {
        const stillInZone = npcs.find(n => n.id === this.activeDialogueNpc.id);
        const currentIndexNpc = npcs[nearNpcIndex];
        if (!stillInZone || currentIndexNpc !== this.activeDialogueNpc) {
          this.closeDialogue();
        }
      }
    }
  }

  showDialogue(npc: any, sim: any): void {
    this.npcPrompt.style.display = 'none';
    this._dialogueVisible = true;
    this.activeDialogueNpc = npc;
    this.currentDialoguePage = 0;
    this.sim = sim;
    this.renderDialogue();
  }

  renderDialogue(): void {
    const npc = this.activeDialogueNpc;
    if (!npc) return;

    const pageText = npc.dialogue[this.currentDialoguePage] || 'Hello!';
    const isLastPage = this.currentDialoguePage === npc.dialogue.length - 1;

    let html = `<div class="dialogue-title">${npc.name}</div>`;
    html += `<div class="dialogue-subtitle">${npc.title}</div>`;
    html += `<div class="dialogue-text">${pageText}</div>`;
    
    html += `<div class="dialogue-footer">`;
    if (npc.shop) {
      html += `<button class="dialogue-btn shop-trade-btn" style="background:#ffd700; color:#000; margin-right:auto">Trade</button>`;
    }
    html += `<button class="dialogue-btn dialogue-next-btn">${isLastPage ? 'Close (Esc)' : 'Next'}</button>`;
    html += `</div>`;

    this.dialogueContainerEl.innerHTML = html;
    this.dialogueContainerEl.style.display = 'flex';

    const nextBtn = this.dialogueContainerEl.querySelector('.dialogue-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (isLastPage) {
          this.closeDialogue();
        } else {
          this.currentDialoguePage++;
          this.renderDialogue();
        }
      });
    }

    const tradeBtn = this.dialogueContainerEl.querySelector('.shop-trade-btn');
    if (tradeBtn) {
      tradeBtn.addEventListener('click', () => {
        this.showShop(npc, this.sim);
      });
    }
  }

  closeDialogue(): void {
    this.dialogueContainerEl.style.display = 'none';
    this._dialogueVisible = false;
    this.activeDialogueNpc = null;
  }

  showLootContainer(container: any, sim: any): void {
    this.lootPrompt.style.display = 'none';
    this._lootVisible = true;
    this.renderLootContainer(container, sim);
  }

  renderLootContainer(container: any, sim: any): void {
    let html = '<div class="loot-title">Chest Contents</div>';
    if (container.money > 0) {
      html += `<div class="loot-gold-row">Money: ${formatMoneyHtml(container.money)}</div>`;
    }
    html += '<div class="loot-item-list">';

    container.items.forEach((item: any, idx: number) => {
      const def = getItemDef(item.itemId);
      const name = def ? def.name : item.itemId;
      const rarity = def ? def.rarity : 'common';
      html += `<div class="loot-item-entry rarity-${rarity}" data-index="${idx}">` +
              `<span class="loot-item-name rarity-${rarity}">${name}</span>` +
              `<span class="loot-item-count">x${item.count}</span></div>`;
    });

    html += '</div>';
    html += '<button class="loot-action-btn">Loot All</button>';
    html += '<div class="loot-close">Close (Esc)</div>';

    this.lootContainerEl.innerHTML = html;
    this.lootContainerEl.style.display = 'block';

    // Hook events
    const closeBtn = this.lootContainerEl.querySelector('.loot-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeLoot());

    const lootAllBtn = this.lootContainerEl.querySelector('.loot-action-btn');
    if (lootAllBtn) {
      lootAllBtn.addEventListener('click', () => {
        sim.lootAll(container.id);
        this.closeLoot();
      });
    }

    const itemEntries = this.lootContainerEl.querySelectorAll('.loot-item-entry');
    itemEntries.forEach(entry => {
      entry.addEventListener('click', () => {
        const idx = parseInt((entry as HTMLElement).dataset.index ?? '0', 10);
        sim.lootItem(container.id, idx);
        // Refresh or close if container is now gone/looted
        const stillExists = sim.lootContainers.find((c: any) => c.id === container.id);
        if (stillExists) {
          this.renderLootContainer(stillExists, sim);
        } else {
          this.closeLoot();
        }
      });
    });
  }

  closeLoot(): void {
    this.lootContainerEl.style.display = 'none';
    this._lootVisible = false;
  }

  toggleInventory(): void {
    if (this._inventoryVisible) {
      this.closeInventory();
    } else {
      this.inventoryPanel.style.display = 'flex';
      this._inventoryVisible = true;
    }
  }

  closeInventory(): void {
    this.inventoryPanel.style.display = 'none';
    this._inventoryVisible = false;
  }

  updateInventoryUI(player: Player): void {
    if (!this._inventoryVisible) return;

    let html = '<div class="inventory-title"><span>Character Inventory</span><span style="cursor:pointer" id="inv-close-x">\u2715</span></div>';
    html += '<div class="inventory-grid">';

    // Grid size: 16 slots
    for (let s = 0; s < 16; s++) {
      const item = player.inventory[s];
      if (item) {
        const def = getItemDef(item.itemId);
        const iconCls = def ? def.icon : 'icon-empty';
        const name = def ? def.name : item.itemId;
        const rarity = def ? def.rarity : 'common';
        const desc = def ? def.desc : '';
        html += `<div class="inventory-slot rarity-${rarity}" style="border-color: rgba(184,134,11,0.6)">` +
                `<div class="${iconCls}"></div>` +
                `<span class="slot-count">${item.count > 1 ? item.count : ''}</span>` +
                `<div class="slot-tooltip" style="bottom: 56px; right: 0; display: none; position: absolute; background: rgba(10,10,20,0.95); border: 1px solid #b8860b; color: #fff; padding: 6px 10px; font-size: 10px; border-radius: 4px; white-space: nowrap; z-index: 50; pointer-events: none">` +
                `<strong>${name}</strong><br><span class="rarity-${rarity}" style="font-weight:bold">${rarity.toUpperCase()}</span><br>${desc}</div>` +
                `</div>`;
      } else {
        html += '<div class="inventory-slot empty"></div>';
      }
    }

    html += '</div>';
    html += `<div class="inventory-money">Money: ${formatMoneyHtml(player.money)}</div>`;

    this.inventoryPanel.innerHTML = html;

    // Hook close button on X
    const closeX = this.inventoryPanel.querySelector('#inv-close-x');
    if (closeX) closeX.addEventListener('click', () => this.closeInventory());

    // Tooltip hovering
    const slots = this.inventoryPanel.querySelectorAll('.inventory-slot:not(.empty)');
    slots.forEach(slot => {
      const tip = slot.querySelector('.slot-tooltip') as HTMLElement;
      if (tip) {
        slot.addEventListener('mouseenter', () => tip.style.display = 'block');
        slot.addEventListener('mouseleave', () => tip.style.display = 'none');
      }
    });
  }

  private buildShopUI(): void {
    this.shopPanel = document.createElement('div');
    this.shopPanel.className = 'shop-panel';
    this.shopPanel.style.display = 'none';
    this.uiContainer.appendChild(this.shopPanel);
  }

  isShopOpen(): boolean { return this._shopVisible; }

  showShop(npc: any, sim: any): void {
    this.closeDialogue();
    this.closeInventory();
    this._shopVisible = true;
    this.activeShopNpc = npc;
    this.sim = sim;
    this.renderShop();
  }

  closeShop(): void {
    this.shopPanel.style.display = 'none';
    this._shopVisible = false;
    this.activeShopNpc = null;
  }

  renderShop(): void {
    const npc = this.activeShopNpc;
    const sim = this.sim;
    if (!npc || !sim) return;

    const player = sim.player;

    let html = `<div class="shop-header">`;
    html += `<span>Trade: ${npc.name}</span>`;
    html += `<span style="cursor:pointer" id="shop-close-x">\u2715</span>`;
    html += `</div>`;

    html += `<div class="shop-body">`;

    // LEFT SIDE: MERCHANT WARES
    html += `<div class="shop-merchant-side">`;
    html += `<div class="shop-section-title">Merchant Goods</div>`;
    html += `<div class="shop-grid">`;
    npc.shop.items.forEach((itemId: string) => {
      const def = getItemDef(itemId);
      if (def) {
        const cost = def.value || 0;
        const iconCls = def.icon;
        const name = def.name;
        const rarity = def.rarity;
        const costHtml = formatMoneyHtml(cost);
        html += `<div class="shop-slot buy-item-btn rarity-${rarity}" data-id="${itemId}" style="border-color: rgba(255,215,0,0.4)">` +
                `<div class="${iconCls}"></div>` +
                `<div class="shop-slot-name">${name}</div>` +
                `<div class="shop-slot-price">${costHtml}</div>` +
                `</div>`;
      }
    });
    html += `</div>`; // end shop-grid
    html += `</div>`; // end merchant-side

    // RIGHT SIDE: PLAYER INVENTORY
    html += `<div class="shop-player-side">`;
    html += `<div class="shop-section-title">Your Bag (Click to Sell)</div>`;
    html += `<div class="inventory-grid" style="grid-template-columns: repeat(4, 1fr)">`;
    for (let s = 0; s < 16; s++) {
      const item = player.inventory[s];
      if (item) {
        const def = getItemDef(item.itemId);
        const iconCls = def ? def.icon : 'icon-empty';
        const name = def ? def.name : item.itemId;
        const rarity = def ? def.rarity : 'common';
        const sellPrice = def ? Math.floor((def.value || 0) * 0.5) : 0;
        const sellHtml = formatMoneyHtml(sellPrice);
        html += `<div class="inventory-slot sell-item-btn rarity-${rarity}" data-index="${s}" style="border-color: rgba(184,134,11,0.6)">` +
                `<div class="${iconCls}"></div>` +
                `<span class="slot-count">${item.count > 1 ? item.count : ''}</span>` +
                `<div class="slot-tooltip" style="bottom: 56px; right: 0; display: none; position: absolute; background: rgba(10,10,20,0.95); border: 1px solid #b8860b; color: #fff; padding: 6px 10px; font-size: 10px; border-radius: 4px; white-space: nowrap; z-index: 50; pointer-events: none">` +
                `<strong>${name}</strong><br>Sells for: ${sellHtml}</div>` +
                `</div>`;
      } else {
        html += `<div class="inventory-slot empty"></div>`;
      }
    }
    html += `</div>`; // end inventory-grid
    html += `<div class="inventory-money" style="margin-top:auto">Your Money: ${formatMoneyHtml(player.money)}</div>`;
    html += `</div>`; // end player-side

    html += `</div>`; // end shop-body

    html += `<div class="shop-close" id="shop-close-btn">Close Shop (Esc)</div>`;

    this.shopPanel.innerHTML = html;
    this.shopPanel.style.display = 'flex';

    // Click events
    const closeX = this.shopPanel.querySelector('#shop-close-x');
    if (closeX) closeX.addEventListener('click', () => this.closeShop());
    const closeBtn = this.shopPanel.querySelector('#shop-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeShop());

    // Buy item handlers
    const buyBtns = this.shopPanel.querySelectorAll('.buy-item-btn');
    buyBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = (btn as HTMLElement).dataset.id ?? '';
        const success = sim.buyItem(npc.id, itemId);
        if (success) {
          this.showMessage(`Bought ${getItemDef(itemId)?.name}`, 2000, '#22c55e');
          this.renderShop();
        } else {
          this.showMessage('Cannot purchase item (not enough money or bag is full)', 2500, '#ef4444');
        }
      });
    });

    // Sell item handlers
    const sellBtns = this.shopPanel.querySelectorAll('.sell-item-btn');
    sellBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.index ?? '0', 10);
        const item = player.inventory[idx];
        if (!item) return;
        const itemName = getItemDef(item.itemId)?.name ?? item.itemId;
        const success = sim.sellItem(npc.id, idx);
        if (success) {
          this.showMessage(`Sold ${itemName}`, 2000, '#eab308');
          this.renderShop();
        }
      });
      // Tooltip hovering
      const tip = btn.querySelector('.slot-tooltip') as HTMLElement;
      if (tip) {
        btn.addEventListener('mouseenter', () => tip.style.display = 'block');
        btn.addEventListener('mouseleave', () => tip.style.display = 'none');
      }
    });
  }

  /** Update friendly NPC nameplates. */
  updateNpcs(
    npcs: any[],
    visuals: CharacterVisual[],
    camera: THREE.Camera,
    rendEl: HTMLElement,
  ): void {
    const activeNpcIds = new Set(npcs.map(n => n.id));
    for (const [id, el] of this.entityUIs) {
      if (id.startsWith('npc_') && !activeNpcIds.has(id)) {
        el.remove();
        this.entityUIs.delete(id);
      }
    }

    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      const v = visuals[i];
      if (!v) continue;

      let el = this.entityUIs.get(npc.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'floating-ui-bar';
        el.innerHTML =
          `<div class="name-label" style="color:#22c55e">${npc.name}</div>` +
          `<div class="name-label" style="font-size:7px; color:rgba(255,255,255,0.5); font-weight:normal; margin-top:-1px">&lt;${npc.title}&gt;</div>`;
        this.uiContainer.appendChild(el);
        this.entityUIs.set(npc.id, el);
      }

      this.proj.set(npc.x, 2.4, npc.z);
      this.proj.project(camera);
      if (this.proj.z > 1) {
        el.style.display = 'none';
      } else {
        const sx = (this.proj.x * 0.5 + 0.5) * rendEl.clientWidth;
        const sy = (-(this.proj.y * 0.5) + 0.5) * rendEl.clientHeight;
        el.style.cssText = `left:${sx}px;top:${sy}px;display:flex; border-color: rgba(34,197,94,0.4); background: rgba(10,10,20,0.85); padding: 3px 6px; width: auto; transform: translate(-50%, -100%)`;
      }
    }
  }
}

// ── Money and Item formatting helpers ──────────────────────────────────────

function formatMoneyHtml(copper: number): string {
  if (copper <= 0) return '<span style="color:#b45309; font-family:monospace; font-weight:bold">0c</span>';
  const p = Math.floor(copper / 1000000);
  const g = Math.floor((copper % 1000000) / 10000);
  const s = Math.floor((copper % 10000) / 100);
  const c = copper % 100;

  const parts: string[] = [];
  if (p > 0) parts.push(`<span style="color:#e2e8f0; font-family:monospace; font-weight:bold">${p}p</span>`);
  if (g > 0) parts.push(`<span style="color:#facc15; font-family:monospace; font-weight:bold">${g}g</span>`);
  if (s > 0) parts.push(`<span style="color:#9ca3af; font-family:monospace; font-weight:bold">${s}s</span>`);
  if (c > 0 || parts.length === 0) parts.push(`<span style="color:#b45309; font-family:monospace; font-weight:bold">${c}c</span>`);
  return parts.join(' ');
}

function getItemDef(itemId: string): { name: string; rarity: string; desc: string; icon: string; value?: number } | null {
  return (itemDefinitions as any)[itemId] || null;
}
