import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { datosDemo } from "@/lib/panel-demo";
import type { Aviso } from "@/lib/resolver";

const ruta = vi.hoisted(() => ({ actual: "/panel" }));
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/BotonSalir", () => ({ BotonSalir: () => null }));

import { NavegacionPanel } from "./NavegacionPanel";
import { VistaPool, VistaRevision } from "./VistaPanel";

const accion = async () => ({ error: null });

beforeEach(() => {
  ruta.actual = "/panel";
});

describe("NavegacionPanel", () => {
  const actual = (html: string) => [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]*)</g)].map((m) => m[1]);

  it("en /panel marca Revisión y enlaza a las dos páginas con enlaces comunes", () => {
    const html = renderToStaticMarkup(<NavegacionPanel />);
    expect(actual(html)).toEqual(["Revisión"]);
    expect(html).toContain('href="/panel"');
    expect(html).toContain('href="/panel/pool"');
  });
  it("en /panel/pool (con o sin barra final) marca Talent pool", () => {
    for (const r of ["/panel/pool", "/panel/pool/"]) {
      ruta.actual = r;
      expect(actual(renderToStaticMarkup(<NavegacionPanel />))).toEqual(["Talent pool"]);
    }
  });
  it("la vista de prueba usa sus propias rutas", () => {
    ruta.actual = "/dev/panel/pool";
    const html = renderToStaticMarkup(<NavegacionPanel base="/dev/panel" />);
    expect(actual(html)).toEqual(["Talent pool"]);
    expect(html).toContain('href="/dev/panel/pool"');
  });
});

describe("VistaRevision", () => {
  it("muestra En revisión y Vencidos, sin la métrica del pool ni el buscador", () => {
    const { cfg, cola } = datosDemo({});
    const html = renderToStaticMarkup(<VistaRevision zona={cfg.zona} plazo={cfg.plazoRevisionDias} cola={cola} accion={accion} />);
    expect(html).toContain("En revisión");
    expect(html).toContain("Vencidos");
    expect(html).not.toContain("Total en el pool");
    expect(html).not.toContain('role="search"');
    expect(html).toContain('data-slot="acciones-revision"');
  });
  it("sin casos muestra el estado vacío", () => {
    const { cfg, cola } = datosDemo({ modo: "vacio" });
    expect(renderToStaticMarkup(<VistaRevision zona={cfg.zona} plazo={3} cola={cola} accion={accion} />)).toContain('data-testid="cola-vacia"');
  });
});

describe("VistaPool", () => {
  it("el formulario GET apunta a /panel/pool y la paginación conserva q, estado y página", () => {
    const { cfg, pool, params } = datosDemo({ estado: "validado", pagina: "2" });
    const html = renderToStaticMarkup(<VistaPool zona={cfg.zona} pool={pool} params={params} accion={accion} />);
    expect(html).toContain('action="/panel/pool"');
    expect(html).toContain('href="/panel/pool?estado=validado"'); // anterior: vuelve a la página 1
    expect(html).toContain('<option value="validado" selected="">');
    expect(html).toContain('name="estado"');
    expect(html).toContain("Página 2 de");
    const conBusqueda = datosDemo({ q: "persona1", pagina: "1" });
    expect(renderToStaticMarkup(<VistaPool zona={cfg.zona} pool={conBusqueda.pool} params={conBusqueda.params} accion={accion} />)).toContain('value="persona1"');
  });
  it("sin filtro dice «Total en el pool» y con filtro «Coinciden con el filtro»", () => {
    const sin = datosDemo({});
    expect(renderToStaticMarkup(<VistaPool zona={sin.cfg.zona} pool={sin.pool} params={sin.params} accion={accion} />)).toContain("Total en el pool");
    const con = datosDemo({ estado: "validado" });
    const html = renderToStaticMarkup(<VistaPool zona={con.cfg.zona} pool={con.pool} params={con.params} accion={accion} />);
    expect(html).toContain("Coinciden con el filtro");
    expect(html).not.toContain("Total en el pool");
    expect(html).not.toContain("Vencidos");
  });
  it("el filtro no ofrece «Registrado» y llama «Ya estaba en el pool» al descartado (valores sin cambios)", () => {
    const { cfg, pool, params } = datosDemo({});
    const html = renderToStaticMarkup(<VistaPool zona={cfg.zona} pool={pool} params={params} accion={accion} />);
    const opciones = html.slice(html.indexOf('<select id="pool-estado"'), html.indexOf("</select>", html.indexOf('<select id="pool-estado"')));
    expect(opciones).not.toContain('value="registrado"');
    expect(opciones).toContain('<option value="descartado">Ya estaba en el pool</option>');
    expect(opciones).not.toContain(">Descartado<");
    for (const v of ["en_revision", "validado", "rechazado"]) expect(opciones).toContain(`value="${v}"`);
  });
  it("un link viejo con estado=registrado conserva esa opción para no mostrar «Todos» con el filtro aplicado", () => {
    const { cfg, pool, params } = datosDemo({ estado: "registrado" });
    expect(renderToStaticMarkup(<VistaPool zona={cfg.zona} pool={pool} params={params} accion={accion} />)).toContain('<option value="registrado" selected="">Registrado</option>');
  });
  it("el chip de la tabla usa la misma etiqueta para el descartado", () => {
    const { cfg, pool, params } = datosDemo({ estado: "descartado" });
    const html = renderToStaticMarkup(<VistaPool zona={cfg.zona} pool={pool} params={params} accion={accion} />);
    expect(html).toContain("Ya estaba en el pool</span>");
    expect(html).not.toContain(">Descartado<");
  });
  it("sin resultados muestra el estado vacío", () => {
    const { cfg, pool, params } = datosDemo({ q: "zzzz" });
    expect(renderToStaticMarkup(<VistaPool zona={cfg.zona} pool={pool} params={params} accion={accion} />)).toContain('data-testid="pool-vacio"');
  });
});

describe("buscador y filtro del pool (respaldo sin JavaScript)", () => {
  const html = (campos: Record<string, string> = {}) => {
    const { cfg, pool, params } = datosDemo(campos);
    return renderToStaticMarkup(<VistaPool zona={cfg.zona} pool={pool} params={params} accion={accion} />);
  };

  it("sigue siendo un formulario GET a /panel/pool, con los mismos nombres de campo", () => {
    const h = html();
    expect(h).toContain('role="search"');
    expect(h).toContain('method="get"');
    expect(h).toContain('action="/panel/pool"');
    expect(h).toContain('name="q"');
    expect(h).toContain('name="estado"');
  });
  it("el botón Buscar existe solo dentro de <noscript>: sin JavaScript se ve, con JavaScript React no lo monta", () => {
    const h = html();
    const botones = h.match(/<button type="submit"[^>]*>Buscar<\/button>/g) ?? [];
    expect(botones).toHaveLength(1);
    expect(h).toMatch(/<noscript><button type="submit"[^>]*>Buscar<\/button><\/noscript>/);
  });
  it("trae la búsqueda y el filtro de la URL en los campos", () => {
    const h = html({ q: "persona1", estado: "validado" });
    expect(h).toContain('value="persona1"');
    expect(h).toContain('<option value="validado" selected="">');
  });
  it("tiene una región aria-live=polite con el contador de resultados, y la vacía dice que no hay coincidencias", () => {
    expect(html()).toMatch(/<p class="sr-only" aria-live="polite"[^>]*>137 candidatos\. Mostrando del 1 al 20\.<\/p>/);
    expect(html({ q: "zzzz" })).toMatch(/aria-live="polite"[^>]*>No hay candidatos con esos filtros<\/p>/);
  });
  it("sin carga pendiente no se muestra el indicador, y el formulario no está ocupado", () => {
    const h = html();
    expect(h).not.toContain('data-testid="pool-cargando"');
    expect(h).toContain('aria-busy="false"');
  });
  it("«Limpiar» sigue siendo un enlace a /panel/pool cuando hay filtros y no aparece sin ellos", () => {
    expect(html({ q: "ana" })).toMatch(/<a [^>]*href="\/panel\/pool"[^>]*>Limpiar<\/a>/);
    expect(html()).not.toContain(">Limpiar<");
  });
});

describe("botones de resolución", () => {
  const cuenta = (html: string, texto: string) => html.split(texto).length - 1;

  it("cada tarjeta de la cola tiene Aprobar y Rechazar, y ningún Reabrir", () => {
    const { cfg, cola } = datosDemo({});
    const html = renderToStaticMarkup(<VistaRevision zona={cfg.zona} plazo={3} cola={cola} accion={accion} />);
    expect(cuenta(html, 'data-testid="boton-aprobar"')).toBe(3);
    expect(cuenta(html, 'data-testid="boton-rechazar"')).toBe(3);
    expect(html).not.toContain('data-testid="boton-reabrir"');
  });
  it("la cola vacía no muestra botones", () => {
    const { cfg, cola } = datosDemo({ modo: "vacio" });
    expect(renderToStaticMarkup(<VistaRevision zona={cfg.zona} plazo={3} cola={cola} accion={accion} />)).not.toContain("boton-aprobar");
  });
  it("el pool muestra Reabrir solo en las filas rechazadas (tabla y tarjetas) y nunca Aprobar ni Rechazar", () => {
    const { cfg, pool, params } = datosDemo({});
    const html = renderToStaticMarkup(<VistaPool zona={cfg.zona} pool={pool} params={params} accion={accion} />);
    const rechazados = pool.ok && "filas" in pool ? pool.filas.filter((f) => f.estado === "rechazado").length : -1;
    expect(rechazados).toBeGreaterThan(0);
    expect(cuenta(html, 'data-testid="boton-reabrir"')).toBe(rechazados * 2); // una vez en la tabla y otra en la tarjeta
    expect(html).not.toContain("boton-aprobar");
    expect(html).not.toContain("boton-rechazar");
  });
  it("filtrar por otro estado no deja ningún Reabrir", () => {
    const { cfg, pool, params } = datosDemo({ estado: "validado" });
    expect(renderToStaticMarkup(<VistaPool zona={cfg.zona} pool={pool} params={params} accion={accion} />)).not.toContain("boton-reabrir");
  });
});

describe("aviso de resultado", () => {
  const cola = datosDemo({}).cola;
  const render = (aviso: Aviso) => renderToStaticMarkup(<VistaRevision zona="UTC" plazo={3} cola={cola} accion={accion} aviso={aviso} />);

  it("aprobado muestra el monto; el éxito es un status y el cierre vuelve a la lista sin parámetros", () => {
    const html = render({ codigo: "aprobado", montoUsd: 100 });
    expect(html).toContain("Caso aprobado. Se generó el pago de USD 100.");
    expect(html).toContain('role="status"');
    expect(html).toContain('href="/panel"');
  });
  it("sin pago explica la sanción", () => {
    expect(render({ codigo: "aprobado_sin_pago", montoUsd: null })).toContain("no se generó ningún pago");
  });
  it("ya_resuelto y estado_invalido se anuncian como alerta", () => {
    for (const codigo of ["ya_resuelto", "estado_invalido"] as const) {
      const html = render({ codigo, montoUsd: null });
      expect(html).toContain('role="alert"');
      expect(html).toContain('data-tipo="error"');
    }
  });
  it("sin aviso no hay banner", () => {
    expect(renderToStaticMarkup(<VistaRevision zona="UTC" plazo={3} cola={cola} accion={accion} />)).not.toContain("aviso-resultado");
  });
});
