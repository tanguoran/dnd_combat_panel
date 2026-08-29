import type { CameraState, Vec2 } from '../model/types'

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export class Camera {
  private state: CameraState

  constructor(initial: CameraState = { x: 0, y: 0, zoom: 0.8 }) {
    this.state = { ...initial, zoom: clamp(initial.zoom, 0.12, 4) }
  }

  get snapshot(): CameraState {
    return { ...this.state }
  }

  set(next: CameraState): void {
    this.state = { ...next, zoom: clamp(next.zoom, 0.12, 4) }
  }

  screenToWorld(point: Vec2): Vec2 {
    return { x: this.state.x + point.x / this.state.zoom, y: this.state.y + point.y / this.state.zoom }
  }

  worldToScreen(point: Vec2): Vec2 {
    return { x: (point.x - this.state.x) * this.state.zoom, y: (point.y - this.state.y) * this.state.zoom }
  }

  panByScreen(delta: Vec2): void {
    this.state.x -= delta.x / this.state.zoom
    this.state.y -= delta.y / this.state.zoom
  }

  zoomAt(screenPoint: Vec2, factor: number): void {
    const before = this.screenToWorld(screenPoint)
    this.state.zoom = clamp(this.state.zoom * factor, 0.12, 4)
    const after = this.screenToWorld(screenPoint)
    this.state.x += before.x - after.x
    this.state.y += before.y - after.y
  }
}
