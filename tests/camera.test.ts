import { describe, expect, it } from 'vitest'
import { Camera } from '../src/core/Camera'

describe('Camera', () => {
  it('round-trips between screen and world coordinates', () => {
    const camera = new Camera({ x: 120, y: -40, zoom: 1.75 })
    const world = { x: 520, y: 310 }
    const screen = camera.worldToScreen(world)
    expect(camera.screenToWorld(screen)).toEqual(world)
  })

  it('keeps the world point below the cursor fixed while zooming', () => {
    const camera = new Camera({ x: 100, y: 80, zoom: 1 })
    const cursor = { x: 360, y: 220 }
    const before = camera.screenToWorld(cursor)
    camera.zoomAt(cursor, 1.8)
    const after = camera.screenToWorld(cursor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('converts screen pan to world pan at the current zoom', () => {
    const camera = new Camera({ x: 0, y: 0, zoom: 2 })
    camera.panByScreen({ x: 40, y: -20 })
    expect(camera.snapshot).toEqual({ x: -20, y: 10, zoom: 2 })
  })
})
