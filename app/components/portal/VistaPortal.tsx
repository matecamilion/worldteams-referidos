import { BotonSalir } from "@/components/BotonSalir";
import { BotonCopiar } from "@/components/portal/BotonCopiar";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import { formatearCiclo, formatearUsd, type EstadoVisible, type Movimiento, type Progreso } from "@/lib/portal";
import type { VistaPortal } from "@/lib/portal-datos";

const estiloEstado: Record<EstadoVisible, string> = {
  validado: "bg-lima text-verde",
  registrado: "bg-crema/15 text-crema",
  en_revision: "bg-crema/15 text-crema",
  no_avanzo: "bg-crema/10 text-crema/60",
};

const tarjeta = "rounded-lg border border-crema/20 p-4 sm:p-5";
const subtitulo = "font-display text-lg font-medium";

/** El portal con datos. Solo lectura: es el mismo diseño de la maqueta de "/", con lo que devuelve la base. */
export function VistaPortalReferente({ vista }: { vista: VistaPortal }) {
  return (
    <div className="pt-4 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.03em]">
          {t("portal.saludo", { nombre: vista.nombre })}
        </h1>
        <BotonSalir />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
        <div className="min-w-0">
          <section aria-labelledby="titulo-link" className={tarjeta}>
            <h2 id="titulo-link" className="text-sm text-crema/65">
              {t("portal.link.etiqueta")}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {/* Dos líneas, cortadas en "/r/", como en la maqueta de la home: el código nunca se parte a la mitad. */}
              <p className="min-w-0 basis-full font-display text-[0.8rem] font-medium sm:flex-1 sm:basis-0 sm:text-lg" aria-label={vista.link} data-testid="link-personal">
                <span aria-hidden className="block whitespace-nowrap">{vista.link.slice(0, vista.link.indexOf("/r/") + 3)}</span>
                <span aria-hidden className="block whitespace-nowrap">{vista.link.slice(vista.link.indexOf("/r/") + 3)}</span>
              </p>
              <BotonCopiar texto={vista.urlCompleta} />
            </div>
            <p className="mt-3 text-sm text-crema/60">{t("portal.link.ayuda")}</p>
          </section>

          <BarraHitos progreso={vista.progreso} />

          <section aria-labelledby="titulo-premios" className="mt-8">
            <h2 id="titulo-premios" className={subtitulo}>
              {t("portal.premios.titulo")}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-crema/10 p-4">
                <p className="text-sm text-crema/65">{t("portal.premios.pendiente")}</p>
                <p className="num mt-1 font-display text-2xl font-medium sm:text-3xl" data-testid="premios-pendiente">
                  {formatearUsd(vista.premios.pendienteUsd)}
                </p>
              </div>
              <div className="rounded-lg bg-crema/10 p-4">
                <p className="text-sm text-crema/65">{t("portal.premios.pagado")}</p>
                <p className="num mt-1 font-display text-2xl font-medium sm:text-3xl" data-testid="premios-pagado">
                  {formatearUsd(vista.premios.pagadoUsd)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-crema/60">{t("portal.premios.corte", { corte: config.diaCortePago })}</p>
            {vista.premios.movimientos.length ? (
              <ul className="mt-4 divide-y divide-crema/15 border-y border-crema/15" aria-label={t("portal.premios.detalle")}>
                {vista.premios.movimientos.map((m) => (
                  <FilaMovimiento key={m.id} movimiento={m} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-crema/70">{t("portal.premios.vacio")}</p>
            )}
          </section>
        </div>

        <section aria-labelledby="titulo-referidos" className="min-w-0">
          <h2 id="titulo-referidos" className={subtitulo}>
            {t("portal.referidos.titulo")}
          </h2>
          {vista.referidos.length ? (
            <>
              <ul className="mt-3 divide-y divide-crema/15 border-y border-crema/15">
                {vista.referidos.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-4 py-3.5">
                    <span className="min-w-0 font-medium">{r.nombreCompleto}</span>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${estiloEstado[r.estado]}`}>
                      {t(`portal.referidos.estados.${r.estado}`)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-crema/60">{t("portal.referidos.privacidad")}</p>
            </>
          ) : (
            <EstadoVacio />
          )}
        </section>
      </div>
    </div>
  );
}

function BarraHitos({ progreso }: { progreso: Progreso }) {
  const porcentaje = progreso.tipo === "completo" ? 100 : progreso.porcentaje;
  const valorTexto =
    progreso.tipo === "completo"
      ? t("portal.progreso.completo", { validados: progreso.validados })
      : t("portal.progreso.texto", { validados: progreso.validados, hito: progreso.hito, bono: progreso.bonoUsd });
  return (
    <section aria-labelledby="titulo-progreso" className="mt-8">
      <h2 id="titulo-progreso" className={subtitulo}>
        {t("portal.progreso.titulo")}
      </h2>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
        aria-valuetext={valorTexto}
        aria-labelledby="titulo-progreso"
        className="mt-3 h-3 overflow-hidden rounded-full bg-crema/15"
      >
        <div className="h-full rounded-full bg-lima" style={{ width: `${porcentaje}%` }} />
      </div>
      <p className="mt-2 text-sm text-crema/75">{valorTexto}</p>
      {progreso.tipo === "en_camino" ? (
        <p className="mt-1 text-sm font-semibold text-lima">
          {progreso.faltan === 1 ? t("portal.progreso.falta") : t("portal.progreso.faltan", { faltan: progreso.faltan })}
        </p>
      ) : null}
    </section>
  );
}

function FilaMovimiento({ movimiento: m }: { movimiento: Movimiento }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">{t(`portal.premios.conceptos.${m.concepto}`, { umbral: m.hitoUmbral ?? "" })}</p>
        <p className="text-sm first-letter:uppercase text-crema/60">{formatearCiclo(m.ciclo)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="num font-display font-medium">{formatearUsd(m.montoUsd)}</p>
        <p className={`text-sm font-semibold ${m.estado === "pagado" ? "text-lima" : "text-crema/70"}`}>{t(`portal.premios.estados.${m.estado}`)}</p>
      </div>
    </li>
  );
}

function EstadoVacio() {
  const e = "portal.referidos.vacio";
  return (
    <div className="mt-3 rounded-lg border border-dashed border-crema/30 p-5 sm:p-6" data-testid="vacio">
      <p className="font-display text-xl font-medium">{t(`${e}.titulo`)}</p>
      <p className="mt-2 text-crema/75">{t(`${e}.texto`)}</p>
      <ol className="mt-5 grid gap-3">
        {(["0", "1", "2"] as const).map((i) => (
          <li key={i} className="flex items-center gap-3">
            <span aria-hidden className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-lima text-sm font-bold text-verde">
              {Number(i) + 1}
            </span>
            <span>{t(`${e}.pasos.${i}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
