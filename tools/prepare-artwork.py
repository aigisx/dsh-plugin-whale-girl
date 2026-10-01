"""
One-off artwork preparation for the whale-girl theme.

Turns an illustration on a flat light background into the transparent PNGs the
client bundle wants:

  assets/icon.png      trimmed, square-padded, 256x256 RGBA   (mark)
  assets/running.png   solid alpha silhouette, 64x64 RGBA     (running mask)
  assets/favicon.png   64x64 RGBA                             (tab icon)

Two details make or break the result, and both are handled here:

* The background is removed by a **border-connected flood fill**, never by a
  global "is it white" test. A white ruffled headdress, a white lace collar or
  white fin frills sit inside the character and must survive.
* Every downscale runs on **premultiplied** colour. Resizing straight RGBA pulls
  the removed white background into the edge pixels and leaves a pale halo on
  dark surfaces.

Needs numpy and Pillow. It is not part of the plugin runtime or its build; re-run
it only when the source illustration changes.

Usage:
    python tools/prepare-artwork.py "<source image>" [--crop x0,y0,x1,y1]
                                    [--erase x0,y0,x1,y1]...
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
# Near-white and unsaturated: the flat page colour of the source illustration.
WHITE_MIN_CHANNEL = 242
WHITE_MAX_SPREAD = 12
# Foreground pixels touching that background keep a partial alpha derived from how
# far they are from white, which removes the keyed-in halo without a hard cut.
EDGE_WHITE_SPAN = 48
# Alpha this faint is not artwork; it only exists to trim the canvas.
TRIM_ALPHA = 8
# Largest enclosed page-colour pocket still treated as a keying artefact rather than
# as white detail. The ceiling scales with the source area: measured artwork puts the
# real pockets one to two orders of magnitude above the artefacts (32 px vs 2321 px
# on a 1536x1536 source).
SPECK_AREA_DIVISOR = 12000
SPECK_MIN_PIXELS = 64
# Annulus the replacement colour is read from: far enough out to clear the
# anti-aliased blend around the pocket, close enough to stay in the same shape.
SPEC_RING_INNER = 3
SPEC_RING_OUTER = 7
# Pixels of anti-aliased blend painted over beyond the pocket itself.
SPEC_GROW = 2
# Colour quantisation used to pick the dominant neighbouring colour family.
SPEC_COLOUR_BUCKET = 16
MARK_PIXELS = 256
SMALL_PIXELS = 128
RUNNING_PIXELS = 64
FAVICON_PIXELS = 64
MARK_MARGIN = 0.04


def parse_rect(text, what):
    parts = text.replace(" ", "").split(",")
    if len(parts) != 4:
        raise SystemExit(f"prepare-artwork: {what} wants x0,y0,x1,y1, got {text!r}")
    try:
        return tuple(int(part) for part in parts)
    except ValueError:
        raise SystemExit(f"prepare-artwork: {what} wants four integers, got {text!r}")


def border_connected_background(rgb):
    """Flood-fill the page colour inward from the border, so interior whites survive."""
    height, width, _ = rgb.shape
    low = rgb.min(axis=2)
    spread = rgb.max(axis=2) - low
    white = (low >= WHITE_MIN_CHANNEL) & (spread <= WHITE_MAX_SPREAD)
    background = np.zeros((height, width), dtype=bool)
    frontier = np.zeros((height, width), dtype=bool)
    frontier[0, :] = white[0, :]
    frontier[-1, :] = white[-1, :]
    frontier[:, 0] = white[:, 0]
    frontier[:, -1] = white[:, -1]
    frontier &= ~background
    while frontier.any():
        background |= frontier
        grown = np.zeros_like(frontier)
        grown[1:, :] |= frontier[:-1, :]
        grown[:-1, :] |= frontier[1:, :]
        grown[:, 1:] |= frontier[:, :-1]
        grown[:, :-1] |= frontier[:, 1:]
        frontier = grown & white & ~background
    return background, low


def dilate(mask, radius):
    """Grow a boolean mask by `radius` pixels along the four axes."""
    grown = mask.copy()
    for _ in range(radius):
        step = grown.copy()
        step[1:, :] |= grown[:-1, :]
        step[:-1, :] |= grown[1:, :]
        step[:, 1:] |= grown[:, :-1]
        step[:, :-1] |= grown[:, 1:]
        grown = step
    return grown


def label_components(mask):
    """Yield (component mask, pixel count) for each 4-connected blob in `mask`."""
    height, width = mask.shape
    unseen = mask.copy()
    while unseen.any():
        seed = np.argwhere(unseen)[0]
        component = np.zeros((height, width), dtype=bool)
        component[seed[0], seed[1]] = True
        unseen[seed[0], seed[1]] = False
        frontier = component.copy()
        count = 1
        while True:
            step = np.zeros_like(frontier)
            step[1:, :] |= frontier[:-1, :]
            step[:-1, :] |= frontier[1:, :]
            step[:, 1:] |= frontier[:, :-1]
            step[:, :-1] |= frontier[:, 1:]
            grown = step & unseen
            if not grown.any():
                break
            unseen &= ~grown
            component |= grown
            frontier = grown
            count += int(grown.sum())
        yield component, count


def heal_specks(rgb, background, white, max_pixels):
    """
    Repaint tiny enclosed page-colour pockets with the surrounding artwork colour.

    A border-connected flood fill keeps every enclosed white — which is exactly what
    the ruffles and lace need — but it also keeps keying artefacts: a few-pixel
    white pocket pinched off inside a dark area survives the trim and shows up as a
    pale dot at large icon sizes. Real white detail (a face, a trim band) is one to
    two orders of magnitude larger, so an area threshold separates them cleanly.

    The replacement colour is the dominant colour family of an annulus a few pixels
    out. Sampling the immediate ring instead would land on the anti-aliased blend
    between the pocket and the artwork and leave a visibly grey patch.

    @param rgb - mutable source colour array.
    @param background - border-connected page colour, updated in place.
    @param white - the near-white candidate mask.
    @param max_pixels - largest pocket area still treated as an artefact.
    @returns the number of pockets healed and the pixels repainted.
    """
    enclosed = white & ~background
    if not enclosed.any():
        return 0, 0
    healed = 0
    pixels = 0
    for component, count in label_components(enclosed):
        if count > max_pixels:
            continue
        ring = dilate(component, SPEC_RING_OUTER) & ~dilate(component, SPEC_RING_INNER) & ~background & ~white
        if not ring.any():
            ring = dilate(component, SPEC_RING_INNER) & ~component & ~background & ~white
        if not ring.any():
            continue
        samples = rgb[ring].reshape(-1, 3).astype(np.int32)
        buckets = samples // SPEC_COLOUR_BUCKET
        keys, counts = np.unique(buckets, axis=0, return_counts=True)
        winner = keys[int(counts.argmax())]
        family = samples[(buckets == winner).all(axis=1)]
        colour = np.median(family, axis=0).astype(np.int16)
        # Paint past the pocket itself: the pixels between it and the artwork are the
        # anti-aliased blend that made the artefact visible in the first place, and
        # leaving them behind keeps a grey halo around the repair.
        paint = dilate(component, SPEC_GROW) & ~background
        rgb[paint] = colour
        healed += 1
        pixels += int(paint.sum())
        print(f"  healed pocket of {count} px at {tuple(int(v) for v in np.argwhere(component).min(axis=0)[::-1])} -> rgb{tuple(int(v) for v in colour)}")
    return healed, pixels


def alpha_plane(background, low):
    """Full alpha inside, zero on the page colour, a soft ramp on the touched edge."""
    alpha = np.where(background, 0.0, 255.0)
    touching = np.zeros_like(background)
    touching[1:, :] |= background[:-1, :]
    touching[:-1, :] |= background[1:, :]
    touching[:, 1:] |= background[:, :-1]
    touching[:, :-1] |= background[:, 1:]
    edge = touching & ~background
    ramp = np.clip((255.0 - low.astype(np.float64)) * 255.0 / EDGE_WHITE_SPAN, 0.0, 255.0)
    alpha[edge] = ramp[edge]
    return alpha.astype(np.uint8)


def crop_centered(rgb, alpha, center_x, center_y, side):
    """Cut a square canvas around one centre, padding past the source edges."""
    left = int(center_x) - side // 2
    top = int(center_y) - side // 2
    out_rgb = np.zeros((side, side, 3), dtype=np.uint8)
    out_alpha = np.zeros((side, side), dtype=np.uint8)
    sx0, sy0 = max(0, left), max(0, top)
    sx1, sy1 = min(rgb.shape[1], left + side), min(rgb.shape[0], top + side)
    dx, dy = sx0 - left, sy0 - top
    out_rgb[dy:dy + (sy1 - sy0), dx:dx + (sx1 - sx0)] = rgb[sy0:sy1, sx0:sx1]
    out_alpha[dy:dy + (sy1 - sy0), dx:dx + (sx1 - sx0)] = alpha[sy0:sy1, sx0:sx1]
    return out_rgb, out_alpha


def subject_box(alpha):
    """Bounds of the artwork, and a centred square that holds it with a margin."""
    ys, xs = np.nonzero(alpha > TRIM_ALPHA)
    if len(xs) == 0:
        raise SystemExit("prepare-artwork: the keyed image is empty")
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    side = int(round(max(x1 - x0, y1 - y0) * (1.0 + 2.0 * MARK_MARGIN)))
    return (x0, x1, y0, y1), (x0 + x1) // 2, (y0 + y1) // 2, side


def premultiplied_resize(rgb, alpha, size):
    """Resize colour and coverage together, so transparency never tints the edges."""
    coverage = alpha.astype(np.float32) / 255.0
    planes = [
        Image.fromarray(rgb[..., channel].astype(np.float32) * coverage, mode="F").resize(size, Image.LANCZOS)
        for channel in range(3)
    ]
    scaled = np.asarray(Image.fromarray(coverage, mode="F").resize(size, Image.LANCZOS), dtype=np.float32)
    output = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    safe = np.maximum(scaled, 1e-6)
    for channel in range(3):
        straight = np.asarray(planes[channel], dtype=np.float32) / safe
        output[..., channel] = np.clip(straight, 0.0, 255.0).astype(np.uint8)
    output[..., 3] = np.clip(scaled * 255.0 + 0.5, 0.0, 255.0).astype(np.uint8)
    return Image.fromarray(output, "RGBA")


def lift_for_dark(mark, amount):
    """
    Screen the artwork toward white for the dark palette.

    The theme's dark rules switch artwork on `body[data-ds-dark-theme]`, so a
    drawing built on a light page keeps its own dark inks at roughly the
    background's own luminance once that background turns near-black. A screen
    blend lifts shadows far more than highlights: the outline comes back, the
    white areas stay white, and the hue is preserved.

    @param mark - the light-theme mark.
    @param amount - 0 keeps the artwork, 1 renders it white.
    @returns the lifted mark.
    """
    if amount <= 0:
        return mark
    data = np.asarray(mark).astype(np.float64)
    data[..., :3] = 255.0 - (255.0 - data[..., :3]) * (1.0 - min(amount, 1.0))
    return Image.fromarray(np.clip(data, 0, 255).astype(np.uint8), "RGBA")


def silhouette(alpha, pixels):
    """Shrink the coverage into the solid glyph the running-status mask tints."""
    small = Image.fromarray(alpha, "L").resize((pixels, pixels), Image.LANCZOS)
    solid = np.asarray(small) >= 96
    grown = solid.copy()
    grown[1:, :] |= solid[:-1, :]
    grown[:-1, :] |= solid[1:, :]
    grown[:, 1:] |= solid[:, :-1]
    grown[:, :-1] |= solid[:, 1:]
    output = np.zeros((pixels, pixels, 4), dtype=np.uint8)
    output[..., 3] = np.where(grown, 255, 0).astype(np.uint8)
    return Image.fromarray(output, "RGBA")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="source illustration on a flat light background")
    parser.add_argument("--crop", help="x0,y0,x1,y1 in source pixels, applied before keying")
    parser.add_argument(
        "--erase",
        action="append",
        default=[],
        metavar="x0,y0,x1,y1",
        help="force one source-space rectangle to alpha 0 (repeatable), reported with its cost",
    )
    parser.add_argument("--mark-name", default="icon", help="base name for the mark output")
    parser.add_argument("--running-name", default="running", help="base name for the running glyph")
    parser.add_argument("--favicon-name", default="favicon", help="base name for the tab icon")
    parser.add_argument(
        "--small-fraction",
        type=float,
        default=None,
        metavar="0..1",
        help="also write <mark-name>-small.png from the top fraction of the artwork "
             "(a head close-up reads far better at the 24px sidebar size)",
    )
    parser.add_argument(
        "--dark-lift",
        type=float,
        default=0.0,
        metavar="0..1",
        help="also write <mark-name>-dark.png with the artwork screened toward white by "
             "this much, for the application's dark palette (0.3-0.4 suits a dark-on-light drawing)",
    )
    options = parser.parse_args()

    image = Image.open(options.source).convert("RGB")
    if options.crop is not None:
        image = image.crop(parse_rect(options.crop, "--crop"))
    rgb = np.asarray(image).astype(np.int16)
    background, low = border_connected_background(rgb)
    share = 100.0 * background.mean()
    print(f"source {options.source} -> {image.size}, keyed background {share:.1f}%")
    if not 5.0 <= share <= 85.0:
        print("prepare-artwork: the keyed share looks implausible; inspect the output before shipping")

    for rect in options.erase:
        x0, y0, x1, y1 = parse_rect(rect, "--erase")
        region = np.zeros(background.shape, dtype=bool)
        region[y0:y1, x0:x1] = True
        erased_artwork = int((region & ~background).sum())
        background |= region
        print(f"erased {rect}: {region.sum()} px, of which {erased_artwork} px were artwork")

    white = (low >= WHITE_MIN_CHANNEL) & ((rgb.max(axis=2) - low) <= WHITE_MAX_SPREAD)
    speck_budget = max(SPECK_MIN_PIXELS, round(rgb.shape[0] * rgb.shape[1] / SPECK_AREA_DIVISOR))
    healed, speck_pixels = heal_specks(rgb, background, white, speck_budget)
    print(f"healed {healed} enclosed page-colour pocket(s) below {speck_budget} px ({speck_pixels} px repainted)")
    source_rgb = np.clip(rgb, 0, 255).astype(np.uint8)

    alpha = alpha_plane(background, low).astype(np.float64)
    # A one-pixel erosion at source resolution drops the anti-aliased white ring
    # that would otherwise survive as a pale outline.
    alpha = np.asarray(
        Image.fromarray(alpha.astype(np.uint8), "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    ).astype(np.uint8)
    (x0, x1, y0, y1), center_x, center_y, side = subject_box(alpha)
    print(f"artwork bounds x {x0}..{x1}, y {y0}..{y1}")
    square_rgb, square_alpha = crop_centered(source_rgb, alpha, center_x, center_y, side)

    mark = premultiplied_resize(square_rgb, square_alpha, (MARK_PIXELS, MARK_PIXELS))
    mark_path = os.path.join(ASSETS, options.mark_name + ".png")
    mark.save(mark_path, optimize=True)
    print(f"wrote {mark_path} {mark.size} mode={mark.mode} ({os.path.getsize(mark_path)} bytes)")

    if options.dark_lift > 0:
        dark = lift_for_dark(mark, options.dark_lift)
        dark_path = os.path.join(ASSETS, options.mark_name + "-dark.png")
        dark.save(dark_path, optimize=True)
        print(f"wrote {dark_path} {dark.size} mode={dark.mode} ({os.path.getsize(dark_path)} bytes) "
              f"lifted {options.dark_lift:.0%} toward white for the dark palette")

    if options.small_fraction is not None:
        head_bottom = y0 + int(round((y1 - y0) * options.small_fraction))
        head_side = int(round(max(x1 - x0, head_bottom - y0) * (1.0 + 2.0 * MARK_MARGIN)))
        head_rgb, head_alpha = crop_centered(
            source_rgb, alpha, (x0 + x1) // 2, (y0 + head_bottom) // 2, head_side
        )
        small = premultiplied_resize(head_rgb, head_alpha, (SMALL_PIXELS, SMALL_PIXELS))
        small_path = os.path.join(ASSETS, options.mark_name + "-small.png")
        small.save(small_path, optimize=True)
        print(f"wrote {small_path} {small.size} mode={small.mode} ({os.path.getsize(small_path)} bytes) "
              f"from source rows {y0}..{head_bottom}")

    favicon = premultiplied_resize(square_rgb, square_alpha, (FAVICON_PIXELS, FAVICON_PIXELS))
    favicon_path = os.path.join(ASSETS, options.favicon_name + ".png")
    favicon.save(favicon_path, optimize=True)
    print(f"wrote {favicon_path} {favicon.size} mode={favicon.mode} ({os.path.getsize(favicon_path)} bytes)")

    glyph = silhouette(square_alpha, RUNNING_PIXELS)
    glyph_path = os.path.join(ASSETS, options.running_name + ".png")
    glyph.save(glyph_path, optimize=True)
    print(f"wrote {glyph_path} {glyph.size} mode={glyph.mode} ({os.path.getsize(glyph_path)} bytes)")

    coverage = np.asarray(mark.getchannel("A"))
    opaque = coverage > 8
    partial = (coverage > 8) & (coverage < 248)
    print(f"mark ink coverage {100.0 * opaque.mean():.1f}%, soft edge {100.0 * partial.mean():.2f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
