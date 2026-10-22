"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";

/**
 * Pestañas del panel. Son enlaces comunes (navegan sin JavaScript); el cliente solo calcula cuál está activa y el
 * HTML del servidor ya sale con `aria-current`. `base` es "/panel" (o "/dev/panel" en la vista de prueba).
 */
export function NavegacionPanel({ base = "/panel" }: { base?: string }) {
  const ruta = usePathname().replace(/\/$/, "");
  const enPool = ruta === `${base}/pool` || ruta.startsWith(`${base}/pool/`);
  const pestanas = [
    { href: base, texto: t("panel.navegacion.revision"), activa: !enPool },
    { href: `${base}/pool`, texto: t("panel.navegacion.pool"), activa: enPool },
  ];
  return (
    <nav aria-label={t("panel.navegacion.etiqueta")} className="border-b border-crema/15" data-testid="navegacion-panel">
      <ul className="grid grid-cols-2 sm:flex sm:gap-2">
        {pestanas.map((p) => (
          <li key={p.href} className="sm:w-auto">
            <Link
              href={p.href}
              aria-current={p.activa ? "page" : undefined}
              className={`-mb-px flex min-h-12 items-center justify-center border-b-2 px-5 font-display text-lg font-medium transition-colors duration-150 sm:px-6 ${
                p.activa ? "border-lima text-lima" : "border-transparent text-crema/75 hover:text-crema"
              }`}
            >
              {p.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
