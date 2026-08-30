import { describe, expect, it } from 'vitest'
import { moveCircleWithoutCrossingWalls } from '../src/geometry/movement'
import type { Wall } from '../src/model/types'

const verticalWall: Wall = {
  id: 'wall-1',
  kind: 'wall',
  a: { x: 100, y: 0 },
  b: { x: 100, y: 200 },
  blocksVision: true,
  blocksLight: true,
}

describe('moveCircleWithoutCrossingWalls', () => {
  it('stops a token radius before a wall', () => {
    const result = moveCircleWithoutCrossingWalls({ x: 40, y: 100 }, { x: 160, y: 100 }, 20, [verticalWall])
    expect(result.x).toBeCloseTo(80, 2)
    expect(result.y).toBe(100)
  })

  it('cannot tunnel through a wall during a large jump', () => {
    const result = moveCircleWithoutCrossingWalls({ x: -500, y: 100 }, { x: 900, y: 100 }, 10, [verticalWall])
    expect(result.x).toBeCloseTo(90, 2)
  })

  it('allows movement parallel to a wall', () => {
    const result = moveCircleWithoutCrossingWalls({ x: 70, y: 30 }, { x: 70, y: 170 }, 20, [verticalWall])
    expect(result).toEqual({ x: 70, y: 170 })
  })

  it('allows unrestricted movement without walls', () => {
    const result = moveCircleWithoutCrossingWalls({ x: 0, y: 0 }, { x: 800, y: 600 }, 30, [])
    expect(result).toEqual({ x: 800, y: 600 })
  })
})
