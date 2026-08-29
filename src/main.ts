import './style.css'
import { DmApp } from './app/DmApp'
import { PlayerApp } from './app/PlayerApp'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('App root was not found')

const isPlayer = new URLSearchParams(location.search).get('mode') === 'player'
document.documentElement.dataset.mode = isPlayer ? 'player' : 'dm'
document.title = isPlayer ? '玩家画面 · 即时战斗板' : '即时战斗板'

if (isPlayer) await new PlayerApp(root).init()
else await new DmApp(root).init()
