"""Generates placeholder pixel art into public/assets/sprites/.

Offline only (never run by the game). Requires Pillow:  pip install pillow
Run from the project root:  python tools/make_placeholder_art.py

Outputs
  vaulter.png  - 14 frames of 16x32, laid out horizontally (see FRAMES); the last
                 four (stand, wave, sad, lookUp) have arms drawn in, for the podium cutscene
  tiles.png    - 16x16 tiles in TILES order: grass top, dirt, wall face, wall top, then
                 the stadium set (track, concrete, seating, ad boards, roof, tarmac, mat)
  flag.png     - 16x32 finish flag
  podium.png   - 56x22 victory podium: 2nd (left), 1st (centre), 3rd (right)
  official.png - 4 frames of 16x32: the little man in a suit and tie (stand, walk1, walk2, reach)
  rivals.png   - 2 frames of 16x32: the silver and bronze vaulters (palette swaps of "stand")
  medal.png    - 3 frames of 5x8: gold, silver, bronze medal on a ribbon (anchor 2, 1)
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
FRAMES = ["idle", "run1", "run2", "run3", "run4", "rise", "fall", "hang", "pike", "land",
          "stand", "wave", "sad", "lookUp"]


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


def frame_stand(d):
    """On the podium: arms by the sides."""
    standing(d, [(7, 20, 7, 30), (8, 20, 9, 30)])
    arm(d, 8, 11, 8, 17)


def frame_wave(d):
    """Champion: one arm up."""
    standing(d, [(7, 20, 7, 30), (8, 20, 9, 30)])
    arm(d, 9, 11, 11, 5)
    rect(d, 11, 3, 12, 4, SKIN)


def frame_sad(d):
    """Now what? Head hung forward and down, shoulders slumped, arms limp."""
    torso(d, 6, 11, 6)
    shorts(d, 6, 17)
    for (x0, y0, x1, y1) in [(7, 20, 7, 30), (8, 20, 9, 30)]:
        leg(d, x0, y0, x1, y1)
        shoe(d, x1 - 1, 31)
    rect(d, 7, 9, 10, 12, SKIN)
    rect(d, 7, 9, 10, 9, HAIR)
    rect(d, 7, 10, 7, 11, HAIR)
    px(d, 10, 12, SKIN_DARK)  # eye, looking at the floor
    arm(d, 9, 12, 10, 18)


def frame_look_up(d):
    """Looking up at the moon: head tipped back, face to the sky."""
    torso(d, 6, 10)
    shorts(d, 6, 17)
    for (x0, y0, x1, y1) in [(7, 20, 7, 30), (8, 20, 9, 30)]:
        leg(d, x0, y0, x1, y1)
        shoe(d, x1 - 1, 31)
    rect(d, 6, 6, 9, 9, SKIN)
    rect(d, 6, 6, 6, 9, HAIR)
    rect(d, 6, 9, 8, 9, HAIR)
    px(d, 9, 6, SKIN_DARK)  # eye, up at the sky
    arm(d, 8, 11, 7, 17)


def outline(img: Image.Image, cell_w: int = FW) -> Image.Image:
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
                    if nx // cell_w == x // cell_w:
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
        elif name == "stand":
            frame_stand(d)
        elif name == "wave":
            frame_wave(d)
        elif name == "sad":
            frame_sad(d)
        elif name == "lookUp":
            frame_look_up(d)
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


# --- The podium cutscene ---------------------------------------------------

# 3x5 digits (as in src/data/pixelFont.ts).
DIGITS = {"1": ".#.|##.|.#.|.#.|###", "2": "##.|..#|.#.|#..|###", "3": "##.|..#|.#.|..#|##."}


def make_podium() -> None:
    """Three blocks on one baseline (bottom row = the ground): 2nd 18 wide 14 high, 1st 20x22, 3rd 18x10."""
    img = Image.new("RGBA", (56, 22), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    face, top, side, edge = (226, 226, 220, 255), (250, 250, 246, 255), (176, 176, 172, 255), (120, 120, 126, 255)
    for (x0, x1, y0, digit, band) in ((0, 17, 8, "2", (190, 196, 206, 255)), (18, 37, 0, "1", (232, 192, 56, 255)),
                                      (38, 55, 12, "3", (200, 128, 60, 255))):
        rect(d, x0, y0, x1, 21, face)
        rect(d, x0, y0, x1, y0 + 1, top)
        d.line((x0, y0 + 2, x1, y0 + 2), fill=band)
        d.line((x1, y0 + 2, x1, 21), fill=side)
        d.line((x0, y0, x0, 21), fill=edge)
        d.line((x0, 21, x1, 21), fill=edge)
        cx = (x0 + x1) // 2 - 1
        for gy, row in enumerate(DIGITS[digit].split("|")):
            for gx, ch in enumerate(row):
                if ch == "#":
                    px(d, cx + gx, y0 + 4 + gy, edge)
    img.save(OUT / "podium.png")


SUIT, SUIT_DARK = (48, 50, 68, 255), (32, 32, 46, 255)
WHITE, TIE, GREY, BLACK = (244, 244, 240, 255), (204, 40, 48, 255), (176, 176, 182, 255), (20, 20, 24, 255)
OFFICIAL_FRAMES = ["stand", "walk1", "walk2", "reach"]


def official(d, name: str) -> None:
    """A little man (20 px to the vaulter's 26) in a suit and tie, balding, with a grey moustache. Faces right."""
    rect(d, 6, 12, 9, 15, SKIN)
    rect(d, 6, 12, 6, 14, GREY)
    px(d, 7, 13, GREY)
    px(d, 9, 13, SKIN_DARK)  # eye
    px(d, 9, 15, GREY)  # moustache
    rect(d, 6, 16, 9, 23, SUIT)
    px(d, 8, 16, WHITE)
    px(d, 9, 16, WHITE)
    for y in range(17, 21):
        px(d, 9, y, TIE)
    legs = {
        "stand": [(7, 24, 7, 30), (8, 24, 8, 30)],
        "reach": [(7, 24, 7, 30), (8, 24, 8, 30)],
        "walk1": [(7, 24, 5, 30), (8, 24, 10, 30)],
        "walk2": [(7, 24, 7, 30), (8, 24, 9, 29)],
    }[name]
    for i, (x0, y0, x1, y1) in enumerate(legs):
        d.line((x0, y0, x1, y1), fill=SUIT_DARK if i == 0 else SUIT)
        rect(d, x1 - 1 + i, y1 + 1, x1 + i, y1 + 1, BLACK)
    if name == "reach":
        d.line((9, 17, 11, 13), fill=SUIT_DARK)
        rect(d, 12, 11, 12, 12, SKIN)  # hand (the medal hangs from it: anchor 12, 11)
    else:
        d.line((8, 17, 8, 22), fill=SUIT_DARK)
        px(d, 8, 23, SKIN)  # hand (anchor 8, 23)


def make_official() -> None:
    sheet = Image.new("RGBA", (FW * len(OFFICIAL_FRAMES), FH), (0, 0, 0, 0))
    for i, name in enumerate(OFFICIAL_FRAMES):
        cell = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
        official(ImageDraw.Draw(cell), name)
        sheet.paste(cell, (i * FW, 0))
    outline(sheet).save(OUT / "official.png")


def make_rivals() -> None:
    """The silver and bronze medallists: the vaulter's podium pose in other kit."""
    swaps = [
        {SHIRT: (52, 96, 196, 255), SHIRT_DARK: (34, 64, 140, 255), HAIR: (224, 192, 96, 255)},
        {SHIRT: (60, 160, 90, 255), SHIRT_DARK: (40, 110, 60, 255), SKIN: (150, 100, 66, 255),
         SKIN_DARK: (106, 68, 46, 255), HAIR: (24, 20, 20, 255), SHORTS: (230, 230, 226, 255)},
    ]
    sheet = Image.new("RGBA", (FW * len(swaps), FH), (0, 0, 0, 0))
    for i, swap in enumerate(swaps):
        cell = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
        frame_stand(ImageDraw.Draw(cell))
        pix = cell.load()
        for y in range(FH):
            for x in range(FW):
                if pix[x, y] in swap:
                    pix[x, y] = swap[pix[x, y]]
        sheet.paste(cell, (i * FW, 0))
    outline(sheet).save(OUT / "rivals.png")


def make_medal() -> None:
    """Gold, silver, bronze: a ribbon from the neck and a 3x3 disc, side on. Drawn 1 px in from the cell edge for the outline."""
    mw, mh = 5, 8
    metals = [((240, 200, 56, 255), (255, 240, 150, 255), (176, 132, 24, 255)),
              ((200, 206, 214, 255), (246, 248, 252, 255), (130, 138, 150, 255)),
              ((204, 128, 60, 255), (240, 180, 120, 255), (140, 80, 34, 255))]
    ribbon = (52, 96, 196, 255)
    sheet = Image.new("RGBA", (mw * len(metals), mh), (0, 0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for i, (base, light, dark) in enumerate(metals):
        ox, oy = i * mw + 1, 1
        rect(d, ox + 1, oy, ox + 1, oy + 2, ribbon)
        rect(d, ox, oy + 3, ox + 2, oy + 5, base)
        px(d, ox, oy + 3, light)
        px(d, ox + 2, oy + 5, dark)
    outline(sheet, mw).save(OUT / "medal.png")

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_vaulter()
    make_tiles()
    make_flag()
    make_podium()
    make_official()
    make_rivals()
    make_medal()
    print(f"wrote sprites to {OUT}")
