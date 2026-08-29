import { Camera } from '../core/Camera'
import { SceneStore } from '../core/SceneStore'
import { WindowBridge } from '../core/WindowBridge'
import { addSceneObject, allSceneObjects, cloneSceneObjects, removeSceneObjects, sceneObjectsInRect, translateSceneObject } from '../core/sceneObjects'
import { distanceToSegment } from '../geometry/visibility'
import { createDefaultScene, createImageLayer, createLight, createToken, createWall, findSceneObject, makeId } from '../model/scene'
import type { SceneObject, SceneState, ToolName, Vec2 } from '../model/types'
import { SceneRenderer } from '../render/SceneRenderer'
import { BattleBoardDatabase, type ExportedAsset } from '../storage/BattleBoardDatabase'
import { renderDmShell, renderInspector } from '../ui/shell'

interface DragState {
  type: 'object' | 'camera' | 'marquee'
  ids?: string[]
  pendingId?: string
  button: number
  additive: boolean
  moved: boolean
  startScreen: Vec2
  startWorld: Vec2
  lastScreen: Vec2
  lastWorld: Vec2
}

interface SceneExport {
  format: 'live-battle-board'
  version: 1
  scene: SceneState
  assets: ExportedAsset[]
}

const screenPoint = (event: PointerEvent | WheelEvent, element: HTMLElement): Vec2 => {
  const rect = element.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

const imageSize = async (file: File): Promise<{ width: number; height: number }> => {
  try {
    const bitmap = await createImageBitmap(file)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions
  } catch {
    return { width: 800, height: 600 }
  }
}

const download = (name: string, contents: Blob): void => {
  const url = URL.createObjectURL(contents)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export class DmApp {
  private readonly root: HTMLElement
  private readonly database = new BattleBoardDatabase()
  private readonly bridge = new WindowBridge()
  private readonly camera = new Camera({ x: -140, y: -100, zoom: 0.72 })
  private store!: SceneStore
  private renderer!: SceneRenderer
  private stage!: HTMLElement
  private inspector!: HTMLElement
  private tool: ToolName = 'select'
  private readonly selectedIds = new Set<string>()
  private primarySelectedId: string | null = null
  private wallStart: Vec2 | null = null
  private wallPointer: Vec2 | null = null
  private drag: DragState | null = null
  private clipboard: SceneObject[] = []
  private clipboardWasCut = false
  private pasteGeneration = 0
  private previewVision = false
  private saveTimer: number | undefined
  private toastTimer: number | undefined

  constructor(root: HTMLElement) {
    this.root = root
  }

  async init(): Promise<void> {
    renderDmShell(this.root)
    this.stage = this.root.querySelector<HTMLElement>('#stage')!
    this.inspector = this.root.querySelector<HTMLElement>('#inspector')!
    const scene = (await this.database.loadScene()) ?? createDefaultScene()
    this.store = new SceneStore(scene)
    this.renderer = await SceneRenderer.create(this.stage, 'dm', (id) => this.database.getAssetBlob(id))
    this.bindEvents()
    this.store.subscribe((next) => {
      this.render(next)
      this.bridge.sendSnapshot(next, this.camera.snapshot)
      window.clearTimeout(this.saveTimer)
      this.saveTimer = window.setTimeout(() => void this.database.saveScene(next), 250)
    })
    this.bridge.onPlayerReady(() => this.bridge.sendSnapshot(this.store.scene, this.camera.snapshot))
    this.setTool('select')
  }

  private render(scene = this.store.scene): void {
    const existingIds = new Set(allSceneObjects(scene).map((object) => object.id))
    for (const id of this.selectedIds) if (!existingIds.has(id)) this.selectedIds.delete(id)
    if (this.primarySelectedId && !this.selectedIds.has(this.primarySelectedId)) {
      this.primarySelectedId = [...this.selectedIds].at(-1) ?? null
    }
    const selected = findSceneObject(scene, this.primarySelectedId)
    this.renderer.render(scene, this.camera.snapshot, {
      selectedIds: [...this.selectedIds],
      wallDraft: this.wallStart && this.wallPointer ? { start: this.wallStart, end: this.wallPointer } : null,
      selectionBox: this.drag?.type === 'marquee' ? { start: this.drag.startWorld, end: this.drag.lastWorld } : null,
      previewVision: this.previewVision,
    })
    renderInspector(this.inspector, scene, this.selectedIds, selected)
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (event) => this.onClick(event))
    this.root.addEventListener('change', (event) => this.onChange(event))
    const imageInput = this.root.querySelector<HTMLInputElement>('#image-input')!
    const sceneInput = this.root.querySelector<HTMLInputElement>('#scene-input')!
    imageInput.addEventListener('change', () => {
      if (imageInput.files) void this.addImages([...imageInput.files])
      imageInput.value = ''
    })
    sceneInput.addEventListener('change', () => {
      const file = sceneInput.files?.[0]
      if (file) void this.importScene(file)
      sceneInput.value = ''
    })
    this.stage.addEventListener('pointerdown', (event) => this.onPointerDown(event))
    this.stage.addEventListener('pointermove', (event) => this.onPointerMove(event))
    this.stage.addEventListener('pointerup', (event) => this.onPointerUp(event))
    this.stage.addEventListener('pointercancel', (event) => this.onPointerUp(event))
    this.stage.addEventListener('contextmenu', (event) => {
      event.preventDefault()
    })
    this.stage.addEventListener('wheel', (event) => this.onWheel(event), { passive: false })
    this.stage.addEventListener('dragover', (event) => {
      event.preventDefault()
      this.stage.classList.add('dragging-file')
    })
    this.stage.addEventListener('dragleave', () => this.stage.classList.remove('dragging-file'))
    this.stage.addEventListener('drop', (event) => {
      event.preventDefault()
      this.stage.classList.remove('dragging-file')
      const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith('image/'))
      if (files.length) void this.addImages(files, this.camera.screenToWorld(screenPoint(event as unknown as PointerEvent, this.stage)))
    })
    window.addEventListener('keydown', (event) => this.onKeyDown(event))
  }

  private onClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tool], [data-action], [data-layer-action], [data-layer-id]')
    if (!target) return
    const tool = target.dataset.tool as ToolName | undefined
    if (tool) return this.setTool(tool)

    const layerRow = target.closest<HTMLElement>('[data-layer-id]')
    const layerId = layerRow?.dataset.layerId
    const layerAction = target.dataset.layerAction
    if (layerId && layerAction) return this.updateLayer(layerId, layerAction)
    if (layerId) {
      const mouseEvent = event as MouseEvent
      if (mouseEvent.shiftKey) this.toggleSelection(layerId)
      else this.selectOnly(layerId)
      this.setTool('select')
      this.render()
      return
    }

    switch (target.dataset.action) {
      case 'player':
        window.open(`${location.pathname}?mode=player`, 'live-battle-board-player', 'popup')
        break
      case 'preview':
        this.previewVision = !this.previewVision
        target.classList.toggle('active', this.previewVision)
        this.render()
        this.showToast(this.previewVision ? '正在预览玩家视野' : '已返回 DM 全视野')
        break
      case 'add-image':
        this.root.querySelector<HTMLInputElement>('#image-input')?.click()
        break
      case 'export':
        void this.exportScene()
        break
      case 'import':
        this.root.querySelector<HTMLInputElement>('#scene-input')?.click()
        break
      case 'reset':
        if (window.confirm('清空当前临时场景？导出的场景不受影响。')) {
          this.clearSelection()
          this.store.replace(createDefaultScene())
          this.showToast('已清空场景')
        }
        break
    }
  }

  private onChange(event: Event): void {
    const input = event.target as HTMLInputElement
    if (input.dataset.sceneProperty === 'name') {
      this.store.update((scene) => { scene.name = input.value.trim() || '临时场景' })
      return
    }
    const property = input.dataset.property
    if (!property) return
    if (property.startsWith('grid.')) {
      this.store.update((scene) => {
        if (property === 'grid.visible') scene.grid.visible = input.checked
        if (property === 'grid.size') scene.grid.size = Number(input.value)
      })
      return
    }
    this.store.update((scene) => {
      const selected = findSceneObject(scene, this.primarySelectedId)
      if (!selected) return
      const value: string | number | boolean = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value
      if (property === 'rotationDegrees' && selected.kind === 'image') selected.rotation = (Number(value) * Math.PI) / 180
      else (selected as unknown as Record<string, string | number | boolean>)[property] = value
    })
  }

  private onPointerDown(event: PointerEvent): void {
    this.stage.focus()
    const screen = screenPoint(event, this.stage)
    const world = this.snap(this.camera.screenToWorld(screen), event.ctrlKey)
    if (event.button === 1 || event.button === 2) {
      event.preventDefault()
      this.drag = {
        type: 'camera',
        button: event.button,
        additive: false,
        moved: false,
        startScreen: screen,
        startWorld: world,
        lastScreen: screen,
        lastWorld: world,
      }
      this.stage.classList.add('panning')
      this.stage.setPointerCapture(event.pointerId)
      return
    }
    if (event.button !== 0) return
    if (this.tool === 'wall') {
      if (!this.wallStart) this.wallStart = world
      else {
        const start = this.wallStart
        this.store.update((scene) => scene.walls.push(createWall(start, world)))
        this.wallStart = world
      }
      this.wallPointer = world
      this.render()
      return
    }
    if (this.tool === 'token') {
      const token = createToken(world)
      this.selectOnly(token.id)
      this.store.update((scene) => scene.tokens.push(token))
      this.showToast('已放置 Token；按 H 可隐藏')
      return
    }
    if (this.tool === 'light') {
      const light = createLight(world)
      this.selectOnly(light.id)
      this.store.update((scene) => scene.lights.push(light))
      this.showToast('已放置光源；Shift + 滚轮调整半径')
      return
    }
    if (this.tool !== 'select') return
    const hit = this.hitTest(world)
    if (hit?.kind === 'image' && !this.selectedIds.has(hit.id)) {
      if (!event.shiftKey) this.clearSelection()
      this.drag = {
        type: 'marquee',
        pendingId: hit.id,
        button: event.button,
        additive: event.shiftKey,
        moved: false,
        startScreen: screen,
        startWorld: world,
        lastScreen: screen,
        lastWorld: world,
      }
      this.stage.setPointerCapture(event.pointerId)
      this.render()
      return
    }
    if (hit) {
      if (event.shiftKey) this.toggleSelection(hit.id)
      else if (!this.selectedIds.has(hit.id)) this.selectOnly(hit.id)
      else this.primarySelectedId = hit.id

      const movableIds = [...this.selectedIds].filter((id) => {
        const object = findSceneObject(this.store.scene, id)
        return object && !(object.kind === 'image' && object.locked)
      })
      if (this.selectedIds.has(hit.id) && movableIds.length > 0) {
        this.drag = {
          type: 'object',
          ids: movableIds,
          button: event.button,
          additive: event.shiftKey,
          moved: false,
          startScreen: screen,
          startWorld: world,
          lastScreen: screen,
          lastWorld: world,
        }
        this.stage.setPointerCapture(event.pointerId)
      }
    } else {
      if (!event.shiftKey) this.clearSelection()
      this.drag = {
        type: 'marquee',
        button: event.button,
        additive: event.shiftKey,
        moved: false,
        startScreen: screen,
        startWorld: world,
        lastScreen: screen,
        lastWorld: world,
      }
      this.stage.setPointerCapture(event.pointerId)
    }
    this.render()
  }

  private onPointerMove(event: PointerEvent): void {
    const screen = screenPoint(event, this.stage)
    const world = this.snap(this.camera.screenToWorld(screen), event.ctrlKey)
    if (this.tool === 'wall' && this.wallStart) {
      this.wallPointer = world
      this.renderer.render(this.store.scene, this.camera.snapshot, {
        selectedIds: [...this.selectedIds],
        wallDraft: { start: this.wallStart, end: world },
        previewVision: this.previewVision,
      })
    }
    if (!this.drag) return
    if (Math.hypot(screen.x - this.drag.startScreen.x, screen.y - this.drag.startScreen.y) > 3) this.drag.moved = true
    if (this.drag.type === 'camera') {
      this.camera.panByScreen({ x: screen.x - this.drag.lastScreen.x, y: screen.y - this.drag.lastScreen.y })
      this.drag.lastScreen = screen
      this.drag.lastWorld = world
      this.render()
      this.bridge.sendSnapshot(this.store.scene, this.camera.snapshot)
      return
    }
    if (this.drag.type === 'marquee') {
      this.drag.lastScreen = screen
      this.drag.lastWorld = world
      this.render()
      return
    }
    const delta = { x: world.x - this.drag.lastWorld.x, y: world.y - this.drag.lastWorld.y }
    this.drag.lastWorld = world
    this.drag.lastScreen = screen
    const ids = new Set(this.drag.ids ?? [])
    this.store.update((scene) => {
      for (const object of allSceneObjects(scene)) if (ids.has(object.id)) translateSceneObject(object, delta)
    })
  }

  private onPointerUp(event: PointerEvent): void {
    const completed = this.drag
    if (this.stage.hasPointerCapture(event.pointerId)) this.stage.releasePointerCapture(event.pointerId)
    this.drag = null
    this.stage.classList.remove('panning')
    if (!completed) return
    if (completed.type === 'marquee') {
      if (!completed.moved && completed.pendingId) {
        if (completed.additive) this.toggleSelection(completed.pendingId)
        else this.selectOnly(completed.pendingId)
      } else {
        const matches = sceneObjectsInRect(this.store.scene, { start: completed.startWorld, end: completed.lastWorld })
        if (!completed.additive) this.clearSelection()
        for (const object of matches) this.selectedIds.add(object.id)
        this.primarySelectedId = matches.at(-1)?.id ?? this.primarySelectedId
      }
    }
    if (completed.type === 'camera' && completed.button === 2 && !completed.moved && this.tool === 'wall') this.finishWall()
    else this.render()
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault()
    const adjustable = [...this.selectedIds]
      .map((id) => findSceneObject(this.store.scene, id))
      .filter((object): object is SceneObject => Boolean(object))
      .some((object) => object.kind === 'light' || object.kind === 'token')
    if (event.shiftKey && adjustable) {
      this.store.update((scene) => {
        const delta = event.deltaY > 0 ? -20 : 20
        for (const id of this.selectedIds) {
          const object = findSceneObject(scene, id)
          if (object?.kind === 'light') object.radius = Math.max(40, object.radius + delta)
          if (object?.kind === 'token') object.visionRange = Math.max(40, object.visionRange + delta)
        }
      })
      return
    }
    this.camera.zoomAt(screenPoint(event, this.stage), Math.exp(-event.deltaY * 0.0012))
    this.render()
    this.bridge.sendSnapshot(this.store.scene, this.camera.snapshot)
  }

  private onKeyDown(event: KeyboardEvent): void {
    if ((event.target as HTMLElement).matches('input, textarea, [contenteditable]')) return
    const control = event.ctrlKey || event.metaKey
    if (control && event.code === 'KeyC') { event.preventDefault(); this.copySelection(false); return }
    if (control && event.code === 'KeyX') { event.preventDefault(); this.copySelection(true); return }
    if (control && event.code === 'KeyV') { event.preventDefault(); this.pasteSelection(); return }
    if (control && event.code === 'KeyA') {
      event.preventDefault()
      this.clearSelection()
      for (const token of this.store.scene.tokens) this.selectedIds.add(token.id)
      this.primarySelectedId = this.store.scene.tokens.at(-1)?.id ?? null
      this.render()
      this.showToast(`已选择 ${this.selectedIds.size} 个 Token`)
      return
    }
    const tools: Partial<Record<string, ToolName>> = { KeyV: 'select', KeyW: 'wall', KeyT: 'token', KeyL: 'light', KeyI: 'image' }
    const tool = tools[event.code]
    if (tool) return this.setTool(tool)
    if (event.code === 'Enter') return this.finishWall()
    if (event.code === 'Escape') {
      if (this.wallStart) this.finishWall()
      else { this.clearSelection(); this.render() }
      return
    }
    if (event.code === 'Delete' || event.code === 'Backspace') return this.deleteSelected()
    if (event.code === 'KeyH') this.toggleSelectedVisibility()
    if (event.code === 'KeyR') this.rotateSelected(event.shiftKey ? -Math.PI / 12 : Math.PI / 12)
    if (event.code === 'KeyD' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); this.duplicateSelected() }
  }

  private setTool(tool: ToolName): void {
    this.tool = tool
    if (tool !== 'wall') this.finishWall()
    this.root.querySelectorAll<HTMLElement>('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool))
    this.stage.dataset.tool = tool
    if (tool === 'image') {
      this.root.querySelector<HTMLInputElement>('#image-input')?.click()
      this.tool = 'select'
      this.root.querySelectorAll<HTMLElement>('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === 'select'))
      this.stage.dataset.tool = 'select'
    }
    const messages: Record<ToolName, string> = {
      select: '拖动或框选 · Shift 追加 · Ctrl+C/X/V · Delete 删除',
      wall: '左键连续绘制 · Ctrl 吸附格点 · 右键单击结束',
      token: '点击战场放置 Token', light: '点击放置光源 · Shift + 滚轮调整半径', image: '选择图片',
    }
    const hint = this.root.querySelector<HTMLElement>('#hint')
    if (hint) hint.innerHTML = `<span>${messages[tool]}</span><span>右键拖动平移</span><span>滚轮缩放</span>`
  }

  private hitTest(point: Vec2): SceneObject | undefined {
    const tolerance = 12 / this.camera.snapshot.zoom
    for (const token of [...this.store.scene.tokens].reverse()) if (Math.hypot(point.x - token.x, point.y - token.y) <= token.radius + tolerance) return token
    for (const light of [...this.store.scene.lights].reverse()) if (Math.hypot(point.x - light.x, point.y - light.y) <= 22 + tolerance) return light
    for (const wall of [...this.store.scene.walls].reverse()) if (distanceToSegment(point, wall.a, wall.b) <= tolerance) return wall
    return [...this.store.scene.images].sort((a, b) => b.zIndex - a.zIndex).find((image) => image.visible && point.x >= image.x - image.width / 2 && point.x <= image.x + image.width / 2 && point.y >= image.y - image.height / 2 && point.y <= image.y + image.height / 2)
  }

  private snap(point: Vec2, enabled: boolean): Vec2 {
    if (!enabled) return point
    const size = this.store.scene.grid.size
    return { x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size }
  }

  private selectOnly(id: string): void {
    this.selectedIds.clear()
    this.selectedIds.add(id)
    this.primarySelectedId = id
  }

  private toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id)
      if (this.primarySelectedId === id) this.primarySelectedId = [...this.selectedIds].at(-1) ?? null
    } else {
      this.selectedIds.add(id)
      this.primarySelectedId = id
    }
  }

  private clearSelection(): void {
    this.selectedIds.clear()
    this.primarySelectedId = null
  }

  private selectedObjects(scene = this.store.scene): SceneObject[] {
    return allSceneObjects(scene).filter((object) => this.selectedIds.has(object.id))
  }

  private finishWall(): void { this.wallStart = null; this.wallPointer = null; if (this.store) this.render() }
  private deleteSelected(): void {
    if (this.selectedIds.size === 0) return
    const ids = new Set(this.selectedIds)
    const count = ids.size
    this.clearSelection()
    this.store.update((scene) => removeSceneObjects(scene, ids))
    this.showToast(`已删除 ${count} 个对象`)
  }
  private toggleSelectedVisibility(): void {
    this.store.update((scene) => {
      const objects = this.selectedObjects(scene).filter((object) => object.kind !== 'wall')
      const allVisible = objects.every((object) => object.kind === 'image' ? object.playerVisible : object.visibleToPlayers)
      for (const object of objects) {
        if (object.kind === 'image') object.playerVisible = !allVisible
        if (object.kind === 'token' || object.kind === 'light') object.visibleToPlayers = !allVisible
      }
    })
  }
  private rotateSelected(delta: number): void {
    this.store.update((scene) => {
      for (const object of this.selectedObjects(scene)) if (object.kind === 'image' && !object.locked) object.rotation += delta
    })
  }
  private duplicateSelected(): void {
    const copies = cloneSceneObjects(this.selectedObjects(), { x: 40, y: 40 })
    if (copies.length === 0) return
    this.store.update((scene) => {
      for (const object of copies) addSceneObject(scene, object)
    })
    this.clearSelection()
    for (const object of copies) this.selectedIds.add(object.id)
    this.primarySelectedId = copies.at(-1)?.id ?? null
    this.render()
  }

  private copySelection(cut: boolean): void {
    const objects = this.selectedObjects()
    if (objects.length === 0) return
    this.clipboard = structuredClone(objects)
    this.clipboardWasCut = cut
    this.pasteGeneration = 0
    if (cut) {
      const ids = new Set(this.selectedIds)
      this.clearSelection()
      this.store.update((scene) => removeSceneObjects(scene, ids))
    }
    this.showToast(`${cut ? '已剪切' : '已复制'} ${objects.length} 个对象`)
  }

  private pasteSelection(): void {
    if (this.clipboard.length === 0) {
      this.showToast('剪贴板中没有战场对象')
      return
    }
    let offset = { x: 0, y: 0 }
    if (this.clipboardWasCut) {
      this.clipboardWasCut = false
      this.pasteGeneration = 0
    } else {
      this.pasteGeneration += 1
      const distance = Math.max(24, this.store.scene.grid.size / 2) * this.pasteGeneration
      offset = { x: distance, y: distance }
    }
    const copies = cloneSceneObjects(this.clipboard, offset)
    this.store.update((scene) => {
      for (const object of copies) addSceneObject(scene, object)
    })
    this.clearSelection()
    for (const object of copies) this.selectedIds.add(object.id)
    this.primarySelectedId = copies.at(-1)?.id ?? null
    this.render()
    this.showToast(`已粘贴 ${copies.length} 个对象`)
  }
  private updateLayer(id: string, action: string): void {
    this.store.update((scene) => {
      const layer = scene.images.find((item) => item.id === id); if (!layer) return
      if (action === 'visible') layer.visible = !layer.visible
      if (action === 'player') layer.playerVisible = !layer.playerVisible
      if (action === 'up') layer.zIndex += 1.5
      if (action === 'down') layer.zIndex -= 1.5
      scene.images.sort((a, b) => a.zIndex - b.zIndex).forEach((item, index) => { item.zIndex = index })
    })
  }

  private async addImages(files: File[], dropPosition?: Vec2): Promise<void> {
    let offset = 0
    const addedIds: string[] = []
    for (const file of files) {
      const assetId = makeId('asset'); await this.database.saveAsset(assetId, file.name, file)
      const dimensions = await imageSize(file); const scale = Math.min(1, 1200 / dimensions.width)
      const center = dropPosition ?? this.camera.screenToWorld({ x: this.stage.clientWidth / 2, y: this.stage.clientHeight / 2 })
      const layer = createImageLayer(assetId, file.name, { x: center.x + offset, y: center.y + offset }, dimensions.width * scale, dimensions.height * scale, this.store.scene.images.length)
      addedIds.push(layer.id); this.store.update((scene) => scene.images.push(layer)); offset += 28
    }
    this.clearSelection()
    for (const id of addedIds) this.selectedIds.add(id)
    this.primarySelectedId = addedIds.at(-1) ?? null
    this.setTool('select'); this.showToast(`已添加 ${files.length} 张图片`)
  }

  private async exportScene(): Promise<void> {
    const assets = await this.database.exportAssets(this.store.scene.images.map((layer) => layer.assetId))
    const payload: SceneExport = { format: 'live-battle-board', version: 1, scene: this.store.scene, assets }
    const safeName = this.store.scene.name.replace(/[\\/:*?"<>|]/g, '-') || 'scene'
    download(`${safeName}.battleboard.json`, new Blob([JSON.stringify(payload)], { type: 'application/json' })); this.showToast('场景已导出')
  }
  private async importScene(file: File): Promise<void> {
    try {
      const payload = JSON.parse(await file.text()) as SceneExport
      if (payload.format !== 'live-battle-board' || payload.version !== 1 || !payload.scene) throw new Error('Invalid format')
      await this.database.importAssets(payload.assets ?? [])
      this.clearSelection(); this.store.replace(payload.scene); this.showToast('场景已导入')
    } catch { this.showToast('无法导入：文件格式不正确') }
  }
  private showToast(message: string): void {
    const toast = this.root.querySelector<HTMLElement>('#toast'); if (!toast) return
    toast.textContent = message; toast.classList.add('show'); window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200)
  }
}
