# Erzeugt die App-Symbole der Sitzplan-App (Pillow).
# Aufruf (im Projektordner): py -I icons/symbole-erzeugen.py icons
# Braucht Python mit Pillow (pip install pillow). Danach in sw.js die VERSION erhöhen.
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 2048          # Zeichenfläche (wird am Ende verkleinert -> glatte Kanten)
U = S / 1024      # Entwurf in 1024 Einheiten

BLAU_HELL = (59, 130, 246)     # oben links
BLAU_DUNKEL = (30, 64, 175)    # unten rechts
TAFEL = (20, 83, 45)
TAFEL_RAND = (34, 120, 70)
WEISS = (255, 255, 255)

# Plätze: 3 Reihen, 2 + 2 Tische mit Gang. None = freier Platz
BELEGUNG = [
    ['#f59e0b', '#10b981', None, '#ec4899'],
    ['#8b5cf6', '#06b6d4', '#f97316', '#22c55e'],
    [None, '#ef4444', '#facc15', '#a855f7'],
]
SPALTEN_X = [160, 330, 546, 716]   # linke Kante je Spalte
ZEILEN_Y = [313, 499, 685]         # obere Kante je Reihe
PLATZ = 148
TAFEL_BOX = (160, 186, 864, 254)


def u(*werte):
    return [v * U for v in werte]


def verlauf():
    """Diagonaler Farbverlauf von oben links nach unten rechts."""
    bild = Image.new('RGB', (S, S))
    d = ImageDraw.Draw(bild)
    for i in range(2 * S):
        t = i / (2 * S - 1)
        farbe = tuple(round(a + (b - a) * t) for a, b in zip(BLAU_HELL, BLAU_DUNKEL))
        d.line([(i, 0), (0, i)], fill=farbe, width=3)
    return bild


def inhalt(skala=1.0):
    """Tafel und Plätze auf transparentem Grund (um die Mitte skaliert)."""
    ebene = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    schatten = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    m = 512

    def box(x1, y1, x2, y2):
        return u(m + (x1 - m) * skala, m + (y1 - m) * skala, m + (x2 - m) * skala, m + (y2 - m) * skala)

    d = ImageDraw.Draw(ebene)
    ds = ImageDraw.Draw(schatten)

    # Tafel mit hellerem Rahmen
    x1, y1, x2, y2 = TAFEL_BOX
    ds.rounded_rectangle(box(x1, y1 + 6, x2, y2 + 6), radius=22 * U * skala, fill=(10, 20, 60, 110))
    d.rounded_rectangle(box(x1, y1, x2, y2), radius=22 * U * skala, fill=TAFEL_RAND)
    d.rounded_rectangle(box(x1 + 7, y1 + 7, x2 - 7, y2 - 7), radius=16 * U * skala, fill=TAFEL)

    # Plätze: weiße Tische mit Schatten, auf den belegten eine Person (Kopf + Schultern).
    # Die Schultern werden an IHREM Tisch abgeschnitten, wie bei einem Profilbild.
    groesse = round(PLATZ * U * skala)
    k = groesse / PLATZ
    tischmaske = Image.new('L', (groesse, groesse), 0)
    ImageDraw.Draw(tischmaske).rounded_rectangle([0, 0, groesse - 1, groesse - 1], radius=30 * k, fill=255)

    def person(farbe):
        p = Image.new('RGBA', (groesse, groesse), (0, 0, 0, 0))
        dp = ImageDraw.Draw(p)
        dp.ellipse([47 * k, 30 * k, 101 * k, 84 * k], fill=farbe)     # Kopf
        dp.ellipse([26 * k, 94 * k, 122 * k, 200 * k], fill=farbe)    # Schultern
        p.putalpha(ImageChops.multiply(p.getchannel('A'), tischmaske))
        return p

    for r, y in enumerate(ZEILEN_Y):
        for c, x in enumerate(SPALTEN_X):
            farbe = BELEGUNG[r][c]
            b = box(x, y, x + PLATZ, y + PLATZ)
            if farbe is None:
                d.rounded_rectangle(b, radius=30 * U * skala, fill=(255, 255, 255, 90))
                continue
            ds.rounded_rectangle(box(x, y + 9, x + PLATZ, y + PLATZ + 9), radius=30 * U * skala, fill=(10, 20, 60, 120))
            d.rounded_rectangle(b, radius=30 * U * skala, fill=WEISS + (255,))
            ebene.alpha_composite(person(farbe), dest=(round(b[0]), round(b[1])))

    schatten = schatten.filter(ImageFilter.GaussianBlur(14 * U))
    return Image.alpha_composite(schatten, ebene)


def kachel(randlos):
    """randlos=False: abgerundete Kachel mit transparenten Ecken (Windows, Browser).
       randlos=True:  ganze Fläche gefüllt (iPhone, Android rundet selbst ab)."""
    grund = verlauf().convert('RGBA')
    # Leichter Glanz oben
    glanz = Image.new('L', (S, S), 0)
    ImageDraw.Draw(glanz).ellipse(u(-200, -620, 1224, 420), fill=46)
    glanz = glanz.filter(ImageFilter.GaussianBlur(80 * U))
    grund = Image.composite(Image.new('RGBA', (S, S), WEISS + (255,)), grund, glanz)

    if randlos:
        bild = grund
        bild.alpha_composite(inhalt(0.8 if randlos == 'maskable' else 0.94))
    else:
        rand = 40
        maske = Image.new('L', (S, S), 0)
        ImageDraw.Draw(maske).rounded_rectangle(u(rand, rand, 1024 - rand, 1024 - rand), radius=200 * U, fill=255)
        # Schatten der Kachel selbst (dezent, unten)
        tschatten = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(tschatten).rounded_rectangle(u(rand + 8, rand + 18, 1024 - rand - 8, 1024 - rand + 10), radius=200 * U, fill=(10, 20, 50, 90))
        tschatten = tschatten.filter(ImageFilter.GaussianBlur(14 * U))
        bild = tschatten
        kachel_bild = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        kachel_bild.paste(grund, (0, 0), maske)
        bild = Image.alpha_composite(bild, kachel_bild)
        # feiner heller Rand oben (wirkt plastischer)
        bild.alpha_composite(inhalt(1.0))
    return bild


def speichern(bild, pfad, groesse, deckend=False):
    klein = bild.resize((groesse, groesse), Image.LANCZOS)
    if deckend:
        klein = klein.convert('RGB')
    klein.save(pfad, optimize=True)
    print(pfad, groesse)


if __name__ == '__main__':
    ziel = sys.argv[1]
    rund = kachel(False)
    speichern(rund, f'{ziel}/icon-512.png', 512)
    speichern(rund, f'{ziel}/icon-192.png', 192)
    speichern(rund, f'{ziel}/favicon-32.png', 32)
    speichern(kachel('maskable'), f'{ziel}/icon-maskable-512.png', 512, deckend=True)
    speichern(kachel('apple'), f'{ziel}/apple-touch-icon.png', 180, deckend=True)
