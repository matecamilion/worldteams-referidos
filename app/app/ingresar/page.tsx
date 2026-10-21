import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Encabezado } from "@/components/Encabezado";
import { FormularioIngreso } from "@/components/ingreso/FormularioIngreso";
import { MensajePagina } from "@/components/MensajePagina";
import { supabaseConfigurado } from "@/lib/supabase-sesion";
import { t } from "@/lib/i18n";
import es from "@/i18n/es.json";

export const metadata: Metadata = {
  title: es.ingreso.tituloPagina,
  robots: { index: false, follow: false },
};

export default function Page({ searchParams }: PageProps<"/ingresar">) {
  return (
    <>
      <Encabezado />
      <main className="mx-auto w-full max-w-[1280px] px-5 pb-20 sm:px-8 lg:px-14">
        <Suspense fallback={<div className="h-[60dvh]" aria-hidden />}>
          <Contenido searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Contenido({ searchParams }: { searchParams: PageProps<"/ingresar">["searchParams"] }) {
  // Sin variables de Supabase el login no puede andar: se avisa, y el resto del sitio sigue normal.
  if (!supabaseConfigurado()) {
    return <MensajePagina titulo={t("ingreso.noDisponible.titulo")} texto={t("ingreso.noDisponible.texto")} cta={{ href: "/", texto: t("ingreso.noDisponible.cta") }} />;
  }
  const { error } = await searchParams;

  return (
    <div className="grid gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-center lg:gap-20 lg:pt-16">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-lima">{t("ingreso.etiqueta")}</p>
        <h1 className="mt-4 font-display text-[clamp(2.5rem,6.4vw,5.25rem)] font-medium leading-[0.98] tracking-[-0.035em]">
          {t("ingreso.titulo")}
        </h1>
        <p className="mt-6 max-w-[32rem] text-lg leading-relaxed text-crema/80">{t("ingreso.bajada")}</p>
        <p className="mt-4 max-w-[32rem] text-crema/60">{t("ingreso.aclaracion")}</p>
      </section>

      <section aria-label={t("ingreso.titulo")}>
        <FormularioIngreso errorInicial={error === "enlace" ? "enlace" : undefined} />
        <Link href="/" className="mt-5 inline-block font-semibold text-crema/70 underline-offset-4 transition-colors hover:text-crema hover:underline">
          {t("ingreso.volver")}
        </Link>
      </section>
    </div>
  );
}
