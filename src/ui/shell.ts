import { createInitiativeState, sortedInitiativeEntries } from '../core/initiative'
import type { SceneObject, SceneState, ToolName } from '../model/types'

export type InspectorPanel = 'properties' | 'initiative'

const toolButton = (tool: ToolName, label: string, key: string): string =>
  `<button class="tool" data-tool="${tool}" aria-label="${label}工具">${label}<kbd>${key}</kbd></button>`

export const renderDmShell = (root: HTMLElement): void => {
  root.innerHTML = `
    <main class="workspace">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">LB</span><span><strong>即时战斗板</strong><small>LIVE BATTLE BOARD</small></span></div>
        <nav class="tools" aria-label="地图工具">
          ${toolButton('select', '选择', 'V')}
          ${toolButton('wall', '墙体', 'W')}
          ${toolButton('token', 'Token', 'T')}
          ${toolButton('light', '光源', 'L')}
          ${toolButton('image', '图片', 'I')}
        </nav>
        <div class="header-actions">
          <button class="icon-button" data-action="preview" title="预览玩家视野">◉</button>
          <button class="icon-button" data-action="export" title="导出场景">↓</button>
          <button class="player-button" data-action="player">打开玩家画面 <span>↗</span></button>
        </div>
      </header>
      <section class="stage-shell">
        <div class="stage" id="stage" tabindex="0" aria-label="战斗地图画布"></div>
        <aside class="inspector" id="inspector"></aside>
        <div class="hint" id="hint"><span>滚轮缩放</span><span>右键拖动平移</span><span>修改即时同步</span></div>
        <div class="toast" id="toast" role="status"></div>
      </section>
      <input id="image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden />
      <input id="scene-input" type="file" accept="application/json,.battleboard.json" hidden />
    </main>`
}

export const renderPlayerShell = (root: HTMLElement): void => {
  root.innerHTML = `
    <main class="player-workspace">
      <div class="player-stage" id="stage" tabindex="0" aria-label="玩家战斗画面"></div>
      <div class="player-status" id="player-status"><span></span>等待 DM 画面</div>
      <div class="player-help">按 F 进入全屏</div>
    </main>`
}

const checkbox = (property: string, label: string, checked: boolean): string => `
  <label class="check-row"><input type="checkbox" data-property="${property}" ${checked ? 'checked' : ''} /><span>${label}</span></label>`

const numberInput = (property: string, label: string, value: number, min: number, max: number, step = 1): string => `
  <label class="field"><span>${label}</span><input type="number" data-property="${property}" value="${Math.round(value * 100) / 100}" min="${min}" max="${max}" step="${step}" /></label>`

const objectEditor = (selected: SceneObject | undefined, selectionCount: number): string => {
  if (selectionCount > 1) {
    return `<section class="multi-selection"><h3>批量选择</h3><strong>${selectionCount}</strong><span> 个对象</span>
      <p>拖动任意已选对象可整体移动。支持 <kbd>Ctrl+C</kbd>、<kbd>Ctrl+X</kbd>、<kbd>Ctrl+V</kbd>、<kbd>H</kbd> 和 <kbd>Delete</kbd>。</p>
    </section>`
  }
  if (!selected) return `<section class="quick-start"><h3>快速开始</h3><p>拖入一张地图或素材；按 <kbd>W</kbd> 画墙，按 <kbd>T</kbd> 放置 Token。</p></section>`
  if (selected.kind === 'image') {
    return `<section><h3>图片属性</h3>
      <label class="field"><span>名称</span><input data-property="name" value="${selected.name.replaceAll('"', '&quot;')}" /></label>
      ${numberInput('width', '宽度', selected.width, 16, 8000)}
      ${numberInput('height', '高度', selected.height, 16, 8000)}
      ${numberInput('rotationDegrees', '旋转角度', (selected.rotation * 180) / Math.PI, -360, 360)}
      ${numberInput('opacity', '不透明度', selected.opacity, 0.05, 1, 0.05)}
      ${checkbox('visible', 'DM 端可见', selected.visible)}
      ${checkbox('playerVisible', '玩家端可见', selected.playerVisible)}
      ${checkbox('locked', '锁定位置', selected.locked)}
    </section>`
  }
  if (selected.kind === 'token') {
    return `<section><h3>Token 属性</h3>
      <label class="field"><span>名称</span><input data-property="name" value="${selected.name.replaceAll('"', '&quot;')}" /></label>
      <label class="field"><span>颜色</span><input type="color" data-property="color" value="${selected.color}" /></label>
      ${numberInput('radius', '尺寸', selected.radius, 12, 120)}
      ${checkbox('visibleToPlayers', '玩家端可见（H）', selected.visibleToPlayers)}
      ${checkbox('visionSource', '提供视野', selected.visionSource)}
      ${numberInput('visionRange', '视野距离', selected.visionRange, 40, 3000, 20)}
      ${checkbox('emitsLight', '携带光源', selected.emitsLight)}
      ${numberInput('lightRange', '光照距离', selected.lightRange, 40, 3000, 20)}
    </section>`
  }
  if (selected.kind === 'light') {
    return `<section><h3>光源属性</h3>
      <label class="field"><span>颜色</span><input type="color" data-property="color" value="${selected.color}" /></label>
      ${numberInput('radius', '照明半径', selected.radius, 40, 3000, 20)}
      ${numberInput('intensity', '强度', selected.intensity, 0.05, 1, 0.05)}
      ${checkbox('visibleToPlayers', '玩家端生效', selected.visibleToPlayers)}
    </section>`
  }
  return `<section><h3>墙体属性</h3>
    ${checkbox('blocksVision', '阻挡视野', selected.blocksVision)}
    ${checkbox('blocksLight', '阻挡光照', selected.blocksLight)}
    <p class="section-note">连续左键绘制，右键或 Enter 结束。按住 Ctrl 吸附格点。</p>
  </section>`
}

const renderInitiativeBoard = (scene: SceneState, selectedIds: ReadonlySet<string>): string => {
  const initiative = scene.initiative ?? createInitiativeState()
  const ordered = sortedInitiativeEntries(initiative)
  const selectedTokenCount = scene.tokens.filter((token) => selectedIds.has(token.id)).length
  const rows = ordered.map((entry) => {
    const token = scene.tokens.find((item) => item.id === entry.tokenId)
    if (!token) return ''
    const active = initiative.status === 'running' && initiative.activeTokenId === token.id
    const safeName = token.name.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const safeColor = /^#[0-9a-f]{6}$/i.test(token.color) ? token.color : '#a9c792'
    return `<li class="initiative-row ${active ? 'active' : ''}" data-initiative-token-id="${token.id}" data-initiative-score="${entry.initiative ?? 'empty'}">
      <button class="initiative-drag" data-initiative-drag title="拖动调整同先攻顺序" aria-label="调整 ${safeName} 的平手顺序">⠿</button>
      <span class="initiative-token" style="--token-color: ${safeColor}" aria-hidden="true">${active ? '▶' : ''}</span>
      <span class="initiative-name" title="${safeName}">${safeName}</span>
      <input class="initiative-score" type="number" inputmode="numeric" min="-99" max="999" step="1" value="${entry.initiative ?? ''}" placeholder="—" data-initiative-score-input="${token.id}" aria-label="${safeName} 的先攻值" />
      <button class="initiative-icon" data-action="initiative-locate" data-token-id="${token.id}" title="在地图上定位" aria-label="定位 ${safeName}">◎</button>
      <button class="initiative-icon danger" data-action="initiative-remove" data-token-id="${token.id}" title="移出先攻板" aria-label="移出 ${safeName}">×</button>
    </li>`
  }).join('')

  return `<section class="initiative-board">
    <div class="initiative-heading">
      <div><p class="eyebrow">ENCOUNTER</p><h2>Token 先攻板</h2></div>
      <span class="round-badge">${initiative.status === 'running' ? `第 ${initiative.round} 轮` : '准备中'}</span>
    </div>
    <button class="initiative-add" data-action="initiative-add-selected" ${selectedTokenCount === 0 ? 'disabled' : ''}>＋ 加入已选 Token${selectedTokenCount > 0 ? `（${selectedTokenCount}）` : ''}</button>
    ${rows ? `<ol class="initiative-list">${rows}</ol>` : `<div class="initiative-empty"><strong>尚未加入 Token</strong><p>在地图上选择一个或多个 Token，然后点击上方按钮。</p></div>`}
    ${ordered.length > 0 ? '<button class="initiative-clear" data-action="initiative-clear">清空先攻板</button>' : ''}
    <div class="initiative-controls">
      ${initiative.status === 'running'
        ? `<button data-action="initiative-previous">← 上一位</button><button class="primary" data-action="initiative-next">下一位 →</button>`
        : `<button class="primary wide" data-action="initiative-start" ${ordered.length === 0 ? 'disabled' : ''}>开始战斗</button>`}
    </div>
  </section>`
}

export const renderInspector = (
  host: HTMLElement,
  scene: SceneState,
  selectedIds: ReadonlySet<string>,
  selected?: SceneObject,
  panel: InspectorPanel = 'properties',
): void => {
  const layers = [...scene.images]
    .sort((a, b) => b.zIndex - a.zIndex)
    .map(
      (layer) => `<li class="layer-row ${selectedIds.has(layer.id) ? 'selected' : ''}" data-layer-id="${layer.id}">
        <button data-layer-action="visible" title="显示/隐藏">${layer.visible ? '●' : '○'}</button>
        <span class="layer-thumb">▧</span><span class="layer-name">${layer.name}</span>
        <button data-layer-action="player" title="玩家可见">${layer.playerVisible ? 'PL' : 'DM'}</button>
        <button data-layer-action="up" title="上移">↑</button><button data-layer-action="down" title="下移">↓</button>
      </li>`,
    )
    .join('')

  host.innerHTML = `
    <div class="scene-heading"><p class="eyebrow">SCENE</p><input class="scene-name" data-scene-property="name" value="${scene.name.replaceAll('"', '&quot;')}" /><p class="muted"><span class="saved-dot"></span> 自动保存</p></div>
    <nav class="inspector-tabs" aria-label="侧栏面板">
      <button class="${panel === 'properties' ? 'active' : ''}" data-action="panel-properties">属性</button>
      <button class="${panel === 'initiative' ? 'active' : ''}" data-action="panel-initiative">先攻 <span>${scene.initiative?.entries.length ?? 0}</span></button>
    </nav>
    ${panel === 'initiative' ? renderInitiativeBoard(scene, selectedIds) : `
      ${objectEditor(selected, selectedIds.size)}
      <section><div class="section-title"><h3>图片图层</h3><button data-action="add-image">＋ 添加</button></div>
        ${layers ? `<ul class="layer-list">${layers}</ul>` : `<button class="empty-layer" data-action="add-image"><span>＋</span><p>拖入或添加图片</p></button>`}
      </section>
      <section class="grid-settings"><h3>网格</h3>
        ${checkbox('grid.visible', '显示网格', scene.grid.visible)}
        ${numberInput('grid.size', '格子尺寸', scene.grid.size, 20, 300, 5)}
      </section>
      <footer><span class="live-dot"></span> LIVE MODE <button data-action="import">导入</button><button data-action="reset">清空</button></footer>`}`
}
