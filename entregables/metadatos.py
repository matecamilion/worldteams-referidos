# Fija los metadatos de los PDF de la entrega (Chrome no escribe el autor). Lo llama generar.mjs.
from pathlib import Path

import pymupdf

DIR = Path(__file__).parent
AUTOR = "Mateo Camilion"
TITULOS = {
    "WorldTeams-Referidos-Mateo-Camilion.pdf": "Programa de referidos de talento — WorldTeams",
    "01-esquema.pdf": "1. Esquema del programa",
    "02-modelo.pdf": "2. Modelo de datos",
    "03-landing.pdf": "3. Landing para referir",
    "04-flujo.pdf": "4. Flujo de automatización",
    "05-nota.pdf": "5. Nota de decisiones",
}
for nombre, titulo in TITULOS.items():
    ruta = DIR / nombre
    doc = pymupdf.open(ruta)
    meta = doc.metadata
    meta.update({"author": AUTOR, "title": titulo,
                 "subject": "Ejercicio práctico — Web & Automation Developer · WorldTeams"})
    doc.set_metadata(meta)
    doc.saveIncr()
    doc.close()
    print(f"  metadatos: {nombre}")
