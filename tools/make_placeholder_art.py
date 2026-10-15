"""Generates placeholder pixel art into public/assets/sprites/.

Offline only (never run by the game). Requires Pillow:  pip install pillow
Run from the project root:  python tools/make_placeholder_art.py

Outputs
  vaulter.png  - 10 frames of 16x32, laid out horizontally (see FRAMES)
  tiles.png    - 16x16 tiles in TILES order: grass top, dirt, wall face, wall top, then
                 the stadium set (track, concrete, seating, ad boards, roof, tarmac, mat)
  flag.png     - 16x32 finish flag
Frame order and anchors are mirrored in src/rendering/sprites.ts.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "sprites"

SKIN = (240, 188, 140, 255)
SKIN_DARK = (196, 140, 98, 255)
HAIR = (60, 40, 30, 255)
SHIRT = (214, 52, 64, 255)
SHIRT_DARK = (160, 32, 48, 255)
SHORTS = (40, 52, 96, 255)
SHOE = (245, 245, 245, 255)
OUTLINE = (24, 20, 28, 255)

FW, FH = 16, 32
FRAMES = ["idle", "run1", "run2", "run3", "run4", "rise", "fall", "hang", "pike", "land"]


def px(d: ImageDraw.ImageDraw, x: int, y: int, c) -> None:
    d.point((x, y), fill=c)


def rect(d: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int, c) -> None:
    d.rectangle((x0, y0, x1, y1), fill=c)


def head(d, x: int, y: int) -> None:
    """3x4 head with hair; (x, y) is the top-left."""
    rect(d, x, y, x + 3, y + 3, SKIN)
    rect(d, x, y, x + 3, y, HAIR)
    px(d, x, y + 1, HAIR)
    px(d, x + 3, y + 1, SKIN_DARK)  # eye side (facing right)


def torso(d, x: int, y: int, h: int = 7) -> None:
    rect(d, x, y, x + 3, y + h - 1, SHIRT)
    rect(d, x, y + h - 2, x + 3, y + h - 1, SHIRT_DARK)


def shorts(d, x: int, y: int) -> None:
    rect(d, x, y, x + 3, y + 2, SHORTS)


def leg(d, x0: int, y0: int, x1: int, y1: int) -> None:
    d.line((x0, y0, x1, y1), fill=SKIN, width=1)
    d.line((x0 + 1, y0, x1 + 1, y1), fill=SKIN_DARK, width=1)


def shoe(d, x: int, y: int) -> None:
    rect(d, x, y, x + 2, y, SHOE)


def arm(d, x0: int, y0: int, x1: int, y1: int) -> None:
    d.line((x0, y0, x1, y1), fill=SKIN, width=1)


def standing(d, legs) -> None:
    """Upright body; feet on the bottom row (y=31). Shoulder at about (8, 12)."""
    head(d, 6, 6)
    torso(d, 6, 10)
    shorts(d, 6, 17)
    for (x0, y0, x1, y1) in legs:
        leg(d, x0, y0, x1, y1)
        shoe(d, x1 - 1, y1 + 1 if y1 < 30 else 31)
    # No arms: the game draws them live, reaching to wherever the hands are on the pole.


def frame_idle(d):
    standing(d, [(7, 20, 7, 30), (8, 20, 9, 30)])


def frame_run(d, i: int):
    poses = [
        [(7, 20, 4, 29), (8, 20, 11, 30)],
        [(7, 20, 6, 30), (8, 20, 9, 26)],
        [(7, 20, 11, 30), (8, 20, 4, 28)],
        [(7, 20, 9, 26), (8, 20, 7, 30)],
    ]
    standing(d, poses[i])


def frame_rise(d):
    standing(d, [(7, 20, 5, 27), (8, 20, 10, 28)])


def frame_fall(d):
    standing(d, [(7, 20, 6, 29), (8, 20, 9, 29)])


def frame_hang(d):
    """On the pole: hands at the top (anchor 8,3), body hanging, legs together."""
    rect(d, 7, 1, 9, 2, SKIN)  # hands on pole
    arm(d, 7, 3, 7, 6)
    arm(d, 9, 3, 9, 6)
    head(d, 6, 6)
    torso(d, 6, 10)
    shorts(d, 6, 17)
    leg(d, 7, 20, 7, 28)
    leg(d, 8, 20, 9, 28)
    shoe(d, 7, 29)


def frame_pike(d):
    """Legs swung up toward the hands (rock-back)."""
    rect(d, 7, 1, 9, 2, SKIN)
    arm(d, 7, 3, 7, 6)
    arm(d, 9, 3, 9, 6)
    head(d, 6, 6)
    torso(d, 6, 10)
    shorts(d, 6, 17)
    leg(d, 9, 18, 13, 9)
    leg(d, 8, 18, 12, 8)
    shoe(d, 12, 6)


def frame_land(d):
    head(d, 6, 11)
    torso(d, 6, 15, 6)
    shorts(d, 6, 21)
    leg(d, 7, 24, 5, 30)
    leg(d, 8, 24, 11, 30)
    shoe(d, 4, 31)
    shoe(d, 10, 31)


def outline(img: Image.Image) -> Image.Image:
    """1px dark outline around opaque pixels (keeps the sprite readable on any background)."""
    src = img.load()
    out = img.copy()
    dst = out.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            if src[x, y][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] != 0 and src[nx, ny] != OUTLINE:
                    # Only outline within the frame cell.
                    if nx // FW == x // FW:
                        dst[x, y] = OUTLINE
                        break
    return out


def make_vaulter() -> None:
    sheet = Image.new("RGBA", (FW * len(FRAMES), FH), (0, 0, 0, 0))
    for i, name in enumerate(FRAMES):
        cell = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
        d = ImageDraw.Draw(cell)
        if name == "idle":
            frame_idle(d)
        elif name.startswith("run"):
            frame_run(d, int(name[3]) - 1)
        elif name == "rise":
            frame_rise(d)
        elif name == "fall":
            frame_fall(d)
        elif name == "hang":
            frame_hang(d)
        elif name == "pike":
            frame_pike(d)
        elif name == "land":
            frame_land(d)
        sheet.paste(cell, (i * FW, 0))
    outline(sheet).save(OUT / "vaulter.png")


def make_tiles() -> None:
    img = Image.new("RGBA", (16 * 14, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    dirt, dirt_dark, dirt_light = (124, 84, 56, 255), (96, 62, 42, 255), (150, 106, 72, 255)
    grass, grass_dark = (92, 168, 72, 255), (60, 124, 52, 255)
    # 0: grass top
    rect(d, 0, 0, 15, 15, dirt)
    rect(d, 0, 0, 15, 3, grass)
    for x in range(0, 16, 3):
        px(d, x, 4, grass_dark)
    for (x, y) in ((3, 9), (10, 7), (13, 12), (6, 13)):
        px(d, x, y, dirt_dark)
    # 1: dirt
    rect(d, 16, 0, 31, 15, dirt)
    for (x, y) in ((2, 3), (9, 1), (13, 8), (5, 10), (11, 13)):
        px(d, 16 + x, y, dirt_dark)
        px(d, 16 + x + 1, y, dirt_light)
    # 2: wall face (stone blocks)
    stone, stone_dark, stone_light = (150, 150, 168, 255), (104, 104, 124, 255), (186, 186, 200, 255)
    rect(d, 32, 0, 47, 15, stone)
    d.line((32, 7, 47, 7), fill=stone_dark)
    d.line((32, 15, 47, 15), fill=stone_dark)
    d.line((39, 0, 39, 7), fill=stone_dark)
    d.line((35, 8, 35, 15), fill=stone_dark)
    d.line((44, 8, 44, 15), fill=stone_dark)
    d.line((32, 0, 38, 0), fill=stone_light)
    # 3: wall top (capstone)
    rect(d, 48, 0, 63, 15, stone)
    rect(d, 48, 0, 63, 3, stone_light)
    d.line((48, 4, 63, 4), fill=stone_dark)
    d.line((48, 15, 63, 15), fill=stone_dark)
    d.line((55, 5, 55, 15), fill=stone_dark)
    stadium_tiles(img)
    img.save(OUT / "tiles.png")


# Order of tiles in tiles.png (mirrored in src/rendering/sprites.ts TILE_FRAMES).
TILES = ["grass", "dirt", "wall", "wallTop", "track", "concreteTop", "concrete", "seats",
         "adBoard", "adBoardTop", "roofTop", "roof", "tarmac", "mat"]


def stadium_tiles(img: Image.Image) -> None:
    d = ImageDraw.Draw(img)

    def at(name: str) -> int:
        return TILES.index(name) * 16

    conc, conc_dark, conc_light = (100, 98, 100, 255), (84, 82, 86, 255), (164, 160, 154, 255)
    # concrete (below the surface): cast panels with a few pits
    x = at("concrete")
    rect(d, x, 0, x + 15, 15, conc)
    d.line((x, 15, x + 15, 15), fill=conc_dark)
    d.line((x + 15, 0, x + 15, 15), fill=conc_dark)
    for (a, b) in ((3, 4), (10, 2), (6, 11), (12, 9)):
        px(d, x + a, b, conc_dark)
    # concrete top: a walkway with a lit edge
    x = at("concreteTop")
    rect(d, x, 0, x + 15, 15, conc)
    rect(d, x, 0, x + 15, 1, conc_light)
    d.line((x, 2, x + 15, 2), fill=conc_dark)
    d.line((x + 15, 3, x + 15, 15), fill=conc_dark)
    d.line((x, 15, x + 15, 15), fill=conc_dark)
    # running track: red tartan over concrete, a white lane line
    x = at("track")
    rect(d, x, 0, x + 15, 15, conc)
    rect(d, x, 0, x + 15, 4, (196, 84, 60, 255))
    rect(d, x, 5, x + 15, 5, (150, 58, 44, 255))
    d.line((x, 1, x + 15, 1), fill=(244, 244, 236, 255))
    for (a, b) in ((4, 3), (11, 3), (8, 4)):
        px(d, x + a, b, (170, 68, 50, 255))
    d.line((x, 15, x + 15, 15), fill=conc_dark)
    # seating: a concrete tread with a row of blue seats under the edge
    x = at("seats")
    rect(d, x, 0, x + 15, 15, conc_dark)
    rect(d, x, 0, x + 15, 2, conc_light)
    seat, seat_dark = (52, 96, 196, 255), (34, 64, 140, 255)
    for sx in (1, 9):
        rect(d, x + sx, 4, x + sx + 1, 9, seat)        # back
        rect(d, x + sx + 1, 9, x + sx + 5, 10, seat)   # seat
        px(d, x + sx + 4, 11, seat_dark)               # leg
        px(d, x + sx + 4, 12, seat_dark)
        px(d, x + sx, 4, seat_dark)
    d.line((x, 14, x + 15, 14), fill=(84, 80, 78, 255))
    # advertising boards: white with coloured blocks of "logos"
    for name, top in (("adBoard", False), ("adBoardTop", True)):
        x = at(name)
        rect(d, x, 0, x + 15, 15, (236, 236, 232, 255))
        d.line((x, 0, x, 15), fill=(190, 190, 186, 255))
        rect(d, x + 3, 5, x + 8, 9, (40, 120, 200, 255))
        rect(d, x + 9, 5, x + 12, 9, (230, 190, 40, 255))
        rect(d, x + 3, 11, x + 12, 11, (210, 60, 60, 255))
        if top:
            rect(d, x, 0, x + 15, 2, (60, 60, 70, 255))
        d.line((x, 15, x + 15, 15), fill=(190, 190, 186, 255))
    # roof top: corrugated metal sheet
    roof, roof_dark, roof_light = (128, 140, 156, 255), (88, 98, 114, 255), (176, 188, 202, 255)
    x = at("roofTop")
    rect(d, x, 0, x + 15, 15, (70, 76, 90, 255))
    rect(d, x, 0, x + 15, 4, roof)
    d.line((x, 0, x + 15, 0), fill=roof_light)
    for a in range(0, 16, 4):
        px(d, x + a, 1, roof_dark)
        px(d, x + a, 2, roof_dark)
    # roof (the stadium's outer shell): dark panels with lit window slits
    x = at("roof")
    rect(d, x, 0, x + 15, 15, (70, 76, 90, 255))
    d.line((x + 15, 0, x + 15, 15), fill=(52, 56, 68, 255))
    rect(d, x + 3, 5, x + 4, 10, (240, 214, 120, 255))
    rect(d, x + 10, 5, x + 11, 10, (240, 214, 120, 255))
    # tarmac with a yellow line
    x = at("tarmac")
    rect(d, x, 0, x + 15, 15, (124, 84, 56, 255))
    rect(d, x, 0, x + 15, 4, (62, 62, 68, 255))
    d.line((x, 4, x + 15, 4), fill=(40, 40, 44, 255))
    rect(d, x + 2, 1, x + 8, 1, (230, 200, 60, 255))
    for (a, b) in ((11, 2), (13, 3), (5, 3)):
        px(d, x + a, b, (84, 84, 92, 255))
    # landing mat: blue foam set into the ground
    x = at("mat")
    rect(d, x, 0, x + 15, 15, conc)
    rect(d, x, 0, x + 15, 7, (40, 90, 190, 255))
    d.line((x, 0, x + 15, 0), fill=(100, 150, 230, 255))
    d.line((x + 15, 0, x + 15, 7), fill=(28, 60, 140, 255))
    d.line((x, 7, x + 15, 7), fill=(28, 60, 140, 255))


def make_flag() -> None:
    img = Image.new("RGBA", (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 3, 2, 3, 31, (220, 220, 220, 255))
    for y in range(3, 11):
        for x in range(4, 14):
            c = (30, 30, 30, 255) if ((x // 2) + (y // 2)) % 2 else (240, 240, 240, 255)
            px(d, x, y, c)
    img.save(OUT / "flag.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_vaulter()
    make_tiles()
    make_flag()
    print(f"wrote sprites to {OUT}")
