# FELIS / Motion Study 011

[中文](README.md) · **English**

## Run

```bash
npm install
npm run dev     # local preview at http://127.0.0.1:5173
npm test        # checks the motion and the mesh
npm run build   # static build in dist/
```

## Controls

- **View**: switch between side, 3/4 and front at the bottom. Drag to rotate, scroll to zoom.
- **Playback**:
  - Space plays or pauses; the left and right arrow keys step through the cycle.
  - Clicking a key pose or dragging the gait-cycle slider pauses there.
  - The speed slider sets the playback rate.
- **Display**: "Skeleton" shows the joints on their own; "X-ray" shows the lines hidden behind the body.
- **Top right**: switch between Chinese and English, and between light and dark mode. The page opens in Chinese and light mode and remembers your choice.

## Model

- **Geometry**:
  - One closed triangle mesh runs from the tail tip to the head, including the legs and both ears.
  - The upper arms and thighs join openings cut into the chest and waist, and the paws are continuous with the legs.
  - Limb cross-sections differ front to back, giving the elbow point, calf, Achilles tendon and heel.
  - The trunk is deep at the chest and narrow at the waist, and narrower than it is deep.
- **Head**:
  - Based on a short-haired black cat. The braincase, cheekbones, nose bridge, muzzle, chin, jaw and neck are blended into one solid, and the skin vertices are cast onto it (`src/head-shape.js`).
  - The ears are thin triangular shells growing from the crown, opening forward and outward.
- **Subdivision**:
  - The belly, thighs and head are refined across their triangles and placed on the smooth surface; the tail and lower legs are refined mainly along their length.
  - Topology and weights are built before playback and shared by the whole cycle.

## Motion

- **Footfalls**:
  - Each foot follows its own stance and swing path.
  - The two forefeet land 0.16 of a cycle apart, the two hind feet 0.10 apart.
  - When the hind legs are fully extended, the forelegs stay bent, tucked under the chin.
- **Ground contact**: planted feet move at ground speed. The swinging hind foot passes outside the forefoot on the same side.
- **From the front and behind**:
  - Paws land close to the midline.
  - The trunk rolls and shifts towards the loaded legs, and the loaded side's shoulder blade rises.
  - The head stays on the midline.
- **Tail**:
  - The tail only rises and falls in the vertical plane; it does not swing side to side.
  - The delay of the tail's motion grows from root to tip.
  - The tail is about six tenths of the head-and-body length.

## References

- [Muybridge, *Cat galloping* (Plate 720)](https://www.nga.gov/artworks/220472-plate-number-720-cat-galloping)
- [Research notes](references/RESEARCH.md) (in Chinese): sources, plus the design and proportion comparisons for each version.

The gait is drawn after the photographs; it is not measured motion-capture data.
