import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Encabezado } from "@/components/Encabezado";
import { FormularioReferido } from "@/components/FormularioReferido";
import es from "@/i18n/es.json";
import { ipDelCliente } from "@/lib/limite";
import { consultarReferente } from "@/lib/referentes";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: es.candidato.tituloPagina,
  robots: { index: false, follow: false },
};

export default function Page({ params }: PageProps<"/r/[codigo]">) {
  return (
    <>
      <Encabezado />
      <main className="mx-auto w-full max-w-[1280px] px-5 pb-20 sm:px-8 lg:px-14">
        <Suspense fallback={<div className="h-[60dvh]" aria-hidden />}>
          <Contenido params={params} />
        </Suspense>
      </main>
    </>
  );
}

function Razones({ nombre, className }: { nombre: string; className: string }) {
  return (
    <ul className={`max-w-[34rem] divide-y divide-crema/15 border-y border-crema/15 ${className}`}>
      {es.candidato.razones.map((r) => (
        <li key={r.titulo} className="py-4">
          <p className="font-display text-lg font-medium">{r.titulo}</p>
          <p className="mt-1 text-crema/75">{r.texto.replace("{nombre}", nombre)}</p>
        </li>
      ))}
    </ul>
  );
}

async function Contenido({ params }: { params: PageProps<"/r/[codigo]">["params"] }) {
  const { codigo } = await params;
  const consulta = await consultarReferente(decodificar(codigo), ipDelCliente(await headers()));

  if (consulta.tipo === "no_disponible") return <MensajeSimple clave="noDisponible" />;
  if (consulta.tipo === "bloqueada") return <MensajeSimple clave="bloqueado" />;
  if (consulta.tipo === "no_existe") return <MensajeSimple clave="noEncontrado" />;
  const { referente } = consulta;

  const nombreCompleto = `${referente.nombre} ${referente.apellido}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-start lg:gap-16">
      {/* Escritorio: bienvenida fija a la izquierda mientras se completa el formulario. */}
      <section className="lg:sticky lg:top-8">
        <h1 className="font-display text-[clamp(2.5rem,6.4vw,5.5rem)] font-medium leading-[0.96] tracking-[-0.035em]">
          <span className="linea">
            <span style={{ "--retraso": "0ms" } as React.CSSProperties}>{nombreCompleto}</span>
          </span>
          <span className="linea">
            <span style={{ "--retraso": "120ms" } as React.CSSProperties}>{t("candidato.titulo")}</span>
          </span>
        </h1>
        <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-crema/80">{t("candidato.bajada")}</p>
        <Razones nombre={referente.nombre} className="mt-10 max-lg:hidden" />
      </section>

      <section aria-label={t("formulario.titulo")}>
        <FormularioReferido codigo={referente.codigo} referente={nombreCompleto} />
      </section>

      {/* Móvil: primero el formulario, después las razones. */}
      <Razones nombre={referente.nombre} className="lg:hidden" />
    </div>
  );
}

/** Un `%` mal formado en la URL no tiene que romper la página: se trata como un código que no existe. */
function decodificar(codigo: string) {
  try {
    return decodeURIComponent(codigo);
  } catch {
    return "";
  }
}

function MensajeSimple({ clave }: { clave: "noEncontrado" | "bloqueado" | "noDisponible" }) {
  return (
    <div className="mx-auto max-w-2xl py-16 sm:py-28">
      <h1 className="font-display text-[clamp(2.5rem,7vw,5rem)] font-medium leading-[0.98] tracking-[-0.035em]">
        {t(`candidato.${clave}.titulo`)}
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-crema/80">{t(`candidato.${clave}.texto`)}</p>
      <Link
        href="/"
        className="mt-9 inline-flex h-12 items-center rounded-lg bg-lima px-8 font-bold text-verde transition-transform duration-150 active:scale-[0.98]"
      >
        {t(`candidato.${clave}.cta`)}
      </Link>
    </div>
  );
}
