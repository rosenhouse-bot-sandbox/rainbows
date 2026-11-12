# Science visualizations

Interactive explorations, served from the landing page `index.html`.

## Rainbows

A rebuild at `v2/`, in three dimensions at every scale, from the whole Earth down to single molecules.

| Scale | Size | What you see |
| --- | --- | --- |
| Orbit | 10 000 km | The Earth in parallel sunlight, where you stand, and the cone of your bow |
| Rain | 1 km to 1 m | A field with the Sun behind you: the bows on the far rain, and 30 000 near drops, each coloured by what it sends to your eye |
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
- The Rain scale used to be two, Sky and Rain. It is now one scene with one camera, which starts
  behind your shoulder with the bow across the sky and moves in among the drops. How far in the
  camera is sets the dressing: the sky is turned down (to about a third of its brightness, close in)
  so that single drops show against it, and the far bow fades with it. Old links with `s=sky` open
  the Rain scale.
- Sunlight and rain are drawn so that they cannot be mistaken for each other. Sunlight is gold,
  slanted, and carries arrowheads that travel with the light. Rain is cool blue-white where it sends
  you nothing, falls straight down, and is drawn as a streak with its head down; a drop near enough
  to have a size on screen is drawn round, because drops are spheres. The streak is a drawing of
  motion, not the drop's shape. The panel carries a key.
- The near drops are coloured by what each sends to the standing figure, not to the camera, while
  the bow on the far rain is painted for the camera. From behind the figure the two nearly coincide;
  from the side they part, which is the point: a bow belongs to one pair of eyes.
- During a flight, both scenes are told how far it has gone (`R.zoom`), and nothing changes on a
  clock of its own. The Drop, Surface and Molecules scenes are light on a dark ground, so their light
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
- The last scale is the Surface scale's own patch of the drop seen from the same camera, closer:
  the flight between the two never turns, the drop's skin and blue water are drawn by the same
  shader code in both, and the water stays on the side it was on. The light drawn is polarised with
  its electric field across the plane of the bend, so from that direction it swings mostly toward
  and away from you; drag to look along the surface and see it from the side. The last scale shows
  light going from air into water, which happens where the ray enters the drop: zooming in from the
  back wall or the way out flies round to the entering crossing first.
- Between the Drop and Surface scales the Drop scene draws the one ray the Surface scale follows,
  the rainbow ray of its colour, through the very spot the Surface scene sits on, and its other
  rays give way. Each colour's rainbow ray crosses the skin at its own place (red and violet are
  about 10 µm apart on a 1 mm drop), so the spot moves with the colour. Arriving from the Drop
  scale, the colour is the one that drop is sending to the eye where it sits in the bow.
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

- **Fusion progress** starts with the vesicle's arrival (the last 120 nm down to the release site,
  with synaptobrevin still free and syntaxin and SNAP-25 waiting on the membrane), then scrubs
  from a docked vesicle through SNARE zippering, the hemifusion stalk,
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

An optional **Interference reflection camera** (a checkbox in vitro) adds a second, dye-free view
through the same objective:

- Light of one colour, 560 to 720 nm (630 nm by default), goes straight up through the objective.
  The 0.4% reflected where glass meets medium is the reference wave; membranes and the vesicle's
  watery interior scatter a far weaker wave back, with a phase of `4πnz/λ` set by their height.
  The camera records the two added together.
- The scattered wave is the first Born approximation integrated over the page's own membrane
  shape: lipid (index 1.48, 4 nm) and the vesicle interior (1.335, like the medium) against
  cytoplasm (1.36). For a flat film this is the Fresnel thin-film formula. The two terms have
  opposite signs, so contrast does not simply grow with vesicle size.
- A docked 42 nm vesicle comes out a little under 1% darker than the background at 630 nm, fading
  as it flattens; larger vesicles turn bright partway through the collapse. The camera panel shows
  a second column (field, magnified centre, contrast trace) in grey, ±3.5% of the background. Six other docked vesicles sit within 300 nm of ours and
  blur into one spot about 2% dark, which stays after ours has merged. **Subtract a frame from
  before the vesicle arrived** shows the change since that baseline instead (±1.5%, with the
  baseline's own shot noise carried along): vesicles already docked cancel, ours shows alone and
  fades to nothing as it merges. During the arrival the spot swings from bright to dark as the
  vesicle comes down through part of a fringe. The inference view still starts from a docked vesicle.
- The wavelength is longer than the laser's to stay clear of the pHluorin band, not because long
  wavelengths resolve more: within the slider's range, shorter light gives a sharper, stronger spot.
- **One objective, two colours.** No lens focuses every colour at the same depth. The objective
  is modelled as an apochromat that is exact at 436, 546 and 656 nm and off by up to 100 nm in
  between (a cubic through the three lines; illustrative, not a maker's data), so at 630 nm it
  focuses 159 nm deeper than for the 510 nm fluorescence, the two agree near 670 nm, and by
  720 nm they are 541 nm apart. A **Focus on** control gives the focus to the fluorescence, the
  reflection, or halfway. The blur of each camera is then computed from the objective's pupil
  with the high-aperture defocus phase `k n Δz (√(1 − (ρ NA/n)²) − 1)`. For the reflection
  camera, which records amplitudes, defocus moves contrast from the centre of the spot into
  rings and can invert it; for the fluorescence camera it widens the blur by the fall in its
  peak (the Strehl ratio). The inference model uses the same blurs.
- Simplifications: each fusion site is a point for the reflection camera, the pupil is uniform
  and scalar (no polarisation), the reference light arrives at normal incidence, the fluorescence
  blur stays Gaussian, and lateral colour (a magnification difference of a few nanometres across
  this field) and wavelength-dependent spherical aberration are left out. The cell has no
  organelles or mottle of its own in the camera panel, which the panel says.

The model is in `js/vesicle/irm.js`.

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

- A **pore width** chart shows the believed width of the fusion pore over the video, in
  nanometres. It is derived from each sample's fusion time, collapse time and vesicle size
  through the membrane shape; the model's pore opens at the moment of fusion and widens as the
  vesicle flattens, so there is no separate pore parameter.
- With the interference reflection camera on, its video is a second likelihood on the same five
  unknowns (Gaussian shot noise, 20,000 photoelectrons per pixel per millisecond). Every pixel
  has an unknown static brightness of its own, standing for the cell's fixed pattern, which is
  integrated out, so only changes over time count and a docked vesicle tells nothing. A second
  sampler runs on the fluorescence video alone and is drawn as green outlines, so the narrowing
  is visible. For the default event (42 nm, all frames seen) the 90% range for vesicle diameter
  goes from 33–63 nm to 41–43 nm, for collapse time from 41–216 ms to 79–92 ms, and for pore
  width 40 ms after fusion from 3–51 nm to 21–27 nm (630 nm, focus on the fluorescence). At
  720 nm, where the reflection camera is 541 nm out of focus, the same three are 41–44 nm,
  73–90 ms and 21–29 nm: the model knows its own blur, so defocus costs contrast, not truth.

A "How it works" button in that view opens a short summary of the mathematics (Bayes' rule, the
priors, the forward model, the Poisson likelihood, the sampler, and how to read the results).

The model and sampler are in `js/vesicle/infer.js`, the charts in `js/vesicle/inferui.js`.

Around the scene:

- The address bar tracks the view after `#` (`mode`, `p`, `size`, `angle`, `cut`, `orbit`, `tilt`,
  `dist`, `labels`, `irm`, `wl`, `focus`, `sub`, plus `t`, `power`, `frame`, `prior`, `seed`, `truth` in the inference view), so any state can be bookmarked or shared; there is also a copy-link button.
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

Rainbows has a test for the things a screenshot cannot show: a jump part-way along a slider
drag, a flash on one frame of a flight, a control that moves as it is pressed, a view that depends
on the route taken to it. `node tests/smooth/run.mjs` drives the page in headless Chromium with a
real pointer on a stepped clock, samples every frame, and writes a report with strips of the worst
frames to `tests/smooth/out/`. `tests/smooth/README.md` explains how it works and what it cannot
judge (how it feels on a real GPU, above all).

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
- `tests/smooth/`: the smooth-interaction tests for Rainbows (`run.mjs` drives the page, `inject.js` is the
  stepped clock and the probes, `scenarios.mjs` the gestures, `analyze.mjs` the checks and the report).

## Optics workshop

A game at `optics/`: build things that bend light on a bench where every ray is really traced.
Each challenge has a brief, one to three things to change (sliders, and a row of buttons where the
choice is a glass), and a goal measured from the trace.
Meet the goal and let go, and the panel says what you just built and why it works.

| Challenge | You change | It teaches |
| --- | --- | --- |
| Burning glass | Where the lens sits, how strongly its faces curve | Focus and focal length |
| Eyeglasses | The power of a spectacle lens in front of a nearsighted eye | Spreading lenses, dioptres |
| Camera lens | The shape of a 50 mm lens and its iris | Spherical aberration, and sharpness against brightness |
| Colour | The glass of a 100 mm lens, and its curve | Dispersion (wavelengths focusing apart), the Abbe number, index against curvature |
| Doublet | The curve of a crown lens, and the glass and back face of a lens cemented behind it, for a 50 mm lens with a 6 µm spot | The achromatic doublet: why it takes two glasses, and why the pair matters |
| Wide view | The bending of a lens and where its stop sits | Coma and field curvature off the axis (Wollaston's landscape lens) |
| Solar tower | The tilt of three heliostat mirrors | The law of reflection |

- The white knobs in the picture can be dragged with a mouse or a finger. Every setting is also a
  slider in the panel, so the whole game can be played from the keyboard. The iris and the mirrors
  move by a fixed small amount for each pixel of drag, so a thumb can set them finely.
- A bar that fills is named for what the player gains: "Sharpness" fills as the blur (the number
  beside it) shrinks, "Brightness" as more light gets through. A value that has to land in a band,
  such as a focal length, is a marker on a scale with the band marked, not a bar. A slider moves the
  same way as the thing it moves in the picture.
- Nothing moves unless you move it, with one exception: when the match lights it flares, with
  sparks, for four seconds and then the flame holds still. With reduced motion switched on it is
  simply alight. The flame is a drawing, not a model of combustion.
- The solar tower's boiler glows by the share of the mirrors' light that lands on it, from dull red
  to white-hot, so each mirror that finds it makes it visibly brighter. The colours are a drawing,
  not a temperature.
- Beside the eye is an eye chart as that eye sees it. The chart is laid out at its true size on the
  retina (a 20/20 letter is five minutes of arc, 26 µm, tall; the eye turns angles into distances
  about the centre of the cornea's curve) and every point of it is spread into the spot the traced
  rays make there. The small change in image size that a spectacle lens causes is left out.
- Solved challenges are remembered in the browser (`localStorage`); the address bar tracks the
  challenge after `#`.

Code: `js/optics/trace.js` is the ray tracer, `glass.js` the refractive indices, `levels.js` the
challenges (their text, their scenes and their scoring), `chart.js` the eye chart, `main.js` the page. `css/optics.css` is the
stylesheet. `node tests/optics/run.mjs` plays every challenge in a real browser with a mouse, a
finger and the keyboard.

The physics:

- The tracer is exact in the plane: each ray meets each spherical face where it really is and bends
  by Snell's law. No thin-lens or small-angle approximation is made, so spherical aberration appears
  because it is in the geometry. Focal lengths shown are the thick-lens (lensmaker's) values.
- Glass indices come from the makers' Sellmeier fits, and Malitson's for fluorite. They give the
  catalogue values at 587.6 nm and the catalogue Abbe numbers: N-BK7 1.5168 and 64.2, F2 1.6200 and
  36.4, SF10 1.7283 and 28.5, CaF2 1.4338 and 95.0.
- The text keeps wavelength and colour apart: wavelength is a property of the light, colour is what
  we see. White light is a mix of many wavelengths; it is traced as three of them, 486 nm, 546 nm
  and 656 nm, each drawn in the colour we see it as (blue, green, red). In the two chromatic challenges the blur behind "Sharpness" is
  over the three together, equally weighted. The inset adds the three drawings up; it is not a
  rendering of what an eye would see of a full spectrum.
- In the Wide view challenge the second bundle arrives 20° off the axis, so its spot is not round.
  Only the slice of that bundle in the plane of the picture is traced, each ray weighted equally,
  and its blur is measured about its own middle. That catches coma and field curvature; the error
  of the slice at right angles (astigmatism) and distortion are not counted. The stop is f/11. The spectacle
  plastic is a two-term fit through CR-39's index and Abbe number. Air is taken as 1.
- For the lens challenges the light comes from a point on the axis, so the spot on the target is
  round. Each traced ray stands for a ring of light, and is weighted by its height in the beam.
  "Blur" is twice the root-mean-square radius of the spot. The camera's sensor is placed where that
  is smallest.
- The eye is the textbook "reduced eye": one spherical surface of radius 5.55 mm into a fluid of
  index 4/3, with a 3 mm pupil, made 23.45 mm long so that it is nearsighted.

Simplifications, which the panel also states where they matter: one wavelength (550 nm) outside the
two chromatic challenges; light on the axis only outside Wide view; no reflection losses at the
glass; the Sun is a point, not a half-degree disc; the spectacle lens (40 mm across, 1.5 mm at its thinnest) is equally curved on both
faces, where a real one is a meniscus; the solar field is a flat slice with three mirrors. The
inset that magnifies the spot compresses brightness (a square root) so that a wide blur can still be
seen.
