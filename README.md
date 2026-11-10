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

## Vesicle fusion

A second experience, at `vesicle/`: a real-time 3D model of a synaptic vesicle fusing with the
presynaptic membrane, drawn lipid by lipid and to scale in nanometres.

- **Fusion progress** scrubs from a docked vesicle through SNARE zippering, the hemifusion stalk,
  the opening and widening of the fusion pore, to full collapse into the membrane.
- **Vesicle diameter** resizes the vesicle (and its glutamate load, at 150 mM).
- **Cutaway, orbit, tilt, distance** fly the camera; drag, pinch and scroll work too.
- Lipids keep the colour of the membrane they started in, so you can watch the two mix: the
  facing leaflets from hemifusion onward, the far leaflets only once the pore is open.

An **In vivo / In vitro** switch changes the setting. In vitro, the cell sits on a glass-bottom
dish over a TIRF microscope, and synaptobrevin carries superecliptic pHluorin on its lumenal end:

- A 488 nm laser hits the glass at an adjustable angle. Past the critical angle it reflects
  totally and leaves an evanescent field that decays exponentially with height
  (`d = λ / 4π√(n₁² sin²θ − n₂²)`); below it, the beam refracts into the cell and lights all of it.
  The field is drawn as a glow, as light falling on the molecules, and in cross-section on the
  cutaway faces with a ruler line at each multiple of the penetration depth.
- pHluorin is quenched at the vesicle's pH 5.5 and lights up when the pore opens. 510 nm
  emission leaves in all directions.
- The distance slider runs from 40 nm out to 160 mm, so you can pull back through the cell, the
  0.17 mm coverslip and the immersion oil to the dish and the 100×, NA 1.49 objective, all to scale.
- A picture-in-picture camera view shows what the microscope records: each tag blurred to the
  175 nm diffraction limit, 65 nm pixels, shot noise, and a trace of brightness over the event.

- The laser footprint is tens of micrometres wide, so the whole underside of the cell is lit.
  A few hundred other vesicles sit near the glass; just under half fuse at their own moment
  before or after the one in focus, and all of them appear in the camera view.

Optics, bench geometry and the camera simulation are in `js/vesicle/vitro.js`.

A third setting, **Inference**, turns the problem around. It simulates a noisy 400 ms TIRF video
of one fusion event from hidden parameters, then infers them back with Bayes' rule, live:

- Five unknowns: the moment of fusion, vesicle diameter, number of pHluorin copies, collapse
  time and the tags' diffusion coefficient, each with a prior (log-normal, or flat for the time).
- The forward model gives the expected photons in every pixel of every frame; the likelihood is
  Poisson. An affine-invariant ensemble of 40 walkers samples the posterior in the browser.
- The video-time slider sets how many frames have been seen, so you can watch beliefs sharpen as
  evidence arrives: the flash fixes the fusion time, the rise gives collapse time, the spreading
  gives diffusion. Vesicle size stays vague, because it trades off against copy number.
- Uncertainty is drawn three ways: density strips (prior in grey, posterior in gold, with a 90%
  range and the bits learned), a fan chart that turns into a forecast past the last frame seen,
  and in the 3D scene a gold band around the best-estimate vesicle that holds 90% of the plausible
  membrane shapes (brighter core: 50%). Everything shown is a running summary, eased over time,
  so it moves when the evidence changes and not with each step of the sampler.
- Laser power, frame time, laser angle and prior width are adjustable; "New event" draws a new
  hidden truth and "Show the true values" reveals it.

The model and sampler are in `js/vesicle/infer.js`, the charts in `js/vesicle/inferui.js`.

Around the scene:

- The address bar tracks the view after `#` (`mode`, `p`, `size`, `angle`, `cut`, `orbit`, `tilt`,
  `dist`, `labels`, plus `t`, `power`, `frame`, `prior`, `seed`, `truth` in the inference view), so any state can be bookmarked or shared; there is also a copy-link button.
- On a desktop, hovering a label opens a short explanation with a Wikipedia link
  (text in `js/vesicle/info.js`).
- Hovering an entry in the colour key picks those molecules out and dims the rest; clicking holds it.

The membrane is a surface of revolution (sphere, toroidal neck, plane) whose two leaflets are
offset copies; clipping those offsets at the axis yields the stalk and the pore without special
cases. Lipids are placed by conserved area, so the vesicle's membrane flows out through the neck
as it flattens. See `js/vesicle/profile.js`. It needs WebGL2 and has no dependencies. If the frame
rate drops it draws fewer, larger lipids.

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
- `vesicle/index.html`, `css/vesicle.css`, `js/vesicle/*.js`: the vesicle fusion experience
  (`profile.js` geometry, `scene.js` molecules and drawing, `vitro.js` microscope, `shaders.js` GLSL,
  `main.js` controls).
- `drafts/`: review boards from each design round.
