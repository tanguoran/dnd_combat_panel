import type { SceneState } from '../model/types'

type Subscriber = (scene: SceneState) => void

export class SceneStore {
  private current: SceneState
  private readonly subscribers = new Set<Subscriber>()

  constructor(initial: SceneState) {
    this.current = structuredClone(initial)
  }

  get scene(): SceneState {
    return this.current
  }

  replace(scene: SceneState): void {
    this.current = structuredClone(scene)
    this.notify()
  }

  update(mutator: (scene: SceneState) => void): void {
    mutator(this.current)
    this.current.updatedAt = Date.now()
    this.notify()
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber)
    subscriber(this.current)
    return () => this.subscribers.delete(subscriber)
  }

  private notify(): void {
    for (const subscriber of this.subscribers) subscriber(this.current)
  }
}
