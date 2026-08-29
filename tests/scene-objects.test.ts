import { describe, expect, it } from 'vitest'
import { addSceneObject, cloneSceneObjects, removeSceneObjects, sceneObjectsInRect } from '../src/core/sceneObjects'
import { createDefaultScene, createToken } from '../src/model/scene'

describe('scene object editing helpers', () => {
  it('box-selects tokens whose bounds overlap the rectangle', () => {
    const scene = createDefaultScene()
    const inside = createToken({ x: 100, y: 100 })
    const outside = createToken({ x: 500, y: 500 })
    scene.tokens.push(inside, outside)
    expect(sceneObjectsInRect(scene, { start: { x: 50, y: 50 }, end: { x: 140, y: 140 } }).map((item) => item.id)).toEqual([inside.id])
  })

  it('clones selected objects with new ids and a shared offset', () => {
    const original = createToken({ x: 100, y: 120 })
    const [copy] = cloneSceneObjects([original], { x: 40, y: 60 })
    expect(copy.id).not.toBe(original.id)
    expect(copy).toMatchObject({ kind: 'token', x: 140, y: 180 })
  })

  it('adds and removes a batch without renderer state', () => {
    const scene = createDefaultScene()
    const first = createToken({ x: 0, y: 0 })
    const second = createToken({ x: 80, y: 0 })
    addSceneObject(scene, first)
    addSceneObject(scene, second)
    removeSceneObjects(scene, new Set([first.id, second.id]))
    expect(scene.tokens).toHaveLength(0)
  })
})
