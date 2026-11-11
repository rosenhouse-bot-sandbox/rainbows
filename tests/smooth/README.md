# Smooth-interaction tests

A person dragging a slider sees every frame. A screenshot sees one. These tests are for the bugs
that live between frames: a jump part-way along a drag, a control that moves as it is pressed, a
label that blinks, particles that all reshuffle at once, a press made in mid-flight that is dropped,
a view that looks different depending on how you got to it.

```sh
node tests/smooth/run.mjs            # everything (most of an hour on a software renderer)
node tests/smooth/run.mjs --quick    # a short pass over every kind of check (about a quarter of an hour)
node tests/smooth/run.mjs --only 'drop|surface'      # scenarios whose name matches
node tests/smooth/run.mjs --analyze  # rebuild the report from the last run's traces
node tests/smooth/run.mjs --list
```

It needs Node 22 and Playwright with its Chromium, installed outside the repository
(`npm install -g playwright && npx playwright install chromium`); the site itself still has no
dependencies. It serves the repository itself, so nothing else needs to be running. It exits with
status 1 if there is any finding that is not in `accepted.json`.

Output goes to `tests/smooth/out/` (not committed):

- `report.md`: the findings, worst first, and a line per scenario.
- `report.html`: the worst of each kind as a strip of frames (two before, the frame, two after)
  with an amplified difference picture. `contact.png` is the same page as one image.
- `report.json`, `traces/*.json`, `frames/<scenario>/NNNNN.jpg`: everything recorded, every frame.

## How it works

**The page is not changed.** `inject.js` is loaded into the page ahead of the site's code and:

- replaces `requestAnimationFrame` and `performance.now` with a clock that only moves when the
  test steps it, and steps CSS transitions by hand on the same clock. A frame is a frame however
  long the software renderer takes over it, so runs are repeatable and a 4-second flight is
  exactly 120 frames at 1/30 s.
- wraps the WebGL calls the page makes. Every uniform and every line and point sent to the GPU is
  checked for NaN and infinity, points are projected to the screen and followed from frame to
  frame, and the amount of line drawn is added up.
- reads each full-size floating-point render target back when the page has finished drawing into
  it, and looks for NaN, infinity and overflow. `--deep` does this after every draw call and names
  the shader that wrote it.
- after each frame reads back the picture (small, for measuring, and medium, for the report), the
  boxes of the panel and every control in it, the labels, and the page's own state
  (`window.__rainbows`).

**The scenarios are made from the page.** Before anything else the runner asks the page which
scales it has and which sliders, buttons and tick boxes each one shows, and how long a frame of
each takes. `scenarios.mjs` builds its list from that, so a reworked or renamed scale is tested as
found. Every slider is dragged slowly there and back, quickly there and back, and again with the
animation paused; every pair of neighbouring scales is flown both ways, turned round in
mid-flight and pressed at random moments; every button is pressed; the view is dragged and
scrolled; and each view is reached by more than one route.

**Input is real.** `run.mjs` moves a real pointer: it presses a slider's thumb and drags it one
step per frame along a path fixed when the drag starts, as a hand's is, and it presses buttons
where they are on screen. If a control moves out from under the pointer, the drag goes wrong
here exactly as it does for a person.

**The checks know nothing about rainbows** (`analyze.mjs`). They compare each frame with its
neighbours:

| Finding | What it means |
|---|---|
| One-frame flash | a frame differs from the frames before and after it, which agree with each other |
| The picture jumps | one frame's change is several times the change either side of it, with no press to explain it |
| Fine detail flickers | many single pixels change sharply for one frame |
| The layout moves | a box in the panel moved or changed size while a slider was dragged, or with no input at all |
| A control moved as it was pressed | the thing under the pointer is somewhere else after the press |
| The slider does not follow the pointer | the slider's value is not where the pointer is, or not what the page's state has |
| Particles reshuffle | a fifth or more of the particles jump across the screen, appear or vanish in one frame |
| Lines pop in or out | the amount of line drawn steps by several times its usual change |
| A label jumps or flickers | a label moves far in one frame, or goes away briefly and comes back |
| The flight is not continuous | the speed along a flight between scales changes abruptly |
| There and back | with the animation paused, dragging a slider away and back, or zooming in part-way and backing out, does not return the same picture, state, layout, labels and particles |
| The address does not bring back the view | after dragging or pressing to a view, loading the address the page wrote for it in a fresh page gives a different state, layout, picture or spread of particles |
| A NaN or infinity | a non-finite number was sent to WebGL, or a shader wrote one into a render target (where the bloom turns it into a white blob for a frame) |

A press is allowed to cut. A drag is not, and neither is doing nothing.

## What it cannot catch

- **Feel on a real GPU.** Frame rate, dropped frames, input lag and the adaptive-resolution
  switch never happen on a stepped clock. Only a person with the device can judge those.
- **A smooth wrong thing.** Wrong colours, wrong physics or an ugly picture that changes
  gradually pass. Use the checks in `CLAUDE.md` for those.
- **Very small things.** The picture is measured at 64 x 40 and 256 x 160. A one-pixel glitch
  that does not flicker is invisible to it.
- **Touch.** The pointer is a mouse. Pinch and touch scrolling are not exercised.
- **Paths nobody wrote down.** It only drags what `scenarios.mjs` tells it to.

## When a person finds a jump the tests missed

Add the gesture to `scenarios.mjs` first and see the report show it, then fix it. When a finding
is intended behaviour, put it in `accepted.json` with the reason, so that the run stays a
pass-or-fail check:

```json
[{ "scenario": "regular expression on the scenario name", "kind": "jump", "match": "optional, on the message", "reason": "why this is meant" }]
```

Thresholds are at the top of `analyze.mjs`. Lower `--dpr` (default 0.5) draws fewer pixels and
runs faster; the layout is the same at any value.
