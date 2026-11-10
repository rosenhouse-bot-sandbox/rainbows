# Developing this site

Guidance for anyone, human or agent, changing this repository. The README describes what each
experience is and where its code lives.

## Ground rules

- Static site, no build step, no dependencies. Plain HTML, CSS and ES modules, served as-is from
  GitHub Pages (`.github/workflows/pages.yml` publishes `main`).
- Run it with `python3 -m http.server 8000` from the repository root. ES modules do not load from
  `file://`.
- Each experience is self-contained: `v1/`, `v2/` and `vesicle/` have their own page, stylesheet
  (`css/`) and modules (`js/`). Do not change one while working on another.
- Physics claims must be true. Numbers shown on screen come from the model in code
  (`js/v2/optics.js` for v2), not from text typed into a caption. Where a picture simplifies or
  exaggerates, say so on screen and in the README.

## Modern Web Guidance

Before writing or changing any HTML, CSS or client-side JavaScript, consult
[Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance) and follow it where it
applies. It is a set of current web-platform best practices (accessibility, forms, CSS, motion,
performance, security, canvas and WebGL) maintained by the browser vendors and MDN.

Search for the capability you are about to build, then read the matching guide:

```sh
npx -y modern-web-guidance@latest search "range slider"
npx -y modern-web-guidance@latest retrieve "slider"
```

Without network access to npm, clone the repository and read the guides under
`skills/modern-web-guidance/guides/`. Start with the discipline guides: `accessibility`, `html`,
`css`, `forms`, `motion`, `performance`, `security`.

**Browser support:** features that are Baseline Widely available need no fallback. Newer features
are welcome only when they are feature-detected or degrade harmlessly, and only with fallbacks
that add no dependency. No polyfills.

What that guidance has meant here so far, and should keep meaning:

- Honour `prefers-reduced-motion`: no camera drift, no flying zoom between scales, and the
  animation starts paused. Anything that moves on its own needs a visible Pause control.
- Use native controls (`<button>`, `<input type="range">`, `<input type="checkbox">`) with real
  labels. Everything reachable by pointer must be reachable by keyboard.
- A canvas is opaque to assistive technology. Keep the story, the numbers and the controls in the
  DOM beside it, and announce changes through a live region.
- Drive all animation from `requestAnimationFrame` (it stops in hidden tabs), recover from a lost
  WebGL context, and keep start-up work in short tasks.
- Keep the page's `<meta>` Content-Security-Policy tight: no inline scripts or event handlers, and
  add a host to it only when a page really needs one.
- Never build HTML from text that came from the URL or the user. Readouts are built from numbers.

## Checking a change

There is no test suite. Before pushing:

- `node --check` every changed module.
- Load each affected page in a browser with the console open, at a desktop width and at a phone
  width (390 × 844), and step through every scale and control.
- For v2, also check with reduced motion switched on, and with only the keyboard.
