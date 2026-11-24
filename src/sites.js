import { ll } from './util.js';

// Everything here is data: where things stood, which way they faced, how big they were,
// and when they were built. Positions are metres in the world frame (see util.js), taken
// from the monuments' modern coordinates or laid out relative to each other from published
// plans. Sizes are rounded. `built` lets the scene be filtered to a given year.

export const YEAR = 180;

// Forum-valley coordinates: `a` metres along the Forum's long axis (towards the Capitoline),
// `b` metres across it (towards the Subura), from the middle of the open square.
const F = (a, b) => [-225 - 0.906 * a + 0.423 * b, -99 - 0.423 * a - 0.906 * b];
// Palatine coordinates: `a` along the hill parallel to the Circus (towards the Caelian), `b` towards the Circus.
const P = (a, b) => [-80 + 0.809 * a - 0.588 * b, 320 + 0.588 * a + 0.809 * b];

export const SITES = [
  // ---------- Forum Romanum ----------
  { id: 'forum', name: 'Forum Romanum', xz: F(0, 0), bearing: 295, type: 'plaza', p: { w: 55, d: 130 }, ground: 14, built: -600, pad: { margin: 0 } },
  { id: 'curia', name: 'Curia Julia', xz: ll(41.893, 12.4854), bearing: 205, type: 'hall', p: { w: 18, d: 26, h: 21 }, ground: 14.5, built: 94,
    note: 'The Senate house, as rebuilt by Domitian.' },
  { id: 'aemilia', name: 'Basilica Aemilia', xz: [-149, -133], bearing: 205, type: 'basilica', p: { w: 95, d: 35, h: 22 }, ground: 14, built: -179 },
  { id: 'julia', name: 'Basilica Julia', xz: [-257, -56], bearing: 25, type: 'basilica', p: { w: 101, d: 49, h: 24 }, ground: 14, built: 12 },
  { id: 'saturn', name: 'Temple of Saturn', xz: ll(41.8925, 12.4842), bearing: 25, type: 'temple', p: { w: 22.5, d: 40, podium: 8, colH: 11, cols: 6 }, ground: 15, built: -42,
    note: 'Home of the state treasury.' },
  { id: 'rostra', name: 'Rostra', xz: F(61, -3), bearing: 115, type: 'rostra', p: { w: 24, d: 10, h: 3.5 }, ground: 14, built: -44 },
  { id: 'vespasian', name: 'Temple of Vespasian and Titus', xz: F(114, -14), bearing: 115, type: 'temple', p: { w: 17, d: 28, podium: 4, colH: 14, cols: 6 }, ground: 16, built: 87 },
  { id: 'concord', name: 'Temple of Concord', xz: F(116, 22), bearing: 115, type: 'temple', p: { w: 40, d: 28, podium: 4, colH: 12, cols: 6, porch: 2 }, ground: 16, built: 10 },
  { id: 'tabularium', name: 'Tabularium', xz: F(155, 5), bearing: 115, type: 'tabularium', p: { w: 73, d: 40, h: 30 }, ground: 16, built: -78,
    note: 'The state archive, closing the Forum against the Capitoline.' },
  { id: 'castor', name: 'Temple of Castor and Pollux', xz: F(-62, -55), bearing: 25, type: 'temple', p: { w: 32, d: 50, podium: 7, colH: 14.8, cols: 8, peripteral: true }, ground: 14, built: 6 },
  { id: 'divusjulius', name: 'Temple of the Deified Julius', xz: F(-83, 0), bearing: 295, type: 'temple', p: { w: 26, d: 28, podium: 5.5, colH: 11, cols: 6 }, ground: 14, built: -29,
    note: 'Built on the spot where Caesar was cremated.' },
  { id: 'vesta', name: 'Temple of Vesta', xz: ll(41.8917, 12.4862), bearing: 115, type: 'tholos', p: { r: 7.5, podium: 2.2, colH: 9, w: 15, d: 15 }, ground: 14.5, built: 64 },
  { id: 'vestals', name: 'House of the Vestals', xz: F(-150, -50), bearing: 25, type: 'block', p: { w: 70, d: 45, h: 12, wing: 11 }, ground: 15, built: 113 },
  { id: 'faustina', name: 'Temple of Antoninus and Faustina', xz: F(-127, 40), bearing: 205, type: 'temple', p: { w: 21, d: 37, podium: 5, colH: 17, cols: 6 }, ground: 15, built: 141,
    note: 'About forty years old in 180.' },
  { id: 'horrea', name: 'Horrea Piperataria', xz: [45, -45], bearing: 205, type: 'block', p: { w: 80, d: 50, h: 11, wing: 12, mat: 'brick', colonnade: false }, built: 92,
    note: 'Spice warehouses. The Basilica of Maxentius replaced them in the 4th century.' },

  // ---------- Via Sacra, Velia, Colosseum valley ----------
  { id: 'archtitus', name: 'Arch of Titus', xz: [50, 89], bearing: 100, type: 'arch', p: { w: 13.5, d: 4.75, h: 15.4 }, ground: 30, built: 81 },
  { id: 'venusroma', name: 'Temple of Venus and Roma', xz: [141, 67], bearing: 108, type: 'venusroma', p: { w: 100, d: 145 }, ground: 31, built: 135,
    note: 'Hadrian\'s double temple, the largest in the city.' },
  { id: 'colosseum', name: 'Flavian Amphitheatre', xz: ll(41.89021, 12.49223), bearing: 18, type: 'amphitheatre', p: { a1: 94, b1: 78, a0: 43.5, b0: 27.5, h: 48.5 }, ground: 22, built: 80,
    pad: { w: 256, d: 224, margin: 0, ellipse: true }, note: 'The Colosseum. A hundred years old in 180.' },
  { id: 'meta', name: 'Meta Sudans', xz: [240, 178], bearing: 0, type: 'meta', p: { w: 18, d: 18 }, ground: 22, built: 89 },
  { id: 'colossus', name: 'Colossus of Sol', xz: [261, 83], bearing: 198, type: 'colossus', p: { w: 16, d: 14 }, ground: 23, built: 127,
    note: 'Nero\'s bronze colossus, moved here by Hadrian.' },
  { id: 'ludus', name: 'Ludus Magnus', xz: [563, 167], bearing: 18, type: 'block', p: { w: 100, d: 75, h: 12, wing: 12, mat: 'brick' }, ground: 23, built: 90,
    note: 'The main gladiator school, linked to the amphitheatre by a tunnel.' },
  { id: 'bathstitus', name: 'Baths of Titus', xz: [456, -22], bearing: 198, type: 'baths', p: { w: 105, d: 120 }, ground: 40, built: 81, pad: { color: 'garden', trees: true } },
  { id: 'bathstrajan', name: 'Baths of Trajan', xz: [704, -111], bearing: 216, type: 'baths', p: { w: 330, d: 315 }, ground: 48, built: 109, pad: { color: 'garden', trees: true } },

  // ---------- Imperial fora ----------
  { id: 'caesar', name: 'Forum of Caesar', xz: [-236, -246], bearing: 140, type: 'caesar', built: -46, ground: 17,
    p: { w: 75, d: 160, colH: 9, temple: { w: 23, d: 33, podium: 5, colH: 12, cols: 8 } },
    note: 'With the Temple of Venus Genetrix, rebuilt by Trajan, and shops along the Clivus Argentarius.' },
  { id: 'augustus', name: 'Forum of Augustus', xz: [-118, -288], bearing: 230, type: 'augustus', built: -2, ground: 19,
    p: { w: 118, d: 125, colH: 10, pd: 13, temple: { w: 36, d: 50, podium: 3.5, colH: 15.3, dia: 1.76, cols: 8, steps: 17, stairAltar: true, cellaMat: 'marble' } },
    note: 'With the Temple of Mars the Avenger, the great firewall, and the statue galleries of Rome\'s heroes.' },
  { id: 'nerva', name: 'Forum of Nerva', xz: [-62, -222], bearing: 230, type: 'nerva', built: 97, ground: 18,
    p: { w: 45, d: 120, colH: 10, pd: 2.5, temple: { w: 22, d: 32, podium: 4, colH: 12, cols: 6 } },
    note: 'The "passage forum", with the Temple of Minerva and columns set close against its walls.' },
  { id: 'peace', name: 'Temple of Peace', xz: [2.5, -169], bearing: 320, type: 'peace', built: 75, ground: 19,
    p: { w: 110, d: 110, colH: 9, pd: 10, temple: { w: 34, d: 22, podium: 1, colH: 14, cols: 6, porch: 2 } },
    note: 'Vespasian\'s garden precinct. It burned in 192.' },
  { id: 'trajanforum', name: 'Forum of Trajan', xz: [-223, -381], bearing: 140, type: 'trajanforum', built: 112, ground: 20,
    p: { w: 100, d: 110, wallH: 15, colH: 10, pd: 12, statue: true, openBack: true } },
  { id: 'ulpia', name: 'Basilica Ulpia', xz: [-278, -446], bearing: 140, type: 'basilica', p: { w: 170, d: 58, h: 30, roof: 'bronze' }, ground: 20, built: 112 },
  { id: 'libwest', name: 'Bibliotheca Ulpia', xz: [-328, -463], bearing: 140, type: 'library', p: { w: 20, d: 27, h: 16, front: 1 }, ground: 20, built: 113 },
  { id: 'libeast', name: 'Bibliotheca Ulpia', xz: [-286, -499], bearing: 140, type: 'library', p: { w: 20, d: 27, h: 16, front: -1 }, ground: 20, built: 113 },
  { id: 'trajancolumn', name: 'Column of Trajan', xz: ll(41.89583, 12.4843), bearing: 140, type: 'column', p: { w: 8, d: 8 }, ground: 20, built: 113 },
  { id: 'divustraianus', name: 'Temple of the Deified Trajan', xz: [-339, -519], bearing: 140, type: 'temple', ground: 20, built: 128,
    p: { w: 36, d: 55, podium: 4, colH: 17, cols: 8, peripteral: true }, note: 'Position and form are conjectural.' },
  { id: 'markets', name: 'Markets of Trajan', xz: [-154, -439], bearing: 230, type: 'markets', p: { w: 120, d: 100 }, ground: 22, built: 110 },

  // ---------- Capitoline ----------
  { id: 'jupiter', name: 'Temple of Jupiter Optimus Maximus', xz: ll(41.8922, 12.4818), bearing: 160, type: 'temple', ground: 45, built: 82,
    p: { w: 54, d: 62, podium: 5, colH: 17, cols: 6, peripteral: true, roof: 'bronze' }, note: 'Domitian\'s rebuild, roofed in gilded bronze.' },
  { id: 'juno', name: 'Temple of Juno Moneta', xz: [-410, -230], bearing: 160, type: 'temple', p: { w: 22, d: 34, podium: 3, colH: 11, cols: 6 }, ground: 47, built: -344 },

  // ---------- Palatine ----------
  { id: 'flavia', name: 'Domus Flavia', xz: P(-18, 26), bearing: 36, type: 'palace', ground: 49, built: 92,
    p: { w: 100, d: 120, h: 18, wing: 16, halls: [{ x: 0, z: 46, w: 34, d: 40, h: 30 }, { x: 0, z: -46, w: 32, d: 30, h: 26 }] },
    note: 'The state rooms of the imperial palace.' },
  { id: 'augustana', name: 'Domus Augustana', xz: P(82, 26), bearing: 36, type: 'palace', ground: 49, built: 92,
    p: { w: 95, d: 150, h: 18, wing: 18, halls: [{ x: 0, z: 0, w: 95, d: 18, h: 20 }] }, note: 'The emperor\'s private residence.' },
  { id: 'stadium', name: 'Palatine Stadium', xz: P(160, 36), bearing: 36, type: 'court', ground: 47, built: 92, pad: { color: 'garden', trees: true },
    p: { w: 48, d: 160, wallH: 10, colH: 6, pd: 6, porticoes: 'all', gap: 0 } },
  { id: 'tiberiana', name: 'Domus Tiberiana', xz: P(-160, -60), bearing: 36, type: 'palace', p: { w: 110, d: 110, h: 18, wing: 16, arcade: true }, ground: 47, built: 40 },
  { id: 'apollo', name: 'Temple of Apollo Palatinus', xz: P(-110, 80), bearing: 216, type: 'temple', p: { w: 24, d: 40, podium: 4, colH: 13, cols: 6 }, ground: 48, built: -28 },
  { id: 'magnamater', name: 'Temple of Magna Mater', xz: P(-185, 60), bearing: 216, type: 'temple', p: { w: 17, d: 33, podium: 4, colH: 11, cols: 6 }, ground: 46, built: 3 },

  // ---------- Circus, Caelian, river ----------
  { id: 'circus', name: 'Circus Maximus', xz: [-247, 584], bearing: 126, type: 'circus', p: { w: 135, d: 620 }, ground: 15, built: 103,
    pad: { w: 150, d: 640, margin: 0, color: 'sand' }, note: 'Trajan\'s rebuild, seating around 150,000.' },
  { id: 'claudius', name: 'Temple of the Deified Claudius', xz: [414, 478], bearing: 216, type: 'court', ground: 46, built: 75, pad: { color: 'garden', trees: true },
    p: { w: 180, d: 200, wallH: 6, colH: 7, pd: 8, porticoes: 'all', templeAt: 'centre', temple: { w: 30, d: 46, podium: 5, colH: 15, cols: 6, peripteral: true } } },
  { id: 'hercules', name: 'Temple of Hercules Victor', xz: ll(41.8887, 12.4807), bearing: 90, type: 'tholos', p: { r: 7.4, podium: 1.6, colH: 10.6, w: 15, d: 15 }, ground: 10, built: -120 },
  { id: 'portunus', name: 'Temple of Portunus', xz: ll(41.8892, 12.4808), bearing: 20, type: 'temple', p: { w: 10.5, d: 19, podium: 2.5, colH: 8.2, cols: 4, porch: 2 }, ground: 10, built: -80 },
  { id: 'marcellus', name: 'Theatre of Marcellus', xz: ll(41.8919, 12.4799), bearing: 230, type: 'theatre', p: { r: 65, h: 32, w: 130, d: 82 }, ground: 10, built: -13 },

  // ---------- Not yet built in 180: kept so the year can be changed later ----------
  { id: 'archseverus', name: 'Arch of Septimius Severus', xz: F(75, 14), bearing: 115, type: 'arch', p: { w: 23, d: 11, h: 21 }, ground: 14, built: 203 },
  { id: 'archconstantine', name: 'Arch of Constantine', xz: [225, 200], bearing: 18, type: 'arch', p: { w: 25.7, d: 7.4, h: 21 }, ground: 22, built: 315 },
  { id: 'maxentius', name: 'Basilica of Maxentius', xz: [25, -33], bearing: 205, type: 'basilica', p: { w: 100, d: 65, h: 35 }, built: 312 },
];

// Open paved areas that are not buildings.
export const ZONES = [
  { id: 'forumvalley', name: 'Forum Romanum', xz: F(-25, 0), bearing: 295, w: 150, d: 330, flatten: false, color: 'paved' },
  { id: 'areacapitolina', name: 'Area Capitolina', xz: [-496, -42], bearing: 160, w: 120, d: 80, ground: 45, color: 'paved' },
  { id: 'areapalatina', name: 'Area Palatina', xz: P(-18, -60), bearing: 36, w: 100, d: 50, ground: 49, color: 'paved' },
];

// [x, z, plateau length, plateau width, bearing of long axis, height, falloff, no housing?]
export const HILLS = [
  { name: 'Palatine', x: -80, z: 320, ra: 230, rb: 165, bearing: 126, h: 49, fall: 80, noHousing: true },
  { name: 'Capitolium', x: -514, z: -78, ra: 90, rb: 80, bearing: 0, h: 45, fall: 70, noHousing: true },
  { name: 'Asylum', x: -456, z: -155, ra: 60, rb: 60, bearing: 0, h: 36, fall: 60, noHousing: true },
  { name: 'Arx', x: -410, z: -230, ra: 55, rb: 50, bearing: 0, h: 47, fall: 60, noHousing: true },
  { name: 'Velia', x: 108, z: 33, ra: 110, rb: 80, bearing: 108, h: 31, fall: 100 },
  { name: 'Oppian', x: 700, z: -140, ra: 260, rb: 160, bearing: 90, h: 50, fall: 170 },
  { name: 'Caelian', x: 520, z: 540, ra: 200, rb: 170, bearing: 90, h: 46, fall: 140 },
  { name: 'Quirinal', x: 40, z: -650, ra: 200, rb: 120, bearing: 90, h: 48, fall: 150 },
  { name: 'Quirinal spur', x: -90, z: -520, ra: 90, rb: 60, bearing: 90, h: 40, fall: 80 },
  { name: 'Viminal', x: 520, z: -620, ra: 250, rb: 140, bearing: 90, h: 45, fall: 150 },
  { name: 'Aventine', x: -410, z: 808, ra: 260, rb: 150, bearing: 126, h: 44, fall: 60 },
];

// Valley-floor heights the ground is interpolated between: [x, z, metres above sea level].
export const LEVELS = [
  [-224, -100, 14], [350, 143, 22], [-247, 584, 15], [-420, 150, 10], [-620, 280, 9], [-180, -320, 18],
  [-280, -450, 20], [250, -380, 24], [200, 400, 20], [-700, -300, 11], [-760, 650, 8], [850, 200, 30],
  [100, 900, 20], [-300, -700, 22], [800, -600, 35], [-800, 950, 9], [150, 800, 17],
];

export const ROADS = [
  { name: 'Via Sacra', w: 8, pts: [F(-100, 15), F(-140, 15), F(-190, 12), [0, 25], [50, 89], [140, 137], [235, 172]] },
  { name: 'Vicus Tuscus', w: 6, pts: [F(-43, -28), F(-43, -80), [-330, 110], [-420, 250], [-470, 380]] },
  { name: 'Clivus Capitolinus', w: 6, pts: [F(68, -20), [-308, -82], [-345, -75], [-410, -62], [-470, -45]] },
  { name: 'Valley road', w: 9, pts: [[240, 190], [215, 330], [170, 480], [110, 620], [40, 720]] },
  { name: 'Via Labicana', w: 8, pts: [[445, 150], [520, 110], [700, 90], [960, 60]] },
  { name: 'River road', w: 8, pts: [[-640, -130], [-600, 200], [-560, 380], [-500, 400]] },
];

export const RIVER = [ll(41.8945, 12.4758), ll(41.8905, 12.4783), ll(41.889, 12.4793), ll(41.887, 12.4792), ll(41.8845, 12.478), ll(41.8815, 12.477)];

export const BOUNDS = { minX: -1000, maxX: 1000, minZ: -760, maxZ: 1000 };

// Street-grid directions for the housing districts: [x, z, bearing].
export const DISTRICTS = [
  [200, -380, 50], [-480, 200, 30], [500, 420, 20], [520, -330, 36], [-80, -640, 50],
  [-520, 880, 126], [160, 760, 126], [-680, -350, 0], [800, 150, 10], [-250, -600, 140],
];

// Where the number keys take you: [label, x, z, bearing to face, fly height (optional)].
export const PLACES = [
  ['Forum Romanum', ...F(-55, 0), 295],
  ['Via Sacra at the Arch of Titus', 92, 112, 290],
  ['Colosseum', 215, 158, 100],
  ['Arena floor', 318, 133, 108],
  ['Forum of Trajan', -195, -348, 320],
  ['Capitoline', -482, -8, 326],
  ['Palatine', ...P(-75, -84), 185],
  ['Circus Maximus', -420, 458, 126],
  ['Above the city', -120, 520, 20, 230],
];
