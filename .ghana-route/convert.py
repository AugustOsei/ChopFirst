import json, math, sys

raw = json.load(open('.ghana-route/raw.json'))
coords = raw['routes'][0]['geometry']['coordinates']  # [lon,lat]
# drop duplicate closing point
if coords[0] == coords[-1]:
    coords = coords[:-1]

lons = [c[0] for c in coords]
lats = [c[1] for c in coords]
lat0 = sum(lats) / len(lats)
lon0 = sum(lons) / len(lons)
mE = 111320.0 * math.cos(math.radians(lat0))
mN = 110574.0

# project to local meters: east -> x, north -> z
pts = [((lon - lon0) * mE, (lat - lat0) * mN) for lon, lat in coords]

def dist(a, b):
    return math.hypot(a[0]-b[0], a[1]-b[1])

def seg_int(a, b, c, d):
    # proper intersection point of segments ab, cd (None if they don't cross)
    r = (b[0]-a[0], b[1]-a[1])
    s = (d[0]-c[0], d[1]-c[1])
    denom = r[0]*s[1] - r[1]*s[0]
    if abs(denom) < 1e-9:
        return None
    t = ((c[0]-a[0])*s[1] - (c[1]-a[1])*s[0]) / denom
    u = ((c[0]-a[0])*r[1] - (c[1]-a[1])*r[0]) / denom
    if 1e-6 < t < 1-1e-6 and 1e-6 < u < 1-1e-6:
        return (a[0]+t*r[0], a[1]+t*r[1])
    return None

def arclen(seq):
    return sum(dist(seq[i], seq[i+1]) for i in range(len(seq)-1)) if len(seq) > 1 else 0.0

def make_simple(p):
    # Repeatedly resolve the first self-intersection by dropping the shorter arc,
    # turning a knotted driving route (with U-turn spurs) into a simple loop.
    for _ in range(2000):
        n = len(p)
        found = False
        for i in range(n):
            ai, bi = p[i], p[(i+1) % n]
            for j in range(i+2, n):
                if i == 0 and j == n-1:
                    continue  # edges meet at p[0]
                aj, bj = p[j], p[(j+1) % n]
                X = seg_int(ai, bi, aj, bj)
                if X:
                    arc1 = p[i+1:j+1]            # between the two edges
                    arc2 = p[j+1:] + p[:i+1]     # the rest
                    if arclen([ai]+arc1+[bj]) <= arclen([aj]+arc2+[bi]):
                        p = p[:i+1] + [X] + p[j+1:]   # drop arc1
                    else:
                        p = [X] + p[i+1:j+1]          # keep arc1 as the loop
                    found = True
                    break
            if found:
                break
        if not found:
            break
    return p

def turn(a, b, c):
    v1 = math.atan2(b[1]-a[1], b[0]-a[0])
    v2 = math.atan2(c[1]-b[1], c[0]-b[0])
    d = (math.degrees(v2 - v1) + 180) % 360 - 180
    return abs(d)

def remove_spurs(p, thresh=50, max_iter=80):
    # Collapse U-turn needles: find the sharpest reversal, walk outward along the
    # two overlapping legs until they diverge at the junction, drop the needle.
    for _ in range(max_iter):
        n = len(p)
        tip, best = -1, 150
        for i in range(n):
            ang = turn(p[(i-1) % n], p[i], p[(i+1) % n])
            if ang > best:
                best, tip = ang, i
        if tip < 0:
            break
        L, R, steps = tip-1, tip+1, 0
        while steps < n//2 - 1 and dist(p[L % n], p[R % n]) < thresh:
            L -= 1; R += 1; steps += 1
        Lm, Rm = L % n, R % n
        remove, k = set(), (Lm+1) % n
        while k != Rm:
            remove.add(k); k = (k+1) % n
        if not remove or len(remove) >= n-3:
            break
        p = [p[i] for i in range(n) if i not in remove]
    return p

pts = make_simple(pts)
pts = remove_spurs(pts)
pts = make_simple(pts)

# total length
total = sum(dist(pts[i], pts[(i+1) % len(pts)]) for i in range(len(pts)))

# Douglas-Peucker simplification (open chain on the loop; keep it closed by
# running on the sequence and re-closing)
def dp(points, eps):
    if len(points) < 3:
        return points
    # perpendicular distance based DP
    def rec(a, b, seg):
        if not seg:
            return []
        ax, az = points[a]; bx, bz = points[b]
        dx, dz = bx-ax, bz-az
        L = math.hypot(dx, dz) or 1e-9
        nx, nz = -dz/L, dx/L
        dmax, idx = -1, -1
        for i in seg:
            px, pz = points[i]
            d = abs((px-ax)*nx + (pz-az)*nz)
            if d > dmax:
                dmax, idx = d, i
        if dmax > eps:
            left = [i for i in seg if i < idx]
            right = [i for i in seg if i > idx]
            return rec(a, idx, left) + [idx] + rec(idx, b, right)
        return []
    keep = [0] + rec(0, len(points)-1, list(range(1, len(points)-1))) + [len(points)-1]
    return [points[i] for i in sorted(set(keep))]

scale = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
eps = float(sys.argv[2]) if len(sys.argv) > 2 else 10.0

simp = dp(pts, eps)
# enforce a minimum spacing so the closing wrap isn't too tight
cleaned = [simp[0]]
for p in simp[1:]:
    if dist(p, cleaned[-1]) > 6:
        cleaned.append(p)
# avoid first/last being almost coincident (closed loop adds the wrap)
if dist(cleaned[0], cleaned[-1]) < 6:
    cleaned = cleaned[:-1]

def drop_needles(seq, tol=14):
    changed = True
    while changed and len(seq) > 5:
        changed = False
        m = len(seq)
        for i in range(m):
            if dist(seq[(i-1) % m], seq[(i+1) % m]) < tol:
                del seq[i]; changed = True; break
    return seq

# Final stabilization: DP can reintroduce crossings, so un-knot + de-needle the
# simplified loop until it is a guaranteed-simple polygon.
for _ in range(8):
    cleaned = drop_needles(cleaned)
    fixed = make_simple(cleaned)
    if len(fixed) == len(cleaned):
        cleaned = fixed
        break
    cleaned = fixed

# apply scale and recenter to a world origin near (140,140)-style positive space
scaled = [(x*scale, z*scale) for (x, z) in cleaned]
# recenter so the centroid sits at origin, then we let the track module place center
cx = sum(p[0] for p in scaled)/len(scaled)
cz = sum(p[1] for p in scaled)/len(scaled)
scaled = [(round(x-cx, 1), round(z-cz, 1)) for (x, z) in scaled]

simp_len = sum(dist(scaled[i], scaled[(i+1) % len(scaled)]) for i in range(len(scaled)))

print(f'raw_pts {len(pts)} total_len_m {total:.0f}')
print(f'simplified_pts {len(scaled)} scale {scale} eps {eps} loop_len_m {simp_len:.0f}')

# bounds
xs = [p[0] for p in scaled]; zs = [p[1] for p in scaled]
print(f'x [{min(xs):.0f},{max(xs):.0f}] z [{min(zs):.0f},{max(zs):.0f}]')

json.dump(scaled, open('.ghana-route/control_points.json', 'w'))

# project named landmarks through the identical transform for labelling
LANDMARKS = {
    'Danquah Circle (Osu)': (-0.1808, 5.5660),
    '37 Military Hospital': (-0.1841, 5.5886),
    'Cantonments': (-0.1720, 5.5745),
    'Oxford Street (Osu)': (-0.1805, 5.5575),
}
lm_out = {}
for name, (lon, lat) in LANDMARKS.items():
    x = (lon - lon0) * mE * scale - cx
    z = (lat - lat0) * mN * scale - cz
    lm_out[name] = [round(x, 1), round(z, 1)]
json.dump(lm_out, open('.ghana-route/landmarks.json', 'w'))

# SVG preview
minx, maxx = min(xs), max(xs); minz, maxz = min(zs), max(zs)
pad = 40
W = (maxx-minx)+2*pad; H = (maxz-minz)+2*pad
def tx(x): return x-minx+pad
def tz(z): return z-minz+pad
path = ' '.join(f'{"M" if i==0 else "L"}{tx(x):.0f},{tz(z):.0f}' for i,(x,z) in enumerate(scaled)) + ' Z'
dots = ''.join(f'<circle cx="{tx(x):.0f}" cy="{tz(z):.0f}" r="3" fill="red"/>' for x,z in scaled)
start = scaled[0]
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}"><rect width="100%" height="100%" fill="#0b1722"/><path d="{path}" fill="none" stroke="#ffd45e" stroke-width="3"/>{dots}<circle cx="{tx(start[0]):.0f}" cy="{tz(start[1]):.0f}" r="6" fill="#39d98a"/></svg>'
open('.ghana-route/preview.svg','w').write(svg)
print('wrote control_points.json and preview.svg')
