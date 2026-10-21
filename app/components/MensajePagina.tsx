import Link from "next/link";
import type { ReactNode } from "react";

/** Pantalla de un solo mensaje (no disponible, no habilitado, error), con la misma voz que las de /r/[codigo]. */
export function MensajePagina({
  titulo,
  texto,
  cta,
  acciones,
}: {
  titulo: string;
  texto: string;
  cta?: { href: string; texto: string };
  acciones?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl py-12 sm:py-24">
      <h1 className="font-display text-[clamp(2.25rem,6vw,4.25rem)] font-medium leading-[0.98] tracking-[-0.035em]">{titulo}</h1>
      <p className="mt-6 text-lg leading-relaxed text-crema/80">{texto}</p>
      <div className="mt-9 flex flex-wrap items-center gap-3">
        {cta ? (
          <Link
            href={cta.href}
            className="inline-flex h-12 items-center rounded-lg bg-lima px-8 font-bold text-verde transition-transform duration-150 active:scale-[0.98]"
          >
            {cta.texto}
          </Link>
        ) : null}
        {acciones}
      </div>
    </div>
  );
}
