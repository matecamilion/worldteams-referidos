import type { Metadata } from "next";
import { Suspense } from "react";
import { BotonSalir } from "@/components/BotonSalir";
import { Encabezado } from "@/components/Encabezado";
import { MensajePagina } from "@/components/MensajePagina";
import { EsqueletoPortal } from "@/components/portal/EsqueletoPortal";
import { exigirRol } from "@/lib/sesion";
import { t } from "@/lib/i18n";
import es from "@/i18n/es.json";

export const metadata: Metadata = {
  title: es.panel.tituloPagina,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <>
      <Encabezado />
      <main className="mx-auto w-full max-w-[1280px] px-5 pb-20 sm:px-8 lg:px-14">
        <Suspense fallback={<EsqueletoPortal />}>
          <Contenido />
        </Suspense>
      </main>
    </>
  );
}

async function Contenido() {
  // Guardia en el servidor: solo reclutamiento. Un referente es redirigido a /portal; sin sesión, a /ingresar.
  const acceso = await exigirRol("reclutamiento");

  if (acceso.estado === "no_disponible") {
    return <MensajePagina titulo={t("portal.noDisponible.titulo")} texto={t("portal.noDisponible.texto")} cta={{ href: "/", texto: t("portal.noDisponible.cta") }} />;
  }
  if (acceso.estado === "error") {
    return <MensajePagina titulo={t("portal.error.titulo")} texto={t("portal.error.texto")} cta={{ href: "/panel", texto: t("portal.error.reintentar") }} acciones={<BotonSalir />} />;
  }
  if (acceso.estado === "no_habilitado") {
    return (
      <MensajePagina
        titulo={t("portal.noHabilitado.titulo")}
        texto={acceso.email ? t("portal.noHabilitado.texto", { email: acceso.email }) : t("portal.noHabilitado.texto_sin_email")}
        acciones={<BotonSalir />}
      />
    );
  }

  return (
    <div className="pt-6 sm:pt-12">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-lima">{t("panel.etiqueta")}</p>
      <h1 className="mt-4 font-display text-[clamp(2.25rem,6vw,4.5rem)] font-medium leading-[0.98] tracking-[-0.035em]">{t("panel.titulo")}</h1>
      <p className="mt-6 text-lg text-crema/80">{t("panel.proximamente")}</p>
      <div className="mt-9">
        <BotonSalir />
      </div>
    </div>
  );
}
