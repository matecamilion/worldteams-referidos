import type { CSSProperties } from "react";
import { Calculadora } from "@/components/Calculadora";
import { Encabezado } from "@/components/Encabezado";
import es from "@/i18n/es.json";
import { config, montoPrioritarioUsd } from "@/lib/config";
import { t } from "@/lib/i18n";

const contenedor = "mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-14";
const hitoMax = config.hitos[config.hitos.length - 1];

const varsGlobales = {
  base: config.montoBaseUsd,
  prioritario: montoPrioritarioUsd,
  hitoMax: hitoMax.bonoUsd,
  hitoMaxReferidos: hitoMax.referidos,
};

/** Sustituye {variables} en un texto del JSON que ya fue leído como literal. */
const rellenar = (texto: string, vars: Record<string, string | number>) =>
  texto.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

const botonLima =
  "inline-flex h-12 items-center rounded-lg bg-lima px-7 font-bold text-verde transition-transform duration-150 active:scale-[0.98]";
const botonLinea =
  "inline-flex h-12 items-center rounded-lg border-[1.5px] border-crema/40 px-7 font-bold transition-colors hover:border-lima hover:text-lima";

export default function Page() {
  const { inicio } = es;
  return (
    <>
      <Encabezado />
      <main>
        <section className={`${contenedor} pb-16 pt-8 sm:pt-14 lg:pb-24`}>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-lima">{inicio.hero.etiqueta}</p>
          <h1 className="mt-5 font-display text-[clamp(3rem,9.5vw,8.5rem)] font-medium leading-[0.94] tracking-[-0.04em]">
            <span className="linea">
              <span style={{ "--retraso": "0ms" } as CSSProperties}>{inicio.hero.titulo1}</span>
            </span>
            <span className="linea">
              <span style={{ "--retraso": "120ms" } as CSSProperties} className="text-lima">
                {inicio.hero.titulo2}
              </span>
            </span>
          </h1>
          <p className="mt-7 max-w-[36rem] text-lg leading-relaxed text-crema/80">{inicio.hero.bajada}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#calculadora" className={botonLima}>
              {inicio.hero.cta}
            </a>
            <a href="#pasos" className={botonLinea}>
              {inicio.hero.cta2}
            </a>
          </div>

          <dl className="mt-14 grid gap-y-6 border-t border-crema/15 pt-8 sm:grid-cols-3 sm:gap-x-10">
            {inicio.hero.datos.map((d) => (
              <div key={d.texto}>
                <dt className="num font-display text-4xl font-medium tracking-tight sm:text-[2.75rem]">
                  {rellenar(d.valor, varsGlobales)}
                </dt>
                <dd className="mt-1.5 max-w-[16rem] text-crema/75">{rellenar(d.texto, varsGlobales)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="pasos" className="scroll-mt-6 border-t border-crema/15">
          <div className={`${contenedor} grid gap-10 py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-24`}>
            <h2 className="font-display text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.03em] lg:sticky lg:top-8 lg:self-start">
              {inicio.pasos.titulo}
            </h2>
            <ol className="divide-y divide-crema/15 border-y border-crema/15">
              {inicio.pasos.items.map((p, i) => (
                <li key={p.titulo} className="grid grid-cols-[3rem_1fr] gap-x-4 py-7 sm:grid-cols-[4.5rem_1fr]">
                  <span className="num font-display text-4xl font-medium leading-none text-lima sm:text-5xl">{i + 1}</span>
                  <div>
                    <h3 className="font-display text-xl font-medium sm:text-2xl">{p.titulo}</h3>
                    <p className="mt-2 max-w-[34rem] leading-relaxed text-crema/75">{p.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="premios" className="scroll-mt-6 border-t border-crema/15">
          <div className={`${contenedor} py-16 lg:py-24`}>
            <h2 className="font-display text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.03em]">
              {inicio.premios.titulo}
            </h2>
            <p className="mt-4 max-w-[34rem] text-lg leading-relaxed text-crema/80">{inicio.premios.bajada}</p>

            <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-16">
              <div className="divide-y divide-crema/15 border-y border-crema/15">
                <div className="py-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-xl font-medium">{inicio.premios.baseTitulo}</h3>
                    <p className="num font-display text-4xl font-medium tracking-tight">{rellenar(inicio.premios.baseMonto, varsGlobales)}</p>
                  </div>
                  <p className="mt-2 max-w-[30rem] text-crema/75">{inicio.premios.baseTexto}</p>
                </div>
                <div className="py-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-xl font-medium">{inicio.premios.prioritarioTitulo}</h3>
                    <p className="num font-display text-4xl font-medium tracking-tight text-lima">
                      {rellenar(inicio.premios.prioritarioMonto, varsGlobales)}
                    </p>
                  </div>
                  <p className="mt-2 max-w-[30rem] text-crema/75">{inicio.premios.prioritarioTexto}</p>
                </div>
              </div>

              <div>
                <h3 className="font-display text-xl font-medium">{inicio.premios.hitosTitulo}</h3>
                <p className="mt-2 max-w-[30rem] text-crema/75">{inicio.premios.hitosTexto}</p>
                <ol className="mt-6 grid grid-cols-3 gap-3">
                  {config.hitos.map((h) => (
                    <li key={h.referidos} className="rounded-lg border border-crema/20 p-4">
                      <p className="num font-display text-3xl font-medium leading-none">{h.referidos}</p>
                      <p className="mt-1 text-sm text-crema/70">{inicio.premios.hito}</p>
                      <p className="num mt-3 font-bold text-lima">{rellenar(inicio.premios.hitoBono, { bono: h.bonoUsd })}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section id="calculadora" className="scroll-mt-6 border-t border-crema/15">
          <div className={`${contenedor} grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-start lg:gap-16 lg:py-24`}>
            <div>
              <h2 className="font-display text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.03em]">
                {inicio.calculadora.titulo}
              </h2>
              <p className="mt-4 max-w-[30rem] text-lg leading-relaxed text-crema/80">{inicio.calculadora.bajada}</p>
            </div>
            <Calculadora />
          </div>
        </section>

        <section id="preguntas" className="scroll-mt-6 border-t border-crema/15">
          <div className={`${contenedor} grid gap-10 py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-24`}>
            <h2 className="font-display text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.03em] lg:sticky lg:top-8 lg:self-start">
              {inicio.faq.titulo}
            </h2>
            <div className="divide-y divide-crema/15 border-y border-crema/15">
              {inicio.faq.items.map((f) => (
                <details key={f.p} className="group py-1">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-3 font-display text-lg font-medium [&::-webkit-details-marker]:hidden">
                    {f.p}
                    <span aria-hidden className="relative size-4 shrink-0">
                      <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-lima" />
                      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-lima transition-transform duration-200 group-open:scale-y-0" />
                    </span>
                  </summary>
                  <p className="max-w-[36rem] pb-5 leading-relaxed text-crema/75">
                    {rellenar(f.r, { corte: config.diaCortePago, dias: config.alertaVolumen.dias, cantidad: config.alertaVolumen.cantidad })}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={`${contenedor} pb-16 lg:pb-24`}>
          <div className="rounded-lg bg-lima p-7 text-verde sm:p-12">
            <h2 className="max-w-[40rem] font-display text-[clamp(2rem,4.6vw,3.75rem)] font-medium leading-[1.02] tracking-[-0.03em]">
              {inicio.cierre.titulo}
            </h2>
            <p className="mt-5 max-w-[34rem] text-lg font-medium leading-relaxed">{inicio.cierre.texto}</p>
            <p className="mt-3 max-w-[34rem] text-sm font-semibold text-verde/75">{inicio.cierre.nota}</p>
          </div>
        </section>
      </main>
      <footer className={`${contenedor} border-t border-crema/15 py-8 text-sm text-crema/60`}>
        {t("marca.nombre")} · {t("inicio.hero.etiqueta")}
      </footer>
    </>
  );
}
