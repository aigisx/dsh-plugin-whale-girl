#!/usr/bin/env python3
"""Turn a picture of a bowl of rice into assets/running.png.

The browser half keys and trims a picture the user picks in the settings card;
this does the same job ahead of time for the picture that ships as the built-in
thinking icon, where there is no browser to run it in. Both share one rule:

  * the page colour is read from the four corners, and only a background flat
    enough for them to agree is keyed out, by a flood fill from the border — so
    colour the artwork encloses is never touched;
  * the anti-aliased edge is faded *only where it meets the removed background*,
    so artwork drawn in the page's own colour (a white bowl on a white page)
    stays opaque instead of being hollowed out.

Everything else — trim to the artwork, centre it on a square with a small
margin, scale to the stored edge — matches prepareArtwork() in
src/client.template.js, so the built-in asset and a picked one look alike.

Usage:
  python tools/prepare-thinking.py assets/Thinking.png [--edge 128] [--preview out.png]
"""
import argparse
import sys
from pathlib import Path

from PIL import Image

WORK_EDGE = 512
TOLERANCE = 30
SPAN = TOLERANCE * 2
CORNER_AGREEMENT = 24
PAGE_SHARE_FLOOR = 0.05
MARGIN = 1.08


def key_background(image):
    """Remove a flat border-connected background, fading its blend ring.

    Returns the artwork bounds, or None when the picture has no flat background
    to key and has to be used as it is.
    """
    width, height = image.size
    pixels = image.load()
    corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    base = [sum(pixels[x, y][channel] for x, y in corners) / len(corners) for channel in range(3)]
    for x, y in corners:
        if any(abs(pixels[x, y][channel] - base[channel]) > CORNER_AGREEMENT for channel in range(3)):
            print("  corners disagree: no flat background to key, using the picture as it is")
            return None

    def is_page(x, y):
        pixel = pixels[x, y]
        return pixel[3] > 8 and all(abs(pixel[channel] - base[channel]) <= TOLERANCE for channel in range(3))

    seen = bytearray(width * height)
    stack = []
    for x in range(width):
        stack.extend([(x, 0), (x, height - 1)])
    for y in range(height):
        stack.extend([(0, y), (width - 1, y)])
    cleared = 0
    while stack:
        x, y = stack.pop()
        at = y * width + x
        if seen[at] or not is_page(x, y):
            continue
        seen[at] = 1
        pixels[x, y] = (pixels[x, y][0], pixels[x, y][1], pixels[x, y][2], 0)
        cleared += 1
        if x > 0:
            stack.append((x - 1, y))
        if x < width - 1:
            stack.append((x + 1, y))
        if y > 0:
            stack.append((x, y - 1))
        if y < height - 1:
            stack.append((x, y + 1))
    share = cleared / (width * height)
    print(f"  page colour {tuple(round(value) for value in base)}, keyed out {share * 100:.1f}% of the picture")
    if share < PAGE_SHARE_FLOOR:
        print("  too little was keyed to be a background, using the picture as it is")
        return None

    # A background pattern — a transparency checkerboard, a paper texture — leaves
    # specks of near-page colour that the fill cannot reach because an edge pixel
    # shaded the wrong way interrupts it. Nothing that small can be artwork, so it
    # goes; that also keeps the specks out of the crop bounds below.
    def is_artwork(x, y):
        at = y * width + x
        return not seen[at] and pixels[x, y][3] > 8

    def meets_background(x, y):
        for dy in (-1, 0, 1):
            ny = y + dy
            if ny < 0 or ny >= height:
                continue
            for dx in (-1, 0, 1):
                nx = x + dx
                if nx < 0 or nx >= width:
                    continue
                if not is_artwork(nx, ny):
                    return True
        return False

    speck_limit = max(8, round(width * height * 0.001))
    labelled = bytearray(width * height)
    removed = 0
    for y0 in range(height):
        for x0 in range(width):
            if labelled[y0 * width + x0] or not is_artwork(x0, y0):
                continue
            component = []
            queue = [(x0, y0)]
            labelled[y0 * width + x0] = 1
            while queue:
                x, y = queue.pop()
                component.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height and not labelled[ny * width + nx] and is_artwork(nx, ny):
                        labelled[ny * width + nx] = 1
                        queue.append((nx, ny))
            if len(component) >= speck_limit:
                continue
            for x, y in component:
                pixels[x, y] = (pixels[x, y][0], pixels[x, y][1], pixels[x, y][2], 0)
            removed += 1
    print(f"  dropped {removed} speck(s) smaller than {speck_limit} px")

    min_x, min_y, max_x, max_y = width, height, -1, -1
    faded = 0
    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            if pixel[3] <= 8:
                continue
            if meets_background(x, y):
                distance = max(abs(pixel[channel] - base[channel]) for channel in range(3))
                if distance < SPAN:
                    faded += 1
                    pixels[x, y] = (pixel[0], pixel[1], pixel[2], round(255 * min(1, distance / SPAN)))
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)
    print(f"  faded {faded} px of blend ring along the edge")
    if max_x < 0:
        return None
    return (min_x, min_y, max_x + 1, max_y + 1)


def prepare(source, edge):
    """Key, trim and scale one picture the way the picker does."""
    image = Image.open(source).convert("RGBA")
    longest = max(image.size)
    factor = min(1, WORK_EDGE / longest)
    if factor < 1:
        image = image.resize(
            (max(1, round(image.size[0] * factor)), max(1, round(image.size[1] * factor))), Image.LANCZOS
        )
    print(f"  working image {image.size[0]}x{image.size[1]}")
    bounds = key_background(image)
    left, top, right, bottom = bounds if bounds is not None else (0, 0, image.size[0], image.size[1])
    box_width, box_height = right - left, bottom - top
    side = max(box_width, box_height) * MARGIN
    # The margin can reach past the picture when the artwork nearly fills it; the
    # browser's drawImage leaves that part transparent, so paste onto a
    # transparent canvas rather than asking PIL for an out-of-bounds crop box.
    span = round(side)
    canvas = Image.new("RGBA", (span, span), (0, 0, 0, 0))
    offset = (round((side - box_width) / 2), round((side - box_height) / 2))
    canvas.alpha_composite(image.crop((left, top, right, bottom)), offset)
    out = canvas.resize((edge, edge), Image.LANCZOS)
    print(f"  artwork {box_width}x{box_height} at ({left},{top}) -> {edge}x{edge}, margin {MARGIN}")
    return out


def main():
    parser = argparse.ArgumentParser(description="Prepare assets/running.png from a picture.")
    parser.add_argument("source", help="the picture to process")
    parser.add_argument("--edge", type=int, default=128, help="stored edge in pixels (default 128)")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "assets" / "running.png"))
    parser.add_argument("--preview", default="", help="also write this PNG showing the artwork at 64/28/14 px")
    args = parser.parse_args()

    print(f"prepare-thinking: {args.source}")
    out = prepare(args.source, args.edge)
    out.save(args.out, "PNG", optimize=True)
    data = list(out.getdata())
    total = args.edge * args.edge
    opaque = sum(1 for pixel in data if pixel[3] > 200)
    white = sum(1 for pixel in data if pixel[3] > 200 and min(pixel[:3]) > 235)
    print(f"  wrote {args.out}: {opaque * 100 // total}% opaque, {white * 100 // total}% of it opaque white")

    if args.preview:
        preview = Image.new("RGBA", (140, 88), (255, 255, 255, 255))
        x = 12
        for size in (64, 28, 14):
            preview.alpha_composite(out.resize((size, size), Image.LANCZOS), (x, 12 + (64 - size)))
            x += size + 12
        preview.save(args.preview, "PNG")
        print(f"  wrote {args.preview}")

    if opaque == 0:
        print("prepare-thinking: the result is fully transparent, which cannot be right")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
