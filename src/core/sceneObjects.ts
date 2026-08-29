import { makeId } from '../model/scene'
import type { SceneObject, SceneState, Vec2 } from '../model/types'

export interface SelectionRect {
  start: Vec2
  end: Vec2
}

export const allSceneObjects = (scene: SceneState): SceneObject[] => [
  ...scene.images,
  ...scene.tokens,
  ...scene.walls,
  ...scene.lights,
]

export const addSceneObject = (scene: SceneState, object: SceneObject): void => {
  if (object.kind === 'image') scene.images.push(object)
  if (object.kind === 'token') scene.tokens.push(object)
  if (object.kind === 'wall') scene.walls.push(object)
  if (object.kind === 'light') scene.lights.push(object)
}

export const removeSceneObjects = (scene: SceneState, ids: ReadonlySet<string>): void => {
  scene.images = scene.images.filter((item) => !ids.has(item.id))
  scene.tokens = scene.tokens.filter((item) => !ids.has(item.id))
  scene.walls = scene.walls.filter((item) => !ids.has(item.id))
  scene.lights = scene.lights.filter((item) => !ids.has(item.id))
}

export const translateSceneObject = (object: SceneObject, delta: Vec2): void => {
  if (object.kind === 'wall') {
    object.a.x += delta.x
    object.a.y += delta.y
    object.b.x += delta.x
    object.b.y += delta.y
    return
  }
  object.x += delta.x
  object.y += delta.y
}

export const cloneSceneObjects = (objects: SceneObject[], offset: Vec2): SceneObject[] =>
  objects.map((source) => {
    const object = structuredClone(source)
    object.id = makeId(object.kind)
    translateSceneObject(object, offset)
    if (object.kind === 'image') object.name = `${object.name} 副本`
    return object
  })

export const sceneObjectsInRect = (scene: SceneState, rect: SelectionRect): SceneObject[] => {
  const minX = Math.min(rect.start.x, rect.end.x)
  const minY = Math.min(rect.start.y, rect.end.y)
  const maxX = Math.max(rect.start.x, rect.end.x)
  const maxY = Math.max(rect.start.y, rect.end.y)
  const overlaps = (left: number, top: number, right: number, bottom: number): boolean =>
    right >= minX && left <= maxX && bottom >= minY && top <= maxY

  return allSceneObjects(scene).filter((object) => {
    if (object.kind === 'token') {
      return overlaps(object.x - object.radius, object.y - object.radius, object.x + object.radius, object.y + object.radius)
    }
    if (object.kind === 'image') {
      const left = object.x - object.width / 2
      const top = object.y - object.height / 2
      const right = object.x + object.width / 2
      const bottom = object.y + object.height / 2
      return object.visible && !object.locked && left >= minX && top >= minY && right <= maxX && bottom <= maxY
    }
    if (object.kind === 'light') return overlaps(object.x - 18, object.y - 18, object.x + 18, object.y + 18)
    return object.a.x >= minX && object.a.x <= maxX && object.a.y >= minY && object.a.y <= maxY
      && object.b.x >= minX && object.b.x <= maxX && object.b.y >= minY && object.b.y <= maxY
  })
}
