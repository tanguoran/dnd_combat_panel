import { describe, expect, it, vi } from 'vitest'
import { SceneStore } from '../src/core/SceneStore'
import { createDefaultScene, createToken } from '../src/model/scene'

describe('SceneStore', () => {
  it('owns plain scene data and not renderer objects', () => {
    const store = new SceneStore(createDefaultScene())
    store.update((scene) => scene.tokens.push(createToken({ x: 80, y: 120 })))
    expect(store.scene.tokens[0]).toMatchObject({ x: 80, y: 120, kind: 'token' })
    expect(JSON.stringify(store.scene)).not.toContain('PIXI')
  })

  it('notifies subscribers after each mutation', () => {
    const store = new SceneStore(createDefaultScene())
    const subscriber = vi.fn()
    store.subscribe(subscriber)
    store.update((scene) => { scene.name = '酒馆遭遇' })
    expect(subscriber).toHaveBeenCalledTimes(2)
    expect(subscriber.mock.lastCall?.[0].name).toBe('酒馆遭遇')
  })
})
