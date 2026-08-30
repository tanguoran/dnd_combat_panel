import type { Vec2 } from '../model/types'

export interface TouchPair {
  center: Vec2
  distance: number
}

export interface TouchTransform {
  pan: Vec2
  zoomFactor: number
}

export const describeTouchPair = (first: Vec2, second: Vec2): TouchPair => ({
  center: {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  },
  distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
})

export const touchTransform = (previous: TouchPair, current: TouchPair): TouchTransform => ({
  pan: {
    x: current.center.x - previous.center.x,
    y: current.center.y - previous.center.y,
  },
  zoomFactor: current.distance / previous.distance,
})
