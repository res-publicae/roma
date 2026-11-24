# Statue meshes

Sculpted statues drawn by `src/statues.js`, one per statue role (see `statue()` in `src/geobuf.js`). Each has a near version (about
20,000 triangles, drawn within 45 m of the viewer) and a far version (about 2,500), one unit
tall, soles at the origin, facing +z, shape only: the city applies its own marble, bronze or
gilding.

They are made from photographs of complete ancient statues. Each photograph is turned into a mesh
by Microsoft TRELLIS.2 (MIT licence); the plinth in the photo is cut away, and the mesh is
simplified.

| Files | Role | Statue | Photograph | How |
|---|---|---|---|---|
| `togatus-*.glb` | magistrate | Togate statue, Rome | [Anonymous, CC0](https://commons.wikimedia.org/wiki/File:Rome_Statue_of_a_togatus.jpg) | local |
| `prima-porta-*.glb` | general | Augustus of Prima Porta, Vatican Museums | [Till Niermann, public domain](https://commons.wikimedia.org/wiki/File:Statue-Augustus.jpg) | online demo |
| `herculaneum-woman-*.glb` | woman | "Large Herculaneum Woman" type, National Archaeological Museum, Athens | [Gary Todd, CC0](https://commons.wikimedia.org/wiki/File:Ancient_Greece_Marble_Funerary_Statue_of_Large_Herculaneum_Woman,_1st_C._AD_Roman_Copy_of_c._320_BC_Greek_Original,_Found_in_Athens.jpg) | local |
| `via-labicana-*.glb` | priest | Augustus as priest (Via Labicana), Museo Nazionale Romano; the right forearm is lost | [Université de Louvain lantern slide, public domain](https://commons.wikimedia.org/wiki/File:Augustus_als_Pontifex_Maximus,_GD017875.jpg) | local |
| `dacian-*.glb` | dacian | Dacian prisoner, Louvre (Ma 1385), of the type that stood on the attic of the Forum of Trajan | [Marie-Lan Nguyen, public domain](https://commons.wikimedia.org/wiki/File:Dacian_prisoner_Louvre_Ma1385.jpg) | local |
| `caryatid-*.glb` | caryatid | Caryatid of the Erechtheion, British Museum (Sc 407), the model for the Forum of Augustus copies; forearms lost | [Marie-Lan Nguyen, public domain](https://commons.wikimedia.org/wiki/File:Caryatid_Erechtheion_BM_Sc407.jpg) | local |

"Online demo": TRELLIS.2 on its Hugging Face demo, which cleans up the mesh. "Local": the
trellis-mac port on Apple Silicon, whose meshes come out cracked, so they are rebuilt as a
closed surface (voxelised, holes closed, smoothed) before simplifying. That leaves their surfaces
slightly softer, with a few small pits.

Riders, charioteers and small figures keep the simple procedural figure: all the sculptures stand.

The source photographs are public domain or CC0, and these meshes are released under the
project's MIT licence.
