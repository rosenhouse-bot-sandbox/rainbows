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
export const CR39 = { name: 'Spectacle plastic (CR-39)', n: cauchy(1.498, 58) };
// The "reduced eye": the whole eye's bending done by one surface into water-like fluid. n = 4/3.
export const EYE = { name: 'Eye (reduced model)', n: () => 4 / 3 };

export const GREEN = 550;      // the one wavelength the first levels trace
