# Changes in this version

## Round 1: review fixes
- Chunk coordinates: Main/ChunkManager convert block -> chunk coords with Math.floorDiv.
- WorldData: ground (iron/bedrock/dirt) computed in getBlock instead of ~17M stored entries; setBlock is public; unused chunkIndex removed.
- ChunkMesher (no OpenGL): hidden faces skipped, consistent counter-clockwise winding.
- ChunkManager: updates only when the player changes chunk; max 4 meshes/frame after first load, nearest first.
- PlayerMovement/PlayerInput: delta-time movement, gravity, jump, AABB collision, A/D strafing, void respawn.
- MatrixUtils.lookAt: right vector sign fixed (view was mirrored).
- Main: GL 3.3 core hints, vsync, resize handling, Esc to quit, cleanup, culling enabled.
- build.gradle.kts: LWJGL BOM, natives per OS, macOS -XstartOnFirstThread, JUnit 5.

## Round 2: textures
- BlockTextures: which tile each block face uses (edit tileFor() to re-skin) and atlas/UV maths.
- TextureRegistry: loads the PNGs with STBImage, shrinks each to 64x64, packs a 256x256 atlas, uploads it with mipmaps.
  A missing PNG becomes a magenta tile and a message on stderr.
- Vertex format is now x, y, z, u, v, shade; the shader samples the atlas and multiplies by face shade.
- ChunkManager prints "[chunks] loaded=... withGeometry=... indices=... triangles=..." once loading settles.
- Placeholder choices to review: ELEVATOR -> Scanner, SPAWNER -> Reactor, UNBREAKABLE -> Reinforced_iron_img.

Tests: src/test/java (16 tests: world, mesher, physics, camera matrix, atlas/UVs).
Not included: the gradle/wrapper folder (run `gradle wrapper` once to create it).

## Round 3: crash on Windows / JDK 25
- LWJGL 3.3.3 -> 3.4.2 (3.3.3 does not support JDK 25).
- Startup logging in Main ([boot] lines) and TextureRegistry ([textures] lines).
- PNGs decoded with ImageIO instead of the native STB library; texture and chunk uploads use
  Java-managed buffers (BufferUtils) instead of memAlloc/memFree. The crash was a Windows heap-corruption
  code right after the first PNG decoded.
- --enable-native-access=ALL-UNNAMED added for gradle/IntelliJ run tasks.

## Round 4: base layout
- Walls now start at the floor (the 2-block gap you could walk out through is gone).
- Every floor has a full ceiling slab, which is also the floor of the floor above; the top slab is the roof.
- Doors are 2 wide x 2 high and go through both wall layers between rooms; DOOR blocks can be walked through for now.
- Room 0 on the ground floor now has a door to room 1 (it had only the outside door before).
- Elevator: a 2x2 column in the last room of every floor, through every slab. Inside it Space rises, Ctrl descends.
  ELEVATOR blocks use the ShieldCore texture and can be walked into.
- Spawn is outside the entrance door, facing it. The four corner spawners moved inside the ground floor corners.
- Tests: LayoutTest (walls, ceilings, doors, every room on every floor reachable) and an elevator test.

## Round 5: doorway fix, hotbar, pause menu
- ChunkMesher: DOOR and ELEVATOR no longer hide the faces next to them, so the floor under a doorway is drawn (you could see the sky through it).
- ui/: built-in 5x7 pixel font (BitmapFont), a 2D rectangle batch (UiBatch), Hotbar (keys 1-9 and mouse wheel), crosshair (Hud),
  PauseMenu (Esc: releases the mouse, dims the screen, RESUME / QUIT buttons) and HudRenderer (OpenGL, alpha-blended overlay).
- Esc now toggles the menu instead of quitting; use QUIT or close the window.
- PlayerMovement.resetMouse(), ShaderProgram.setUniform2f().
- Tests: UiTest, and a doorway-floor test in WorldAndMeshTest (27 tests in total).

## Round 6: elevator tower, terrace, spawners
- The elevator is now a sealed 4x4 tower east of the last room (shaft and car both outside the building, no way in from outside).
  A 2x2 landing door on every floor and on the terrace leads to it from the last room; the door is open only where the car is.
- The car is a real 4x4 platform of ELEVATOR blocks that moves through the shaft block by block (ElevatorSystem).
- Entering the cabin opens a floor menu (GROUND, FLOOR 1-9, TERRACE) that locks movement; click a floor or press its digit (T = terrace).
  M reopens the menu inside the cabin and calls the car from in front of a closed door; Esc closes the menu.
- The roof is now a terrace (parapet all around), reachable only by the elevator.
- Spawners: circuits.png texture, four per room in the inside corners, every room on every floor.
- WorldData tracks block changes after generation and ChunkManager.applyWorldChanges() re-meshes the affected chunks.
- Tests: 38 in total (tower sealed, terrace, spawners, reachability including the cabin and terrace, elevator system, menu layout).

## Round 7: 20x20 rooms, windows, break/place, inventory, fullscreen, fog
- Main moved to package `com` (file src/main/java/com/Main.java, run class `com.Main`). Delete the old
  src/main/java/com/craftedresistance/Main.java.
- Always fullscreen at the monitor's resolution and refresh rate (Esc, then QUIT, leaves).
- Distance fog in the sky colour: terrain fades out before the edge of the loaded chunks (Fog). Vertical chunk radius is now 4.
- Rooms are 20x20x10. Ground floor plus floors 1-10 plus the terrace (12 elevator stops).
- Windows: two 6x3 windows in the front and back wall of every room, made of GLASS, a semi-transparent black block
  (generated texture, second blended render pass, glass sorted back to front).
- The elevator menu no longer opens by itself; press M inside the cabin. You must stand fully inside (not in the door blocks).
  Arrow keys + Enter, digits 0-9, T for the terrace, or click.
- Break (left mouse) and place (right mouse) blocks within 5 blocks; hold to repeat. White outline on the targeted block.
  Bedrock and the elevator's own blocks can't be broken. Ground can be dug out.
- Inventory (E): block counts; click a block to put it in the selected hotbar slot. Hotbar shows counts. Survival by default;
  set CREATIVE = true in Main for unlimited blocks.
- Tests: 57.

## Round 8: Ground+9, one-block parapet, mining, saves and the real Minecraft-style inventory
- Building height corrected: the ground floor plus floors 1-9, then the terrace (11 elevator stops, was 12).
  The terrace parapet is exactly 1 block high.
- Elevator: the whole 4x4 cabin AND the open doorway now count as "inside", so M works wherever you stand in
  the lift (before, only the centre blocks opened the menu and the doorway was a dead zone). An idle car no
  longer sits wherever it was last used: after 8 seconds with nobody in or near it, it parks itself on the
  ground floor. Calling it (M at a closed door) re-targets it even mid-ride.
- Mining is hold-to-break, not instant: every block has HP (iron 20 at 4 HP/s = 5 s, dirt/lights 8, glass 6,
  doors 10, gold/uranium 16, spawners 24). At half HP the block switches to its damaged texture (the
  "breaking" PNGs, and generated cracked variants for dirt, lights, door and glass). Damage persists if you
  stop. A thin progress bar sits under the crosshair while mining.
- Progress saving: world edits, block damage, player position/view, elevator level and the whole inventory
  are saved to ~/.craftedresistance/world.dat. Loads on startup; saves on quit and every 30 s in between
  (never mid-ride: a moving car is first brought to its floor so the file is always consistent).
- Inventory (E) is now a close replica of the Minecraft screen: a player mannequin with 8 half-armour slots
  (left/right helmet, chest, legs and boots - the modular sci-fi armour idea from the old Unity scripts,
  each half worth half the defense, a full set = 80%), a 2x2 crafting grid with output, the 27 backpack
  slots and the 9 hotbar slots. Left click picks up/places/swaps, right click takes half or places one,
  shift-click quick-moves (and equips armour), 1-9 swaps the hovered slot with that hotbar slot. Equipped
  halves light up their side of the mannequin, empty slots show a ghost of the piece that belongs there,
  the total DEFENSE % is shown, and hovering shows the item tooltip. Placing blocks now uses the stack in
  the selected hotbar slot, like Minecraft. E or Esc returns the craft grid and cursor stack to storage.
- BitmapFont learned the glyphs % . - / : + < > for the new labels.
- Tests: 81 (mining timing + cracked texture, elevator idle-return and re-targeting, save round-trip,
  inventory click rules, inventory screen layout/hit-testing at several resolutions).

## Round 8 fixes: elevator behaviour, one recipe, faster mining
- The car no longer abandons you: it counts as "in use" while you are on the same floor it is parked at
  (playerOnCarLevel), so it waits at the terrace while you explore. It only parks itself on the ground
  floor once you have actually left that floor (or respawned outside).
- Ground-floor teleport fixed: the pre-save "put the player back on the car" snap now only applies inside
  the cabin column itself and only when you are clearly not standing on the car (> 2 blocks off), instead
  of matching the doorway column at any height - which is what yanked terrace players down to y=0.
- The floor menu opens only inside the 4x4 cabin again (every corner of it, still not just the centre).
  Opening it while touching the doors and then choosing a floor dragged you through the closed door
  blocks - the "weird upward drag, world goes transparent" (camera inside solid blocks). Riding now always
  starts on the car.
- Crafting: all recipes removed except one - fill the 2x2 grid with iron to make an ADVANCED CRAFTING TABLE
  (new placeable block: Admin tableTop + Console textures, cracked variants, 20 HP like iron).
- Mining is twice as fast (8 HP/s: iron 2.5 s) and the under-crosshair progress bar is gone.
- Tests: 82.

## Round 8 fixes 2: dead keyboard on startup
- Root cause: a fullscreen window without keyboard focus receives NO key events and glfwGetKey always
  reports released, so WASD, E and Esc are all dead until you click. Windows refuses to hand the
  foreground to a process that wasn't started by the foreground process (e.g. the game when it's launched
  through IntelliJ's Gradle runner / the Gradle daemon), so glfwFocusWindow alone silently did nothing.
- The game now takes the foreground for real on Windows via the AttachThreadInput + SetForegroundWindow
  workaround, called through the JDK FFM API (platform/ForegroundFix, needs JDK 22+, build bumped to
  release 22). It runs at window creation and again after the long init.
- If even that fails, the game no longer goes deaf: an unfocused PLAY state pauses itself with a
  "CLICK TO PLAY" screen and unpauses automatically the moment the window gets focus (one click).
  Losing focus mid-game (alt-tab) pauses the same visible way.
- Old saves that left the player embedded in solid blocks (a lift door closing on them) are rescued to the
  spawn point instead of loading frozen (PlayerMovement.isStuck).
- Tests: 83.

## Round 9: thin outline, shaft protection, save buttons, health & stamina
- The block targeting outline is now thin and black (12 slim bars sampling the dark glass tile) instead of
  the thick bright frame.
- Blocks can no longer be placed inside the elevator shaft column (WorldData.isElevatorShaft): the car
  needs its whole travel column clear, from the pit floor to the tower cap.
- Pause menu has three buttons: RESUME, SAVE (writes the save and stays in the menu) and SAVE & QUIT
  (quitting always saves, via the window X too).
- Damage & stamina (player/PlayerStats, the old Unity PlayerProperties idea done dt-based):
  - Stamina drains while moving (8/s, or 24/s while sprinting) and rebuilds while standing still (14/s);
    sprinting needs stamina in the tank.
  - Fall damage: landing from more than 4 blocks costs 8 HP per extra block (the elevator car and void
    respawns never count as falls; only real airborne landings are measured).
  - Health regenerates 4 HP/s after 5 seconds without damage. Death respawns you at the spawn with full
    stats; the inventory is kept.
  - HUD shows Minecraft-style vitals above the hotbar: hearts on the left, energy bolts on the right
    (your FullHeart/HalfHeart/EmptyHeart and EnergyFull/Half/Empty PNGs, now in the atlas).
  - Health and stamina are stored in the save file (appended fields; pre-stats saves still load).
- Tests: 94.

## Round 9 fixes: stamina pacing, one quit button, the death screen
- Stamina pacing is Minecraft-like now, not a tax: sprinting empties the tank in ~33 s (was 4 s!),
  walking in ~100 s (was 12 s), idling refills it in ~12 s.
- The pause menu has two buttons, RESUME and SAVE AND QUIT, and buttons size themselves to their labels,
  so the text never spills out.
- Dying shows a Minecraft-style death screen: dark red tint, "YOU DIED!", the reason
  ("YOU FELL FROM A HIGH PLACE" / "YOU WAS HURT" - the fatal hit sets it), and RESPAWN / SAVE AND QUIT
  buttons. Enter, R or Esc also respawn. A dead player is never written into the save (quitting from the
  death screen saves you respawned at the spawn), and a corrupted dead-state save self-heals on load.
- Tests: 96.

## Round 10: debug tool, bots, guardians, room clearing and elevator locks
- Debug tool (solid magenta placeholder tile, last hotbar slot in the starter kit): holding it breaks any
  block in one frame and kills any bot or the guardian in one hit.
- Bots (the Unity BotLogic): the four spawners of the room you're in release a bot every 20 s (two alive
  per spawner at most). 20 HP, wander, chase on sight (12 blocks, line-of-sight), hit for 5 up close once
  a second, flee under 25% HP. Rendered as small textured boxes (bot head/body tiles). You hit back with
  the left button (10 damage, or one-shot with the debug tool). Death by a bot has its own death-screen
  reason. Bots aren't saved - they respawn from the remaining spawners next session.
- Door locking: every room-to-room door starts locked (solid, "Lock Screen" texture) until you break all
  four spawners of either room touching it - then it becomes a normal walkable door ("ROOM CLEARED -
  DOORS UNLOCKED"). The lock state is derived from the world, so it saves for free; putting a spawner
  back re-locks. The entrance and the elevator landing doors never lock.
- Guardians (the Unity boss): clearing the floor's boss room (room 9 on the ground floor, room 1
  elsewhere) wakes a 50 HP guardian (10 damage hits, red boss HP bar on top). Killing it unlocks the next
  elevator level; the last floor's guardian unlocks the terrace. Defeated guardians are saved
  (Progression mask in the save file) and never respawn.
- Elevator menu greys out locked floors and won't travel to them (click, digits and Enter all refuse);
  a hint line explains the guardian requirement.
- Tests: 114.

## Round 10 fixes: bots are floating face cubes, and they fight back properly
- Bots are now single floating cubes - no body: one 0.9-block cube (1.6 for the guardian) hovering at
  your eye level with a gentle bob, the face texture on the front side tracking you, the plain bot body
  texture on the other five sides. They glide up and over spawner blocks and other one-block clutter.
- Much tankier: bots have 50 HP (was 20, five hits to kill) and the guardian 200 HP (was 50, twenty
  hits). The debug tool still one-shots everything.
- Tests: 115 (bot floating height, tankiness, deterministic chase-and-hit coverage).

## Round 10 fixes 2: Minecraft hurt flash
- Damaged entities flash red for 0.5 s, like Minecraft: every hit on a bot or the guardian starts a
  hurtTimer (BotSystem.damage), and flashing entities are drawn in a second pass with a red tint uniform
  in the chunk shader (the world itself always draws white).
- Tests: 116.

## Round 11: broken blocks drop as items
- Mining no longer puts blocks straight into the inventory: the block pops out of its cell as a little
  spinning, bobbing item cube (DropSystem + DropRenderer), settles on the floor, and is vacuumed up when
  you walk within 1.3 blocks. Drops despawn after 5 minutes. Creative mode still voids broken blocks.
- Drops are saved too (appended to the save file; older saves load without any).
- Tests: 121.

## Round 11 fixes: "save and quit not saving"
- SAVE AND QUIT (and the death screen's SAVE AND QUIT) now writes the save AT CLICK TIME, not only in
  the loop-exit path - if anything later failed, the progress is already on disk.
- Save failures are loud: any exception is printed with a stack trace and a "SAVE FAILED!" HUD hint
  instead of being swallowed; a brief "GAME SAVED" hint confirms successful autosaves.
- Single-instance save lock (world.lock next to world.dat): a forgotten second game instance can no
  longer quietly overwrite your progress with its stale world via its autosave/exit-save - the real
  cause of "save and quit not saving". The second instance boots and plays, but logs "ANOTHER INSTANCE
  HOLDS THE SAVE LOCK", shows a warning hint, and never writes.

## Round 11 fixes 2: desktop window management restored
- Removed the AttachThreadInput/SetForegroundWindow hack (ForegroundFix): attaching the game's input
  queue to another app's foreground thread broke window management for the WHOLE machine (alt-tab,
  minimise/maximise of other apps).
- The game now uses BORDERLESS fullscreen instead of exclusive fullscreen: it looks identical, but
  alt-tab and every other app's minimise/maximise work normally, and the game auto-pauses with the
  "CLICK TO PLAY" screen whenever it isn't the focused window. Startup focus is a polite glfwFocusWindow
  request only - if Windows refuses it, one click on that screen gets you in, and everything else on the
  desktop keeps working.

## Round 12: title screen and multiple worlds
- Minecraft-style title screen on startup: CRAFTED RESISTANCE + "GROUND PLUS NINE", PLAY and QUIT GAME.
- PLAY opens the world list (the Minecraft "Singleplayer" screen): every world is its own save file in
  ~/.craftedresistance/worlds/, most recently played first, with its last-played date. PLAY SELECTED,
  CREATE NEW WORLD (type a name, Enter), DELETE WORLD (click twice), BACK; mouse wheel scrolls long
  lists, Up/Down/Enter/Delete work too.
- The old single save (~/.craftedresistance/world.dat) is automatically copied in as "LEGACY WORLD"
  the first time this version runs (the original file is kept).
- SAVE AND QUIT (pause menu and death screen) now quits TO THE TITLE after saving, so you can switch
  worlds without restarting; QUIT GAME on the title screen exits. The window X still saves and exits.
- The per-instance save lock is now per world ("<name>.dat.lock").
- Tests: 125.

## Round 12 fixes
- The block targeting outline is disabled for now (OutlineMesher/OutlineRenderer kept for later).

## Round 12 fixes 2: outline back, indestructible building
- The thin black block outline is back.
- Logo.png from the resources root is the window/taskbar icon.
- The facility's iron shell is now indestructible - walls, ceiling slabs, terrace parapet and the
  elevator tower (WorldData.isBuildingShell + isIndestructible). It keeps the plain iron texture: the
  rule is "iron at a generated shell position", so iron you place anywhere else, and spawners, glass,
  doors and light fixtures, all stay breakable. Mining the shell does nothing - no cracks, no debug
  bypass, no drops.
- Shell protection now covers only untouched, GENERATED iron (playerTouched set): anything the player
  ever placed or changed - iron patched into a broken window, doorway or wall hole - stays theirs to
  break again, including after a reload (the set is saved; legacy saves rebuild it by diffing against a
  fresh generation).
- Tests: 132.

## Round 13: no fleeing, humanoid guardians, per-floor boss kits
- Bots never flee any more: low health changes nothing, they fight to the death.
- Guardians are little humanoids now: two legs, a torso and two arms in the bot body texture plus a head
  with the boss face (the Unity bosses had bodies, hands and legs); plain bots stay floating face cubes.
- Every floor's guardian has its own kit, modelled on the Unity Boss0-Boss9 scripts (BossSpec table,
  HP doubled for our pacing): G Poison Lob (green telegraph, then a projectile), 1 Reinforcements,
  2 Lock-On Missile, 3 Supply Drain (burns stamina), 4 Energy Zap, 5 Broadcast Shockwave, 6 Lifesteal
  (heals on melee hits), 7 Landmines (proximity, 15 dmg), 8 Stamina Burn (empties the tank),
  9 Command Pulse (reinforcements + shockwave). Abilities lock on with a green marker cube before firing,
  like the Unity greenCubePrefab.
- New death reasons: zapped by a guardian, stepped on a landmine.
- Tests: 139.

## Round 14: cutscenes, the friendly bot, and boss 10
- Cutscene engine (Mode.CUTSCENE): controls lock, letterbox bars with captions, the camera pans/lerps
  along a scripted path, Esc skips.
- Scene 1 - "A FRIENDLY BOT HAS BEEN FREED": defeating floor 3's guardian (COMPANION_FLOOR constant)
  frees a companion (friendbot texture) that follows you everywhere, teleports to you when left behind,
  and zaps the nearest enemy within 8 blocks twice a second. Your own ray can never hit it, and the
  freed flag is saved, so it's with you forever once earned.
- Scene 2 - "ROOM 100 CLEARED": breaking every spawner of the last room (floor 9, room 9) lifts you to
  the terrace where boss 10 waits: the FINAL GUARDIAN, 600 HP, combining a lock-on missile, a shockwave
  and reinforcements (Ability.FINAL). Killing it fires "FACILITY CLEARED!" and is saved as boss bit 10.
- Getting hit knocks you back, scaled by the damage (PlayerMovement.knockback: a fast-decaying shove of
  3 + dmg x 0.5 blocks/s away from the attacker plus a small upward pop; walls still stop it).
  Bots shove you off them, guardians launch you, projectiles push along their flight path, landmines
  blast you off the spot.
- Tests: 144.

## Round 15: charging machines and the friend-bot battery
- A charging machine (ChargeMachine.png) now stands in room 1 of every floor; it is indestructible and
  old saves get it retrofitted on load.
- The friend bot runs on a battery: freed with half a tank (50%), it drains ~0.5%/s while active (a full
  tank is about 3 minutes of following and fighting), and goes dormant at 0 until fed.
- Right-click a charging machine with gold in hand: one gold block is half a charge (+50%), with HUD
  hints for full / no gold / no friend bot yet.
- A gold "FRIEND BOT" charge bar sits above the hearts whenever the companion exists. The charge level
  is saved.
- Tests: 146.

## Round 16: F3 overlay and chat commands
- F3 toggles a Minecraft-style debug panel (top-left): fps, XYZ, chunk coords, facing, floor/room and
  how many rooms are cleared on it, live bot/drop counts, and the world name.
- T opens the chat line (Minecraft style: type, Enter runs, Esc closes, Up/Down for history). Results
  linger a few seconds; NOTHING is ever written to disk.
- Commands: /debug lvlclr <from> <to> clears every spawner in LEVELS from..to - the 100 rooms, numbered
  1-100 (level n = room (n-1)%10 on floor (n-1)/10, so 100 is the last room). Reversed bounds swap,
  out-of-range is rejected with "LEVELS ARE 1-100". Clearing unlocks doors - and wakes a boss room's
  guardian. Plain text echoes as <YOU>. Unknown commands get a hint.
- Room ids unified: every floor's boss room is its LAST room (room 9), so boss levels are the round
  numbers 10, 20, 30, ..., 100 - matching the level ids used by /debug lvlclr and the F3 panel
  (which now shows LEVEL). The friendly-bot cutscene triggers at level 30's guardian (floor 2), and the
  final cutscene lifts you to the terrace once room 100 is cleared AND its guardian is beaten.
- Tests: 151.

## Round 17: sliding doors, single-texture panels, DoorHiss sfx
- Doors are one logical slab per doorway now (WorldData.Doorway: the full 2-wide x 2-high opening,
  both wall layers). Intact doorways are skipped by the chunk mesher and drawn by DoorRenderer as a
  single panel with ONE door texture stretched across each visible face - no more 4-tiled look.
  Locked doors show one lock-screen face. Broken doorways keep their remaining per-block faces.
- Proximity animation: unlocked doors slide up on approach (6-block range, ~0.5 s travel) and back
  down when you leave; locked doors never budge. Collision follows the panel (walkable past 60% open).
  Elevator landing doors slide fast with the car. Door openness is transient - never saved.
- DoorHiss.wav plays on every opening via a new OpenAL sound system (javax.sound decode, 4-source
  round-robin so simultaneous doors all hiss, silent degradation without an audio device).
- Tests: 160 (new DoorSystemTest + SoundSystemTest; DoorLockTest walkability now drives the animation).

## Round 18: death animations for bots and guardians
- The killing blow starts a 5-second death animation instead of an instant vanish: the corpse renders
  permanently red (same tint pass as the hurt flash), sinks straight down to the floor without ever
  falling through it, and despawns at 5 s. No AI, attacks, hover bob or player-targeting while dying.
- Boss bookkeeping (unlock events, cutscene triggers, boss bar) still fires at the moment of death, so
  pacing is unchanged - only the body lingers. Dying bots don't count toward spawner caps.
- Applies to plain bots, guardians and the companion alike (a slain companion despawns and lets go).
- Tests: 163.

## Round 20: damage and UI click sounds
- Dmg.wav plays whenever the player takes damage: one health-polling hook in the game loop catches
  every source (bot/guardian melee, projectiles, shockwaves, landmines, fall damage) without touching
  any combat code.
- UIClick.wav plays on every UI activation: title, world list (select/open/create/delete/back),
  pause, death screen, elevator floor choice (mouse, digits, T and Enter - unlocked floors only),
  and inventory slot clicks.
- SoundSystem generalized to named clips (hiss/dmg/click) sharing one 6-source round-robin pool; a
  corrupt file only kills its own clip, never all sound.
- PlayerWalk+JumpLanding.wav footsteps: one step sound per block of real horizontal travel, grounded
  and moving only (sprinting steps faster automatically since it covers ground faster; airborne/idle
  resets). Landings above half a block reuse the same sound as the thud (a normal jump peaks ~1.4).
- Tests: 167.

## Round 21: advanced table 3x3 grid and recipe engine
- Right-clicking a placed advanced crafting table opens its workbench screen (new Mode.TABLE): a 3x3
  grid with an output slot on top, backpack and hotbar below, same click rules as the inventory
  (left take/place/swap, right one/half, 1-9 hotbar swap). Esc/E closes and spills the grid to storage.
- Crafting is now data-driven shaped recipes (pattern + key, trimmed so shapes match anywhere they fit):
  the 2x2 inventory grid matches small recipes, the 3x3 table matches everything. One line per recipe.
- Seed recipes: the table itself (2x2 all-iron, both grids), 2 doors from a 2x3 iron slab, 2 lights from
  glass around an iron core, and all 8 armour halves (left in iron, right in gold) - halves were only in
  the starter kit before and otherwise unobtainable. Armour/tools are never ingredients.
- Tests: 176.

## Round 22: player-designed armour recipes
- All 8 armour halves now use the mirrored iron pairs from the recipe designer: left is left-heavy,
  right is its mirror (chests 2x3, helmets 2x2, legs tall 2x3, boots 2x2 with a toe block). The old
  iron-left/gold-right split is gone.
- One fix while transcribing: both boot designs arrived as the identical 1-wide bar, which trims the
  same and would have left BOOT_R uncraftable - each boot now carries a toe block so the feet stay
  distinct (bare 1x2 bars craft nothing).
- Small shapes still fit the 2x2 inventory grid (helmets, both boots); chests, legs, doors and lights
  need the table.
- Tests: 177.

## Round 23: quieter hiss and footsteps
- Per-clip volume: the door hiss plays at 0.4 and footsteps at 0.25 gain, damage and UI clicks stay at
  full volume. One place to retune (HISS_GAIN / STEP_GAIN in SoundSystem).
- Tests: 178.

## Round 24: no hiss on join
- Joining a world always hissed once: the landing door where the car is parked loads as open blocks,
  so the first animation update saw a rising edge. Session open now snaps every door to its current
  target silently (DoorSystem.sync) - the car door starts open and walkable, and only real openings
  hiss afterwards.
- Tests: 179.

## Round 25: pickup and placement sounds
- BlockPick.wav plays when an item drop is vacuumed into the inventory (DropSystem.update now reports
  the pickup count; one sound even for multi-pickups).
- BlockPlace.wav plays on every successful block placement, at full volume like damage and clicks.
- Tests: 181.

## Round 26: armor equip, unbreakable doors, single-block 4x4x1 doors, visible elevator close
- Right-click in hand with armor equips it, Minecraft style (swaps with the worn piece, no target
  needed). The inventory-screen path already worked and is unchanged.
- ArmourEquip.wav plays on every real equip, in hand and on the armor screen (failed clicks keep the
  plain click).
- Doors are unbreakable (maxHp and canBreak refuse): mining, debug breaks and instant breaks bounce off.
- One placed DOOR block is now one 4x4x1 door: placement builds the full unit facing the clicked face
  for a single item, and refuses (costing nothing) unless all 16 cells are clear air outside doorways
  and the shaft. Completed volumes register as proper doors - animated panel, hiss, proximity
  collision, never locked, saved and re-validated on load. Partial volumes stay loose walkable blocks.
- Elevator landing doors now visibly slide shut: the departure blocks stay until the panel is fully
  down, then swap to ELEVATOR (previously an instant pop). Arrival, retargeting, finishNow and load
  repair all honor the handshake; loads still repair stale doors.
- Tests: 194.

## Round 26: armor equip, unbreakable doors, player-built doors, elevator repair
- Right-click in hand with armor equips it, Minecraft style (Inventory.equipHeldArmor swaps with the
  worn piece, needs no target). The inventory-screen path already worked - verified, not changed.
- ArmourEquip.wav plays on every equip: in-hand and on the armor screen (screen compares the slot
  before/after so failed clicks keep the plain click sound).
- Doors are unbreakable (maxHp and canBreak): mining, debug-tool breaks and instant breaks all refuse.
  Door tiles stay so nothing renumbers.
- A player-built 2x2x2 DOOR cube registers as one proper door ("C x y z"): animated single panel,
  proximity hiss, openness collision, saved and restored. Partial cubes stay loose walkable blocks;
  cubes overlapping existing doorways just repair them. Custom doors never lock.
- Elevator landing doors self-heal on load (repairLandingDoors): only the car's level may show open
  blocks, so a stale mid-ride save can never strand every door open. A player caught inside a repaired
  doorway is rescued by the existing stuck-player check.
- Tests: 193.

## Round 27: terrace boss music
- FinalBoss.wav loops on its own dedicated OpenAL source during the terrace fight: starts when the
  final guardian is up and you're on the terrace with it, stops when it dies, you leave, die, pause
  or quit (never leaks onto the title screen). One-shots share a separate pool, so combat sounds
  never steal the music source. Plays at 0.5 gain - say the word to retune.
- Tests: 194.

## Round 28: longer unskippable companion scene with hearts
- The friend-bot freeing cutscene runs 10 seconds (was 4.5) and Esc no longer skips it - only the
  terrace scene stays skippable. It plays in three beats with staged captions: reveal, fly-in as the
  bot eases to hover in front of you trailing heart bursts, then settle with a gold-charging reminder.
- New HeartParticles system (deterministic spiral bursts that rise and shrink away) rendered as small
  spinning heart-textured cubes through the existing chunk-shader pipeline.
- Tests: 198.

## Round 29: friend song drives the companion scene
- FriendBot.wav (11.8 s, true stereo, peaks at full scale with a soft 2 s swell up front) plays once
  when the companion scene starts, and the scene now ends exactly when the song ends - read off the
  real OpenAL playback clock, so hitches can't desync it. Beats, captions and heart windows are
  fractions of the track length, so any replacement song just works. Fixed 10 s fallback without
  audio; plays at 0.7 gain to sit with the other music.
- Tests: 199.

## Round 19: boss rooms back to the original rule
- Reverted my room-9-everywhere unification: boss rooms follow the C# BossSpawner rule again - the
  10th room (index 9, the elevator room) on the ground floor, Room1 (index 1) on every other floor.
  Boss levels are now 10, 12, 22, 32, ..., 92. Verified against the C# sources (0-indexed Room ids).
- Tests: 163 (boss-room test asserts the original rule and level ids).

## Round 30: companion stops face-planting walls
- The friend bot hovered at a fixed 1.35 with a 0.9 cube, so it rode up onto 2-high door frames and
  pushed forever. It now detects no-progress (distance to the player not shrinking, so micro-jitters
  don't fool it), ducks its hover down to just above your feet to fit through doorways, and after ~1 s
  of that slides sideways along the obstruction - picking the freer side once and sticking with it -
  to go around dead ends. It rises back to scenic height once clear.
- Hovering gained a collision guard so easing can never sink a bot into solid rock.
- **Companion cutscene now persists correctly across saves**: the trigger checks whether the companion
  bot already exists rather than a persisted flag, so the cutscene triggers on the first floor-2 guardian
  death of any new world, and properly continues from loaded saves where the companion was already freed.
- Tests: 203 (added save-persistence test for companion cutscene).
