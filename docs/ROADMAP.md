# Roadmap

Where the model stands and what is left to do. [CHANGELOG.md](../CHANGELOG.md) records each
change once it has been made. This page describes the state of the whole model.

The guiding rule: **no people until the buildings reach a convincing level.** Work goes into one
monument or one system at a time, then gets checked by eye from the ground and from the air.

## Where it stands

### Monuments

Each entry in `src/sites.js` is drawn by a builder in `src/builders.js` or `src/fora.js`.
"Detailed" means a dedicated model that is good up close. "Basic" means a generic shape that
reads correctly at a distance but not when you walk up to it.

| Area | Monument | State |
|---|---|---|
| Forum Romanum | Temples of Saturn, Castor and Pollux, Divus Julius, Vespasian, Concord, Antoninus and Faustina | Detailed: fine Corinthian columns, mouldings, bronze doors, pediment figures, altars |
| | Temple of Vesta | Detailed (round temple) |
| | Basilicas Julia and Aemilia | Detailed: two-storey arcades, coffered ceilings, inlaid floors |
| | Curia Julia | Basic: rendered hall with windows and a door |
| | Tabularium | Basic: arcaded middle storey only |
| | Rostra | Basic: a plain marble block, with no ships' beaks or steps |
| | House of the Vestals, Horrea Piperataria | Basic: generic courtyard blocks |
| Velia and Colosseum valley | Colosseum | Detailed: seating, arena, trapdoors, boxes, corridors, stairs to the top, awning, props, firelight |
| | Arch of Titus | Detailed |
| | Temple of Venus and Roma | Detailed: double temple, granite porticoes |
| | Meta Sudans, Colossus of Sol | Basic: simple cones, cylinders and spheres |
| | Ludus Magnus | Basic: generic courtyard block, with no training arena |
| | Baths of Titus, Baths of Trajan | Detailed: pool, halls, lead domes, exercise courts |
| Imperial fora | Forum of Augustus | Detailed, and checked against Platner & Ashby, Lanciani, Middleton and Suetonius: Mars Ultor, firewall with the Arco dei Pantani, caryatid porticoes, screened half-round halls with statues and trophies, arches of AD 19, chariot group |
| | Forum of Caesar | Detailed: double porticoes, Venus Genetrix, fountains, rider, shops outside |
| | Forum of Nerva | Detailed: columns against the walls, projecting attic, relief panels, Temple of Minerva |
| | Temple of Peace | Detailed: granite porticoes, temple between halls, rose beds and water channel |
| | Forum of Trajan, Basilica Ulpia, libraries, Trajan's Column | Detailed |
| | Temple of the Deified Trajan | Detailed temple, but its position and form are conjectural |
| | Markets of Trajan | Detailed |
| Capitoline | Temples of Jupiter and Juno Moneta | Detailed temples, sitting on plain paved areas |
| Palatine | Domus Flavia, Domus Augustana, Domus Tiberiana | Detailed: palace builder with state halls, porticoes, garden courts |
| | Temples of Apollo and Magna Mater | Detailed temples |
| | Palatine Stadium | Basic: generic colonnaded court |
| Circus and river | Circus Maximus | Detailed: seating, gallery, starting gates, central barrier |
| | Temple of the Deified Claudius | Basic: generic court with a temple |
| | Temples of Hercules Victor and Portunus | Detailed |
| | Theatre of Marcellus | Basic: shared seating code with a plain stage block |

### City and systems

- **Terrain:** a height field built from hills and valley levels, the Tiber, and flattened pads
  under the monuments.
- **Housing:** about 4,600 apartment blocks on street grids that change from district to
  district. Within 400 m of the first eight jump-to places, blocks have built shop fronts,
  windows, shutters and pavements. Further out they are simpler.
- **Streets:** raised pavements, kerbs, stepping stones and fountains on side streets and main
  roads; basalt paving with dust and worn patches.
- **Trees:** umbrella pines and cypresses on the hills and in gardens, kept clear of buildings.
- **Walking:** first-person movement with collision, stairs, ramps and floors above floors;
  flying; nine places to jump to.
- **Light:** sky and sun from 06:30 to 19:00, four-cascade shadows, ambient occlusion, bloom,
  haze, a film grade, weathering on every surface, and brazier firelight at dusk.
- **Performance:** about 60 fps at 2400×1520 on the development machine. The GPU is the limit;
  the CPU spends about 1.3 ms a frame. The main view takes about 7 ms, the effects about 6 ms and
  the shadows about 4 ms.
- **Publishing:** GitLab Pages deploys the site from `main`. Version 0.1.0 is tagged.

## To do

### Monuments still basic (rough order of value)

- [ ] **Ludus Magnus:** small oval arena with seating, cells round a courtyard. It can reuse the
  Colosseum's seating code and props.
- [ ] **Theatre of Marcellus:** a curved arcaded facade in three orders like the Colosseum's, and
  a proper stage building.
- [ ] **House of the Vestals:** two-storey courtyard with pools and statues of the Vestals.
- [ ] **Temple of the Deified Claudius:** the huge terrace on the Caelian with its arcaded front.
- [ ] **Curia Julia:** the real proportions, bronze doors, and the stepped interior.
- [ ] **Rostra:** the platform with the bronze ships' beaks and the access stairs.
- [ ] **Tabularium:** the full facade, including the lower storey and the upper colonnade.
- [ ] **Meta Sudans and Colossus of Sol:** proper fountain cone and basin; a better figure for
  the colossus.
- [ ] **Palatine Stadium:** two-storey portico, the curved end, the imperial viewing box.
- [ ] **Capitoline:** the precinct of Jupiter, with porticoes, statues and the approach stairs.

### Open questions from checking the Forum of Augustus

- [ ] Temple plan: Italian Wikipedia gives 40 × 30 m against the model's 36 × 50, and it is unclear
  whether that excludes the steps.
- [ ] Forum width: Platner gives about 90 m for the rectangle, other sources 118 m with the halls;
  the model's body between the portico walls is 78 m.
- [ ] Firewall height: 36 m (Platner) or 33 m (others); the model uses 33.
- [ ] Niche and statue totals: 36 niches (Platner, whose own counts give 38), 25 named figures,
  108 statues. Scopes differ.
- [ ] The Hall of the Colossus, with a statue about 12 m high, at the head of one portico.
- [ ] A second order of africano columns above the hall screens, mentioned in one source.

### Missing from the city

- [ ] Aqueduct arches carrying water across the Caelian to the Palatine.
- [ ] Tiber bridges, Tiber Island, and the river front.
- [ ] The Campus Martius (Pantheon, Stadium of Domitian, theatres) lies beyond the modelled area.
  Extending the bounds would bring it in.

### Known weak spots in finished work

- [ ] The chariot horses in the Forum of Augustus are blocky. A better horse model would help
  every equestrian statue, including Trajan's and Caesar's.
- [ ] Statues are generic draped figures. Varied poses, armour and seated figures would help.
- [ ] The relief panels in the Forum of Nerva are generic figures, not the actual reliefs.
- [ ] Temple cellas are solid; none can be entered.
- [ ] Apartment blocks far from the jump-to places are simple boxes with painted windows.
- [ ] The Temple of Peace garden is paved between the beds; its lawn spread past the walls when the
  pad was coloured as a garden.

### Not yet checked up close

- [ ] Walking the new rows of seats in the Circus Maximus.
- [ ] The Domus Augustana at street level.
- [ ] The court of the Baths of Titus.
- [ ] Climbing from the porticoes into the half-round halls of the Forum of Augustus.

### Later

- [ ] People, carts and animals, once the buildings are convincing.
- [ ] A setting for render resolution, which is the biggest lever on frame time.
- [ ] Night, with the city lit by fire and lamps.
- [ ] A references page that ties each monument to its sources and marks what is conjecture.

## Sources

The model follows the standard literature, but nothing in it has yet been checked line by line
against these sources:

- L. Richardson Jr., *A New Topographical Dictionary of Ancient Rome* (1992).
- S. B. Platner and T. Ashby, *A Topographical Dictionary of Ancient Rome* (1929), free online
  at LacusCurtius.
- F. Coarelli, *Rome and Environs: An Archaeological Guide* (English edition, 2007).
- A. Carandini (ed.), *The Atlas of Ancient Rome* (2017).
- P. Zanker, *The Power of Images in the Age of Augustus* (1988).
- R. Meneghini and R. Santangeli Valenzani, *I Fori Imperiali: gli scavi del Comune di Roma
  1991–2007* (2007).

Notes in `src/sites.js` say which positions are conjectural.
