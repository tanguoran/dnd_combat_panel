import type { Vec2, Wall } from '../model/types'
import { distanceToSegment } from './visibility'

const COLLISION_EPSILON = 0.001
const BINARY_SEARCH_STEPS = 14

const lerp = (start: Vec2, end: Vec2, amount: number): Vec2 => ({
  x: start.x + (end.x - start.x) * amount,
  y: start.y + (end.y - start.y) * amount,
})

export const circleTouchesWall = (center: Vec2, radius: number, walls: readonly Wall[]): boolean =>
  walls.some((wall) => distanceToSegment(center, wall.a, wall.b) < radius - COLLISION_EPSILON)

/**
 * Returns the furthest collision-free point along a requested straight-line move.
 * Sampling prevents tunnelling on large pointer jumps; binary search places the
 * token immediately before the first wall contact.
 */
export const moveCircleWithoutCrossingWalls = (
  start: Vec2,
  desired: Vec2,
  radius: number,
  walls: readonly Wall[],
): Vec2 => {
  const distance = Math.hypot(desired.x - start.x, desired.y - start.y)
  if (distance === 0 || walls.length === 0) return { ...desired }

  // A quarter-radius step catches walls even when pointer events are sparse.
  const stepLength = Math.max(2, Math.min(12, radius * 0.25))
  const steps = Math.max(1, Math.ceil(distance / stepLength))
  let lastSafeAmount = 0

  for (let step = 1; step <= steps; step += 1) {
    const amount = step / steps
    const candidate = lerp(start, desired, amount)
    if (!circleTouchesWall(candidate, radius, walls)) {
      lastSafeAmount = amount
      continue
    }

    let safe = lastSafeAmount
    let blocked = amount
    for (let iteration = 0; iteration < BINARY_SEARCH_STEPS; iteration += 1) {
      const middle = (safe + blocked) / 2
      if (circleTouchesWall(lerp(start, desired, middle), radius, walls)) blocked = middle
      else safe = middle
    }
    return lerp(start, desired, safe)
  }

  return { ...desired }
}
