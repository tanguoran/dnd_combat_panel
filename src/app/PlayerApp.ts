import { Camera } from '../core/Camera'
import { WindowBridge } from '../core/WindowBridge'
import { describeTouchPair, touchTransform, type TouchPair } from '../core/touchGesture'
import { createDefaultScene } from '../model/scene'
import type { CameraState, SceneState, Token, Vec2 } from '../model/types'
import { SceneRenderer } from '../render/SceneRenderer'
import { BattleBoardDatabase } from '../storage/BattleBoardDatabase'
import { renderPlayerShell } from '../ui/shell'

interface PlayerDragState {
  pointerId: number
  type: 'camera' | 'token'
  lastScreen: Vec2
  tokenId?: string
  grabOffset?: Vec2
}

interface PlayerTouchGesture {
  pointerIds: [number, number]
  last: TouchPair
}

const screenPoint = (event: PointerEvent | WheelEvent, element: HTMLElement): Vec2 => {
  const rect = element.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

export class PlayerApp {
  private readonly root: HTMLElement
  private readonly database = new BattleBoardDatabase()
  private readonly bridge = new WindowBridge()
  private readonly camera = new Camera({ x: -140, y: -100, zoom: 0.72 })
  private renderer!: SceneRenderer
  private stage!: HTMLElement
  private scene: SceneState = createDefaultScene()
  private cameraInitialized = false
  private drag: PlayerDragState | null = null
  private touchGesture: PlayerTouchGesture | null = null
  private readonly touchPoints = new Map<number, Vec2>()
  private readonly ignoredTouchPointers = new Set<number>()

  constructor(root: HTMLElement) {
    this.root = root
  }

  async init(): Promise<void> {
    renderPlayerShell(this.root)
    this.stage = this.root.querySelector<HTMLElement>('#stage')!
    this.renderer = await SceneRenderer.create(this.stage, 'player', (id) => this.database.getAssetBlob(id))
    const stored = await this.database.loadScene()
    if (stored) {
      this.scene = stored
      this.render()
    }
    this.bindEvents()
    this.bridge.onSnapshot((scene, camera) => this.receiveSnapshot(scene, camera))
    this.bridge.announcePlayer()
    window.setInterval(() => this.bridge.announcePlayer(), 3000)
    document.addEventListener('visibilitychange', () => this.bridge.announcePlayer())
  }

  private bindEvents(): void {
    this.stage.addEventListener('pointerdown', (event) => this.onPointerDown(event))
    this.stage.addEventListener('pointermove', (event) => this.onPointerMove(event))
    this.stage.addEventListener('pointerup', (event) => this.onPointerUp(event))
    this.stage.addEventListener('pointercancel', (event) => this.onPointerUp(event))
    this.stage.addEventListener('contextmenu', (event) => event.preventDefault())
    this.stage.addEventListener('wheel', (event) => this.onWheel(event), { passive: false })
    window.addEventListener('resize', () => this.render())
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyF' && !document.fullscreenElement) void document.documentElement.requestFullscreen()
    })
    this.stage.addEventListener('dblclick', () => {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen()
    })
  }

  private receiveSnapshot(scene: SceneState, camera: CameraState): void {
    this.scene = scene
    if (!this.cameraInitialized) {
      this.camera.set(camera)
      this.cameraInitialized = true
    }
    this.render()
    const status = this.root.querySelector<HTMLElement>('#player-status')
    if (status) {
      status.innerHTML = '<span></span>已连接 DM · 可移动视野 Token'
      status.classList.add('connected')
      window.setTimeout(() => status.classList.add('hidden'), 1400)
    }
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch' && ![0, 1, 2].includes(event.button)) return
    event.preventDefault()
    this.stage.focus()
    this.stage.setPointerCapture(event.pointerId)
    const point = screenPoint(event, this.stage)

    if (event.pointerType === 'touch') {
      this.touchPoints.set(event.pointerId, point)
      if (this.ignoredTouchPointers.has(event.pointerId)) return
      if (this.touchPoints.size >= 2) {
        const pointerIds = [...this.touchPoints.keys()].slice(0, 2) as [number, number]
        this.drag = null
        this.touchGesture = {
          pointerIds,
          last: describeTouchPair(this.touchPoints.get(pointerIds[0])!, this.touchPoints.get(pointerIds[1])!),
        }
        this.updateInteractionClass('camera')
        return
      }
      this.beginPrimaryDrag(event.pointerId, point)
      return
    }

    if (event.button === 0) this.beginPrimaryDrag(event.pointerId, point)
    else this.beginCameraDrag(event.pointerId, point)
  }

  private beginPrimaryDrag(pointerId: number, point: Vec2): void {
    const world = this.camera.screenToWorld(point)
    const token = this.hitControllableToken(world)
    if (!token) return this.beginCameraDrag(pointerId, point)
    this.drag = {
      pointerId,
      type: 'token',
      tokenId: token.id,
      grabOffset: { x: world.x - token.x, y: world.y - token.y },
      lastScreen: point,
    }
    this.updateInteractionClass('token')
  }

  private beginCameraDrag(pointerId: number, point: Vec2): void {
    this.drag = { pointerId, type: 'camera', lastScreen: point }
    this.updateInteractionClass('camera')
  }

  private onPointerMove(event: PointerEvent): void {
    const point = screenPoint(event, this.stage)
    if (event.pointerType === 'touch') {
      if (!this.touchPoints.has(event.pointerId)) return
      this.touchPoints.set(event.pointerId, point)
      if (this.ignoredTouchPointers.has(event.pointerId)) return
      if (this.touchGesture) {
        const [firstId, secondId] = this.touchGesture.pointerIds
        const first = this.touchPoints.get(firstId)
        const second = this.touchPoints.get(secondId)
        if (!first || !second) return
        const current = describeTouchPair(first, second)
        const transform = touchTransform(this.touchGesture.last, current)
        this.camera.panByScreen(transform.pan)
        this.camera.zoomAt(current.center, transform.zoomFactor)
        this.touchGesture.last = current
        this.render()
        return
      }
    }

    if (!this.drag || this.drag.pointerId !== event.pointerId) return
    event.preventDefault()
    if (this.drag.type === 'camera') {
      this.camera.panByScreen({ x: point.x - this.drag.lastScreen.x, y: point.y - this.drag.lastScreen.y })
      this.drag.lastScreen = point
      this.render()
      return
    }

    const tokenId = this.drag.tokenId
    const offset = this.drag.grabOffset
    if (!tokenId || !offset) return
    const world = this.camera.screenToWorld(point)
    this.bridge.requestTokenMove(tokenId, { x: world.x - offset.x, y: world.y - offset.y })
    this.drag.lastScreen = point
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      this.touchPoints.delete(event.pointerId)
      if (this.ignoredTouchPointers.delete(event.pointerId)) {
        if (this.touchPoints.size === 0) this.ignoredTouchPointers.clear()
        return
      }
      if (this.touchGesture) {
        this.touchGesture = null
        this.drag = null
        for (const pointerId of this.touchPoints.keys()) this.ignoredTouchPointers.add(pointerId)
        this.updateInteractionClass(null)
        return
      }
    }
    if (this.drag?.pointerId === event.pointerId) {
      this.drag = null
      this.updateInteractionClass(null)
    }
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault()
    this.camera.zoomAt(screenPoint(event, this.stage), Math.exp(-event.deltaY * 0.0015))
    this.render()
  }

  private hitControllableToken(point: Vec2): Token | undefined {
    const tolerance = 12 / this.camera.snapshot.zoom
    return [...this.scene.tokens].reverse().find((token) =>
      token.visibleToPlayers
      && token.visionSource
      && Math.hypot(point.x - token.x, point.y - token.y) <= token.radius + tolerance,
    )
  }

  private updateInteractionClass(type: PlayerDragState['type'] | null): void {
    this.stage.classList.toggle('panning', type === 'camera')
    this.stage.classList.toggle('dragging-token', type === 'token')
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera.snapshot)
  }
}
