import type { Vec2, Wall } from '../model/types'

const EPSILON = 0.00001
const ANGLE_EPSILON = 0.00004

export interface RayHit extends Vec2 {
  distance: number
}

export const raySegmentIntersection = (
  origin: Vec2,
  direction: Vec2,
  a: Vec2,
  b: Vec2,
): RayHit | null => {
  const segment = { x: b.x - a.x, y: b.y - a.y }
  const denominator = direction.x * segment.y - direction.y * segment.x
  if (Math.abs(denominator) < EPSILON) return null

  const offset = { x: a.x - origin.x, y: a.y - origin.y }
  const rayT = (offset.x * segment.y - offset.y * segment.x) / denominator
  const segmentT = (offset.x * direction.y - offset.y * direction.x) / denominator
  if (rayT < 0 || segmentT < -EPSILON || segmentT > 1 + EPSILON) return null

  return {
    x: origin.x + direction.x * rayT,
    y: origin.y + direction.y * rayT,
    distance: rayT,
  }
}

export const computeVisibilityPolygon = (
  origin: Vec2,
  walls: Wall[],
  maxDistance: number,
  baseRayCount = 96,
): Vec2[] => {
  const angles: number[] = []
  for (let index = 0; index < baseRayCount; index += 1) {
    angles.push((index / baseRayCount) * Math.PI * 2 - Math.PI)
  }

  for (const wall of walls) {
    if (!wall.blocksVision && !wall.blocksLight) continue
    for (const endpoint of [wall.a, wall.b]) {
      const angle = Math.atan2(endpoint.y - origin.y, endpoint.x - origin.x)
      angles.push(angle - ANGLE_EPSILON, angle, angle + ANGLE_EPSILON)
    }
  }

  return angles
    .sort((a, b) => a - b)
    .map((angle) => {
      const direction = { x: Math.cos(angle), y: Math.sin(angle) }
      let nearest = maxDistance
      for (const wall of walls) {
        if (!wall.blocksVision && !wall.blocksLight) continue
        const hit = raySegmentIntersection(origin, direction, wall.a, wall.b)
        if (hit && hit.distance < nearest) nearest = hit.distance
      }
      return { x: origin.x + direction.x * nearest, y: origin.y + direction.y * nearest }
    })
}

export const distanceToSegment = (point: Vec2, a: Vec2, b: Vec2): number => {
  const ab = { x: b.x - a.x, y: b.y - a.y }
  const lengthSquared = ab.x * ab.x + ab.y * ab.y
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / lengthSquared))
  return Math.hypot(point.x - (a.x + ab.x * t), point.y - (a.y + ab.y * t))
}
