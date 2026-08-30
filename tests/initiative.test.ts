import { describe, expect, it } from 'vitest'
import {
  addTokensToInitiative,
  advanceInitiative,
  clearInitiative,
  normalizeInitiative,
  removeFromInitiative,
  reorderInitiative,
  setInitiativeScore,
  sortedInitiativeEntries,
  startInitiative,
} from '../src/core/initiative'
import { createDefaultScene, createToken } from '../src/model/scene'

const sceneWithTokens = () => {
  const scene = createDefaultScene()
  const first = createToken({ x: 100, y: 100 }); first.name = '战士'
  const second = createToken({ x: 200, y: 100 }); second.name = '法师'
  const third = createToken({ x: 300, y: 100 }); third.name = '哥布林'
  scene.tokens.push(first, second, third)
  return { scene, first, second, third }
}

describe('initiative tracker', () => {
  it('adds each valid token once and sorts scores descending with empty scores last', () => {
    const { scene, first, second, third } = sceneWithTokens()
    expect(addTokensToInitiative(scene, [first.id, second.id, first.id, 'missing', third.id])).toBe(3)
    setInitiativeScore(scene, first.id, 12)
    setInitiativeScore(scene, second.id, 18)
    expect(sortedInitiativeEntries(normalizeInitiative(scene)).map((entry) => entry.tokenId)).toEqual([
      second.id, first.id, third.id,
    ])
  })

  it('uses manual tie order for equal initiative scores', () => {
    const { scene, first, second, third } = sceneWithTokens()
    addTokensToInitiative(scene, [first.id, second.id, third.id])
    for (const token of scene.tokens) setInitiativeScore(scene, token.id, 15)
    reorderInitiative(scene, [third.id, first.id, second.id])
    expect(sortedInitiativeEntries(normalizeInitiative(scene)).map((entry) => entry.tokenId)).toEqual([
      third.id, first.id, second.id,
    ])
  })

  it('advances turns and increments the round after wrapping', () => {
    const { scene, first, second } = sceneWithTokens()
    addTokensToInitiative(scene, [first.id, second.id])
    setInitiativeScore(scene, first.id, 20)
    setInitiativeScore(scene, second.id, 10)
    expect(startInitiative(scene)).toBe(first.id)
    expect(advanceInitiative(scene, 1)).toBe(second.id)
    expect(advanceInitiative(scene, 1)).toBe(first.id)
    expect(scene.initiative?.round).toBe(2)
    expect(advanceInitiative(scene, -1)).toBe(second.id)
    expect(scene.initiative?.round).toBe(1)
  })

  it('selects the next valid entry when the active token is removed and can reset', () => {
    const { scene, first, second } = sceneWithTokens()
    addTokensToInitiative(scene, [first.id, second.id])
    startInitiative(scene)
    removeFromInitiative(scene, first.id)
    expect(scene.initiative?.activeTokenId).toBe(second.id)
    clearInitiative(scene)
    expect(scene.initiative).toEqual({ status: 'setup', round: 1, activeTokenId: null, entries: [] })
  })

  it('migrates older scenes without initiative state', () => {
    const scene = createDefaultScene()
    delete scene.initiative
    expect(normalizeInitiative(scene)).toEqual({ status: 'setup', round: 1, activeTokenId: null, entries: [] })
  })
})
