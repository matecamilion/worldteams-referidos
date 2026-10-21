import type { Metadata } from "next";
import { Suspense } from "react";
import { BotonSalir } from "@/components/BotonSalir";
import { Encabezado } from "@/components/Encabezado";
import { MensajePagina } from "@/components/MensajePagina";
import { EsqueletoPortal } from "@/components/portal/EsqueletoPortal";
import { VistaPortalReferente } from "@/components/portal/VistaPortal";
import { cargarPortal } from "@/lib/portal-datos";
import { exigirRol } from "@/lib/sesion";
import { t } from "@/lib/i18n";
import es from "@/i18n/es.json";

export const metadata: Metadata = {
  title: es.portal.tituloPagina,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <>
      <Encabezado />
      <main className="mx-auto w-full max-w-[1280px] px-5 pb-20 sm:px-8 lg:px-14">
        {/* El fallback es el estado "cargando": hasta que la sesión y los datos llegan, se ve el esqueleto. */}
        <Suspense fallback={<EsqueletoPortal />}>
          <Contenido />
        </Suspense>
      </main>
    </>
  );
}

async function Contenido() {
  // Guardia en el servidor: sin sesión va a /ingresar y un rol que no es referente va a su página (ver lib/sesion.ts).
  const acceso = await exigirRol("referente");

  if (acceso.estado === "no_disponible") {
    return <MensajePagina titulo={t("portal.noDisponible.titulo")} texto={t("portal.noDisponible.texto")} cta={{ href: "/", texto: t("portal.noDisponible.cta") }} />;
  }
  if (acceso.estado === "error") return <ErrorPortal />;
  if (acceso.estado === "no_habilitado") {
    // Sesión válida sin habilitación: ningún dato, solo el aviso y la salida.
    return (
      <MensajePagina
        titulo={t("portal.noHabilitado.titulo")}
        texto={acceso.email ? t("portal.noHabilitado.texto", { email: acceso.email }) : t("portal.noHabilitado.texto_sin_email")}
        acciones={<BotonSalir />}
      />
    );
  }

  const { supabase, referente } = acceso.sesion;
  // Un rol "referente" siempre trae su fila; si no la trajera, es un error nuestro y no se muestra nada.
  if (!referente) return <ErrorPortal />;
  const resultado = await cargarPortal(supabase, referente);
  if (!resultado.ok) return <ErrorPortal />;
  return <VistaPortalReferente vista={resultado.vista} />;
}

function ErrorPortal() {
  return (
    <MensajePagina
      titulo={t("portal.error.titulo")}
      texto={t("portal.error.texto")}
      cta={{ href: "/portal", texto: t("portal.error.reintentar") }}
      acciones={<BotonSalir />}
    />
  );
}
