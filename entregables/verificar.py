# Verifica los PDF de la entrega y deja una imagen por página para revisarlos a ojo.
# Uso (desde la raíz del repo): python entregables/verificar.py
#   · Páginas: se cuentan desde el PDF (no desde las imágenes). Las imágenes viejas se borran antes de generar las nuevas.
#   · Fuentes: todas incrustadas y de la marca (Space Grotesk o Manrope); cualquier otra delata un carácter sin cubrir.
#   · Desbordes: texto fuera del área imprimible.
#   · Secciones: en el PDF único, en qué página empieza cada una (cada una tiene que arrancar en página nueva).
#   · Esquema: exactamente 1 página.
import re
import sys
from pathlib import Path

import pymupdf

DIR = Path(__file__).parent
VISTAS = DIR / "fuente" / "vistas"
VISTAS.mkdir(parents=True, exist_ok=True)
for viejo in VISTAS.glob("*.png"):
    viejo.unlink()

problemas = []
for pdf in sorted(DIR.glob("*.pdf")):
    doc = pymupdf.open(pdf)
    print(f"{pdf.name}: {doc.page_count} página(s)")
    fuentes = {}
    for i, pagina in enumerate(doc, 1):
        for f in pagina.get_fonts(full=True):
            fuentes[f[3]] = f[1]
        ancho, alto = pagina.rect.width, pagina.rect.height
        for b in pagina.get_text("blocks"):
            if b[0] < 0 or b[1] < 0 or b[2] > ancho or b[3] > alto:
                problemas.append(f"{pdf.name} p{i}: texto fuera de la página: {b[4][:50]!r}")
        pagina.get_pixmap(dpi=110).save(VISTAS / f"{pdf.stem}-p{i}.png")
    for nombre, ext in sorted(fuentes.items()):
        limpio = re.sub(r"^[A-Z]{6}\+", "", nombre)
        if ext == "n/a":
            problemas.append(f"{pdf.name}: fuente no incrustada: {nombre}")
        if not re.match(r"(SpaceGrotesk|Manrope)", limpio):
            problemas.append(f"{pdf.name}: fuente ajena a la marca: {limpio}")
    print("    fuentes: " + ", ".join(sorted({re.sub(r'^[A-Z]{6}\+', '', n) for n in fuentes})))
    autor = doc.metadata.get("author")
    print(f"    autor: {autor!r} · título: {doc.metadata.get('title')!r}")
    if autor != "Mateo Camilion":
        problemas.append(f"{pdf.name}: autor en metadatos = {autor!r}")
    texto = "".join(p.get_text() for p in doc)
    # Marcadores sin completar: <texto> (el operador SQL <> no cuenta) o las palabras de plantilla.
    for m in re.finditer(r"<[^<>\s][^<>]{0,40}>|NOMBRE|APELLIDO|NombreApellido", texto):
        problemas.append(f"{pdf.name}: posible marcador sin completar: {m.group(0)!r}")
    if pdf.name == "01-esquema.pdf" and doc.page_count != 1:
        problemas.append(f"01-esquema.pdf tiene {doc.page_count} páginas: tiene que ser 1")
    if pdf.name.startswith("WorldTeams"):
        for n, titulo in enumerate(["Esquema del programa", "Modelo de datos", "Landing para referir",
                                    "Flujo de automatización", "Nota de decisiones"], 1):
            paginas = [i for i, p in enumerate(doc, 1) if p.search_for(titulo) and
                       any(titulo in b[4] and b[1] < 140 for b in p.get_text("blocks"))]
            print(f"    sección {n} ({titulo}) empieza en la página {paginas[0] if paginas else '¿?'}")

print("\nSin problemas." if not problemas else "\nPROBLEMAS:\n  " + "\n  ".join(problemas))
sys.exit(1 if problemas else 0)
