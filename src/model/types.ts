export interface Vec2 {
  x: number
  y: number
}

export interface CameraState {
  x: number
  y: number
  zoom: number
}

export interface GridConfig {
  size: number
  visible: boolean
  color: string
  opacity: number
}

export interface ImageLayer {
  id: string
  kind: 'image'
  assetId: string
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  zIndex: number
  visible: boolean
  playerVisible: boolean
  locked: boolean
}

export interface Token {
  id: string
  kind: 'token'
  name: string
  x: number
  y: number
  radius: number
  color: string
  visibleToPlayers: boolean
  visionSource: boolean
  visionRange: number
  emitsLight: boolean
  lightRange: number
}

export interface Wall {
  id: string
  kind: 'wall'
  a: Vec2
  b: Vec2
  blocksVision: boolean
  blocksLight: boolean
}

export interface Light {
  id: string
  kind: 'light'
  x: number
  y: number
  radius: number
  color: string
  intensity: number
  visibleToPlayers: boolean
}

export interface SceneState {
  version: 1
  id: string
  name: string
  width: number
  height: number
  grid: GridConfig
  images: ImageLayer[]
  tokens: Token[]
  walls: Wall[]
  lights: Light[]
  updatedAt: number
}

export type SceneObject = ImageLayer | Token | Wall | Light
export type ToolName = 'select' | 'wall' | 'token' | 'light' | 'image'

export interface SceneSnapshot {
  scene: SceneState
  camera: CameraState
}
