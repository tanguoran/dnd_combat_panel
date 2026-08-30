import { describe, expect, it } from 'vitest'
import { Camera } from '../src/core/Camera'
import { describeTouchPair, touchTransform } from '../src/core/touchGesture'

describe('touch gestures', () => {
  it('describes the midpoint and distance between two touches', () => {
    expect(describeTouchPair({ x: 20, y: 40 }, { x: 80, y: 120 })).toEqual({
      center: { x: 50, y: 80 },
      distance: 100,
    })
  })

  it('turns two-finger movement into pan and pinch zoom', () => {
    const previous = describeTouchPair({ x: 50, y: 100 }, { x: 150, y: 100 })
    const current = describeTouchPair({ x: 40, y: 120 }, { x: 240, y: 120 })
    expect(touchTransform(previous, current)).toEqual({
      pan: { x: 40, y: 20 },
      zoomFactor: 2,
    })
  })

  it('keeps the previous gesture center under the moved pinch center', () => {
    const camera = new Camera({ x: 0, y: 0, zoom: 1 })
    const previous = describeTouchPair({ x: 50, y: 100 }, { x: 150, y: 100 })
    const current = describeTouchPair({ x: 70, y: 120 }, { x: 270, y: 120 })
    const anchoredWorldPoint = camera.screenToWorld(previous.center)
    const transform = touchTransform(previous, current)

    camera.panByScreen(transform.pan)
    camera.zoomAt(current.center, transform.zoomFactor)

    expect(camera.screenToWorld(current.center).x).toBeCloseTo(anchoredWorldPoint.x)
    expect(camera.screenToWorld(current.center).y).toBeCloseTo(anchoredWorldPoint.y)
  })
})
