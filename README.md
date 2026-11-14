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
| Molecules | 1 nm | One wave crossing into water at an angle you set, and the electrons its field moves: why each wavelength is slowed, and so bent, by a different amount |

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
- The Surface scale's words go by the view. With Particles (the view it opens in) they describe the
  dots: photons that reflect or pass with the Fresnel odds and travel at c/n. That view shows where
  the light goes and is a simplification; the text says so, and that the wave is the better model
  of why light turns at a surface. With Waves they describe the crests.
- Changing which crossing the Surface scale shows flies the camera out until the drop is in view,
  round the drop to the new crossing and back in. The camera stays upright in the drop's frame
  throughout, so each crossing is seen tilted the way it lies on the drop: the back wall with water
  on the left and air on the right, the leaving point from inside with air below.
- The rainbow ray meets the back of the drop at 40°, below the 48.6° critical angle. A ray inside a
  sphere always meets the wall at the angle it was refracted to on entry, so sunlight in a drop is
  never totally reflected. The Surface scale says so, and its angle slider stops short of the
  critical angle for light inside the water.
- The last scale draws one thing: the light's electric field entering the water, with two rows of
  water molecules beside it, each drawn as a dot for its nuclei and a disc for its electrons, which the field moves the opposite way. The magnetic field is a
  toggle, the energy split is folded away under "Where the wave's energy is", and the few percent
  of light that reflects is left out, which the panel says. Each molecule drawn stands for over a
  hundred layers of real ones.
- The Surface scale draws the drop cut open along the plane of the ray (`dropSkin` in
  `js/v2/stages/surface.js`): the half nearer the camera is taken away, so the surface is seen
  edge-on as a bright line with the water's blue cut face on one side and air on the other, and the
  beams bend at that line. It is a drawing aid and the panel says so: the light is a round beam on
  both sides of the cut. From far off the cutting plane is out beyond the drop and closes in as the
  camera does (`cutAt`), and the Drop scale's sphere is cut by the same plane on the flight in.
- The Molecules panel carries two moving pictures drawn from the model, on the scene's clock, so
  Pause stops them. One shows a molecule's electrons (a disc) moved by the field of 700 nm and of 400 nm light; how
  much further they move than in a steady field of the same strength (2.1% and 6.8%) is drawn ten
  times too big, which the caption says. The other shows the wave falling behind the wave there
  would be with no water as each layer of molecules adds its own small wave a quarter of a cycle
  behind. Each layer drawn stands for about 220 real ones and delays the wave by exactly 220 times
  what one real layer does; reflection is left out.
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

- **Fusion progress** starts with the vesicle's arrival: it wanders the last 120 nm by Brownian
  motion until tethers on the active zone (Munc13 and RIM, drawn as rods) catch it about 42 nm up
  and reel it in, with synaptobrevin free until syntaxin and SNAP-25 can reach it. The wander is a
  fixed path, so the slider is repeatable, and only its up-and-down part is drawn. It then scrubs
  from a docked vesicle through SNARE zippering, the hemifusion stalk,
  the opening and widening of the fusion pore, to full collapse into the membrane.
- The vesicle carries more than its fusion machinery: about 30 synaptophysins, 10 glutamate
  transporters, 10 Rab3 and a proton pump, in the numbers counted on an average vesicle (Takamori
  et al., 2006). They ride into the cell membrane with its lipids, but each only once it fits: around
  a narrow neck the cytoplasm is a wedge a few nanometres high, so the small proteins leave soon
  after the pore opens, Rab3 later, and the proton pump, whose head stands 13 nm tall, only when the
  neck has opened to the vesicle's full width. A tagged synaptobrevin waits until the pore's lumen
  is wide enough for its tag. The fit is tested against the membrane shape in code (`gates` in
  `scene.js`); that the pump stays whole is a simplification. Shapes are schematic, and they
  are not counted as scatterers by the reflection camera.
- **Vesicle diameter** resizes the vesicle (and its glutamate load, at 150 mM).
- **Cutaway, orbit, tilt, distance** fly the camera; drag, pinch and scroll work too.
- Lipids keep the colour of the membrane they started in, so you can watch the two mix: the
  facing leaflets from hemifusion onward, the far leaflets only once the pore is open.

An **In vivo / In vitro** switch changes the setting. In vitro, the cell sits on a glass-bottom
dish over a TIRF microscope, and synaptobrevin carries two fluorescent proteins in a row on its
lumenal end, superecliptic pHluorin and an orange protein:

- A 488 nm laser hits the glass at an adjustable angle. Past the critical angle it reflects
  totally and leaves an evanescent field that decays exponentially with height
  (`d = λ / 4π√(n₁² sin²θ − n₂²)`); below it, the beam refracts into the cell and lights all of it.
  The field is drawn as a glow, as light falling on the molecules, and in cross-section on the
  cutaway faces with a ruler line at each multiple of the penetration depth.
- pHluorin is quenched at the vesicle's pH 5.5 (to 4% of its brightness outside) and lights up
  when the pore opens. 510 nm emission leaves in all directions.
- The orange protein is modelled on CyOFP1, whose Stokes shift is large enough for the same
  488 nm laser to excite it: emission peak 589 nm, pKa 5.5. It is treated as one acid group, lit
  fraction `1 / (1 + 10^(pKa − pH))`, which leaves it at 51% of its outside brightness in the
  vesicle. So it shows where a vesicle is before any pore opens (its light follows the
  evanescent field at the tags' height), and at the pore it only doubles while pHluorin rises
  25-fold. One of each per synaptobrevin, taken to be equally bright once both are lit.
- A dichroic mirror is assumed to send the two bands to separate halves of the sensor with no
  light from one protein landing in the other's half. The camera panel lays the two pictures
  back over each other, 510 nm drawn in green and 589 nm in orange (a spot lit in both comes out
  yellow), each with its own shot noise, and the trace has one line per band. The 589 nm blur
  is wider (202 nm against 175 nm), and wider again (237 nm) because the objective, focused for
  510 nm, is 162 nm out of focus at 589 nm in the page's model of its chromatic error.
- Not modelled: bleed between the bands, the two proteins' different bleaching and maturation,
  energy transfer between them (they sit a few nanometres apart, and pHluorin's emission overlaps
  the orange protein's absorption, so a real tandem tag would pass some of the green light's
  energy to the orange protein), and the time protons take to leave through a narrow pore.
- The distance slider runs from 40 nm out to 160 mm, so you can pull back through the cell, the
  0.17 mm coverslip and the immersion oil to the dish and the 100×, NA 1.49 objective, all to scale.
- A picture-in-picture camera view shows what the microscope records: each tag blurred to the
  diffraction limit, 65 nm pixels, shot noise, and a trace of brightness over the event.

- The laser footprint is tens of micrometres wide, so the whole underside of the cell is lit.
  A few hundred other vesicles sit near the glass; just under half fuse at their own moment
  before or after the one in focus, and all of them appear in the camera view.

Optics, bench geometry and the camera simulation are in `js/vesicle/vitro.js`.

An optional **Interference reflection camera** (a checkbox in vitro) adds a second, dye-free view
through the same objective:

- Light of one colour, 620 to 720 nm (630 nm by default), goes straight up through the objective.
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
- The wavelength is longer than the laser's to stay clear of both emission bands (the slider
  starts at 620 nm, past the 589 nm band), not because long
  wavelengths resolve more: within the slider's range, shorter light gives a sharper, stronger spot.
- On the cutaway faces, beside the lines that mark each multiple of the evanescent depth, level
  lines in the reflection colour mark the heights where a small piece of membrane looks brightest
  (solid) and darkest (dotted) to the reflection camera, `λ/4n` apart.
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

- Six unknowns: the moment of arrival, the moment of fusion, vesicle diameter, number of tag
  copies, collapse time and the tags' diffusion coefficient, each with a prior (log-normal; flat
  for the fusion time; for the arrival, any time before the fusion).
- Until it arrives the vesicle hangs about 120 nm above its docked height, where the page's
  Arrival stage begins, and then it is docked: one step, not the wander and reeling-in of the
  3D view.
- The forward model gives the expected photons in every pixel of every frame of each band. The
  bands share every unknown and the evanescent field, and differ only in how much the acid dims
  them. Each band's likelihood is Poisson and the two add. A change of position moves both bands
  by the same factor; a pore moves the 510 nm band about 13 times more than the 589 nm band.
  An affine-invariant ensemble of 40 walkers samples the posterior in the browser.
- A second sampler is given the 510 nm band alone and drawn as green outlines. For the default
  event (42 nm, all frames seen, arrival truly at 40 ms) it puts the arrival between 10 and
  54 ms; with the 589 nm band the range is 36 to 43 ms. The second band also narrows collapse
  time (42–236 ms to 75–205 ms) and the pore width 40 ms after fusion (3–50 nm to 3–34 nm).
  It does little for vesicle diameter (32–63 nm to 40–68 nm): size shows only in how much dimmer
  the docked vesicle is than the flattened one, and a field 107 nm deep changes slowly over
  a vesicle's height.
- The video-time slider sets how many frames have been seen, so you can watch beliefs sharpen as
  evidence arrives: an orange step without a green one is the arrival, the green flash fixes
  the fusion time, the rise gives collapse time, the spreading gives diffusion. Vesicle size
  stays vague.
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
- With the interference reflection camera on, its video is a further likelihood on the same six
  unknowns (Gaussian shot noise, 20,000 photoelectrons per pixel per millisecond). Every pixel
  has an unknown static brightness of its own, standing for the cell's fixed pattern, which is
  integrated out, so only changes over time count and a picture that stays the same tells
  nothing. The green outlines then show the two fluorescence bands without the reflection video,
  so the narrowing is visible. For the default event (42 nm, all frames seen) the 90% range for
  vesicle diameter goes from 40–68 nm to 41–43 nm, for collapse time from 75–205 ms to 79–92 ms,
  and for pore width 40 ms after fusion from 3–34 nm to 21–26 nm (630 nm, focus on the
  fluorescence). At 720 nm, where the reflection camera is 541 nm out of focus, the same three
  are 40–43 nm, 74–91 ms and 20–28 nm: the model knows its own blur, so defocus costs contrast,
  not truth.

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
- `maple/index.html`, `css/maple.css`, `js/maple/*.js`: Japanese maple (see its section below).
- `drafts/`: review boards from each design round.
- `tests/vesicle/placement.mjs`: steps Vesicle fusion through every frame without a GPU and fails if a
  protein is on the wrong side of a membrane or pushed into one.
- `tests/smooth/`: the smooth-interaction tests for Rainbows (`run.mjs` drives the page, `inject.js` is the
  stepped clock and the probes, `scenarios.mjs` the gestures, `analyze.mjs` the checks and the report).

## Optics workshop

A game at `optics/`: build things that bend light on a bench where every ray is really traced.
Each challenge has a one-line task, one to three things to change (sliders, and a row of buttons
where the choice is a glass), and a goal measured from the trace. The challenges are taken in order: each is
locked until the ones before it are solved. A bar at the foot of the panel holds Previous and one
button for going on: Next, which becomes Submit while the goal is met and the challenge is not yet solved. Pressing it wins the challenge: the button becomes Next, and the
text under the bar becomes a note about what you just built and why it works. Nothing opens over the page.

| Challenge | You change | It teaches |
| --- | --- | --- |
| Burning glass | Where the lens sits, how strongly its faces curve | Focus and focal length |
| Make a picture | A hole or a lens in a plate, the size of the hole, where the screen sits | What a picture is: each point of a candle lighting its own point of a screen; pinhole against lens |
| Step back | How far away the candle is, where the screen sits | Light from a far-off point arrives as parallel rays and makes a spot one focal length behind the lens |
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
- On a phone the bench is given only the height its shape needs and the panel takes the rest, so
  that every control is on screen when a challenge opens (the test checks this at 390 × 844 and at
  390 × 700). The magnified spot, or the eye chart, sits in a column beside the bench.
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
finger and the keyboard. `node tests/optics/layout.mjs` moves every slider through every value, on a
desktop and two phone sizes, and fails if anything in the panel or the bench changes place or size.

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
- The insets show a small night scene (white stars, a close pair, a lit window) as the sensor records
  it: each point is spread into the traced spot, per wavelength in white light. Brightness is compressed.
- In the Wide view challenge the second bundle arrives 20° off the axis, so its spot is not round.
  Only the slice of that bundle in the plane of the picture is traced, each ray weighted equally,
  and its blur is measured about its own middle. That catches coma and field curvature; the error
  of the slice at right angles (astigmatism) and distortion are not counted. Its inset
  therefore smears the stars at the edge of the picture up and down only. The stop is f/11. The spectacle
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

## Graph layout

A page at `dag/` that draws a directed graph two ways, one step at a time. A directed graph is a
set of nodes joined by arrows (edges).

Each method has an **Engine** switch. "Step by step" is code written for this page, so that every
step can be shown; it is not the real library, and the page says so. "Real ELK" and "Real TALA"
load the real engines and show what they give for the same graph:

- ELK is [elkjs](https://github.com/kieler/elkjs) 0.12.1 (ELK compiled to JavaScript, 1.6 MB).
  Groups become nested nodes with `hierarchyHandling: INCLUDE_CHILDREN`. The settings map onto
  ELK's own options (`js/dag/real.js`); "Sorting passes" sets `elk.layered.thoroughness`, which is
  related but not the same thing.
- TALA is inside D2's WebAssembly build, [@d2lang/d2](https://www.npmjs.com/package/@d2lang/d2)
  0.1.34 (11 MB). The graph is written out as D2 text with each group as a container. Seed and
  Tries become `tala-seeds`. It runs in a worker; on the 55-node file it takes about 7 s for each
  seed.

Both come from jsDelivr, pinned to those versions, and only when the switch is pressed. This is the
site's one outside dependency, and the page's Content-Security-Policy allows that host, WebAssembly
and a blob worker for it. The engines give only a finished layout, so in that mode there are two
steps, the input and the result. The nodes and edges are still drawn by this page.

**Layered** follows the five phases of ELK Layered (the Sugiyama method), written again here in
`js/dag/layered.js`. It is not ELK's code, and where a phase is simpler than ELK's it is listed below.

| Step | What happens | Settings |
| --- | --- | --- |
| Turn | Edges are turned round until no cycle is left | Greedy (Eades, Lin and Smyth), depth first, or every edge that points to an earlier node in the file |
| Layers | Each node gets a layer after every node that points to it | Longest path; short edges; at most a set number of nodes in a layer |
| Sort | Each layer is sorted by the average place of its neighbours, back and forth | Number of passes, 0 to 10 |
| Align | Nodes slide along their layer until joined nodes line up | Space between nodes and between layers |
| Route | Edges are drawn through the points that hold their place in each layer | Right angles, straight, or curved |

- "Short edges" is a local search that moves a node towards the side where it has more edges. ELK
  finds the true shortest total with the network simplex method; this can stop short of it.
- "Width limit" fills layers in file order and sends a node one layer further when a layer is full.
  ELK's bounded-width layering is Coffman and Graham's.
- Sorting uses the barycentre rule only and keeps the best ordering seen. ELK adds a greedy switch
  and random restarts.
- Align is an isotonic regression per layer towards the average of the neighbours. ELK's default is
  Brandes and Köpf.
- Groups: with "Boxes", each group is laid out by itself and becomes a box, the boxes are laid out
  as if each were one large node, and edges between boxes are routed last around the nodes with
  the same A* router the search uses (always at right angles). ELK does this in one pass
  (`hierarchyHandling: INCLUDE_CHILDREN`), where edges between boxes also shape the layers inside
  them; this two-level version cannot, so it crosses more edges than ELK would. "Colour only"
  ignores the groups when placing nodes.
- Connected pieces are laid out one at a time and packed in rows; nodes with no edge go in one block.

**Search** stands in for TALA, D2's layout engine, in `js/dag/search.js`. It is not TALA's code
and not its algorithm. TALA was closed source until September 2026 and is now open source
(MPL-2.0, shipped inside D2 from v0.9.0); this page was written from its makers' description, not
from that source. It shares the outline: TALA is not tied to layers, treats containers as
first-class, draws edges at right angles, and runs several seeds (3 by default) and keeps the
layout that scores best. Here
each group is a box, nodes sit on a grid inside their box and boxes on a grid of their own. A try
starts from a random arrangement and swaps two nodes or two boxes, keeping the swap when the
score drops (simulated annealing: early on, some swaps that raise it are kept too). The score adds
edge length, bends, crossings and edges that point against the chosen direction. Several seeds are
tried, each shown as a small picture with its score, and the lowest is kept. Edges are then routed
with an A* search over lines laid through and beside the nodes. 
What the real TALA does that this does not, from its source (`d2layouts/d2talalayout` in D2, about
64 000 lines of Go): each seed first discovers structure in the graph (sequences, hubs, clusters,
trees, and layered parts ranked by network simplex), then places nodes and refines the placement
(swaps, transposes, gap normalisation, cluster optimisation, symmetry balancing, equal spacing),
packs disconnected parts, routes edges over an orthogonal visibility graph with channel nudging,
places labels, and scores the finished layout; the lowest penalty wins, then the smallest area.
None of the structure discovery, symmetry, label placement or per-container direction is here.

The numbers in the panel are measured from the lines as drawn (`measure` in `js/dag/common.js`):
crossings are counted where two drawn edges cross, and edge length is in node widths.

The first sample is `dag/graphs/anonymous-topology.yaml`, copied from the `lg` repository: 55 nodes
in 9 groups. Of its 65 edges, 2 repeat an earlier one and 1 joins a node to itself; those are left
out of the layout, and the self edge is drawn as a small loop on its node. `parseTopology` in
`js/dag/graphs.js` reads only that file's shape, not YAML in general. The other samples are small
graphs that each show one thing: a shortcut edge, a fan, cycles, a tangle, a tree, three groups.

**Edge labels.** The "Edge labels" switch gives every edge the label "source to target". The real
engines place labels as part of the layout: ELK is told each label's size and makes room for it
beside its edge; TALA (through D2, at font size 10) picks a position along each route, and the page
turns that position into coordinates the way D2's `lib/label` does. The page's own step-by-step
layouts do not place labels: each is put at the middle of its finished edge and left there. The
panel counts "Labels covered", the labels that lie over a node or over another label
(`labelsCovered` in `js/dag/common.js`). On the 55-node file that is 0 for both real engines and
24 and 38 for the page's own two layouts. A label's text is drawn only when it is large enough on
screen to read; its plate is always drawn.

Under each method the panel links to its background and source:
[layered graph drawing](https://en.wikipedia.org/wiki/Layered_graph_drawing),
the [ELK Layered reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html),
[ELK](https://github.com/eclipse-elk/elk) and [elkjs](https://github.com/kieler/elkjs);
[TALA in the D2 docs](https://d2lang.com/tour/tala), the
[announcement that it is open source](https://d2lang.com/blog/tala-is-open-source/) and
[its source](https://github.com/d2lang/d2/tree/master/d2layouts/d2talalayout).

Hovering or tapping a node, or the arrow keys with the drawing focused, picks out the node and its
edges. The address after `#` holds the graph, the method, the step and every setting.

Code: `layered.js` and `search.js` are the two layouts, `route.js` the right-angle router, `common.js` the shared measurements and
seeded random number, `graphs.js` the samples, `main.js` the page. `css/dag.css` is the stylesheet.
`node tests/dag/run.mjs` checks the layouts' rules without a browser; `node tests/dag/page.mjs`
presses every control in a real one.

## Japanese maple

A page at `maple/`: one leaf of a Japanese maple (*Acer palmatum*) from the day its bud opens to the
day it falls, at every scale from the whole tree down to its pigment molecules. Two sliders drive it.

- **Zoom** is continuous, with five named stops: Tree (the view is about 5.5 m tall),
  Leaf (13 cm), Tissue (0.16 mm), Cells (54 µm) and Molecules (7 nm). It is one camera closing on
  one point: the followed leaf hangs at the end of a low twig on the left of the tree, the Tissue
  scale is the leaf cut through at a point on its middle lobe and seen from the cut edge, the Cells
  scale is one tall cell of that cut, and the Molecules scale looks into that cell. Between Leaf and
  Tissue the leaf is cut and turned as one solid, with nothing faded in or out: once the leaf fills
  the screen it is cut along a level line through that point, the near piece slides away, and the
  piece left (2.5 mm of it) tips back about the cut until its cut face is seen square on. The zoom
  slows over this part of the slider. The scale bar at the
  top right is measured from the camera. The mouse wheel zooms too.
- **Season** runs from 25 March to 20 December, with a Play button. The date and the zoom never
  move together: while the zoom is moving the year waits, then goes on. Summer, when little changes,
  takes less of the slider than autumn. The date is shown, and the day length for it at 35° N
  (sunrise to sunset by geometry, without the bending of light by the air).
- At Cells and Molecules, **Zoom into** chooses between a chloroplast and the vacuole of the same
  cell, because the pigments live in different places: chlorophyll and carotenoids in the
  chloroplast's membranes, anthocyanin dissolved in the vacuole's water.

What the page shows, and where each part comes from (`js/maple/model.js` unless noted):

- **Each leaf has its own timetable.** It stops renewing chlorophyll on a day between late October
  and mid November, earlier the more sun it gets; it makes anthocyanin in proportion to the sun it
  gets (a leaf needs light and sugar to make it); it falls 22 to 38 days later. So the crown turns
  from the outside in, red outside and yellow or orange within. The followed leaf is in full sun and
  is the last to fall.
- **Four curves per leaf**: chlorophyll (built up over about six weeks in spring, gone within 23
  days in autumn), carotenoids (55% remain at leaf fall), anthocyanin, and how far the separation
  layer has cut through the foot of the stalk. The panel's bars show them for the followed leaf.
- **Colour is computed, not painted.** Each pigment has an absorption band (a few Gaussians placed
  on the bands measured in leaves: chlorophyll near 440 and 675 nm, carotenoids 425 to 480 nm,
  cyanidin 3-glucoside near 530 nm). The light that comes back from a leaf is `exp(−absorbance)`
  at each wavelength, and its colour on screen is that spectrum weighted by the CIE 1931 colour
  matching functions (the fit of Wyman, Sloan and Shirley, 2013), under light equal at every
  wavelength. The panel's small chart shows the same numbers: the share of each wavelength that
  comes back, over what each pigment absorbs. The colour's name in its caption is taken from the
  computed hue.
- **Tissue** is the leaf's thickness (0.14 mm here): an upper skin of clear cells, a row of tall
  cells packed with chloroplasts (the palisade layer), loose cells with air between (the spongy
  layer), a lower skin with pores (stomata), and a small vein cut across with its water-carrying
  cells above and sugar-carrying cells below. The tall cells make all of the anthocyanin share
  shown in the panel and the loose cells a fifth of it, so the leaf reddens from its upper side;
  cells within 75 µm of the vein run up to 7.5 days behind the rest, so green lasts longest there.
  Both numbers are illustrative.
- **Cells**: one tall cell from the side, chloroplasts along its walls and the vacuole down its
  middle. In autumn the stacks of membrane inside each chloroplast (dark dots) go, the
  chloroplasts shrink and turn yellow, and the vacuole turns crimson.
- **Molecules** are skeleton diagrams to scale (a carbon to carbon bond is 0.14 nm): chlorophyll
  *a* (the ring, its magnesium atom, the 20-carbon tail), β-carotene and cyanidin 3-glucoside.
  As chlorophyll is broken down, each molecule in turn loses its magnesium, then its tail, then
  fades to grey as its ring is opened (the order the enzymes work in).
- **The foot of the stalk**, a diagram in the panel at the Leaf scale once the cut has begun: cork
  forms on the twig side, the separation layer comes apart from the outside in, the vein breaks last.

Simplified or exaggerated, and said so on the page:

- Dates are typical for Kyoto; pigment amounts are smooth curves with the right order and rough
  durations, shown as shares of the leaf's own summer amount (anthocyanin: of its peak), not
  measurements. Absorption bands are illustrative fits.
- The tree has about 3,600 leaves; a real one this size carries several times more. The picture is
  flat: a leaf's depth in the crown only makes it darker.
- A fall takes seconds; it is spread over two and a half days of the slider so that it can be seen.
  Fallen leaves keep their colour (real ones brown within days).
- The cut leaf is a diagram: cells have regular shapes, and only their walls, chloroplasts and
  vacuoles are drawn.
- Molecules are flat, without hydrogen atoms; the proteins and lipids that hold chlorophyll and
  carotenoids in the membrane are left out, and so is water. One molecule has no colour: each is
  drawn in the colour its pigment has in bulk. Anthocyanin is drawn far more crowded than it is: a
  real view 10 nm across would usually hold no molecule at all.

It is a 2D canvas with no dependencies. Nothing moves unless the year is playing or a zoom is in
flight; with reduced motion the year does not start by itself and zooms are immediate.

Code: `model.js` the calendar, pigments and colour; `tree.js` the tree, each leaf's timetable and
the leaf outline; `scene.js` tree to leaf surface; `micro.js` the cut leaf, cells and molecules; `figs.js` the two
panel pictures; `main.js` the camera and controls. `css/maple.css` is the stylesheet.
`node tests/maple/model.mjs` checks the model without a browser; `node tests/maple/page.mjs` presses
every control in a real one and steps both sliders end to end looking for jumps.
