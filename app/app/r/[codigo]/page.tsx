import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Encabezado } from "@/components/Encabezado";
import { FormularioReferido } from "@/components/FormularioReferido";
import es from "@/i18n/es.json";
import { buscarReferente } from "@/lib/referentes";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: es.candidato.tituloPagina,
  robots: { index: false, follow: false },
};

export default function Page({ params }: PageProps<"/r/[codigo]">) {
  return (
    <>
      <Encabezado />
      <main className="px-5 pb-20 sm:px-8 lg:px-14">
        <Suspense fallback={<div className="h-[60dvh]" aria-hidden />}>
          <Contenido params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function Contenido({ params }: { params: PageProps<"/r/[codigo]">["params"] }) {
  const { codigo } = await params;
  const referente = await buscarReferente(decodeURIComponent(codigo));

  if (!referente) return <CodigoInexistente />;

  const nombreCompleto = `${referente.nombre} ${referente.apellido}`;

  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
      <section className="lg:col-span-7 lg:sticky lg:top-10 lg:self-start xl:pr-10">
        <h1 className="font-display text-[clamp(2.75rem,7.2vw,6.25rem)] font-medium leading-[0.96] tracking-[-0.035em]">
          <span className="linea">
            <span style={{ "--retraso": "0ms" } as React.CSSProperties}>{nombreCompleto}</span>
          </span>
          <span className="linea">
            <span style={{ "--retraso": "120ms" } as React.CSSProperties}>{t("candidato.titulo")}</span>
          </span>
        </h1>
        <p className="mt-7 max-w-[34rem] text-lg leading-relaxed text-crema/80">{t("candidato.bajada")}</p>
        <ul className="mt-10 max-w-[34rem] divide-y divide-crema/15 border-y border-crema/15">
          {es.candidato.razones.map((r) => (
            <li key={r.titulo} className="py-5">
              <p className="font-display text-lg font-medium">{r.titulo}</p>
              <p className="mt-1 text-crema/75">{r.texto.replace("{nombre}", referente.nombre)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lg:col-span-5" aria-label={t("formulario.titulo")}>
        <FormularioReferido codigo={referente.codigo} referente={nombreCompleto} />
      </section>
    </div>
  );
}

function CodigoInexistente() {
  return (
    <div className="mx-auto max-w-2xl py-16 sm:py-28">
      <h1 className="font-display text-[clamp(2.5rem,7vw,5rem)] font-medium leading-[0.98] tracking-[-0.035em]">
        {t("candidato.noEncontrado.titulo")}
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-crema/80">{t("candidato.noEncontrado.texto")}</p>
      <Link
        href="/"
        className="mt-9 inline-flex min-h-14 items-center rounded-full bg-lima px-8 font-bold text-verde transition-transform duration-150 active:scale-[0.98]"
      >
        {t("candidato.noEncontrado.cta")}
      </Link>
    </div>
  );
}
