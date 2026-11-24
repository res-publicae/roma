# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-23

First version: a walkable model of central Rome in AD 180, running in the browser
with no build step.

### Added

- **City and terrain:** a height field of the valleys and hills, with the Tiber; 47
  monuments placed from their real coordinates or published plans, filtered to those
  standing in AD 180; about 4,600 apartment blocks on street grids that change from
  district to district; umbrella pines and cypresses on the hills and in gardens.
- **Walking and flying:** first-person movement with collision, stairs and ramps; floors
  above floors, so upper storeys and galleries can be walked on; nine places to jump to.
- **Rendering:** sky and sun following the time of day (06:30–19:00), four-cascade sun
  shadows, ambient occlusion, bloom, film grade, dust haze that thickens in the valleys,
  and weathering on every surface (stains, streaks, dirt at the foot of walls, lichen on
  roofs).
- **Materials:** columns in white marble, grey granite, red granite, yellow marble or
  cipollino; coffered ceilings under every temple colonnade.
- **Textures:** Poly Haven photo textures stored locally, plus textures generated at load
  time for marble, travertine, inlaid floors, coffered ceilings and basalt paving.
- **Forum Romanum:** temples with modelled Corinthian columns, mouldings, bronze doors and
  pediment figures; the basilicas Julia and Aemilia with two-storey arcades, coffered
  ceilings and inlaid floors; statues, honorary columns and altars in the square.
- **Colosseum:** stepped seating in three tiers; engaged columns and statues in the
  arcades; the awning on its masts; the arena with trapdoors, cages, weapon racks and the
  imperial and magistrates' boxes; a ring corridor with stalls, benches, statues and
  braziers; two staircases from the street to the top gallery; parapets on the upper
  arches.
- **Arch of Titus:** coffered passage, carved panels, attic inscription and a gilded
  four-horse chariot.
- **Temple of Venus and Roma:** a second front with steps and doors, and granite
  porticoes along the precinct.
- **Trajan's Forum:** triumphal gateway, raised porticoes with Dacian prisoners and gilded
  shields, the equestrian statue, Trajan's Column with its spiral relief, and the two
  libraries with marble porches.
- **Forum of Augustus:** the Temple of Mars the Avenger with columns on three sides only, its back
  against a 32 m firewall of squared stone; porticoes of yellow marble columns whose attic is
  carried by maidens with carved shields between them; statue niches along the portico walls;
  two half-round halls with two tiers of statues under coffered ceilings; Augustus in a gilded
  four-horse chariot.
- **Forum of Caesar:** double porticoes on three sides, the Temple of Venus Genetrix with
  fountains of nymphs at its steps, Caesar on horseback, and two storeys of brick shops facing
  the Clivus Argentarius.
- **Forum of Nerva:** columns standing just clear of the long walls, the entablature and attic
  breaking forward over each one, relief panels between, and the Temple of Minerva.
- **Temple of Peace:** porticoes of red granite on three sides, the temple standing in line with
  them between two halls with bronze doors, and a garden of six raised rose beds either side of
  a water channel, with Greek bronzes on pedestals.
- **Markets of Trajan:** shops with travertine doorways and stock inside, arched upper
  windows, a terrace with a second row of shops, and the market hall.
- **Palatine palaces:** marble-faced lower storeys, painted stucco above, columned end
  porticoes, state halls with bronze doors, and a colonnaded garden court with a pool.
- **Circus Maximus:** stepped seating with walkways, a roofed top gallery, an arcaded
  facade, the imperial box, twelve starting gates, and the central barrier with its
  basins, obelisk, lap counters, shrines and turning posts.
- **Baths of Trajan and of Titus:** swimming pool behind a wall of statue niches, cold hall
  with half-round clerestory windows, hot hall with an apse, lead-covered domes, and two
  colonnaded exercise courts.
- **Streets:** built shop fronts, windows and shutters near the walking places; raised
  pavements, kerbs, stepping stones and fountains on side streets and main roads.
- **Firelight:** animated brazier flames that light the corridors around them at dusk.
- **Project:** README with screenshots, and a GitHub Pages workflow that publishes the site.

[0.1.0]: https://github.com/res-publicae/roma/releases/tag/v0.1.0
