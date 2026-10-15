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
  vehicle_*.png - the traffic's vehicles (bus, lorry, car, houseRig, transporter), sized to their
                 solid shapes in src/data/vehicles.ts (wheels are drawn in game)
  busstop.png, lamp.png, bridge.png, warning.png, gantry.png, tree.png, building.png,
  canopy.png, farebox.png - things fixed to the road, and the bus's fare box
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


# --- The traffic (v0.9) ------------------------------------------------------
# Vehicle sprites match the solid shapes in src/data/vehicles.ts: width = columns x 16,
# height = rows x 16 + the drawn-only space above (tests/traffic.test.ts checks the sizes).
# Wheels are left out: the game draws them spinning. Text is drawn in game (pixel font).

VEHICLES = {  # type: (columns, rows, above)
    "bus": (18, 2, 12),
    "lorry": (7, 4, 0),
    "car": (6, 1, 0),
    "houseRig": (30, 5, 6),
    "transporter": (23, 5, 0),
}

DARK = (28, 26, 34, 255)
GLASS = (54, 70, 104, 255)
LIT = (255, 214, 120, 255)
LIT_DIM = (204, 160, 84, 255)
STEEL, STEEL_DARK, STEEL_LIGHT = (120, 126, 138, 255), (78, 82, 94, 255), (170, 176, 188, 255)
HEADLIGHT = (255, 250, 210, 255)
TAIL = (220, 40, 30, 255)


def window(d, x0, y0, x1, y1, lit=True):
    rect(d, x0, y0, x1, y1, LIT if lit else GLASS)
    rect(d, x0, y1, x1, y1, LIT_DIM if lit else DARK)


def arch(d, cx, base, r):
    """Dark wheel arch (the wheel itself is drawn by the game)."""
    for y in range(base - r - 2, base):
        for x in range(cx - r - 2, cx + r + 3):
            if (x - cx) ** 2 + (y - base) ** 2 <= (r + 2) ** 2:
                px(d, x, y, DARK)


def make_bus(d, w, h, top):
    red, red_dark, red_light = (200, 40, 44, 255), (140, 24, 30, 255), (236, 88, 80, 255)
    cream = (236, 222, 180, 255)
    deck = top            # top deck floor (h2)
    plat = top + 16       # rear platform floor (h1)
    # Lower deck body under the top deck, the platform, and the rear step (a ramp up to it).
    rect(d, 64, deck, w - 1, h - 1, red)
    rect(d, 16, plat, 63, h - 1, red)
    for i in range(16):
        rect(d, 15 - i, h - 1 - i, 15, h - 1 - i, red_dark)
    rect(d, 16, plat, 47, plat + 1, STEEL_LIGHT)
    # Stairs (column 3) up to the top deck.
    for i in range(16):
        rect(d, 48 + i, plat - i - 1, 63, plat - i - 1, STEEL)
    for i in range(0, 16, 3):
        d.line((48 + i, plat - i - 1, 50 + i, plat - i - 1), fill=STEEL_LIGHT)
    rect(d, 30, plat - 12, 30, plat, STEEL_LIGHT)   # grab pole on the platform
    # Cream bands and lit lower-deck windows.
    rect(d, 64, deck, w - 1, deck + 2, cream)
    rect(d, 16, h - 6, w - 1, h - 5, cream)
    for x in range(70, w - 26, 18):
        window(d, x, deck + 5, x + 13, deck + 15)
    # Driver's cab, headlight, tail light.
    window(d, w - 18, deck + 5, w - 4, deck + 17, lit=False)
    rect(d, w - 3, h - 9, w - 1, h - 7, HEADLIGHT)
    rect(d, 17, plat + 3, 18, plat + 5, TAIL)
    # Open top deck: a railing (drawn only) and a low front screen.
    rail = (226, 226, 230, 255)
    rect(d, 64, deck - 8, w - 1, deck - 8, rail)
    for x in range(64, w, 12):
        rect(d, x, deck - 8, x, deck - 1, rail)
    rect(d, w - 4, deck - 12, w - 1, deck - 1, red_light)
    rect(d, w - 3, deck - 11, w - 2, deck - 5, GLASS)
    # Destination blind (text drawn in game).
    rect(d, w - 46, deck + 18, w - 22, deck + 24, DARK)
    d.line((64, deck, w - 1, deck), fill=red_light)
    for cx in (44, 240):
        arch(d, cx, h, 6)


def make_lorry(d, w, h, top):
    box, box_dark, box_light = (226, 228, 232, 255), (170, 172, 180, 255), (250, 250, 252, 255)
    rect(d, 0, top, w - 1, h - 17, box)
    rect(d, 0, top, w - 1, top + 1, box_light)
    d.line((0, top, 0, h - 17), fill=box_dark)
    rect(d, 8, top + 16, w - 9, top + 25, (40, 120, 200, 255))   # the firm's stripe (name in game)
    rect(d, 8, top + 26, w - 9, top + 27, (230, 190, 40, 255))
    # Cab under the front of the box (the Luton overhang), chassis behind it.
    rect(d, w - 26, h - 16, w - 1, h - 1, (60, 90, 170, 255))
    window(d, w - 16, h - 15, w - 3, h - 9, lit=False)
    rect(d, w - 2, h - 5, w - 1, h - 3, HEADLIGHT)
    rect(d, 0, h - 16, w - 27, h - 1, STEEL_DARK)
    rect(d, 1, h - 6, 2, h - 4, TAIL)
    for cx in (22, 90):
        arch(d, cx, h, 7)


def make_car(d, w, h, top):
    paint, paint_dark, paint_light = (240, 200, 40, 255), (184, 140, 20, 255), (255, 236, 120, 255)
    # A low wedge: its roof is the solid top.
    rect(d, 2, top + 3, w - 1, h - 3, paint)
    rect(d, 18, top, 62, top + 3, paint)
    d.polygon([(62, top), (w - 1, top + 6), (w - 1, top + 9), (62, top + 3)], fill=paint)
    rect(d, 40, top + 1, 58, top + 3, GLASS)
    d.line((2, top + 3, w - 1, top + 3), fill=paint_light)
    rect(d, 0, top + 4, 2, h - 4, paint_dark)
    rect(d, 0, top + 5, 1, top + 6, TAIL)
    rect(d, w - 2, top + 9, w - 1, top + 10, HEADLIGHT)
    rect(d, 2, h - 3, w - 1, h - 1, DARK)
    for cx in (16, 78):
        arch(d, cx, h, 5)


def make_house_rig(d, w, h, top):
    deck = top + 64       # the dollies' deck (h1)
    van, van_dark, van_light = (232, 228, 214, 255), (184, 178, 162, 255), (250, 248, 240, 255)
    # Supports on the far side (dark), from the caravan down to the decks.
    for x0 in (10 * 16 + 2, 26 * 16 - 8):
        rect(d, x0, top + 32, x0 + 5, deck - 1, (58, 54, 64, 255))
    # Dolly A, the drawbar across the gap, dolly B, and the little tug at the front.
    rect(d, 0, deck, 16 * 16 - 1, h - 1, STEEL_DARK)
    rect(d, 0, deck, 16 * 16 - 1, deck + 2, STEEL)
    rect(d, 19 * 16, deck, w - 1, h - 1, STEEL_DARK)
    rect(d, 19 * 16, deck, w - 1, deck + 2, STEEL)
    rect(d, 16 * 16, h - 6, 19 * 16 - 1, h - 5, STEEL)
    rect(d, 27 * 16, deck + 3, w - 1, h - 1, (236, 180, 40, 255))
    rect(d, w - 7, deck + 4, w - 2, deck + 9, GLASS)
    rect(d, w - 2, h - 7, w - 1, h - 5, HEADLIGHT)
    for x in (6, 100, 200, 340, 390):
        rect(d, x, deck + 6, x + 5, deck + 8, (230, 190, 40, 255))
    # The static caravan.
    rect(d, 10 * 16, top, 27 * 16 - 1, top + 31, van)
    rect(d, 10 * 16, top, 27 * 16 - 1, top + 1, van_light)
    rect(d, 10 * 16, top + 29, 27 * 16 - 1, top + 31, van_dark)
    rect(d, 10 * 16, top + 14, 27 * 16 - 1, top + 15, (120, 170, 140, 255))
    for x in range(10 * 16 + 52, 27 * 16 - 20, 34):
        window(d, x, top + 5, x + 14, top + 12)
    rect(d, 20 * 16, top + 6, 20 * 16 + 9, top + 28, (150, 110, 80, 255))   # the door
    rect(d, 10 * 16 + 4, top + 4, 10 * 16 + 44, top + 12, (230, 190, 40, 255))  # WIDE LOAD board (text in game)
    # A TV aerial on the roof (drawn only).
    rect(d, 23 * 16, top - 6, 23 * 16, top - 1, STEEL_LIGHT)
    rect(d, 23 * 16 - 4, top - 5, 23 * 16 + 4, top - 5, STEEL_LIGHT)
    for cx in (24, 228, 332, 428, 464):
        arch(d, cx, h, 5)


def make_transporter(d, w, h, top):
    blue, blue_dark = (70, 80, 110, 255), (46, 52, 74, 255)
    # Frame: everything under the ramp and the upper deck.
    rect(d, 0, top + 64, w - 1, h - 1, STEEL_DARK)
    for i in range(4):
        x = (3 + i) * 16
        d.polygon([(x, top + 64 - 16 * i), (x + 16, top + 48 - 16 * i), (x + 16, top + 64), (x, top + 64)], fill=STEEL_DARK)
    rect(d, 7 * 16, top, w - 1, top + 63, STEEL_DARK)
    # The ramp's treads and the upper deck's edge.
    for i in range(4):
        x = (3 + i) * 16
        d.line((x, top + 64 - 16 * i, x + 16, top + 48 - 16 * i), fill=STEEL_LIGHT)
        d.line((x, top + 65 - 16 * i, x + 16, top + 49 - 16 * i), fill=STEEL)
    rect(d, 7 * 16, top, w - 1, top + 2, STEEL_LIGHT)
    rect(d, 0, top + 64, 3 * 16 - 1, top + 66, STEEL_LIGHT)
    # Cars parked on the lower deck.
    colours = [(200, 40, 44, 255), (52, 96, 196, 255), (236, 236, 232, 255), (60, 160, 90, 255), (240, 200, 40, 255)]
    for i, x in enumerate(range(116, w - 76, 48)):
        c = colours[i % len(colours)]
        rect(d, x, top + 46, x + 38, top + 56, c)
        rect(d, x + 8, top + 40, x + 28, top + 46, c)
        rect(d, x + 11, top + 41, x + 25, top + 45, GLASS)
        rect(d, x + 4, top + 56, x + 8, top + 59, DARK)
        rect(d, x + 30, top + 56, x + 34, top + 59, DARK)
    # Cab at the front, under the upper deck.
    rect(d, w - 30, top + 20, w - 1, h - 1, blue)
    rect(d, w - 30, top + 20, w - 1, top + 21, blue_dark)
    window(d, w - 18, top + 26, w - 3, top + 40, lit=False)
    rect(d, w - 2, h - 8, w - 1, h - 6, HEADLIGHT)
    for cx in (20, 40, 60, 284, 344):
        arch(d, cx, h, 6)


def make_vehicles() -> None:
    drawers = {"bus": make_bus, "lorry": make_lorry, "car": make_car, "houseRig": make_house_rig, "transporter": make_transporter}
    for name, (cols, rows, above) in VEHICLES.items():
        w, h = cols * 16, rows * 16 + above
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        drawers[name](ImageDraw.Draw(img), w, h, above)
        img.save(OUT / f"vehicle_{name}.png")


def make_roadside() -> None:
    """Things fixed to the road: bus stop, lamp post, low bridge, warning sign, sign gantry,
    tree, the tall building's lower floors and its entrance canopy; and the bus's fare box."""
    conc, conc_dark, conc_light = (110, 108, 112, 255), (78, 76, 82, 255), (150, 148, 150, 255)
    # Bus stop: a shelter with a lit timetable, and the stop's flag.
    img = Image.new("RGBA", (48, 44), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 2, 4, 33, 6, STEEL_DARK)
    rect(d, 3, 7, 4, 43, STEEL_DARK)
    rect(d, 31, 7, 32, 43, STEEL_DARK)
    rect(d, 5, 9, 30, 36, (120, 150, 190, 90))
    rect(d, 22, 12, 28, 26, LIT)
    rect(d, 8, 33, 26, 34, STEEL)
    rect(d, 42, 2, 42, 43, STEEL_LIGHT)
    rect(d, 37, 2, 47, 11, (200, 40, 44, 255))
    rect(d, 39, 4, 45, 9, (236, 236, 232, 255))
    img.save(OUT / "busstop.png")
    # Lamp post: tall, the lamp reaching out over the road.
    img = Image.new("RGBA", (24, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 3, 6, 4, 119, STEEL_DARK)
    rect(d, 2, 112, 5, 119, STEEL)
    rect(d, 4, 4, 18, 5, STEEL_DARK)
    rect(d, 14, 6, 21, 8, (255, 236, 170, 255))
    img.save(OUT / "lamp.png")
    # Low bridge: the deck in section (40 x 14, chevrons on its face) and its pier on the far side.
    img = Image.new("RGBA", (40, 100), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 8, 14, 31, 99, conc_dark)
    d.line((8, 14, 8, 99), fill=conc)
    rect(d, 0, 0, 39, 13, conc)
    rect(d, 0, 0, 39, 1, conc_light)
    for x in range(0, 40, 8):
        d.polygon([(x, 6), (x + 4, 6), (x + 8, 12), (x + 4, 12)], fill=(230, 190, 40, 255))
    img.save(OUT / "bridge.png")
    # Warning sign: a post, a red-rimmed triangle and a plate (text in game).
    img = Image.new("RGBA", (28, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 13, 20, 14, 63, STEEL_DARK)
    d.polygon([(14, 0), (27, 18), (0, 18)], fill=(220, 40, 30, 255))
    d.polygon([(14, 4), (23, 16), (5, 16)], fill=(250, 250, 250, 255))
    rect(d, 12, 8, 15, 13, DARK)
    rect(d, 1, 20, 26, 28, (250, 250, 250, 255))
    img.save(OUT / "warning.png")
    # Sign gantry: a green board high over the road (text in game), legs on the far side.
    img = Image.new("RGBA", (96, 170), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 2, 0, 3, 169, STEEL_DARK)
    rect(d, 92, 0, 93, 169, STEEL_DARK)
    rect(d, 0, 6, 95, 7, STEEL_DARK)
    rect(d, 8, 8, 87, 30, (30, 120, 70, 255))
    d.rectangle((9, 9, 86, 29), outline=(240, 240, 240, 255))
    img.save(OUT / "gantry.png")
    # A street tree.
    img = Image.new("RGBA", (40, 80), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 18, 36, 21, 79, (80, 58, 40, 255))
    d.ellipse((2, 0, 37, 40), fill=(40, 84, 52, 255))
    d.ellipse((8, 4, 28, 22), fill=(56, 108, 66, 255))
    img.save(OUT / "tree.png")
    # The tall building's lower floors (its top goes off screen): lit windows, a doorway.
    rnd = __import__("random").Random(7)
    img = Image.new("RGBA", (240, 400), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 0, 0, 239, 399, (58, 64, 84, 255))
    for y in range(8, 340, 20):
        for x in range(10, 230, 16):
            window(d, x, y, x + 9, y + 11, lit=rnd.random() < 0.55)
    rect(d, 60, 344, 179, 399, (40, 44, 58, 255))
    rect(d, 80, 352, 159, 399, LIT)
    d.line((120, 352, 120, 399), fill=LIT_DIM)
    img.save(OUT / "building.png")
    # The entrance canopy: 160 x 6 (the solid part), a fascia with lights underneath.
    img = Image.new("RGBA", (160, 9), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 0, 0, 159, 5, (200, 40, 44, 255))
    rect(d, 0, 0, 159, 0, (236, 88, 80, 255))
    for x in range(6, 160, 14):
        rect(d, x, 6, x + 3, 7, LIT)
    img.save(OUT / "canopy.png")
    # The fare box on the bus's platform: a little ticket machine on a post.
    img = Image.new("RGBA", (8, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect(d, 3, 8, 4, 15, STEEL_DARK)
    rect(d, 0, 0, 7, 8, STEEL)
    rect(d, 1, 1, 6, 3, (60, 180, 90, 255))
    rect(d, 2, 5, 5, 5, DARK)
    img.save(OUT / "farebox.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_vaulter()
    make_tiles()
    make_flag()
    make_podium()
    make_official()
    make_rivals()
    make_medal()
    make_vehicles()
    make_roadside()
    print(f"wrote sprites to {OUT}")
