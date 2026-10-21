"use client";

import { useEffect, useRef } from "react";
import { config } from "@/lib/config";
import es from "@/i18n/es.json";
import { cargarGsap, prefiereMovimientoReducido } from "@/lib/gsap";
import { t } from "@/lib/i18n";

const p = es.inicio.portal;
const hito = config.hitos[0];
const validados = p.referidos.filter((r) => r.estado === "validado").length;
const estados = p.estados as Record<string, string>;
const estiloEstado: Record<string, string> = {
  validado: "bg-lima text-verde",
  revision: "bg-crema/15 text-crema",
  noAvanzo: "bg-crema/10 text-crema/60",
};

/** Maqueta del portal con datos ficticios. La barra de hitos avanza una vez al entrar en pantalla. */
export function PortalEjemplo() {
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el || prefiereMovimientoReducido()) return;
    let cancelado = false;
    let limpiar = () => {};

    cargarGsap().then(({ gsap }) => {
      if (cancelado) return;
      const ctx = gsap.context(() => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 75%", once: true } });
        tl.from("[data-barra]", { scaleX: 0, duration: 1.1, ease: "power3.out" })
          .from("[data-fila]", { autoAlpha: 0, x: -14, stagger: 0.09, duration: 0.5, ease: "power3.out" }, 0.1);
      }, el);
      limpiar = () => ctx.revert();
    });
    return () => {
      cancelado = true;
      limpiar();
    };
  }, []);

  return (
    <figure className="mt-10">
      <div
        ref={raiz}
        aria-hidden
        className="overflow-hidden rounded-lg border-[1.5px] border-verde/30 bg-verde text-crema shadow-[0_40px_80px_-40px_rgba(20,45,43,0.7)]"
      >
        <div className="flex items-center gap-2 border-b border-crema/15 px-4 py-3">
          <span className="size-2.5 rounded-full bg-crema/25" />
          <span className="size-2.5 rounded-full bg-crema/25" />
          <span className="size-2.5 rounded-full bg-crema/25" />
          <span className="ml-3 truncate text-sm text-crema/60">{p.ventana}</span>
        </div>

        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <p className="font-display text-2xl font-medium sm:text-3xl">{p.saludo}</p>
            <div className="mt-5 rounded-lg border border-crema/20 p-4">
              <p className="text-sm text-crema/65">{p.linkEtiqueta}</p>
              <p className="mt-1 font-display text-[0.8rem] font-medium sm:text-lg">
                <span className="block whitespace-nowrap">{p.linkValor.slice(0, p.linkValor.indexOf("/r/") + 3)}</span>
                <span className="block whitespace-nowrap">{p.linkValor.slice(p.linkValor.indexOf("/r/") + 3)}</span>
              </p>
            </div>

            <div className="mt-6">
              <p className="font-display text-lg font-medium">{p.barraTitulo}</p>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-crema/15">
                <div data-barra className="h-full origin-left rounded-full bg-lima" style={{ width: `${(validados / hito.referidos) * 100}%` }} />
              </div>
              <p className="mt-2 text-sm text-crema/75">{t("inicio.portal.barraTexto", { validados, hito: hito.referidos, bono: hito.bonoUsd })}</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-crema/10 p-4">
                <p className="text-sm text-crema/65">{p.pendiente}</p>
                <p className="num mt-1 font-display text-3xl font-medium">USD {config.montoBaseUsd}</p>
              </div>
              <div className="rounded-lg bg-crema/10 p-4">
                <p className="text-sm text-crema/65">{p.pagado}</p>
                <p className="num mt-1 font-display text-3xl font-medium">USD {config.montoBaseUsd}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-crema/60">{t("inicio.portal.corte", { corte: config.diaCortePago })}</p>
          </div>

          <div>
            <p className="font-display text-lg font-medium">{p.referidosTitulo}</p>
            <ul className="mt-3 divide-y divide-crema/15 border-y border-crema/15">
              {p.referidos.map((r) => (
                <li key={r.nombre} data-fila className="flex items-center justify-between gap-4 py-3.5">
                  <span className="font-medium">{r.nombre}</span>
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${estiloEstado[r.estado]}`}>{estados[r.estado]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-sm font-semibold">{p.ficticio}</figcaption>
    </figure>
  );
}
