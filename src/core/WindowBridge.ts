import type { CameraState, SceneState } from '../model/types'

type BridgeMessage =
  | { type: 'PLAYER_READY' }
  | { type: 'SNAPSHOT'; scene: SceneState; camera: CameraState }

const CHANNEL_NAME = 'live-battle-board-v1'

export class WindowBridge {
  private readonly channel = new BroadcastChannel(CHANNEL_NAME)

  sendSnapshot(scene: SceneState, camera: CameraState): void {
    this.channel.postMessage({ type: 'SNAPSHOT', scene, camera } satisfies BridgeMessage)
  }

  announcePlayer(): void {
    this.channel.postMessage({ type: 'PLAYER_READY' } satisfies BridgeMessage)
  }

  onPlayerReady(callback: () => void): () => void {
    const listener = (event: MessageEvent<BridgeMessage>) => {
      if (event.data.type === 'PLAYER_READY') callback()
    }
    this.channel.addEventListener('message', listener)
    return () => this.channel.removeEventListener('message', listener)
  }

  onSnapshot(callback: (scene: SceneState, camera: CameraState) => void): () => void {
    const listener = (event: MessageEvent<BridgeMessage>) => {
      if (event.data.type === 'SNAPSHOT') callback(event.data.scene, event.data.camera)
    }
    this.channel.addEventListener('message', listener)
    return () => this.channel.removeEventListener('message', listener)
  }
}
