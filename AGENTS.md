# Live Battle Board constraints

- Model state must never depend on PixiJS objects. PixiJS is rendering only.
- Geometry, scene data, walls, tokens, lights, and visibility calculations must remain renderer-independent.
- The DM window is the only source of truth. The player window only receives scene and camera snapshots.
- Keep every live-session action within one or two direct gestures where practical.
- Do not add character sheets, dice, initiative, chat, accounts, networking, or a rules engine to the MVP.
