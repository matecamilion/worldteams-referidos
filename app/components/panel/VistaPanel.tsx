import Link from "next/link";
import { BarraFiltrosPool } from "@/components/panel/BarraFiltrosPool";
import { BotonResolver, type AccionResolver } from "@/components/panel/BotonResolver";
import { claseBotonSecundario } from "@/components/panel/estilos";
import { t } from "@/lib/i18n";
import {
  estadosReferido,
  esMotivoConocido,
  motivoDesconocido,
  POR_PAGINA,
  totalPaginas,
  urlPool,
  type CandidatoPool,
  type CasoRevision,
  type EstadoReferido,
  type ParamsPool,
} from "@/lib/panel";
import type { ResultadoCola, ResultadoPool } from "@/lib/panel-datos";
import { esError, type Aviso } from "@/lib/resolver";

const foco = "focus-visible:outline-lima";
const claseEnlace = "inline-flex min-h-10 items-center gap-2 rounded text-lima no-underline transition-colors hover:text-crema";
const claseTarjeta = "rounded-xl border border-crema/15 bg-crema/[0.04]";

// Un chip por estado, siempre con punto y texto: el color solo no alcanza para distinguirlos.
const estiloEstado: Record<EstadoReferido, string> = {
  validado: "bg-lima text-verde",
  registrado: "bg-salvia/30 text-crema",
  en_revision: "bg-arena text-verde",
  rechazado: "bg-alerta/15 text-alerta",
  descartado: "bg-crema/10 text-crema/70",
};

/** Texto de un valor de la base ("semi_senior"); si aparece uno nuevo que no está en el archivo de textos se muestra tal cual. */
function etiqueta(grupo: string, valor: string): string {
  try {
    return t(`panel.${grupo}.${valor}`);
  } catch {
    return motivoDesconocido(valor);
  }
}

function fecha(iso: string, zona: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: zona });
}


function Icono({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
      {children}
    </svg>
  );
}
const IconoMail = () => (
  <Icono>
    <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
    <path d="m3 6 7 5 7-5" />
  </Icono>
);
const IconoLinkedin = () => (
  <Icono>
    <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V12M11 4h5v5M16 4l-7 7" />
  </Icono>
);
const IconoEstrella = () => (
  <Icono>
    <path d="m10 3 2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7z" />
  </Icono>
);
const IconoDocumento = () => (
  <Icono>
    <path d="M5.5 2.5h6l3.5 3.5v10a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16V4a1.5 1.5 0 0 1 1.5-1.5Z" />
    <path d="M11.5 2.5V6H15M7 10h6M7 13h4" />
  </Icono>
);
const IconoBuscar = () => (
  <Icono>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13 13 4 4" />
  </Icono>
);
const IconoReloj = () => (
  <Icono>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4l2.5 1.5" />
  </Icono>
);
const IconoVacio = () => (
  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
    <path d="M3 13h5l1.5 3h5L16 13h5M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z" />
  </svg>
);

function EstadoVacio({ titulo, texto, testid, icono }: { titulo: string; texto: string; testid: string; icono: React.ReactNode }) {
  return (
    <div className={`${claseTarjeta} mt-4 flex flex-col items-center border-dashed px-6 py-10 text-center`} data-testid={testid}>
      <span className="flex size-12 items-center justify-center rounded-full bg-crema/10 text-lima">{icono}</span>
      <p className="mt-4 font-display text-xl font-medium">{titulo}</p>
      <p className="mt-2 max-w-md text-crema/75">{texto}</p>
    </div>
  );
}

/** Resultado de lo último que se resolvió (viene en la URL; ver lib/resolver.ts). El error se anuncia como alerta. */
function AvisoResultado({ aviso, cerrarHref }: { aviso: Aviso; cerrarHref: string }) {
  const error = esError(aviso.codigo);
  const texto =
    aviso.codigo === "aprobado" && aviso.montoUsd !== null ? t("panel.acciones.avisos.aprobado_monto", { monto: aviso.montoUsd }) : t(`panel.acciones.avisos.${aviso.codigo}`);
  return (
    <div
      role={error ? "alert" : "status"}
      data-testid="aviso-resultado"
      data-tipo={error ? "error" : "ok"}
      className={`mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border px-5 py-3 ${error ? "border-alerta/60 bg-alerta/10" : "border-lima/50 bg-lima/10"}`}
    >
      <p className="font-medium">{texto}</p>
      <Link href={cerrarHref} className={`${claseEnlace} ${foco} text-sm`}>
        {t("panel.acciones.cerrarAviso")}
      </Link>
    </div>
  );
}

function ChipEstado({ estado }: { estado: EstadoReferido }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${estiloEstado[estado]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {t(`panel.estados.${estado}`)}
    </span>
  );
}

function Metrica({ etiqueta, valor, alerta }: { etiqueta: string; valor: number | null; alerta?: boolean }) {
  return (
    <div className={`${claseTarjeta} flex items-baseline justify-between gap-3 px-5 py-4 sm:block ${alerta ? "border-alerta/50 bg-alerta/[0.07]" : ""}`}>
      <dt className="text-sm text-crema/70">{etiqueta}</dt>
      <dd className={`num font-display text-4xl font-medium leading-none tracking-tight sm:mt-3 ${alerta ? "text-alerta" : ""}`}>{valor ?? "—"}</dd>
    </div>
  );
}

/** Rutas del pool para el formulario y la paginación; /dev/panel usa las suyas para no salir de la vista de prueba. */
const BASE_POOL = "/panel/pool";

function EncabezadoPagina({ id, titulo, ayuda, children }: { id: string; titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <header className="pt-8 sm:pt-10">
      <h1 id={id} className="font-display text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.03em]">
        {titulo}
      </h1>
      {ayuda ? <p className="mt-3 max-w-2xl text-crema/75">{ayuda}</p> : null}
      <dl aria-label={t("panel.metricas.etiqueta")} className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="metricas">
        {children}
      </dl>
    </header>
  );
}

/** Pantalla "Revisión": la cola de casos en revisión, con sus métricas y los botones para resolverlos. */
export function VistaRevision({
  zona,
  cola,
  plazo,
  accion,
  aviso = null,
  baseCola = "/panel",
}: {
  zona: string;
  cola: ResultadoCola;
  /** Plazo en días hábiles (de `configuracion`); null si no se pudo leer. */
  plazo: number | null;
  accion: AccionResolver;
  aviso?: Aviso | null;
  baseCola?: string;
}) {
  return (
    <div data-testid="vista-revision">
      {aviso ? <AvisoResultado aviso={aviso} cerrarHref={baseCola} /> : null}
      <EncabezadoPagina id="titulo-cola" titulo={t("panel.cola.titulo")}>
        <Metrica etiqueta={t("panel.metricas.enRevision")} valor={cola.ok ? cola.total : null} />
        <Metrica etiqueta={t("panel.metricas.vencidos")} valor={cola.ok ? cola.casos.filter((c) => c.vencido).length : null} alerta={cola.ok && cola.casos.some((c) => c.vencido)} />
      </EncabezadoPagina>
      <ColaRevision cola={cola} plazo={plazo} zona={zona} accion={accion} />
    </div>
  );
}

/** Pantalla "Talent pool": buscador, filtro, tabla y paginación, con la métrica del total y "Reabrir" en los rechazados. */
export function VistaPool({
  zona,
  pool,
  params,
  accion,
  aviso = null,
  basePool = BASE_POOL,
}: {
  zona: string;
  pool: ResultadoPool;
  params: ParamsPool;
  accion: AccionResolver;
  aviso?: Aviso | null;
  basePool?: string;
}) {
  const filtrado = Boolean(params.q || params.estado);
  return (
    <div data-testid="vista-pool">
      {aviso ? <AvisoResultado aviso={aviso} cerrarHref={urlPool(params, basePool)} /> : null}
      <EncabezadoPagina id="titulo-pool" titulo={t("panel.pool.titulo")} ayuda={t("panel.pool.ayuda")}>
        {/* `pool.total` respeta el filtro: con uno activo ya no es el total del pool y la tarjeta lo dice. */}
        <Metrica etiqueta={filtrado ? t("panel.metricas.filtrados") : t("panel.metricas.pool")} valor={pool.ok && "total" in pool ? pool.total : null} />
      </EncabezadoPagina>
      <TalentPool pool={pool} params={params} zona={zona} basePool={basePool} accion={accion} />
    </div>
  );
}

function ErrorSeccion() {
  return (
    <p role="alert" className="mt-4 rounded-xl border border-dashed border-alerta/60 bg-alerta/[0.07] p-5 text-crema" data-testid="error-seccion">
      {t("panel.errorSeccion")}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Cola de revisión
// ---------------------------------------------------------------------------------------------------------------
function ColaRevision({ cola, plazo, zona, accion }: { cola: ResultadoCola; plazo: number | null; zona: string; accion: AccionResolver }) {
  return (
    <section aria-labelledby="titulo-cola" className="mt-8" data-testid="cola">
      {!cola.ok ? (
        <ErrorSeccion />
      ) : cola.casos.length === 0 ? (
        <EstadoVacio testid="cola-vacia" titulo={t("panel.cola.vacio.titulo")} texto={t("panel.cola.vacio.texto")} icono={<IconoVacio />} />
      ) : (
        <>
          <ResumenCola cola={cola} plazo={plazo} />
          <ul className="mt-4 grid gap-4">
            {cola.casos.map((caso) => (
              <li key={caso.id}>
                <TarjetaCaso caso={caso} zona={zona} accion={accion} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ResumenCola({ cola, plazo }: { cola: Extract<ResultadoCola, { ok: true }>; plazo: number | null }) {
  const vencidos = cola.casos.filter((c) => c.vencido).length;
  return (
    <div className="mt-2 text-crema/75">
      <p>{cola.total === 1 ? t("panel.cola.resumen_uno") : t("panel.cola.resumen", { total: cola.total })}</p>
      {cola.total > cola.casos.length ? <p>{t("panel.cola.parcial", { mostrados: cola.casos.length, total: cola.total })}</p> : null}
      {plazo !== null ? (
        <>
          {vencidos > 0 ? (
            <p className="font-semibold text-alerta" data-testid="resumen-vencidos">
              {vencidos === 1 ? t("panel.cola.vencidos_uno", { plazo }) : t("panel.cola.vencidos", { vencidos, plazo })}
            </p>
          ) : null}
          <p className="text-sm text-crema/65">{t("panel.cola.plazoNota")}</p>
        </>
      ) : null}
    </div>
  );
}

function antiguedad(dias: number): string {
  if (dias === 0) return t("panel.cola.antiguedad.hoy");
  return dias === 1 ? t("panel.cola.antiguedad.uno") : t("panel.cola.antiguedad.otros", { dias });
}

function TarjetaCaso({ caso, zona, accion }: { caso: CasoRevision; zona: string; accion: AccionResolver }) {
  const c = caso.candidato;
  return (
    <article
      className={`relative overflow-hidden rounded-xl border py-5 pl-6 pr-5 sm:py-6 sm:pl-8 sm:pr-7 ${caso.vencido ? "border-alerta/40 bg-alerta/[0.06]" : "border-crema/15 bg-crema/[0.04]"}`}
      data-testid="caso"
      data-vencido={caso.vencido ? "true" : "false"}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${caso.vencido ? "bg-alerta" : "bg-lima"}`} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-medium leading-tight tracking-tight sm:text-[1.75rem]">{c.nombreCompleto}</h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-crema/70">
            <span className={`inline-flex items-center gap-1.5 ${caso.vencido ? "font-semibold text-alerta" : ""}`}>
              <IconoReloj />
              {antiguedad(caso.diasHabiles)}
            </span>
            <span aria-hidden>·</span>
            <span>{fecha(caso.creadoEn, zona)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {caso.vencido ? <span className="rounded-full bg-alerta px-3 py-1 text-sm font-semibold text-verde">{t("panel.cola.vencido")}</span> : null}
          {c.esPrioritario ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-lima/50 px-3 py-1 text-sm font-medium text-lima">
              <IconoEstrella />
              {t("panel.cola.prioritario")}
            </span>
          ) : null}
        </div>
      </header>

      {caso.motivos.length ? (
        <div className="mt-4">
          <p className="text-sm text-crema/70">{t("panel.cola.motivos.etiqueta")}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {caso.motivos.map((m) => (
              <li key={m} className="flex items-start gap-2 rounded-lg bg-crema/10 px-3 py-1.5 text-sm">
                <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${caso.vencido ? "bg-alerta" : "bg-arena"}`} />
                <span>{esMotivoConocido(m) ? t(`panel.cola.motivos.${m}`) : motivoDesconocido(m)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 border-t border-crema/10 pt-4">
        <h4 className="text-sm font-semibold text-crema/70">{t("panel.cola.candidato")}</h4>
        <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Dato nombre={t("panel.cola.campos.email")}>
            <a href={`mailto:${c.email}`} className={`${claseEnlace} ${foco} break-all`}>
              <IconoMail />
              {c.email}
            </a>
          </Dato>
          <Dato nombre={t("panel.cola.campos.linkedin")}>
            {c.linkedin ? (
              <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className={`${claseEnlace} ${foco}`}>
                <IconoLinkedin />
                {t("panel.cola.linkedinAbrir")}
              </a>
            ) : (
              <span className="text-crema/70">{t("panel.cola.sinLinkedin")}</span>
            )}
          </Dato>
          <Dato nombre={t("panel.cola.campos.especialidad")}>{etiqueta("especialidades", c.especialidad)}</Dato>
          <Dato nombre={t("panel.cola.campos.revit")}>{c.usaRevit ? t("panel.si") : t("panel.no")}</Dato>
          <Dato nombre={t("panel.cola.campos.seniority")}>{etiqueta("seniorities", c.seniority)}</Dato>
          <Dato nombre={t("panel.cola.campos.ingles")}>{etiqueta("ingles", c.nivelIngles)}</Dato>
        </dl>
      </div>

      <div className="mt-5 border-t border-crema/10 pt-4">
        <h4 className="text-sm font-semibold text-crema/70">{t("panel.cola.referente")}</h4>
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1">
          <p className="font-medium">{caso.referente.nombreCompleto}</p>
          <a href={`mailto:${caso.referente.email}`} className={`${claseEnlace} ${foco} break-all`}>
            <IconoMail />
            {caso.referente.email}
          </a>
        </div>
      </div>

      <footer className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-crema/10 pt-4">
        {caso.tieneCv ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* Se pide al hacer clic: el servidor firma un link de 60 s y redirige. Una pestaña nueva evita perder la lista. */}
            <a href={`/panel/cv/${caso.id}`} target="_blank" rel="noopener noreferrer" className={claseBotonSecundario} data-testid="ver-cv">
              <IconoDocumento />
              {t("panel.cola.cv.ver")}
            </a>
            <span className="text-sm text-crema/70">{t("panel.cola.cv.nuevaPestana")}</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-crema/70">
            <IconoDocumento />
            {t("panel.cola.cv.sin")}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto" data-slot="acciones-revision">
          <BotonResolver decision="rechazar" referidoId={caso.id} nombre={c.nombreCompleto} accion={accion} />
          <BotonResolver decision="aprobar" referidoId={caso.id} nombre={c.nombreCompleto} accion={accion} />
        </div>
      </footer>
    </article>
  );
}

function Dato({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-crema/65">{nombre}</dt>
      <dd className="mt-0.5 min-w-0 font-medium">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Talent pool
// ---------------------------------------------------------------------------------------------------------------
/** Opciones del filtro. "registrado" no se ofrece (nunca queda así en la práctica), salvo que un link viejo ya lo traiga. */
function opcionesEstado(params: ParamsPool) {
  return estadosReferido
    .filter((e) => e !== "registrado" || params.estado === "registrado")
    .map((e) => ({ valor: e, etiqueta: t(`panel.estados.${e}`) }));
}

/** Texto que se anuncia cuando cambian los resultados: el mismo contador que se ve, o que no hay coincidencias. */
function anuncioPool(pool: ResultadoPool, params: ParamsPool): string {
  if (!pool.ok || !("filas" in pool)) return "";
  if (pool.filas.length === 0) return t("panel.pool.vacio.titulo");
  const primero = (params.pagina - 1) * POR_PAGINA + 1;
  return pool.total === 1 ? t("panel.pool.resumen_uno") : t("panel.pool.resumen", { total: pool.total, desde: primero, hasta: primero + pool.filas.length - 1 });
}

function TalentPool({ pool, params, zona, basePool, accion }: { pool: ResultadoPool; params: ParamsPool; zona: string; basePool: string; accion: AccionResolver }) {
  return (
    <section aria-labelledby="titulo-pool" className="mt-8" data-testid="pool">

      {/* Buscador y filtro: en el navegador solo cambian la URL; sin JavaScript es el formulario GET de siempre. */}
      <BarraFiltrosPool params={params} basePool={basePool} opciones={opcionesEstado(params)} anuncio={anuncioPool(pool, params)} icono={<IconoBuscar />} />

      {!pool.ok ? <ErrorSeccion /> : "fueraDeRango" in pool ? null : <TablaPool pool={pool} params={params} zona={zona} basePool={basePool} accion={accion} />}
    </section>
  );
}

function TablaPool({ pool, params, zona, basePool, accion }: { pool: Extract<ResultadoPool, { filas: CandidatoPool[] }>; params: ParamsPool; zona: string; basePool: string; accion: AccionResolver }) {
  if (pool.filas.length === 0) {
    return <EstadoVacio testid="pool-vacio" titulo={t("panel.pool.vacio.titulo")} texto={t("panel.pool.vacio.texto")} icono={<IconoBuscar />} />;
  }
  const paginas = totalPaginas(pool.total);
  const primero = (params.pagina - 1) * POR_PAGINA + 1;
  const columnas = ["candidato", "email", "especialidad", "estado", "referente", "ingreso"] as const;
  // Reabrir solo existe en los rechazados; el botón vuelve a esta misma página, con la misma búsqueda y filtro.
  const reabrir = (f: CandidatoPool, compacto: boolean) =>
    f.estado === "rechazado" && f.referidoId ? (
      <BotonResolver
        decision="reabrir"
        referidoId={f.referidoId}
        nombre={f.nombreCompleto}
        accion={accion}
        compacto={compacto}
        campos={{ origen: "pool", q: params.q, estado: params.estado ?? "", pagina: String(params.pagina) }}
      />
    ) : null;
  return (
    <>
      <p className="mt-6 text-sm text-crema/70" data-testid="pool-resumen">
        {pool.total === 1 ? t("panel.pool.resumen_uno") : t("panel.pool.resumen", { total: pool.total, desde: primero, hasta: primero + pool.filas.length - 1 })}
      </p>

      {/* Escritorio: tabla con encabezado fijo (queda visible al desplazar la página). */}
      <div className={`${claseTarjeta} mt-2 hidden lg:block`}>
        <table className="w-full border-separate border-spacing-0 text-left" data-testid="tabla-pool">
          <thead>
            <tr className="text-sm text-crema/70">
              {columnas.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`sticky top-0 z-10 border-b border-crema/20 bg-verde-hondo px-4 py-3 font-semibold ${i === 0 ? "rounded-tl-xl" : ""} ${i === columnas.length - 1 ? "rounded-tr-xl" : ""}`}
                >
                  {t(`panel.pool.columnas.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pool.filas.map((f) => (
              <tr key={f.id} data-testid="fila-pool" className="group hover:bg-crema/[0.05]">
                <th scope="row" className="border-b border-crema/10 px-4 py-4 font-medium group-last:border-b-0">
                  {f.nombreCompleto}
                </th>
                <td className="break-all border-b border-crema/10 px-4 py-4 text-crema/80 group-last:border-b-0">{f.email}</td>
                <td className="border-b border-crema/10 px-4 py-4 group-last:border-b-0">{etiqueta("especialidades", f.especialidad)}</td>
                <td className="border-b border-crema/10 px-4 py-4 group-last:border-b-0">
                  {f.estado ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <ChipEstado estado={f.estado} />
                      {reabrir(f, true)}
                    </div>
                  ) : (
                    <span className="text-crema/70">{t("panel.pool.directo")}</span>
                  )}
                </td>
                <td className="border-b border-crema/10 px-4 py-4 group-last:border-b-0">{f.referente ?? <span className="text-crema/65">{t("panel.pool.sinReferente")}</span>}</td>
                <td className="whitespace-nowrap border-b border-crema/10 px-4 py-4 text-crema/80 group-last:border-b-0">{fecha(f.creadoEn, zona)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil y tablet: una tarjeta por fila. */}
      <ul className="mt-2 grid gap-3 lg:hidden" data-testid="lista-pool-movil">
        {pool.filas.map((f) => (
          <li key={f.id} className={`${claseTarjeta} p-4`} data-testid="tarjeta-pool">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 font-display text-lg font-medium">{f.nombreCompleto}</p>
              {f.estado ? <ChipEstado estado={f.estado} /> : <span className="text-sm text-crema/70">{t("panel.pool.directo")}</span>}
            </div>
            <p className="mt-1 break-all text-crema/80">{f.email}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-crema/10 pt-3 text-sm">
              <div className="min-w-0">
                <dt className="text-crema/65">{t("panel.pool.columnas.especialidad")}</dt>
                <dd className="mt-0.5 font-medium">{etiqueta("especialidades", f.especialidad)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-crema/65">{t("panel.pool.columnas.ingreso")}</dt>
                <dd className="mt-0.5 font-medium">{fecha(f.creadoEn, zona)}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-crema/65">{t("panel.pool.columnas.referente")}</dt>
                <dd className="mt-0.5 font-medium">{f.referente ?? <span className="font-normal text-crema/65">{t("panel.pool.sinReferente")}</span>}</dd>
              </div>
            </dl>
            {f.estado === "rechazado" && f.referidoId ? <div className="mt-3 border-t border-crema/10 pt-3">{reabrir(f, false)}</div> : null}
          </li>
        ))}
      </ul>

      {paginas > 1 ? <Paginacion params={params} paginas={paginas} basePool={basePool} /> : null}
    </>
  );
}

function Paginacion({ params, paginas, basePool }: { params: ParamsPool; paginas: number; basePool: string }) {
  const inactivo = `${claseBotonSecundario} cursor-not-allowed border-crema/10 text-crema/45 hover:border-crema/10 hover:bg-transparent active:scale-100`;
  return (
    <nav aria-label={t("panel.pool.paginacion.etiqueta")} className="mt-5 flex flex-wrap items-center justify-between gap-3">
      {params.pagina > 1 ? (
        <Link href={urlPool({ ...params, pagina: params.pagina - 1 }, basePool)} rel="prev" className={claseBotonSecundario}>
          {t("panel.pool.paginacion.anterior")}
        </Link>
      ) : (
        <span aria-disabled="true" className={inactivo}>
          {t("panel.pool.paginacion.anterior")}
        </span>
      )}
      <span className="num text-crema/75">{t("panel.pool.paginacion.pagina", { pagina: params.pagina, total: paginas })}</span>
      {params.pagina < paginas ? (
        <Link href={urlPool({ ...params, pagina: params.pagina + 1 }, basePool)} rel="next" className={claseBotonSecundario}>
          {t("panel.pool.paginacion.siguiente")}
        </Link>
      ) : (
        <span aria-disabled="true" className={inactivo}>
          {t("panel.pool.paginacion.siguiente")}
        </span>
      )}
    </nav>
  );
}
