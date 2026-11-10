# How a rainbow forms

An interactive visualization that zooms smoothly from orbit down to a single
wave of light, showing where a rainbow appears and why each colour bends by
its own amount. Built for curious adults and their curious children.

Five stages, one continuous descent:

| Stage | Scale | What you see |
| --- | --- | --- |
| Orbit | 100 000 km | Parallel sunlight, Earth, and where you stand |
| Sky | 100 m | Sun behind you, the 42° bow, the sun-height control |
| Rain | 1 m | Every drop makes colour; only some of it reaches you |
| Drop | 1 mm | Ray tracing through one drop, colour by colour |
| Wave | 1 µm | A real 2D wave simulation of light entering water |

## Running it

It is a static site with no build step. Open `index.html` (the landing page; the zoom experience is `v1/index.html`) through any local
web server (ES modules will not load from `file://`), for example:

```
python3 -m http.server 8000
```

The wave stage needs WebGL2 with float render targets. Without it, the page
falls back to an animated 2D drawing of the wavefronts.

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `main`. In the repository settings, set Pages → Source to
"GitHub Actions" once.

`tools/bundle.py` concatenates the modules into one self-contained HTML file
for previews.

## Layout

- `index.html`: the landing page with a button per experience.
- `v1/index.html`, `css/app.css`: the shell, captions, scrubber, and controls.
- `js/main.js`: state, the camera that cross-zooms between stages, and input.
- `js/physics.js`: refractive index of water, spectral colours, ray tracing.
- `js/stages/*.js`: one module per stage, each with a `draw` and a `box`
  (the region of its picture that becomes the next stage's full frame).
- `drafts/`: review boards from each design round.
