// Refractive indices. Everything the game bends light with gets its index from here.
// Wavelengths are in nanometres in air.

// Sellmeier equation with the makers' published coefficients (C in µm²).
function sellmeier(B, C) {
  return (nm) => {
    const l2 = (nm / 1000) ** 2;
    let s = 1;
    for (let i = 0; i < B.length; i++) s += B[i] * l2 / (l2 - C[i]);
    return Math.sqrt(s);
  };
}

// Two-term Cauchy fit n = A + B/λ² through an index at 587.6 nm and an Abbe number. Used where no
// Sellmeier fit is to hand; it is right at the yellow line and close across the visible.
function cauchy(nd, V) {
  const inv2 = (nm) => 1 / (nm * nm);
  const B = (nd - 1) / V / (inv2(486.13) - inv2(656.27));
  const A = nd - B * inv2(587.56);
  return (nm) => A + B * inv2(nm);
}

export const AIR = { name: 'Air', n: () => 1 };          // air's index (1.0003) is taken as 1
export const BK7 = { name: 'Crown glass (N-BK7)',
  n: sellmeier([1.03961212, 0.231792344, 1.01046945], [0.00600069867, 0.0200179144, 103.560653]) };
export const F2 = { name: 'Flint glass (F2)',
  n: sellmeier([1.34533359, 0.209073176, 0.937357162], [0.00997743871, 0.0470450767, 111.886764]) };
export const SF10 = { name: 'Dense flint (SF10)',
  n: sellmeier([1.62153902, 0.256287842, 1.64447552], [0.0122241457, 0.0595736775, 147.468793]) };
// Calcium fluoride crystal (Malitson 1963): very low dispersion, the "fluorite" of telephoto lenses.
export const CAF2 = { name: 'Fluorite (CaF2)',
  n: sellmeier([0.5675888, 0.4710914, 3.8484723], [0.050263605 ** 2, 0.1003909 ** 2, 34.649040 ** 2]) };
export const CR39 = { name: 'Spectacle plastic (CR-39)', n: cauchy(1.498, 58) };
// The "reduced eye": the whole eye's bending done by one surface into water-like fluid. n = 4/3.
export const EYE = { name: 'Eye (reduced model)', n: () => 4 / 3 };

export const GREEN = 550;      // the one wavelength the first levels trace

// Three colours for white light: the blue and red lines opticians quote dispersion between, and
// a green between them. `rgb` is how each is drawn.
export const WHITE = [{ nm: 486.13, rgb: [70, 130, 255] }, { nm: 546.07, rgb: [60, 225, 90] }, { nm: 656.27, rgb: [255, 70, 55] }];

// The Abbe number: how little a glass spreads colours. Higher is better.
export const abbe = (mat) => (mat.n(587.56) - 1) / (mat.n(486.13) - mat.n(656.27));
