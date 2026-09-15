export const STYLE_ID = 'xunji-workbench-style'

export const CSS = `
.xunji-panel,.xunji-tab{box-sizing:border-box;font-family:var(--ds-font-family,Inter,"PingFang SC","Microsoft YaHei",sans-serif);color:var(--dsw-alias-label-primary,#182230)}
.xunji-panel *,.xunji-tab *{box-sizing:border-box}
.xunji-panel button,.xunji-tab button{font:inherit}
.xunji-panel button:focus-visible,.xunji-tab button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#3b6ff5);outline-offset:2px}
.xunji-section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:24px;margin-bottom:6px}
.xunji-section-title strong{font-size:12px;font-weight:680}
.xunji-section-title span{min-width:0;color:var(--dsw-alias-label-tertiary,#778292);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xunji-section-title button{flex:none;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#526071);font-size:11px;cursor:pointer;padding:4px 6px}
.xunji-section-actions{display:flex;align-items:center;gap:2px}
.xunji-section-title button:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f3f7)}
.xunji-connections{display:flex;flex-direction:column;gap:6px}
.xunji-connection{min-width:0;border:1px solid var(--dsw-alias-border-l2,#dce2ea);background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#fafbfc) 88%,transparent);border-radius:10px;padding:7px 8px;display:flex;align-items:center;gap:8px}
.xunji-connection__icon{flex:none;width:28px;height:28px;border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#dce2ea);display:grid;place-items:center;color:var(--dsw-alias-state-business-primary,#3b6ff5);font-size:10px;font-weight:800}
.xunji-connection__copy{min-width:0;flex:1}
.xunji-connection__copy strong{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xunji-connection__copy span{display:block;margin-top:2px;color:var(--dsw-alias-label-tertiary,#7b8796);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xunji-connection__phase{flex:none;display:flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary,#7b8796);font-size:10px;white-space:nowrap}
.xunji-connection__phase i{width:6px;height:6px;border-radius:50%;background:currentColor}
.xunji-connection__phase[data-phase=active]{color:var(--dsw-alias-state-success-primary,#1e9d66)}
.xunji-connection__phase[data-phase=failed]{color:var(--dsw-alias-state-error-primary,#d84a4a)}
.xunji-connection__phase[data-phase=loading]{color:var(--dsw-alias-state-business-primary,#3b6ff5)}
.xunji-connections[data-compact=true]{display:grid;grid-template-columns:1fr 1fr}
.xunji-connections[data-compact=true] .xunji-connection__copy span{display:none}
.xunji-mini-mark{display:inline-grid;place-items:center;border-radius:10px;overflow:hidden;box-shadow:0 5px 16px rgba(49,93,224,.2)}
.xunji-tab{width:100%;min-height:100%;overflow-y:auto;overscroll-behavior:contain;padding:16px 18px 20px}
.xunji-tab__top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;min-width:0;margin-bottom:14px}
.xunji-tab__connections{margin-top:4px}
.xunji-panel{width:100%;height:100%;overflow-y:auto;overscroll-behavior:contain;padding:28px 32px 40px}
.xunji-panel__surface{max-width:1040px;margin:0 auto}
.xunji-panel .xunji-tab__top{margin-bottom:18px}
.xunji-panel .xunji-dock__top-actions{width:auto}
.xunji-panel__grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:22px;align-items:start;margin-top:6px}
.xunji-panel__grid .xunji-tab__connections{margin-top:0}
.xunji-panel-glyph{flex:none;display:inline-block}
button:has(.xunji-panel-glyph){height:38px;min-height:38px;justify-content:center;gap:6px;margin:0 2px;padding:8px 16px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 35%,var(--dsw-alias-border-l3,#d5dbe5));border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 8%,var(--dsw-alias-button-elevated-fill,#fff));color:var(--dsw-alias-state-business-primary,#315de0);font-size:14px;font-weight:500;line-height:22px;box-shadow:none}
button:has(.xunji-panel-glyph):hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 14%,var(--dsw-alias-button-elevated-fill,#fff))}
button:has(.xunji-panel-glyph)[aria-current=page]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 18%,var(--dsw-alias-button-elevated-fill,#fff));color:var(--dsw-alias-state-business-primary,#315de0);font-weight:600}
.xunji-dock__brand{min-width:0;display:flex;align-items:center;gap:10px}
.xunji-dock__brand-copy{min-width:0;display:flex;flex-direction:column;gap:2px}
.xunji-dock__brand-copy strong{font-size:15px;line-height:20px}
.xunji-dock__brand-copy span{color:var(--dsw-alias-label-tertiary,#778292);font-size:11px;line-height:15px}
.xunji-mini-mark{flex:none;width:32px;height:32px;border-radius:10px;font-size:14px}
.xunji-dock__top-actions{width:100%;display:flex;align-items:center;gap:6px}
.xunji-dock__config-toggle{flex:1;height:32px;border:0;border-radius:9px;background:var(--dsw-alias-bg-layer-2,#f3f5f8);color:var(--dsw-alias-state-business-primary,#315de0);padding:0 10px;font-size:11px;font-weight:650;text-align:left;cursor:pointer}
.xunji-dock__config-toggle:hover,.xunji-dock__config-toggle[aria-pressed=true]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 10%,transparent)}
.xunji-dock__connections-summary{flex:none;display:flex;align-items:center;gap:6px;height:32px;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:999px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#526071);padding:0 11px;font-size:12px}
.xunji-status-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#9aa4b2)}
.xunji-status-dot[data-state=ready]{background:var(--dsw-alias-state-success-primary,#1e9d66)}
.xunji-status-dot[data-state=error]{background:var(--dsw-alias-state-error-primary,#d84a4a)}
.xunji-dock__connection-summary{margin:9px 0 0;color:var(--dsw-alias-label-tertiary,#778292);font-size:11px;line-height:16px}
.xunji-dock__notice{min-width:0;margin:12px 0 0;padding-top:11px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#dce2ea) 76%,transparent);color:var(--dsw-alias-label-tertiary,#778292);font-size:10px;line-height:15px}
.xunji-config-panel{min-width:0}
.xunji-config-panel__intro{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:11px}
.xunji-config-panel__intro strong{display:block;font-size:13px;line-height:18px}
.xunji-config-panel__intro span:not(.xunji-config-panel__safe){display:block;margin-top:2px;color:var(--dsw-alias-label-tertiary,#778292);font-size:10px;line-height:14px}
.xunji-config-panel__safe{flex:none;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#1e9d66) 10%,transparent);color:var(--dsw-alias-state-success-primary,#1e9d66);padding:4px 7px;font-size:9px;font-weight:700;white-space:nowrap}
.xunji-config-panel__tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:9px}
.xunji-config-panel__tabs button{min-width:0;height:30px;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#526071);padding:0 8px;font-size:10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xunji-config-panel__tabs button:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f3f7)}
.xunji-config-panel__tabs button[data-active=true]{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 48%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 10%,transparent);color:var(--dsw-alias-state-business-primary,#315de0);font-weight:700}
.xunji-config-panel__card{border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 23%,var(--dsw-alias-border-l2,#dce2ea));border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 5%,var(--dsw-alias-bg-layer-1,#fff)),var(--dsw-alias-bg-layer-1,#fff));padding:11px}
.xunji-config-panel__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.xunji-config-panel__heading h3{margin:0;font-size:12px;line-height:17px}
.xunji-config-panel__heading p{margin:2px 0 0;color:var(--dsw-alias-label-tertiary,#778292);font-size:10px;line-height:14px}
.xunji-config-panel__permission{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:6px;margin-top:10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#f7f8fa) 86%,transparent);padding:7px 8px}
.xunji-config-panel__permission span{color:var(--dsw-alias-label-tertiary,#778292);font-size:9px}
.xunji-config-panel__permission strong{border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#1e9d66) 12%,transparent);color:var(--dsw-alias-state-success-primary,#1e9d66);padding:2px 5px;font-size:9px}
.xunji-config-panel__permission p{min-width:0;margin:0;color:var(--dsw-alias-label-secondary,#526071);font-size:9px;line-height:13px}
.xunji-config-panel__field{margin-top:10px}
.xunji-config-panel__field>span{display:block;margin-bottom:5px;color:var(--dsw-alias-label-tertiary,#778292);font-size:9px;font-weight:650}
.xunji-config-panel__variables{display:flex;flex-wrap:wrap;gap:5px}
.xunji-config-panel__variables code{border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);padding:4px 6px;color:var(--dsw-alias-label-secondary,#526071);font-family:var(--ds-font-family-mono,ui-monospace,monospace);font-size:9px}
.xunji-config-panel__form{display:grid;gap:7px;margin-top:11px;padding:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 22%,var(--dsw-alias-border-l2,#dce2ea));border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 4%,transparent)}
.xunji-config-panel__form-title{display:flex;align-items:center;justify-content:space-between;gap:6px;color:var(--dsw-alias-label-secondary,#526071);font-size:10px;font-weight:700}
.xunji-config-panel__form-title em{color:var(--dsw-alias-label-tertiary,#778292);font-size:9px;font-style:normal;font-weight:500}
.xunji-config-panel__input{display:block;min-width:0}
.xunji-config-panel__input>span{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px;color:var(--dsw-alias-label-secondary,#526071);font-size:9px}
.xunji-config-panel__input i{border-radius:4px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-tertiary,#778292);padding:2px 4px;font-size:8px;font-style:normal}
.xunji-config-panel__input i[data-configured=true]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#1e9d66) 10%,transparent);color:var(--dsw-alias-state-success-primary,#1e9d66)}
.xunji-config-panel__input select{width:100%;height:29px;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#182230);padding:0 6px;font-size:13px;outline:0;cursor:pointer}
.xunji-config-panel__input select:focus{border-color:var(--dsw-alias-state-business-primary,#3b6ff5);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 12%,transparent)}
.xunji-config-panel__input input{width:100%;height:27px;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#182230);padding:0 7px;font-size:10px;outline:0}
.xunji-config-panel__input input:focus{border-color:var(--dsw-alias-state-business-primary,#3b6ff5);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 12%,transparent)}
.xunji-config-panel__form>button{height:28px;border:0;border-radius:7px;background:var(--dsw-alias-state-business-primary,#3b6ff5);color:#fff;font-size:10px;font-weight:700;cursor:pointer}
.xunji-config-panel__form>button:disabled{cursor:wait;opacity:.6}
.xunji-import{margin-top:11px;padding:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 22%,var(--dsw-alias-border-l2,#dce2ea));border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 4%,transparent)}
.xunji-import__drop{display:flex;flex-direction:column;align-items:center;gap:3px;margin-top:7px;padding:14px 10px;border:1px dashed color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 42%,var(--dsw-alias-border-l2,#dce2ea));border-radius:9px;background:var(--dsw-alias-bg-layer-1,#fff);cursor:pointer;text-align:center}
.xunji-import__drop:hover,.xunji-import__drop[data-dragging=true]{border-color:var(--dsw-alias-state-business-primary,#3b6ff5);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 7%,var(--dsw-alias-bg-layer-1,#fff))}
.xunji-import__drop input{display:none}
.xunji-import__drop strong{font-size:12px;color:var(--dsw-alias-state-business-primary,#315de0)}
.xunji-import__drop span{font-size:11px;color:var(--dsw-alias-label-tertiary,#778292);line-height:16px}
.xunji-import__list{list-style:none;display:flex;flex-direction:column;gap:5px;margin:9px 0 0;padding:0}
.xunji-import__list li{display:flex;align-items:center;gap:8px;min-width:0;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);padding:5px 6px 5px 8px}
.xunji-import__name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
.xunji-import__meta{flex:none;color:var(--dsw-alias-label-tertiary,#778292);font-size:11px}
.xunji-import__status{max-width:40%;font-size:11px;color:var(--dsw-alias-label-tertiary,#778292);overflow-wrap:anywhere}
.xunji-import__status[data-failed=true]{color:var(--dsw-alias-state-error-primary,#d84a4a)}
.xunji-config-panel__clear{justify-self:start;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#526071);font-size:11px;cursor:pointer;padding:2px 0}
.xunji-import__list button{flex:none;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#526071);padding:3px 6px;font-size:11px;cursor:pointer}
.xunji-import__list button:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f3f7);color:var(--dsw-alias-state-error-primary,#d84a4a)}
.xunji-config-panel__help{margin-top:10px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#dce2ea) 78%,transparent);padding-top:9px}
.xunji-config-panel__help strong{display:block;color:var(--dsw-alias-label-secondary,#526071);font-size:10px}
.xunji-config-panel__help ol{margin:5px 0 6px;padding-left:17px;color:var(--dsw-alias-label-tertiary,#778292);font-size:9px;line-height:14px}
.xunji-config-panel__help a{color:var(--dsw-alias-state-business-primary,#315de0);font-size:9px;font-weight:700;text-decoration:none}
.xunji-config-panel__unified{margin:9px 0 0;color:var(--dsw-alias-label-tertiary,#778292);font-size:9px;line-height:14px}
.xunji-config-panel__notice{margin:8px 0 0;color:var(--dsw-alias-state-success-primary,#1e9d66);font-size:10px;line-height:14px}
.xunji-dock__brand-copy span{font-size:12px;line-height:18px}
.xunji-section-title strong{font-size:13px}
.xunji-section-title span,.xunji-section-title button,.xunji-connection__copy span,.xunji-connection__phase,.xunji-dock__notice{font-size:11px;line-height:16px}
.xunji-connection__copy strong,.xunji-dock__config-toggle{font-size:12px}
.xunji-config-panel__intro span:not(.xunji-config-panel__safe),.xunji-config-panel__heading p,.xunji-config-panel__permission p,.xunji-config-panel__field>span,.xunji-config-panel__form-title,.xunji-config-panel__input>span,.xunji-config-panel__help strong,.xunji-config-panel__help ol,.xunji-config-panel__help a,.xunji-config-panel__unified,.xunji-config-panel__notice{font-size:12px;line-height:18px}
.xunji-config-panel__tabs button,.xunji-config-panel__heading h3,.xunji-config-panel__input input,.xunji-config-panel__form>button{font-size:13px}
.xunji-config-panel__permission span,.xunji-config-panel__permission strong,.xunji-config-panel__variables code,.xunji-config-panel__form-title em{font-size:11px}
.xunji-turn-sources{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:8px 0 0;color:var(--dsw-alias-label-tertiary,#778292);font-size:11px;line-height:16px}
.xunji-turn-sources>span{font-weight:650}
.xunji-turn-sources i{border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 9%,transparent);color:var(--dsw-alias-state-business-primary,#315de0);padding:2px 7px;font-size:11px;font-style:normal}
.xunji-turn-evidence{display:flex;align-items:center;flex-wrap:wrap;gap:5px;width:100%;padding-top:2px;color:var(--dsw-alias-label-tertiary,#778292)}
.xunji-turn-evidence>span{font-weight:650}
.xunji-turn-evidence em,.xunji-turn-evidence a{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#f7f8fa) 85%,transparent);padding:2px 6px;color:var(--dsw-alias-label-secondary,#526071);font-size:10px;font-style:normal;text-decoration:none}
.xunji-turn-evidence a{color:var(--dsw-alias-state-business-primary,#315de0)}
@media(max-width:1100px){.xunji-panel__grid{grid-template-columns:1fr}.xunji-panel{padding:20px}}
@media(max-width:680px){.xunji-tab{padding:13px}.xunji-dock__brand-copy span{display:none}.xunji-dock__top-actions{gap:4px}.xunji-dock__config-toggle{padding:0 7px}}
`
