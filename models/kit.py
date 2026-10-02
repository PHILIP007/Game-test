# The modelling kit: every model script in this folder imports it (`from kit import *`), builds a model out of its
# words, keys three clips and calls `export(__file__)`. Run `npm run models` (all) or `npm run models -- crate` (some);
# the .glb lands next to its script and is committed, so the game builds without Blender. A new modelling word lands
# here, with a row in docs/declarative-ui.md (## Modelling kit), never in a model script.
#
# The rig contract the game relies on (when the game loads its first model, give it a loader that reads this contract
# and a test that checks every committed .glb against it):
#   - Blender +X is the model's forward, +Z up, one unit = the thing's collision radius (scenery: about a metre; say
#     which in the script's header).
#   - Materials are named only `body` (tinted by the thing's palette colour), `trim` (a second, darker surface: metal,
#     straps, rims), `glow` (unlit, blooms, in the palette colour) or `cloth` (the body colour darkened, rough, woven).
#     Colour is value-painted into the vertices here (top light, cavity shadow, edge highlight, brush noise, warm lights
#     and cool shadows); hue comes from CSS.
#   - Animations are NLA tracks named `idle` (loops), `attack` (one shot) and `die` (one shot, ends collapsed).
#   - Everything hangs under one empty called `rig`, so a clip can move the whole model.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Euler, noise
from mathutils.bvhtree import BVHTree

FPS = 30
MATERIALS = {'body': (0.8, 0.8, 0.8, 1), 'trim': (0.25, 0.25, 0.3, 1), 'glow': (1, 1, 1, 1), 'cloth': (0.3, 0.3, 0.3, 1)}
CLIPS = ('idle', 'attack', 'die')
D = math.radians


def _reset():
    """An empty scene with the four materials and the `rig` root. Runs when the kit is imported."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    for name, rgba in MATERIALS.items():
        m = bpy.data.materials.new(name)
        m.diffuse_color = rgba
    root = bpy.data.objects.new('rig', None)
    bpy.context.scene.collection.objects.link(root)
    return root


RIG = _reset()


# ---------- shapes: each returns a new object with one material ----------

def _obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(bpy.data.materials[mat])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _bevel(bm, width, segments=1):
    if width > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=width, segments=segments, affect='EDGES', clamp_overlap=True)


def _skin(bm, rings, seg, caps=True):
    """Quads between consecutive rings of `seg` verts (a 1-vert ring is a pole), caps on open ends (unless `caps` is
    off: a torus closes on itself); normals outward."""
    for lo, hi in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(lo) == 1 and len(hi) > 1: bm.faces.new((lo[0], hi[j], hi[i]))
            elif len(hi) == 1 and len(lo) > 1: bm.faces.new((lo[i], lo[j], hi[0]))
            elif len(lo) > 1: bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    for cap, flip in ((rings[0], True), (rings[-1], False)) if caps else ():
        if len(cap) > 1:
            f = bm.faces.new(cap)
            if flip: f.normal_flip()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def lathe(name, profile, mat='body', seg=16, caps=True):
    """A body of revolution around Z: `profile` is [(radius, z), ...] bottom to top; radius 0 closes a pole."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)) for a in (i / seg * math.tau for i in range(seg))])
    _skin(bm, rings, seg, caps)
    return _obj(name, bm, mat)


def tube(name, pts, radii, mat='body', seg=8):
    """A tube swept along the points [(x, y, z), ...] with a radius per point (or one for all; 0 closes a point):
    limbs, branches, roots, pipes, tails, rags."""
    pts = [Vector(p) for p in pts]
    radii = list(radii) if isinstance(radii, (list, tuple)) else [radii] * len(pts)
    bm = bmesh.new()
    n = (pts[1] - pts[0]).normalized().orthogonal().normalized()
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = (n - t * n.dot(t)).normalized()  # parallel transport: the ring doesn't twist along a bend
        b = t.cross(n)
        r = radii[i]
        if r <= 1e-6: rings.append([bm.verts.new(p)])
        else: rings.append([bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * r) for a in (k / seg * math.tau for k in range(seg))])
    _skin(bm, rings, seg)
    return _obj(name, bm, mat)


def slab(name, outline, depth, mat='body', bevel=0.03):
    """A flat 2D outline [(x, y), ...] extruded `depth` thick along Z (centred), edges bevelled: wings, fins, blades, plates."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, -depth / 2)) for x, y in outline])
    if f.normal.z > 0: f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, 0, depth), verts=[v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _bevel(bm, min(bevel, depth * 0.45))
    return _obj(name, bm, mat)


def box(name, size, mat='body', bevel=0.04):
    """A bevelled box of `size` (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    _bevel(bm, min(bevel, *[s * 0.45 for s in size]))
    return _obj(name, bm, mat)


def ball(name, r, mat='body', seg=14, rings=9):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return _obj(name, bm, mat)


def cone(name, r1, r2, depth, mat='body', seg=10, bevel=0.0):
    """Along +Z from 0 to `depth`, radius r1 at the base and r2 at the tip (r2 = r1 is a cylinder)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.translate(bm, vec=(0, 0, depth / 2), verts=bm.verts)
    _bevel(bm, bevel)
    return _obj(name, bm, mat)


def torus(name, R, r, mat='glow', seg=24, sides=6):
    """A ring in the XY plane."""
    return lathe(name, [(R + math.cos(a) * r, math.sin(a) * r) for a in (i / sides * math.tau for i in range(sides + 1))], mat, seg, caps=False)


# ---------- shaping ----------

def at(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=1):
    """Place an object: location, rotation in degrees (XYZ), scale (number or triple)."""
    ob.location = loc
    ob.rotation_euler = Euler([D(a) for a in rot])
    ob.scale = (scale,) * 3 if isinstance(scale, (int, float)) else scale
    return ob


def deform(ob, fn):
    """Move every vertex (local space): fn(Vector) -> Vector. Taper, bulge, bend, squash."""
    for v in ob.data.vertices:
        v.co = fn(v.co.copy())
    ob.data.update()
    return ob


def rough(ob, amp=0.04, freq=3.0, seed=0):
    """Push every vertex along its normal by noise: bark, rot, stone, torn cloth. Smooth first for enough vertices."""
    for v in ob.data.vertices:
        v.co += v.normal * amp * noise.noise(v.co * freq + Vector((seed * 7.1, seed * 3.3, 0)))
    ob.data.update()
    return ob


def smooth(ob, levels=1):
    """Subdivide (applied), for soft chunky forms and enough vertices to hold the paint."""
    m = ob.modifiers.new('sub', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    _apply(ob)
    return ob


def _apply(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)


def _bake(ob):
    """Fold the object's transform into its mesh (world space), leaving an identity transform."""
    ob.data.transform(ob.matrix_basis)
    if ob.matrix_basis.determinant() < 0: ob.data.flip_normals()
    ob.matrix_basis = Matrix.Identity(4)


def shell(ob, thickness=0.05):
    """Give an open surface a thickness (applied), so a hood or a cup reads from inside too."""
    m = ob.modifiers.new('solid', 'SOLIDIFY')
    m.thickness = thickness
    m.offset = 0
    _apply(ob)
    return ob


def cut(ob, keep):
    """Delete the faces whose centre (local space) fails keep(Vector): open a hood, split a shell into plates."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median())], context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def _join(obs):
    obs = [o for o in obs if o is not None]
    for o in obs: _bake(o)
    base = obs[0]
    if len(obs) > 1:
        with bpy.context.temp_override(active_object=base, selected_editable_objects=obs, selected_objects=obs):
            bpy.ops.object.join()
    return base


def fuse(name, *obs, voxel=0.03, keep=0.5):
    """Melt shapes into one organic mesh: a voxel remesh of their union (`voxel` units per cell), decimated to `keep`
    of its faces. Organic lumps, heaped earth, a sculpted head. One material: the first shape's."""
    base = _join(obs)
    m = base.modifiers.new('remesh', 'REMESH')
    m.mode, m.voxel_size, m.adaptivity = 'VOXEL', voxel, 0.0
    _apply(base)
    if keep < 1:
        d = base.modifiers.new('decimate', 'DECIMATE')
        d.ratio = keep
        _apply(base)
    base.name = base.data.name = name
    return base


def carve(ob, *cutters):
    """Cut the cutters' volumes out of `ob` (boolean difference; the cutters are deleted): sockets, a hollow."""
    for c in cutters:
        m = ob.modifiers.new('carve', 'BOOLEAN')
        m.operation, m.object, m.solver = 'DIFFERENCE', c, 'EXACT'
        _apply(ob)
        bpy.data.objects.remove(c, do_unlink=True)
    return ob


def aim(ob, direction, loc=(0, 0, 0)):
    """Place `ob` at `loc` with its local +Z pointing along `direction` (spikes, legs, barrels built along Z)."""
    ob.matrix_basis = Matrix.Translation(loc) @ Vector(direction).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4() @ Matrix.Diagonal((*ob.scale, 1))
    return ob


def sphere_dirs(n, zmin=-1.0):
    """`n` evenly spread unit directions (a Fibonacci sphere), keeping those with z >= zmin."""
    out = []
    for i in range(n):
        z = 1 - (i + 0.5) / n * 2
        r = math.sqrt(max(0, 1 - z * z))
        a = i * 2.39996
        if z >= zmin: out.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
    return out


def part(name, *obs, pivot=(0, 0, 0), parent=None):
    """Merge objects (materials kept) into one rig part named `name`, pivoting at `pivot`, hung from `parent` (or the
    rig). A part is what a clip moves; everything that moves together should be one part (one draw per material)."""
    obs = [o for o in obs if o is not None]
    for o in obs: _bake(o)
    base = obs[0]
    if len(obs) > 1:
        with bpy.context.temp_override(active_object=base, selected_editable_objects=obs, selected_objects=obs):
            bpy.ops.object.join()
    base.name = base.data.name = name
    base.data.transform(Matrix.Translation(-Vector(pivot)))
    p = parent or RIG
    bpy.context.view_layer.update()  # matrix_world is lazy: a parent placed a moment ago must be evaluated first
    base.parent = p
    # Parts are authored in model space; a parent at rest is only ever translated, so the child's local offset is
    # the difference. No parent inverse: the glTF exporter bakes those into every sampled frame, dragging in the
    # held poses of other clips.
    base.matrix_parent_inverse = Matrix.Identity(4)
    base.location = Vector(pivot) - p.matrix_world.translation
    return base


# ---------- clips ----------

def key(ob, clip, frames, linear=False):
    """Key `ob` in `clip`: frames are (seconds, {loc, rot, scale}) relative to its rest pose (loc added, rot degrees
    added, scale multiplied). Channels a frame leaves out are keyed at rest. `linear` for constant spins and loops."""
    rest_l, rest_r, rest_s = ob.location.copy(), ob.rotation_euler.copy(), ob.scale.copy()
    ob.animation_data_create()
    if clip in ob.animation_data.nla_tracks: raise SystemExit(f'{ob.name}: already has a "{clip}" clip (one key/loop/spin per part per clip)')
    act = bpy.data.actions.new(f'{ob.name}.{clip}')
    ob.animation_data.action = act
    # Every channel is keyed, unkeyed ones at rest: the exporter samples other clips' held poses into any channel a
    # clip leaves free (a wing would idle where it lands when it dies).
    chans = {'loc', 'rot', 'scale'}
    for t, k in frames:
        f = 1 + t * FPS
        if 'loc' in chans:
            ob.location = rest_l + Vector(k.get('loc', (0, 0, 0)))
            ob.keyframe_insert('location', frame=f)
        if 'rot' in chans:
            r = k.get('rot', (0, 0, 0))
            ob.rotation_euler = Euler([rest_r[i] + D(r[i]) for i in range(3)])
            ob.keyframe_insert('rotation_euler', frame=f)
        if 'scale' in chans:
            s = k.get('scale', 1)
            s = (s,) * 3 if isinstance(s, (int, float)) else s
            ob.scale = Vector([rest_s[i] * s[i] for i in range(3)])
            ob.keyframe_insert('scale', frame=f)
    if linear:
        for fc in _fcurves(act):
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    slot = ob.animation_data.action_slot
    ob.animation_data.action = None
    ob.location, ob.rotation_euler, ob.scale = rest_l, rest_r, rest_s
    track = ob.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, act)
    strip.action_slot = slot
    return ob


def _fcurves(act):
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def loop(ob, period, n=1, steps=8, phase=0.0, **k):
    """An idle loop: a sine of amplitude `k` (loc/rot/scale deltas) over `period` s, `n` cycles, ending where it began.
    Keep `period / steps` at or above one frame (1/30 s): a flutter is period 4/30 with steps 4. `phase` in turns."""
    frames = []
    for i in range(steps * n + 1):
        t = i / steps * period
        s = math.sin((i / steps + phase) * math.tau)
        frame = {}
        if 'loc' in k: frame['loc'] = tuple(c * s for c in k['loc'])
        if 'rot' in k: frame['rot'] = tuple(c * s for c in k['rot'])
        if 'scale' in k: frame['scale'] = 1 + k['scale'] * s
        frames.append((t, frame))
    return key(ob, 'idle', frames)


def spin(ob, clip, period, turns=1, axis=2, ccw=True):
    """A constant spin: `turns` whole turns over `period` s about local `axis` (0 X, 1 Y, 2 Z)."""
    frames = []
    for i in range(4 * turns + 1):
        r = [0, 0, 0]
        r[axis] = i * 90 * (1 if ccw else -1)
        frames.append((i / (4 * turns) * period, {'rot': tuple(r)}))
    return key(ob, clip, frames, linear=True)


def still(ob, clips=CLIPS):
    """Scenery's clips: an imperceptible settle in each of `clips` (the glTF exporter drops a clip that doesn't move,
    and the rig contract wants all three)."""
    for c in clips:
        key(ob, c, [(0, {}), (0.5, {'rot': (0.3, 0, 0)}), (1.0, {})])


def burst_apart(parts, dur=0.7, fling=1.2, rise=0.6, seed=1):
    """A generic `die`: each part flies out from the centre, tumbles and shrinks to nothing; the rig sinks and squashes."""
    bpy.context.view_layer.update()
    for i, ob in enumerate(parts):
        c = Vector(ob.matrix_world.translation)
        d = Vector((c.x, c.y, 0))
        d = d.normalized() if d.length > 1e-3 else Vector((math.cos(i * 2.4 + seed), math.sin(i * 2.4 + seed), 0))
        spin_axis = [(i * 131 + seed * 37) % 360 - 180, (i * 71 + seed * 13) % 360 - 180, (i * 53) % 180]
        key(ob, 'die', [
            (0, {'loc': (0, 0, 0), 'rot': (0, 0, 0), 'scale': 1}),
            (dur * 0.25, {'loc': tuple(d * fling * 0.5 + Vector((0, 0, rise))), 'rot': tuple(a * 0.4 for a in spin_axis), 'scale': 1.15}),
            (dur, {'loc': tuple(d * fling + Vector((0, 0, -0.2))), 'rot': tuple(spin_axis), 'scale': 0.01}),
        ])
    key(RIG, 'die', [(0, {'scale': 1}), (dur * 0.15, {'scale': (1.15, 1.15, 0.85)}), (dur, {'scale': (1, 1, 0.6)})])


# ---------- paint and export ----------

def _smooth_normals(ob, sharp_deg):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        e.smooth = not (e.is_boundary or (len(e.link_faces) == 2 and e.calc_face_angle(0) > D(sharp_deg)))
    bm.to_mesh(ob.data)
    bm.free()


def _paint(ob, zmin, zmax, seed, bvh):
    """Value painting in the vertices: light from above, dark underneath, cavities shadowed, convex edges caught,
    a low brush noise so flat faces don't read as plastic, warm lights and cool shadows."""
    me = ob.data
    glow = me.materials[0].name == 'glow' if len(me.materials) == 1 else False
    mw = ob.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    cav = []
    for v in bm.verts:
        n = v.normal
        acc = [n.dot((e.other_vert(v).co - v.co).normalized()) for e in v.link_edges if (e.other_vert(v).co - v.co).length > 1e-6]
        cav.append(sum(acc) / len(acc) if acc else 0)
    bm.free()
    attr = me.color_attributes.new('Color', 'BYTE_COLOR', 'POINT')
    pz = [(mw @ v.co).z for v in me.vertices]
    lo, hi = min(pz), max(pz)
    for i, v in enumerate(me.vertices):
        p = mw @ v.co
        n = (nm @ v.normal).normalized()
        # Half the gradient runs over the whole model, half over this part, so every piece has its own light-to-dark.
        h = 0.5 * (p.z - zmin) / max(1e-3, zmax - zmin) + 0.5 * (p.z - lo) / max(1e-3, hi - lo)
        if glow:
            # Hot centre fading to the rim: brighter where the surface faces the camera.
            val = 0.55 + 0.45 * max(0, n.z) + 0.1 * noise.noise(p * 4 + Vector((seed, 0, 0)))
            attr.data[i].color = (min(1, val * 1.05), min(1, val), min(1, val * 0.97), 1)
            continue
        # The game's camera looks down, so most of the value has to live in how much a surface faces up: tops bright,
        # flanks falling off to dark rims (that is what gives a sphere its volume from above), undersides darkest.
        val = 0.16 + 0.26 * h + 0.55 * max(0, n.z) ** 1.5 - 0.1 * max(0, -n.z)
        c = max(-1, min(1, cav[i] * 4))
        val += -0.3 * c if c < 0 else -0.35 * c  # convex edges catch light, cavities shadow
        val += 0.12 * noise.noise(p * 3.5 + Vector((seed, seed, 0))) + 0.06 * noise.noise(p * 11)
        val *= 1 - 0.65 * _occlusion(bvh, p, n)
        val = max(0.12, min(1.0, val))
        warm = max(0, min(1, (val - 0.45) * 2))
        r = val * (0.8 + 0.28 * warm)
        g = val * (0.8 + 0.2 * warm)
        b = val * (1.12 - 0.26 * warm)
        attr.data[i].color = (min(1, r), min(1, g), min(1, b), 1)
    me.color_attributes.active_color = attr


# Fixed hemisphere of ray directions (around +Z) for the ambient-occlusion bake.
_AO_DIRS = [Vector((math.cos(i * 2.39996) * math.sqrt(1 - (0.15 + 0.85 * (i + 0.5) / 12) ** 2), math.sin(i * 2.39996) * math.sqrt(1 - (0.15 + 0.85 * (i + 0.5) / 12) ** 2), 0.15 + 0.85 * (i + 0.5) / 12)) for i in range(12)]
AO_REACH = 0.45


def _occlusion(bvh, p, n):
    """How much of the sky a vertex can't see (0..1): rays over its hemisphere against every mesh in the model."""
    rot = Vector((0, 0, 1)).rotation_difference(n)
    hit = sum(1 for d in _AO_DIRS if bvh.ray_cast(p + n * 0.01, rot @ d, AO_REACH)[0] is not None)
    return hit / len(_AO_DIRS)


def export(script, sharp_deg=40, seed=0):
    """Paint every mesh and write `<script name>.glb` next to the script."""
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in meshes:
        bad = [m.name for m in o.data.materials if m.name not in MATERIALS]
        if bad: raise SystemExit(f'{o.name}: materials must be body/trim/glow/cloth, got {bad}')
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    verts, polys = [], []
    for o in meshes:
        base = len(verts)
        verts += [o.matrix_world @ v.co for v in o.data.vertices]
        polys += [[base + i for i in p.vertices] for p in o.data.polygons]
    bvh = BVHTree.FromPolygons(verts, polys)
    for o in meshes:
        for uv in list(o.data.uv_layers): o.data.uv_layers.remove(uv)
        _smooth_normals(o, sharp_deg)
        _paint(o, min(zs), max(zs), seed, bvh)
    clips = {t.name for o in bpy.context.scene.objects if o.animation_data for t in o.animation_data.nla_tracks}
    if clips != set(CLIPS): raise SystemExit(f'clips must be {CLIPS}, got {sorted(clips)}')
    out = os.path.splitext(os.path.abspath(script))[0] + '.glb'
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='NLA_TRACKS', export_vertex_color='ACTIVE',
                              export_texcoords=False, export_extras=False, export_yup=True, export_apply=True, export_materials='EXPORT',
                              export_force_sampling=False, export_optimize_animation_size=True)
    tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    print(f'MODEL {os.path.basename(out)}: {len(meshes)} parts, {tris} tris, {os.path.getsize(out) // 1024} KB')
