#!/usr/bin/env python3
"""Independent pixel check of what `sidebar-fit-check.mjs` renders.

The Node check asks the browser whether the mark is painted, through hit tests
and clip arithmetic; both are layout APIs. This reads the screenshot instead and
measures the artwork that is actually on screen, so a bug in those APIs cannot
flatter the result.

The posed page shows three sidebars per column — the wide row, the collapsed
rail, and the wide row in the Windows titlebar layout — all at 1.8x. It finds the
blue character in each, and passes when the two wide marks in the "after" column
are as tall as the rail mark (which nothing ever clipped) and, in the "before"
column, at least one of them is shorter, i.e. still visibly cut off.

Usage: python tools/verify-fit-screenshot.py tools/sidebar-fit-check.png
"""
import sys

from PIL import Image

# Below this row the page shows the numeric table, whose text antialiasing
# produces scattered blue fringing that is not artwork.
PANELS_BOTTOM = 500
# A mark covers hundreds of pixels at 1.8x; a text fringe covers a handful.
MIN_MARK_PIXELS = 300


def is_artwork(pixel):
    """The character is strongly blue; heading and label text only fringes blue."""
    r, g, b = pixel
    return b > r + 40 and b >= g and max(pixel) - min(pixel) > 60


def cluster(values, gap):
    """Split sorted values into runs whose neighbours are within gap."""
    groups = []
    start = previous = values[0]
    for value in values[1:]:
        if value - previous > gap:
            groups.append((start, previous))
            start = value
        previous = value
    groups.append((start, previous))
    return groups


def marks(pixels, left, right, height):
    """Every artwork blob in one column, as (x range, y range, pixel count)."""
    points = [
        (x, y)
        for y in range(85, min(PANELS_BOTTOM, height))
        for x in range(left, right)
        if is_artwork(pixels[x, y])
    ]
    found = []
    for column_left, column_right in cluster(sorted({x for x, _ in points}), 10):
        strip = [point for point in points if column_left <= point[0] <= column_right]
        for top, bottom in cluster(sorted({y for _, y in strip}), 6):
            blob = [point for point in strip if top <= point[1] <= bottom]
            if len(blob) >= MIN_MARK_PIXELS:
                found.append((column_left, column_right, top, bottom, len(blob)))
    return found


def main():
    image = Image.open(sys.argv[1]).convert("RGB")
    width, height = image.size
    pixels = image.load()
    print(f"image: {width}x{height}")

    heights = {}
    for label, (left, right) in (("before", (0, width // 2)), ("after", (width // 2, width))):
        found = marks(pixels, left, right, height)
        print(f"{label}: {len(found)} mark(s)")
        for column_left, column_right, top, bottom, count in found:
            print(f"  x={column_left}..{column_right} y={top}..{bottom} "
                  f"height={bottom - top + 1}px width={column_right - column_left + 1}px pixels={count}")
        heights[label] = [bottom - top + 1 for _, _, top, bottom, _ in found]

    ok = True
    for label in ("before", "after"):
        if len(heights[label]) != 3:
            print(f"FAIL: {label} shows {len(heights[label])} marks, expected 3")
            ok = False

    if ok:
        rail_before, rail_after = heights["before"][-1], heights["after"][-1]
        clipped_before = [value for value in heights["before"][:-1] if value < rail_before - 8]
        clipped_after = [value for value in heights["after"][:-1] if abs(value - rail_after) > 2]
        print(f"\nrail mark (never clipped): before {rail_before}px, after {rail_after}px")
        print(f"wide marks: before {heights['before'][:-1]}, after {heights['after'][:-1]}")
        if not clipped_before:
            print("FAIL: the shipped column shows no clipped mark, so this check cannot see the bug")
            ok = False
        if clipped_after:
            print(f"FAIL: the fixed column still clips a mark ({clipped_after})")
            ok = False

    print("\nverify-fit-screenshot: " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
