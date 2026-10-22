import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

/**
 * `entrar` muestra el acceso al portal: solo en la home, que es la página del referente. `acciones` lo reemplaza por lo
 * que necesite la sección (por ejemplo, Salir en el panel).
 */
export function Encabezado({ entrar = false, acciones }: { entrar?: boolean; acciones?: ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-5 py-6 sm:px-8 lg:px-14">
      <Link href="/" className="inline-block" aria-label={t("marca.nombre")}>
        {/* SVG publicado por WorldTeams en su sitio; next/image no aporta para un SVG. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/worldteams-logo.svg" alt={t("marca.logoAlt")} width={150} height={29} className="h-7 w-auto" />
      </Link>
      {acciones ?? null}
      {entrar && !acciones ? (
        <Link
          href="/ingresar"
          className="inline-flex h-11 items-center rounded-lg border-[1.5px] border-fg/30 px-5 text-sm font-bold transition-colors duration-150 hover:border-fg/60 active:scale-[0.98] sm:text-base"
        >
          {t("marca.entrar")}
        </Link>
      ) : null}
    </header>
  );
}
