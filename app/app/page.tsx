import type { CSSProperties } from "react";
import { Calculadora } from "@/components/Calculadora";
import { Encabezado } from "@/components/Encabezado";
import { ComoFunciona } from "@/components/inicio/ComoFunciona";
import { HeroFragmentos } from "@/components/inicio/HeroFragmentos";
import { HeroRed } from "@/components/inicio/HeroRed";
import { Magnetico } from "@/components/inicio/Magnetico";
import { Marquesina } from "@/components/inicio/Marquesina";
import { Movimiento } from "@/components/inicio/Movimiento";
import { PortalEjemplo } from "@/components/inicio/PortalEjemplo";
import { Premios } from "@/components/inicio/Premios";
import es from "@/i18n/es.json";
import { config, montoPrioritarioUsd } from "@/lib/config";
import { extraPrioritarioUsd } from "@/lib/premios";
import { t } from "@/lib/i18n";

const contenedor = "mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-14";
const titulo = "font-display text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.03em]";

/** Sustituye {variables} en un texto del JSON que ya fue leído como literal. */
const rellenar = (texto: string, vars: Record<string, string | number>) =>
  texto.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

const cifras: Record<string, number> = {
  base: config.montoBaseUsd,
  prioritario: montoPrioritarioUsd,
  hitos: config.hitos.reduce((suma, h) => suma + h.bonoUsd, 0),
};

export default function Page() {
  const { inicio } = es;
  return (
    <Movimiento>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-lima focus:px-4 focus:py-3 focus:font-bold focus:text-verde"
      >
        {inicio.saltar}
      </a>
      <Encabezado entrar />
      <main id="contenido" tabIndex={-1} className="outline-none">
        <HeroRed>
          <h1 className="font-display text-[clamp(2.4rem,5.6vw,4.75rem)] font-medium leading-[1.02] tracking-[-0.035em]">
            <span className="sr-only">{inicio.hero.tituloAccesible}</span>
            <span aria-hidden className="block">
              <span className="linea">
                <span style={{ "--retraso": "0ms" } as CSSProperties}>{inicio.hero.titulo}</span>
              </span>
              <span className="linea">
                <span style={{ "--retraso": "120ms" } as CSSProperties}>
                  <HeroFragmentos />
                </span>
              </span>
            </span>
          </h1>

          <p className="mt-8 max-w-[32rem] text-lg leading-relaxed text-fg/80">{inicio.hero.bajada}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Magnetico>
              <a
                href="#calculadora"
                className="inline-flex h-12 items-center rounded-lg bg-lima px-7 font-bold text-verde transition-transform duration-150 active:scale-[0.98]"
              >
                {inicio.hero.cta}
              </a>
            </Magnetico>
            <a
              href="#como"
              className="inline-flex h-12 items-center rounded-lg border-[1.5px] border-fg/30 px-6 font-bold transition-colors duration-150 hover:border-fg/60 active:scale-[0.98]"
            >
              {inicio.hero.ctaSecundario}
            </a>
          </div>

          <ul className="mt-10 flex max-w-[34rem] flex-wrap gap-x-9 gap-y-5 border-t border-fg/15 pt-6">
            {inicio.hero.cifras.map((c) => (
              <li key={c.clave}>
                <p className="num whitespace-nowrap font-display text-[clamp(1.25rem,2.4vw,1.875rem)] font-medium leading-none">
                  {"prefijo" in c ? <span className="mr-1 text-xs text-fg/70">{c.prefijo}</span> : null}
                  USD {cifras[c.clave]}
                </p>
                <p className="mt-2 text-sm leading-snug text-fg/65">{c.etiqueta}</p>
              </li>
            ))}
          </ul>
        </HeroRed>

        <ComoFunciona />
        <Marquesina />

        <section id="premios" data-fondo="crema" className="scroll-mt-6">
          <div className={`${contenedor} pb-6 pt-20 lg:pt-28`}>
            <h2 className={titulo}>{inicio.premios.titulo}</h2>
            <p className="mt-4 max-w-[34rem] text-lg leading-relaxed text-fg/80">{inicio.premios.bajada}</p>
            <Premios />
            <div className="mt-10 grid gap-3 border-t border-fg/15 pt-8 lg:grid-cols-2 lg:gap-16">
              <div>
                <h3 className="font-display text-xl font-medium">{inicio.premios.prioritarioTitulo}</h3>
                <p className="mt-2 max-w-[32rem] text-fg/75">
                  {rellenar(inicio.premios.prioritarioTexto, { extra: extraPrioritarioUsd })}
                </p>
              </div>
              <p className="max-w-[32rem] text-fg/75 lg:self-end">{inicio.premios.hitosTexto}</p>
            </div>
          </div>
        </section>

        <section id="calculadora" data-fondo="crema" tabIndex={-1} className="scroll-mt-6 outline-none">
          <div className={`${contenedor} grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-start lg:gap-16 lg:py-24`}>
            <div>
              <h2 className={titulo}>{inicio.calculadora.titulo}</h2>
              <p className="mt-4 max-w-[30rem] text-lg leading-relaxed text-fg/80">{inicio.calculadora.bajada}</p>
            </div>
            <Calculadora />
          </div>
        </section>

        <section id="portal" data-fondo="lima" className="scroll-mt-6">
          <div className={`${contenedor} py-16 lg:py-28`}>
            <h2 className={titulo}>{inicio.portal.titulo}</h2>
            <p className="mt-4 max-w-[34rem] text-lg leading-relaxed text-fg/80">{inicio.portal.bajada}</p>
            <PortalEjemplo />
          </div>
        </section>

        <section id="preguntas" data-fondo="verde" className="scroll-mt-6">
          <div className={`${contenedor} grid gap-10 py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-28`}>
            <h2 className={`${titulo} lg:sticky lg:top-8 lg:self-start`}>{inicio.faq.titulo}</h2>
            <div className="divide-y divide-fg/15 border-y border-fg/15">
              {inicio.faq.items.map((f) => (
                <details key={f.p} className="group py-1">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-3 font-display text-lg font-medium [&::-webkit-details-marker]:hidden">
                    {f.p}
                    <span aria-hidden className="relative size-4 shrink-0">
                      <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-acento" />
                      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-acento transition-transform duration-200 group-open:scale-y-0" />
                    </span>
                  </summary>
                  <p className="max-w-[36rem] pb-5 leading-relaxed text-fg/75">
                    {rellenar(f.r, { corte: config.diaCortePago, dias: config.alertaVolumen.dias, cantidad: config.alertaVolumen.cantidad })}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section data-fondo="verde" className={`${contenedor} pb-16 lg:pb-24`}>
          <div className="rounded-lg bg-lima p-7 text-verde sm:p-12">
            <h2 className="max-w-[40rem] font-display text-[clamp(2rem,4.6vw,3.75rem)] font-medium leading-[1.02] tracking-[-0.03em]">
              {inicio.cierre.titulo}
            </h2>
            <p className="mt-5 max-w-[34rem] text-lg font-medium leading-relaxed">{inicio.cierre.texto}</p>
            <p className="mt-3 max-w-[34rem] text-sm font-semibold text-verde/75">{inicio.cierre.nota}</p>
          </div>
        </section>
      </main>

      <footer data-fondo="verde" className={`${contenedor} pb-8 pt-4`}>
        {/* SVG publicado por WorldTeams en su sitio, a todo el ancho. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/worldteams-logo.svg" alt={t("marca.logoAlt")} width={612} height={120} className="h-auto w-full" />
        <p className="mt-6 text-sm text-fg/60">{inicio.hero.etiqueta}</p>
      </footer>
    </Movimiento>
  );
}
