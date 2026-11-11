# Science visualizations

Interactive explorations, served from the landing page `index.html`.

## Rainbows

A rebuild at `v2/`, in three dimensions at every scale, with a sixth scale added at the end.

| Scale | Size | What you see |
| --- | --- | --- |
| Orbit | 10 000 km | The Earth in parallel sunlight, where you stand, and the cone of your bow |
| Sky | 1 km | A field with the Sun behind you; primary and secondary bows and the dark band between |
| Rain | 1 m | 30 000 falling drops, each coloured by what it sends to your eye |
| Drop | 1 mm | One drop traced in 3D: every route the light takes, with its share of the energy |
| Surface | 1 µm | The exact field where light crosses the water's surface, on the drop's own curving skin |
| Molecules | 1 nm | One wave crossing into water at an angle you set, and the electron clouds it shakes: why each wavelength is slowed, and so bent, by a different amount |

- **Follow the light** picks out what comes from the Sun, or only what ends up in your eye.
- **Show light as** switches between particles (rays and photons) and waves (crests), where both make sense.
- The camera at each scale turns and zooms only within fixed limits, and "Reset view" (or a double click) returns it.
- The address bar tracks the scale and settings after `#`, so a view can be bookmarked or shared.
- The scales are one connected world. Each deeper scene sits inside the one above at its true place,
  size and orientation (the sky where you stand on the globe, the drop in the rain, a patch of surface
  tangent to the drop where the ray crosses it), and moving between scales is a single camera flight.
- The continents and clouds on the globe, and the cloud tops you pass on the way down to the field,
  are generated noise and not a map of the real Earth. The ring and dot at "You are here" are a marker
  and nothing more; they fade as the camera dives towards them. The cloud also parts around your spot
  as the camera comes down on it, which is staging and not weather.
- During a flight, both scenes are told how far it has gone (`R.zoom`), and nothing changes on a
  clock of its own. The Sky and Rain scales draw one shared landscape; at the Rain scale it is turned
  down to about a quarter of its brightness so that single drops show against it, and the camera's own
  bow is left out. The Drop, Surface and Molecules scenes are light on a dark ground, so their light
  is added over the scene they sit in, and their own backdrop and framing (the block of water, the
  wire frame) arrive last. Those frames are drawing aids, not objects inside the drop.

The physics, all in `js/v2/optics.js`:

- Water is one Lorentz oscillator (bound electrons with a resonance near 101 nm), fitted to measured
  indices: `n² = 1 + Aλ²/(λ² − λ0²)`. It gives 1.3327 at 589 nm against a measured 1.3330. The same
  model sets the bending in the drop, the colours in the sky and the energy stored in the molecules.
- Rays through the drop carry Fresnel reflection and transmission for both polarisations. Of the
  sunlight on a typical rainbow ray, about 6% reflects off the front, 89% leaves through the back,
  4.6% makes the primary bow (96% polarised) and 0.5% the secondary.
- The sky's brightness against angle is computed, not painted: rays over the whole face of the drop,
  for the outside reflection and one and two internal reflections, summed over the spectrum with
  CIE colour matching and blurred by the Sun's half-degree disc. The dark band and the brighter sky
  inside the bow fall out of it. Interference (supernumerary bows) is not modelled.
- At the surface the field is the exact plane-wave solution at a flat boundary, in a beam of finite
  width. The surface around it is the drop's own, a sphere of 1 mm radius drawn to scale: it runs to
  a horizon about 90 µm away and curves out of sight. Across the beam it is flat to about 20 nm.
- Changing which crossing the Surface scale shows flies the camera out until the drop is in view,
  round the drop to the new crossing and back in. The camera stays upright in the drop's frame
  throughout, so each crossing is seen tilted the way it lies on the drop: the back wall with water
  on the left and air on the right, the leaving point from inside with air below.
- The rainbow ray meets the back of the drop at 40°, below the 48.6° critical angle. A ray inside a
  sphere always meets the wall at the angle it was refracted to on entry, so sunlight in a drop is
  never totally reflected. The Surface scale says so, and its angle slider stops short of the
  critical angle for light inside the water.
- The last scale draws one thing: the light's electric field entering the water, with two rows of
  water molecules beside it whose electron clouds swing against the field. The magnetic field is a
  toggle, the energy split is folded away under "Where the wave's energy is", and the few percent
  of light that reflects is left out, which the panel says. Each molecule drawn stands for over a
  hundred layers of real ones.
- In the last scale the wave's energy is split into electric field, magnetic field, stretched
  molecules and moving electrons. Energy held in matter does not travel, which gives the energy
  velocity; nearer the ultraviolet resonance more is held, so violet is slower than red.

Simplifications: drops are spheres, air's index is taken as 1, and brightness is compressed so that
the 5% of light in the bow can be seen beside the 89% that escapes. A toggle spreads the colours 5×
for visibility; it is off by default.

Code: `js/v2/gl.js` is a small WebGL2 engine (HDR targets, bloom, glowing lines and points,
full-screen ray shaders), `js/v2/main.js` holds state, cameras and controls, and each scale is a
module in `js/v2/stages/`. It needs WebGL2 and has no dependencies. On slow machines it draws
fewer pixels to keep the frame rate.

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

A "How it works" button in that view opens a short summary of the mathematics (Bayes' rule, the
priors, the forward model, the Poisson likelihood, the sampler, and how to read the results).

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

It is a static site with no build step. Open `index.html` (the landing page) through any local
web server (ES modules will not load from `file://`), for example:

```
python3 -m http.server 8000
```

## Developing

`CLAUDE.md` holds the working rules for this repository. The main one: before changing any HTML,
CSS or client-side JavaScript, consult
[Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance) and follow it where it
applies.

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `main`. In the repository settings, set Pages → Source to
"GitHub Actions" once.

## Layout

- `index.html`: the landing page with a button per experience.
- `v2/index.html`, `css/v2.css`, `js/v2/`: Rainbows v2 (`gl.js` engine, `optics.js` physics, `main.js` controls, `stages/*.js` one module per scale).
- `vesicle/index.html`, `css/vesicle.css`, `js/vesicle/*.js`: the vesicle fusion experience
  (`profile.js` geometry, `scene.js` molecules and drawing, `vitro.js` microscope, `shaders.js` GLSL,
  `main.js` controls).
- `drafts/`: review boards from each design round.
