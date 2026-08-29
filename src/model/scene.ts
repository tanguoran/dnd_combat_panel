import type { ImageLayer, Light, SceneObject, SceneState, Token, Vec2, Wall } from './types'

export const makeId = (prefix: string): string =>
  `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

export const createDefaultScene = (): SceneState => ({
  version: 1,
  id: makeId('scene'),
  name: '临时场景',
  width: 4000,
  height: 2800,
  grid: { size: 80, visible: true, color: '#768277', opacity: 0.28 },
  images: [],
  tokens: [],
  walls: [],
  lights: [],
  updatedAt: Date.now(),
})

export const createToken = (position: Vec2): Token => ({
  id: makeId('token'),
  kind: 'token',
  name: '新 Token',
  x: position.x,
  y: position.y,
  radius: 30,
  color: '#a9c792',
  visibleToPlayers: true,
  visionSource: true,
  visionRange: 600,
  emitsLight: false,
  lightRange: 320,
})

export const createLight = (position: Vec2): Light => ({
  id: makeId('light'),
  kind: 'light',
  x: position.x,
  y: position.y,
  radius: 420,
  color: '#ffc56d',
  intensity: 0.82,
  visibleToPlayers: true,
})

export const createWall = (a: Vec2, b: Vec2): Wall => ({
  id: makeId('wall'),
  kind: 'wall',
  a: { ...a },
  b: { ...b },
  blocksVision: true,
  blocksLight: true,
})

export const createImageLayer = (
  assetId: string,
  name: string,
  position: Vec2,
  width: number,
  height: number,
  zIndex: number,
): ImageLayer => ({
  id: makeId('image'),
  kind: 'image',
  assetId,
  name,
  x: position.x,
  y: position.y,
  width,
  height,
  rotation: 0,
  opacity: 1,
  zIndex,
  visible: true,
  playerVisible: true,
  locked: false,
})

export const findSceneObject = (scene: SceneState, id: string | null): SceneObject | undefined => {
  if (!id) return undefined
  return (
    scene.images.find((item) => item.id === id) ??
    scene.tokens.find((item) => item.id === id) ??
    scene.walls.find((item) => item.id === id) ??
    scene.lights.find((item) => item.id === id)
  )
}

export const removeSceneObject = (scene: SceneState, id: string): void => {
  scene.images = scene.images.filter((item) => item.id !== id)
  scene.tokens = scene.tokens.filter((item) => item.id !== id)
  scene.walls = scene.walls.filter((item) => item.id !== id)
  scene.lights = scene.lights.filter((item) => item.id !== id)
}
