import { WindowBridge } from '../core/WindowBridge'
import { createDefaultScene } from '../model/scene'
import type { CameraState, SceneState } from '../model/types'
import { SceneRenderer } from '../render/SceneRenderer'
import { BattleBoardDatabase } from '../storage/BattleBoardDatabase'
import { renderPlayerShell } from '../ui/shell'

export class PlayerApp {
  private readonly root: HTMLElement
  private readonly database = new BattleBoardDatabase()
  private readonly bridge = new WindowBridge()
  private renderer!: SceneRenderer
  private scene: SceneState = createDefaultScene()
  private camera: CameraState = { x: -140, y: -100, zoom: 0.72 }

  constructor(root: HTMLElement) {
    this.root = root
  }

  async init(): Promise<void> {
    renderPlayerShell(this.root)
    const stage = this.root.querySelector<HTMLElement>('#stage')!
    this.renderer = await SceneRenderer.create(stage, 'player', (id) => this.database.getAssetBlob(id))
    const stored = await this.database.loadScene()
    if (stored) {
      this.scene = stored
      this.render()
    }
    this.bridge.onSnapshot((scene, camera) => void this.receiveSnapshot(scene, camera))
    this.bridge.announcePlayer()
    window.setInterval(() => this.bridge.announcePlayer(), 3000)
    document.addEventListener('visibilitychange', () => this.bridge.announcePlayer())
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyF' && !document.fullscreenElement) void document.documentElement.requestFullscreen()
    })
    window.addEventListener('dblclick', () => {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen()
    })
  }

  private async receiveSnapshot(scene: SceneState, camera: CameraState): Promise<void> {
    this.scene = scene
    this.camera = camera
    this.render()
    const status = this.root.querySelector<HTMLElement>('#player-status')
    if (status) {
      status.innerHTML = '<span></span>已连接 DM'
      status.classList.add('connected')
      window.setTimeout(() => status.classList.add('hidden'), 1400)
    }
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera)
  }
}
