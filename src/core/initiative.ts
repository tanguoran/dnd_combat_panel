import type { InitiativeEntry, InitiativeState, SceneState } from '../model/types'

export const createInitiativeState = (): InitiativeState => ({
  status: 'setup',
  round: 1,
  activeTokenId: null,
  entries: [],
})

export const ensureInitiative = (scene: SceneState): InitiativeState => {
  if (!scene.initiative) scene.initiative = createInitiativeState()
  return scene.initiative
}

export const sortedInitiativeEntries = (state: InitiativeState): InitiativeEntry[] =>
  [...state.entries].sort((first, second) => {
    if (first.initiative === null && second.initiative !== null) return 1
    if (first.initiative !== null && second.initiative === null) return -1
    if (first.initiative !== null && second.initiative !== null && first.initiative !== second.initiative) {
      return second.initiative - first.initiative
    }
    return first.tieBreaker - second.tieBreaker
  })

export const normalizeInitiative = (scene: SceneState): InitiativeState => {
  const state = ensureInitiative(scene)
  const tokenIds = new Set(scene.tokens.map((token) => token.id))
  const seen = new Set<string>()
  state.entries = state.entries.filter((entry) => {
    if (!tokenIds.has(entry.tokenId) || seen.has(entry.tokenId)) return false
    seen.add(entry.tokenId)
    return true
  })
  state.round = Math.max(1, Math.floor(state.round || 1))
  if (state.entries.length === 0) {
    state.status = 'setup'
    state.activeTokenId = null
  } else if (state.activeTokenId && !seen.has(state.activeTokenId)) {
    state.activeTokenId = state.status === 'running' ? sortedInitiativeEntries(state)[0]?.tokenId ?? null : null
  }
  return state
}

export const addTokensToInitiative = (scene: SceneState, tokenIds: Iterable<string>): number => {
  const state = normalizeInitiative(scene)
  const validIds = new Set(scene.tokens.map((token) => token.id))
  const existingIds = new Set(state.entries.map((entry) => entry.tokenId))
  let nextTieBreaker = Math.max(-1, ...state.entries.map((entry) => entry.tieBreaker)) + 1
  let added = 0
  for (const tokenId of tokenIds) {
    if (!validIds.has(tokenId) || existingIds.has(tokenId)) continue
    state.entries.push({ tokenId, initiative: null, tieBreaker: nextTieBreaker++ })
    existingIds.add(tokenId)
    added += 1
  }
  return added
}

export const setInitiativeScore = (scene: SceneState, tokenId: string, initiative: number | null): void => {
  const entry = normalizeInitiative(scene).entries.find((item) => item.tokenId === tokenId)
  if (!entry) return
  entry.initiative = initiative === null || !Number.isFinite(initiative) ? null : initiative
}

export const reorderInitiative = (scene: SceneState, tokenIds: string[]): void => {
  const state = normalizeInitiative(scene)
  const positions = new Map(tokenIds.map((tokenId, index) => [tokenId, index]))
  const fallback = tokenIds.length
  state.entries.sort((first, second) =>
    (positions.get(first.tokenId) ?? fallback + first.tieBreaker)
    - (positions.get(second.tokenId) ?? fallback + second.tieBreaker))
  state.entries.forEach((entry, index) => { entry.tieBreaker = index })
}

export const startInitiative = (scene: SceneState): string | null => {
  const state = normalizeInitiative(scene)
  const first = sortedInitiativeEntries(state)[0]
  if (!first) return null
  state.status = 'running'
  state.round = 1
  state.activeTokenId = first.tokenId
  return first.tokenId
}

export const advanceInitiative = (scene: SceneState, direction: 1 | -1): string | null => {
  const state = normalizeInitiative(scene)
  const ordered = sortedInitiativeEntries(state)
  if (ordered.length === 0) return null
  if (state.status !== 'running' || !state.activeTokenId) return startInitiative(scene)

  const currentIndex = ordered.findIndex((entry) => entry.tokenId === state.activeTokenId)
  const index = currentIndex >= 0 ? currentIndex : 0
  if (direction === 1) {
    const nextIndex = (index + 1) % ordered.length
    if (nextIndex === 0) state.round += 1
    state.activeTokenId = ordered[nextIndex].tokenId
  } else {
    const previousIndex = (index - 1 + ordered.length) % ordered.length
    if (index === 0 && state.round > 1) state.round -= 1
    state.activeTokenId = ordered[previousIndex].tokenId
  }
  return state.activeTokenId
}

export const removeFromInitiative = (scene: SceneState, tokenId: string): void => {
  const state = normalizeInitiative(scene)
  const orderedBefore = sortedInitiativeEntries(state)
  const removedIndex = orderedBefore.findIndex((entry) => entry.tokenId === tokenId)
  state.entries = state.entries.filter((entry) => entry.tokenId !== tokenId)
  if (state.entries.length === 0) {
    state.status = 'setup'
    state.round = 1
    state.activeTokenId = null
    return
  }
  if (state.activeTokenId === tokenId) {
    const orderedAfter = sortedInitiativeEntries(state)
    state.activeTokenId = orderedAfter[Math.min(Math.max(removedIndex, 0), orderedAfter.length - 1)]?.tokenId ?? null
  }
}

export const clearInitiative = (scene: SceneState): void => {
  scene.initiative = createInitiativeState()
}
