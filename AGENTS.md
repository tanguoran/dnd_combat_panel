# Live Battle Board constraints

- Model state must never depend on PixiJS objects. PixiJS is rendering only.
- Geometry, scene data, walls, tokens, lights, and visibility calculations must remain renderer-independent.
- The DM window is the only source of truth. The player window receives snapshots and may send Token move requests; the DM validates and applies them.
- Keep every live-session action within one or two direct gestures where practical.
- Do not add character sheets, dice, chat, accounts, networking, or a rules engine to the MVP.
- Initiative is limited to the approved manual Token tracker: no automatic rolls, modifiers, character stats, conditions, or rules automation.
