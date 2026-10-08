// foto.js – Fotos verkleinern, bevor sie gespeichert werden.
// Ein Handyfoto hat oft 3–5 MB. Nach dem Verkleinern auf 400 × 400 px (JPEG)
// sind es meist nur 20–40 KB. Das schont Speicher und macht Backups klein.

// Wandelt eine Bilddatei (aus Kamera oder Galerie) in ein quadratisches,
// verkleinertes JPEG um. Rückgabe: Data-URL ("data:image/jpeg;base64,...").
export async function fotoVerkleinern(datei, maxPixel = 400, qualitaet = 0.8) {
  const url = URL.createObjectURL(datei);
  try {
    const bild = await bildLaden(url);

    // Quadratischen Ausschnitt aus der Bildmitte nehmen (passt in den runden Avatar)
    const seite = Math.min(bild.naturalWidth, bild.naturalHeight);
    const x = (bild.naturalWidth - seite) / 2;
    const y = (bild.naturalHeight - seite) / 2;
    const ziel = Math.min(maxPixel, seite);

    const canvas = document.createElement('canvas');
    canvas.width = ziel;
    canvas.height = ziel;
    canvas.getContext('2d').drawImage(bild, x, y, seite, seite, 0, 0, ziel, ziel);
    return canvas.toDataURL('image/jpeg', qualitaet);
  } finally {
    URL.revokeObjectURL(url); // Speicher wieder freigeben
  }
}

function bildLaden(url) {
  return new Promise((resolve, reject) => {
    const bild = new Image();
    bild.onload = () => resolve(bild);
    bild.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
    bild.src = url;
  });
}
