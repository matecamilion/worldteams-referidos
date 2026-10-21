import Link from "next/link";
import { t } from "@/lib/i18n";

export function Encabezado() {
  return (
    <header className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-8 lg:px-14">
      <Link href="/" className="inline-block" aria-label={t("marca.nombre")}>
        {/* SVG publicado por WorldTeams en su sitio; next/image no aporta para un SVG. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/worldteams-logo.svg" alt={t("marca.logoAlt")} width={150} height={29} className="h-7 w-auto" />
      </Link>
    </header>
  );
}
