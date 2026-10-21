import type { ReactNode } from "react";
import { config } from "@/lib/config";
import es from "@/i18n/es.json";
import { t } from "@/lib/i18n";

const c = es.inicio.como.celular;
const hito = config.hitos[0];

/** Marco de celular, solo decorativo: el sentido de cada pantalla lo da el texto del paso. */
export function Celular({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="relative h-[34rem] w-[16.5rem] shrink-0 overflow-hidden rounded-[2.6rem] border-[7px] border-[#0a1716] bg-crema text-verde shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] ring-1 ring-crema/15"
    >
      <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-[#0a1716]" />
      {children}
    </div>
  );
}

const pantalla = "absolute inset-0 flex flex-col px-4 pb-5 pt-11";

export function PantallaLink() {
  return (
    <div data-pantalla="link" className={pantalla}>
      <p className="font-display text-lg font-medium">{c.linkTitulo}</p>
      <div className="mt-4 rounded-lg border-[1.5px] border-borde/50 bg-white p-3">
        {/* El espacio de ancho cero tras "/r/" deja cortar la línea ahí y no en mitad de la palabra. */}
        <p className="font-display text-[0.95rem] font-medium leading-snug">{c.linkValor.replace("/r/", "/r/​")}</p>
      </div>
      <div className="relative mt-3 h-10">
        <span data-copiar className="absolute inset-0 flex items-center justify-center rounded-lg bg-verde text-sm font-bold text-crema">
          {c.copiar}
        </span>
        <span data-copiado className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-lima text-sm font-bold text-verde">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4.5 10.5 3.5 3.5 7.5-8" />
          </svg>
          {c.copiado}
        </span>
      </div>
      <p className="mt-3 text-[0.8rem] leading-snug text-tinta-suave">{c.linkAyuda}</p>
      <p className="mt-auto rounded-md bg-lima/30 px-3 py-2 text-xs font-semibold">{c.etiquetaFicticio}</p>
    </div>
  );
}

export function PantallaFormulario() {
  return (
    <div data-pantalla="formulario" className={pantalla}>
      <p className="font-display text-base font-medium leading-tight">{c.formTitulo}</p>
      <div className="mt-4 grid gap-3">
        {c.formCampos.map((f) => (
          <div key={f.etiqueta}>
            <p className="text-[0.7rem] font-semibold text-tinta-suave">{f.etiqueta}</p>
            <div className="mt-1 flex h-9 items-center rounded-md border-[1.5px] border-borde/50 bg-white px-2.5">
              <span data-campo className="block truncate text-[0.8rem] font-medium">
                {f.valor}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div data-enviar className="mt-auto flex h-10 items-center justify-center rounded-lg bg-verde text-sm font-bold text-crema">
        {c.formBoton}
      </div>
    </div>
  );
}

/** Estado final: 2 de 3 referidos hacia el primer bono. GSAP parte de la mitad de la barra al mover el scroll. */
export function PantallaPortal() {
  const validados = 2;
  return (
    <div data-pantalla="portal" className={pantalla}>
      <p className="font-display text-base font-medium">{c.portalTitulo}</p>
      <div data-premio className="mt-4 rounded-lg bg-verde p-4 text-crema">
        <p className="num whitespace-nowrap font-display text-4xl font-medium leading-none text-lima">+USD {config.montoBaseUsd}</p>
        <p className="mt-2 text-sm font-medium text-crema/85">{c.portalAviso}</p>
      </div>
      <div className="mt-5">
        <div className="h-2.5 overflow-hidden rounded-full bg-borde/30">
          <div data-barra className="h-full origin-left rounded-full bg-verde" style={{ width: `${(validados / hito.referidos) * 100}%` }} />
        </div>
        <p className="mt-2 text-[0.8rem] font-semibold">
          {t("inicio.como.celular.portalBarra", { validados, hito: hito.referidos, bono: hito.bonoUsd })}
        </p>
      </div>
      <p className="mt-5 text-[0.8rem] font-semibold">{c.referidosTitulo}</p>
      <ul className="mt-1.5 divide-y divide-borde/30 border-y border-borde/30">
        {es.inicio.portal.referidos.slice(0, 2).map((r) => (
          <li key={r.nombre} className="flex items-center justify-between gap-2 py-2 text-[0.78rem]">
            <span className="truncate font-medium">{r.nombre}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${r.estado === "validado" ? "bg-lima" : "bg-borde/25"}`}>
              {(es.inicio.portal.estados as Record<string, string>)[r.estado]}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto rounded-md bg-lima/30 px-3 py-2 text-xs font-semibold">{c.etiquetaFicticio}</p>
    </div>
  );
}
