# Genera los dos diagramas de la entrega a partir del repo y los incrusta (SVG en línea) en el HTML de cada sección:
#   · Diagrama entidad-relación desde supabase/schema.sql (+ las tablas internas de supabase/consulta_referente.sql)
#     -> entre <!-- er:inicio --> y <!-- er:fin --> de fuente/02-modelo.html
#   · Secuencia de nodos del flujo 1 desde n8n/flujo-1-registro.json
#     -> entre <!-- flujo:inicio --> y <!-- flujo:fin --> de fuente/04-flujo.html
# Solo la posición de cada tabla en el lienzo es fija; columnas, tipos, claves y relaciones salen del SQL, y los nodos,
# su orden y sus conexiones salen del JSON.
# Uso (desde la raíz del repo): python entregables/diagramas.py
import json
import re
from html import escape
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FUENTE = Path(__file__).resolve().parent / "fuente"

VERDE, LIMA, CREMA, SALVIA, SUAVE, LINEA = "#142d2b", "#d0ef76", "#fff7f3", "#58958c", "#4a5f5b", "#c9d3d0"
DISPLAY, SANS = "Space Grotesk, sans-serif", "Manrope, sans-serif"


def incrustar(archivo: Path, marca: str, svg: str) -> None:
    html = archivo.read_text(encoding="utf8")
    patron = re.compile(rf"(<!-- {marca}:inicio -->).*?(<!-- {marca}:fin -->)", re.S)
    if not patron.search(html):
        raise SystemExit(f"{archivo.name}: faltan las marcas {marca}:inicio / {marca}:fin")
    archivo.write_text(patron.sub(lambda m: m.group(1) + "\n" + svg + "\n" + m.group(2), html), encoding="utf8")


# ---------------------------------------------------------------------------------------------------------------------
# Diagrama entidad-relación
# ---------------------------------------------------------------------------------------------------------------------

def partir(cuerpo: str) -> list[str]:
    """Separa el cuerpo de un CREATE TABLE por las comas de primer nivel."""
    cuerpo = re.sub(r"--[^\n]*", "", cuerpo)  # los comentarios tienen comas y paréntesis
    partes, nivel, actual = [], 0, ""
    for ch in cuerpo:
        if ch == "(":
            nivel += 1
        elif ch == ")":
            nivel -= 1
        if ch == "," and nivel == 0:
            partes.append(actual)
            actual = ""
        else:
            actual += ch
    partes.append(actual)
    return [re.sub(r"--[^\n]*", "", p).strip() for p in partes if re.sub(r"--[^\n]*", "", p).strip()]


def tablas(sql: str) -> dict:
    res = {}
    for m in re.finditer(r"create table (?:if not exists )?public\.(\w+) \((.*?)\n\);", sql, re.S):
        nombre, cuerpo = m.group(1), m.group(2)
        cols = []
        for item in partir(cuerpo):
            if item.lower().startswith(("constraint", "primary key", "unique")):
                continue
            nom, resto = item.split(None, 1)
            tipo = re.match(r"(public\.\w+|auth\.\w+|numeric\([^)]*\)|text\[\]|\w+)", resto).group(1).replace("public.", "").replace("tipo_", "")
            bajo = resto.lower()
            ref = re.search(r"references (?:public|auth)\.(\w+)", bajo)
            cols.append({
                "nombre": nom,
                "tipo": tipo.replace("numeric(10, 2)", "numeric").replace("timestamptz", "timestamptz"),
                "pk": "primary key" in bajo,
                "uq": " unique" in bajo or bajo.startswith("unique"),
                "gen": "generated always as (" in bajo,
                "ref": (("auth." if "references auth." in bajo else "") + ref.group(1)) if ref else None,
            })
        res[nombre] = cols
    return res


def svg_er() -> str:
    t = tablas((RAIZ / "supabase/schema.sql").read_text(encoding="utf8"))
    t.update(tablas((RAIZ / "supabase/consulta_referente.sql").read_text(encoding="utf8")))
    t["auth.users"] = [{"nombre": "id", "tipo": "uuid", "pk": True, "uq": False, "gen": False, "ref": None}]
    internas = {"secretos_internos", "intentos_consulta_codigo"}

    ANCHO_T, FILA, CAB = 260, 17, 26
    # Posición de cada tabla en el lienzo (x, y). Lo único fijo del diagrama.
    pos = {
        "referentes": (20, 20), "referidos": (320, 20), "candidatos": (620, 20),
        "movimientos_pago": (20, 288), "historial_estados": (320, 288), "configuracion": (620, 334),
        "auth.users": (320, 470), "equipo_reclutamiento": (320, 548),
        "secretos_internos": (620, 470), "intentos_consulta_codigo": (620, 560),
    }
    faltan = set(t) - set(pos)
    if faltan:
        raise SystemExit(f"Tablas sin posición en el diagrama: {faltan}")

    def fila_y(tabla, col):
        x, y = pos[tabla]
        i = [c["nombre"] for c in t[tabla]].index(col)
        return y + CAB + i * FILA + FILA / 2

    partes = []
    # Relaciones primero, para que queden debajo de las tablas.
    rel = []
    for tabla, cols in t.items():
        for c in cols:
            if c["ref"]:
                rel.append((tabla, c["nombre"], c["ref"]))
    for origen, col, destino in rel:
        ox, _ = pos[origen]
        dx, _ = pos[destino]
        y1, y2 = fila_y(origen, col), fila_y(destino, "id")
        if ox == dx:  # misma columna del lienzo: rodea por la izquierda
            x = ox - 12
            d = f"M{ox},{y1} H{x} V{y2} H{dx}"
            nx, ny, ux, uy = ox - 9, y1 - 3, dx - 9, y2 - 3
        elif ox > dx:  # origen a la derecha del destino
            x1, x2 = ox, dx + ANCHO_T
            m = (x1 + x2) / 2
            d = f"M{x1},{y1} C{m},{y1} {m},{y2} {x2},{y2}"
            nx, ny, ux, uy = x1 - 9, y1 - 3, x2 + 3, y2 - 3
        else:
            x1, x2 = ox + ANCHO_T, dx
            m = (x1 + x2) / 2
            d = f"M{x1},{y1} C{m},{y1} {m},{y2} {x2},{y2}"
            nx, ny, ux, uy = x1 + 3, y1 - 3, x2 - 9, y2 - 3
        partes.append(f'<path d="{d}" fill="none" stroke="{SALVIA}" stroke-width="1.3"/>')
        partes.append(f'<text x="{nx}" y="{ny}" font-family="{DISPLAY}" font-size="9" font-weight="600" fill="{SALVIA}">N</text>')
        partes.append(f'<text x="{ux}" y="{uy}" font-family="{DISPLAY}" font-size="9" font-weight="600" fill="{SALVIA}">1</text>')

    for tabla, cols in t.items():
        x, y = pos[tabla]
        alto = CAB + len(cols) * FILA + 4
        interna = tabla in internas
        externa = tabla.startswith("auth.")
        fondo_cab = "#e6ebe9" if (interna or externa) else VERDE
        color_cab = VERDE if (interna or externa) else CREMA
        borde = 'stroke-dasharray="4 3"' if (interna or externa) else ""
        partes.append(f'<rect x="{x}" y="{y}" width="{ANCHO_T}" height="{alto}" rx="5" fill="#fff" stroke="{VERDE}" stroke-width="1" {borde}/>')
        partes.append(f'<path d="M{x},{y + 5} a5,5 0 0 1 5,-5 h{ANCHO_T - 10} a5,5 0 0 1 5,5 v{CAB - 5} h-{ANCHO_T} z" fill="{fondo_cab}"/>')
        partes.append(f'<text x="{x + 10}" y="{y + 17}" font-family="{DISPLAY}" font-size="12" font-weight="600" fill="{color_cab}">{escape(tabla)}</text>')
        if interna or externa:
            etiqueta = "interna" if interna else "Supabase Auth"
            partes.append(f'<text x="{x + ANCHO_T - 10}" y="{y + 17}" text-anchor="end" font-family="{SANS}" font-size="9" font-weight="600" fill="{SUAVE}">{etiqueta}</text>')
        for i, c in enumerate(cols):
            fy = y + CAB + i * FILA
            if i:
                partes.append(f'<line x1="{x + 8}" x2="{x + ANCHO_T - 8}" y1="{fy}" y2="{fy}" stroke="#eef1f0"/>')
            marcas = [m for m, ok in (("PK", c["pk"]), ("FK", c["ref"]), ("UQ", c["uq"]), ("GEN", c["gen"])) if ok]
            peso = "700" if c["pk"] else "500"
            partes.append(f'<text x="{x + 10}" y="{fy + 12}" font-family="{SANS}" font-size="10.5" font-weight="{peso}" fill="{VERDE}">{escape(c["nombre"])}</text>')
            partes.append(f'<text x="{x + 170}" y="{fy + 12}" font-family="{SANS}" font-size="9.5" fill="{SUAVE}">{escape(c["tipo"])}</text>')
            mx = x + 118
            for mk in marcas:
                fondo = LIMA if mk == "PK" else ("#dceeea" if mk == "FK" else "#f1ebe7")
                ancho = 8 + 6.2 * len(mk)
                partes.append(f'<rect x="{mx}" y="{fy + 3.5}" width="{ancho}" height="11" rx="2" fill="{fondo}"/>')
                partes.append(f'<text x="{mx + ancho / 2}" y="{fy + 12}" text-anchor="middle" font-family="{DISPLAY}" font-size="7.5" font-weight="700" fill="{VERDE}">{mk}</text>')
                mx += ancho + 3

    alto_total = max(pos[n][1] + CAB + len(c) * FILA + 4 for n, c in t.items()) + 12
    return (f'<svg class="diagrama" viewBox="0 0 900 {alto_total}" xmlns="http://www.w3.org/2000/svg" role="img" '
            f'aria-label="Diagrama entidad-relación generado desde supabase/schema.sql">' + "".join(partes) + "</svg>")


# ---------------------------------------------------------------------------------------------------------------------
# Secuencia del flujo 1 de n8n
# ---------------------------------------------------------------------------------------------------------------------

TIPOS = {
    "n8n-nodes-base.webhook": "Webhook", "n8n-nodes-base.code": "Código", "n8n-nodes-base.httpRequest": "HTTP",
    "n8n-nodes-base.if": "Condición", "n8n-nodes-base.respondToWebhook": "Respuesta",
}


def svg_flujo() -> str:
    d = json.loads((RAIZ / "n8n/flujo-1-registro.json").read_text(encoding="utf8"))
    nodos = {n["name"]: n for n in d["nodes"]}
    aristas = []  # (origen, salida, destino)
    for origen, tipos in d["connections"].items():
        for salidas in tipos.values():
            for i, destinos in enumerate(salidas):
                for dest in destinos:
                    aristas.append((origen, i, dest["node"]))

    # Rango = camino más largo desde el webhook; la rama principal es la de la salida 0.
    inicio = next(n for n, v in nodos.items() if v["type"].endswith(".webhook"))
    rango = {inicio: 0}
    cambio = True
    while cambio:
        cambio = False
        for o, _, dst in aristas:
            if o in rango and rango.get(dst, -1) < rango[o] + 1:
                rango[dst] = rango[o] + 1
                cambio = True
    # Orden de lectura: por rango y, a igual rango, por la posición vertical que tiene en n8n.
    orden = sorted(nodos, key=lambda n: (rango[n], nodos[n]["position"][1]))
    numero = {n: i + 1 for i, n in enumerate(orden)}
    por_rango = {}
    for n in orden:
        por_rango.setdefault(rango[n], []).append(n)

    COLS, AN, AL, SEP_X, Y_FILA = 6, 146, 62, 168, (10, 196)
    lugar = {}
    for r, ns in por_rango.items():
        fila, col = divmod(r, COLS)
        base_y = Y_FILA[fila]
        for j, n in enumerate(ns):
            # Las ramas secundarias (salida "no" o desvío) van debajo de la fila principal.
            lugar[n] = (10 + col * SEP_X, base_y + j * 82)

    partes = []
    for o, i, dst in aristas:
        x1, y1 = lugar[o]
        x2, y2 = lugar[dst]
        etiqueta = ""
        if nodos[o]["type"].endswith(".if"):
            etiqueta = "sí" if i == 0 else "no"
        if y2 > y1 + 100 and x2 < x1:  # salto de fila: sale por la derecha, baja entre filas y vuelve a la izquierda
            ym = Y_FILA[1] - 16
            d_ = f"M{x1 + AN},{y1 + AL / 2} H{x1 + AN + 10} V{ym} H{x2 + AN / 2} V{y2}"
        elif x2 == x1:
            d_ = f"M{x1 + AN / 2},{y1 + AL} V{y2}"
        elif abs(y2 - y1) < 1 and x2 > x1 + SEP_X:  # salta un nodo de la misma fila: pasa por debajo
            d_ = f"M{x1 + AN / 2},{y1 + AL} V{y1 + AL + 16} H{x2 + AN / 2} V{y1 + AL}"
        else:
            d_ = f"M{x1 + AN},{y1 + AL / 2} C{x1 + AN + 18},{y1 + AL / 2} {x2 - 18},{y2 + AL / 2} {x2},{y2 + AL / 2}"
        partes.append(f'<path d="{d_}" fill="none" stroke="{SALVIA}" stroke-width="1.4" marker-end="url(#punta)"/>')
        if etiqueta:
            if abs(y2 - y1) < 1 and x2 > x1 + SEP_X:
                ex, ey = x1 + AN / 2 + 6, y1 + AL + 13
            elif y2 > y1 and x2 > x1:  # rama que baja hacia la columna siguiente
                ex, ey = x1 + AN + 4, y1 + AL / 2 + 16
            elif y2 > y1:
                ex, ey = x1 + AN / 2 + 6, y1 + AL + 14
            else:
                ex, ey = x1 + AN + 4, y1 + AL / 2 - 5
            partes.append(f'<text x="{ex}" y="{ey}" font-family="{DISPLAY}" font-size="9.5" font-weight="700" fill="{SALVIA}">{etiqueta}</text>')

    for n in orden:
        x, y = lugar[n]
        nodo = nodos[n]
        sigue = nodo.get("onError") == "continueRegularOutput"
        error = nodo["type"].endswith("respondToWebhook") and nodo["parameters"].get("options", {}).get("responseCode") != 200
        borde = 'stroke-dasharray="4 3"' if sigue else ""
        fondo = "#fff1ec" if error else "#fff"
        partes.append(f'<rect x="{x}" y="{y}" width="{AN}" height="{AL}" rx="6" fill="{fondo}" stroke="{VERDE}" stroke-width="1.1" {borde}/>')
        partes.append(f'<circle cx="{x + 14}" cy="{y + 14}" r="8.5" fill="{LIMA}"/>')
        partes.append(f'<text x="{x + 14}" y="{y + 17.5}" text-anchor="middle" font-family="{DISPLAY}" font-size="9.5" font-weight="700" fill="{VERDE}">{numero[n]}</text>')
        partes.append(f'<text x="{x + 28}" y="{y + 18}" font-family="{SANS}" font-size="10" font-weight="600" fill="{SUAVE}">{TIPOS.get(nodo["type"], nodo["type"])}</text>')
        # Nombre en una o dos líneas.
        palabras, lineas, actual = n.split(), [], ""
        for p in palabras:
            if len(actual + " " + p) > 17 and actual:
                lineas.append(actual)
                actual = p
            else:
                actual = (actual + " " + p).strip()
        lineas.append(actual)
        for k, linea in enumerate(lineas[:2]):
            partes.append(f'<text x="{x + 10}" y="{y + 38 + k * 15}" font-family="{DISPLAY}" font-size="13" font-weight="600" fill="{VERDE}">{escape(linea)}</text>')

    defs = (f'<defs><marker id="punta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">'
            f'<path d="M0,0 L8,4 L0,8 z" fill="{SALVIA}"/></marker></defs>')
    alto = max(y for _, y in lugar.values()) + AL + 30  # lugar para el desvío que pasa por debajo
    return (f'<svg class="diagrama" viewBox="0 0 {10 + (COLS - 1) * SEP_X + AN + 16} {alto}" xmlns="http://www.w3.org/2000/svg" role="img" '
            f'aria-label="Secuencia de nodos del flujo 1, generada desde n8n/flujo-1-registro.json">' + defs + "".join(partes) + "</svg>")


if __name__ == "__main__":
    incrustar(FUENTE / "02-modelo.html", "er", svg_er())
    incrustar(FUENTE / "04-flujo.html", "flujo", svg_flujo())
    print("diagramas incrustados en 02-modelo.html y 04-flujo.html")
