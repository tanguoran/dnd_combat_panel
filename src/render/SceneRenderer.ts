import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { computeVisibilityPolygon } from '../geometry/visibility'
import type { CameraState, SceneState, Vec2 } from '../model/types'

export type RenderMode = 'dm' | 'player'

interface RenderOptions {
  selectedIds?: string[]
  wallDraft?: { start: Vec2; end: Vec2 } | null
  selectionBox?: { start: Vec2; end: Vec2 } | null
  previewVision?: boolean
}

type AssetLoader = (assetId: string) => Promise<Blob | undefined>

interface LastRender {
  scene: SceneState
  camera: CameraState
  options: RenderOptions
}

const destroyChildren = (container: Container): void => {
  for (const child of container.removeChildren()) child.destroy({ children: true })
}

const polygon = (graphics: Graphics, points: Vec2[]): Graphics =>
  graphics.poly(points.map((point) => ({ x: point.x, y: point.y })))

export class SceneRenderer {
  readonly app = new Application()
  private readonly mode: RenderMode
  private readonly loadAsset: AssetLoader
  private readonly world = new Container()
  private readonly content = new Container()
  private readonly imageLayer = new Container()
  private readonly tokenLayer = new Container()
  private readonly wallLayer = new Container()
  private readonly lightLayer = new Container()
  private readonly selectionLayer = new Container()
  private readonly visionMask = new Graphics()
  private readonly textures = new Map<string, Texture>()
  private readonly pendingTextures = new Set<string>()
  private readonly failedTextures = new Set<string>()
  private lastRender: LastRender | null = null

  private constructor(mode: RenderMode, loadAsset: AssetLoader) {
    this.mode = mode
    this.loadAsset = loadAsset
  }

  static async create(
    host: HTMLElement,
    mode: RenderMode,
    loadAsset: AssetLoader,
  ): Promise<SceneRenderer> {
    const renderer = new SceneRenderer(mode, loadAsset)
    await renderer.app.init({
      resizeTo: host,
      background: mode === 'player' ? '#050706' : '#171b18',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    })
    renderer.app.canvas.className = 'battle-canvas'
    host.appendChild(renderer.app.canvas)
    renderer.content.sortableChildren = true
    renderer.content.addChild(renderer.imageLayer, renderer.tokenLayer)
    renderer.world.addChild(renderer.content, renderer.lightLayer, renderer.wallLayer, renderer.selectionLayer, renderer.visionMask)
    renderer.app.stage.addChild(renderer.world)
    return renderer
  }

  render(scene: SceneState, camera: CameraState, options: RenderOptions = {}): void {
    this.lastRender = { scene, camera, options }
    this.world.position.set(-camera.x * camera.zoom, -camera.y * camera.zoom)
    this.world.scale.set(camera.zoom)
    this.drawImages(scene)
    this.drawGrid(scene)
    this.drawTokens(scene)
    this.drawWalls(scene, options.wallDraft)
    this.drawLights(scene)
    this.drawSelection(scene, options.selectedIds, options.selectionBox)
    this.applyVision(scene, Boolean(options.previewVision))
    // Background windows can have a throttled ticker. Render the received
    // snapshot immediately so the player display never depends on focus.
    this.app.render()
  }

  private drawImages(scene: SceneState): void {
    destroyChildren(this.imageLayer)

    const ground = new Graphics()
      .rect(0, 0, scene.width, scene.height)
      .fill(this.mode === 'player' ? '#161a17' : '#202520')
      .stroke({ color: '#414b43', width: 2, alpha: this.mode === 'dm' ? 0.7 : 0 })
    ground.zIndex = -10000
    this.imageLayer.addChild(ground)

    for (const layer of [...scene.images].sort((a, b) => a.zIndex - b.zIndex)) {
      if (!layer.visible || (this.mode === 'player' && !layer.playerVisible)) continue
      const texture = this.textures.get(layer.assetId)
      if (!texture) {
        void this.ensureTexture(layer.assetId)
        this.drawImagePlaceholder(layer, this.failedTextures.has(layer.assetId))
        continue
      }
      const sprite = new Sprite(texture)
      sprite.anchor.set(0.5)
      sprite.position.set(layer.x, layer.y)
      sprite.width = layer.width
      sprite.height = layer.height
      sprite.rotation = layer.rotation
      sprite.alpha = layer.opacity * (this.mode === 'dm' && !layer.playerVisible ? 0.38 : 1)
      sprite.zIndex = layer.zIndex
      this.imageLayer.addChild(sprite)
    }
  }

  private async ensureTexture(assetId: string): Promise<void> {
    if (this.textures.has(assetId) || this.pendingTextures.has(assetId) || this.failedTextures.has(assetId)) return
    this.pendingTextures.add(assetId)
    try {
      const blob = await this.loadAsset(assetId)
      if (!blob) throw new Error(`Asset ${assetId} was not found`)
      const resource = await this.decodeImage(blob)
      this.textures.set(assetId, Texture.from(resource, true))
    } catch (error) {
      console.error('Unable to decode battle-board image', error)
      this.failedTextures.add(assetId)
    } finally {
      this.pendingTextures.delete(assetId)
      if (this.lastRender) this.render(this.lastRender.scene, this.lastRender.camera, this.lastRender.options)
    }
  }

  private async decodeImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
    if ('createImageBitmap' in globalThis) {
      try {
        return await createImageBitmap(blob)
      } catch {
        // Some browsers cannot decode every supported format through ImageBitmap.
      }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const image = new Image()
      image.onload = () => {
        URL.revokeObjectURL(url)
        resolve(image)
      }
      image.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error(`Unable to decode ${blob.type || 'image'}`))
      }
      image.src = url
    })
  }

  private drawImagePlaceholder(layer: SceneState['images'][number], failed: boolean): void {
    const placeholder = new Container()
    placeholder.position.set(layer.x, layer.y)
    placeholder.rotation = layer.rotation
    placeholder.zIndex = layer.zIndex
    const body = new Graphics()
      .rect(-layer.width / 2, -layer.height / 2, layer.width, layer.height)
      .fill({ color: failed ? '#382221' : '#252b26', alpha: 0.82 })
      .stroke({ color: failed ? '#c9776f' : '#667267', width: 2, alpha: 0.75 })
    const label = new Text({
      text: failed ? `图片解码失败\n${layer.name}` : `正在加载图片…\n${layer.name}`,
      style: { fill: failed ? '#efb0aa' : '#aeb9af', fontFamily: 'sans-serif', fontSize: 15, align: 'center', lineHeight: 23 },
    })
    label.anchor.set(0.5)
    placeholder.addChild(body, label)
    this.imageLayer.addChild(placeholder)
  }

  private drawGrid(scene: SceneState): void {
    const existing = this.content.getChildByLabel('grid')
    if (existing) existing.destroy()
    if (!scene.grid.visible) return

    const grid = new Graphics({ label: 'grid' })
    for (let x = 0; x <= scene.width; x += scene.grid.size) grid.moveTo(x, 0).lineTo(x, scene.height)
    for (let y = 0; y <= scene.height; y += scene.grid.size) grid.moveTo(0, y).lineTo(scene.width, y)
    grid.stroke({ color: scene.grid.color, width: 1, alpha: scene.grid.opacity })
    grid.zIndex = 9000
    this.content.addChild(grid)
  }

  private drawTokens(scene: SceneState): void {
    destroyChildren(this.tokenLayer)
    this.tokenLayer.zIndex = 10000
    for (const token of scene.tokens) {
      if (this.mode === 'player' && !token.visibleToPlayers) continue
      const container = new Container()
      container.position.set(token.x, token.y)
      container.alpha = this.mode === 'dm' && !token.visibleToPlayers ? 0.4 : 1

      const body = new Graphics()
        .circle(0, 0, token.radius)
        .fill(token.color)
        .stroke({ color: '#f2f2e8', width: 3, alpha: 0.92 })
      const inner = new Graphics().circle(0, 0, Math.max(5, token.radius - 8)).stroke({ color: '#111711', width: 2, alpha: 0.45 })
      const initials = token.name
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
      const text = new Text({
        text: initials || 'T',
        style: { fill: '#172016', fontFamily: 'sans-serif', fontSize: Math.max(12, token.radius * 0.62), fontWeight: '800' },
      })
      text.anchor.set(0.5)
      const name = new Text({
        text: token.name,
        style: { fill: '#f4f3e9', fontFamily: 'sans-serif', fontSize: 13, stroke: { color: '#0b0d0c', width: 4 } },
      })
      name.anchor.set(0.5, 0)
      name.position.set(0, token.radius + 7)
      container.addChild(body, inner, text, name)
      this.tokenLayer.addChild(container)
    }
  }

  private drawWalls(scene: SceneState, draft?: { start: Vec2; end: Vec2 } | null): void {
    destroyChildren(this.wallLayer)
    if (this.mode === 'player') return
    const walls = new Graphics()
    for (const wall of scene.walls) {
      walls.moveTo(wall.a.x, wall.a.y).lineTo(wall.b.x, wall.b.y)
      walls.circle(wall.a.x, wall.a.y, 4).circle(wall.b.x, wall.b.y, 4)
    }
    walls.stroke({ color: '#c7e1b2', width: 5, alpha: 0.84 }).fill({ color: '#d9efc8', alpha: 0.9 })
    if (draft) {
      walls.moveTo(draft.start.x, draft.start.y).lineTo(draft.end.x, draft.end.y)
      walls.stroke({ color: '#f6d58c', width: 4, alpha: 0.9 })
    }
    this.wallLayer.addChild(walls)
  }

  private drawLights(scene: SceneState): void {
    destroyChildren(this.lightLayer)
    if (this.mode === 'player') return
    for (const light of scene.lights) {
      const graphic = new Graphics()
        .circle(light.x, light.y, light.radius)
        .fill({ color: light.color, alpha: 0.055 * light.intensity })
        .stroke({ color: light.color, width: 3, alpha: light.visibleToPlayers ? 0.56 : 0.24 })
        .circle(light.x, light.y, 10)
        .fill({ color: light.color, alpha: 0.95 })
      this.lightLayer.addChild(graphic)
    }
  }

  private drawSelection(
    scene: SceneState,
    selectedIds: string[] = [],
    selectionBox?: { start: Vec2; end: Vec2 } | null,
  ): void {
    destroyChildren(this.selectionLayer)
    if (this.mode === 'player') return
    const graphic = new Graphics()
    for (const selectedId of selectedIds) {
      const selected =
        scene.images.find((item) => item.id === selectedId) ??
        scene.tokens.find((item) => item.id === selectedId) ??
        scene.lights.find((item) => item.id === selectedId) ??
        scene.walls.find((item) => item.id === selectedId)
      if (!selected) continue
      if (selected.kind === 'image') {
        graphic
          .rect(selected.x - selected.width / 2, selected.y - selected.height / 2, selected.width, selected.height)
          .stroke({ color: '#f3d28b', width: 3, alpha: 0.95 })
      } else if (selected.kind === 'wall') {
        graphic.moveTo(selected.a.x, selected.a.y).lineTo(selected.b.x, selected.b.y).stroke({ color: '#f3d28b', width: 9, alpha: 0.8 })
      } else {
        const radius = selected.kind === 'token' ? selected.radius + 8 : 18
        graphic.circle(selected.x, selected.y, radius).stroke({ color: '#f3d28b', width: 4, alpha: 0.95 })
      }
    }
    if (selectionBox) {
      const x = Math.min(selectionBox.start.x, selectionBox.end.x)
      const y = Math.min(selectionBox.start.y, selectionBox.end.y)
      const width = Math.abs(selectionBox.end.x - selectionBox.start.x)
      const height = Math.abs(selectionBox.end.y - selectionBox.start.y)
      graphic
        .rect(x, y, width, height)
        .fill({ color: '#a9c792', alpha: 0.12 })
        .stroke({ color: '#cde2bd', width: 2, alpha: 0.92 })
    }
    this.selectionLayer.addChild(graphic)
  }

  private applyVision(scene: SceneState, previewVision: boolean): void {
    this.visionMask.clear()
    const visionEnabled = this.mode === 'player' || previewVision
    if (!visionEnabled) {
      this.content.mask = null
      return
    }

    const sources = [
      ...scene.tokens
        .filter((token) => token.visibleToPlayers && (token.visionSource || token.emitsLight))
        .map((token) => ({
          position: { x: token.x, y: token.y },
          range: Math.max(token.visionSource ? token.visionRange : 0, token.emitsLight ? token.lightRange : 0),
          walls: scene.walls.filter((wall) => wall.blocksVision),
        })),
      ...scene.lights
        .filter((light) => light.visibleToPlayers)
        .map((light) => ({
          position: { x: light.x, y: light.y },
          range: light.radius,
          walls: scene.walls.filter((wall) => wall.blocksLight),
        })),
    ]

    if (sources.length === 0) {
      this.content.mask = null
      return
    }

    for (const source of sources) {
      polygon(this.visionMask, computeVisibilityPolygon(source.position, source.walls, source.range)).fill('#ffffff')
    }
    this.content.mask = this.visionMask
  }
}
