import { describe, expect, it } from 'vitest'
import { computeVisibilityPolygon, distanceToSegment, raySegmentIntersection } from '../src/geometry/visibility'
import type { Wall } from '../src/model/types'

describe('visibility geometry', () => {
  it('finds a forward ray/segment intersection', () => {
    const hit = raySegmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: -5 }, { x: 10, y: 5 })
    expect(hit).toMatchObject({ x: 10, y: 0, distance: 10 })
  })

  it('ignores segments behind the ray origin', () => {
    expect(raySegmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -10, y: -5 }, { x: -10, y: 5 })).toBeNull()
  })

  it('clips a visibility ray at the nearest blocking wall', () => {
    const wall: Wall = {
      id: 'wall', kind: 'wall', a: { x: 10, y: -5 }, b: { x: 10, y: 5 }, blocksVision: true, blocksLight: true,
    }
    const polygon = computeVisibilityPolygon({ x: 0, y: 0 }, [wall], 100, 8)
    const forward = polygon.reduce((best, point) => (Math.abs(point.y) < Math.abs(best.y) ? point : best))
    expect(forward.x).toBeCloseTo(10, 3)
    expect(Math.abs(forward.y)).toBeLessThan(0.01)
  })

  it('measures distance to the nearest point on a segment', () => {
    expect(distanceToSegment({ x: 4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
  })
})
