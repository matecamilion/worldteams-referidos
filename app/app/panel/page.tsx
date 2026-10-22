import type { Metadata } from "next";
import { Suspense } from "react";
import { mensajeAcceso } from "@/components/panel/mensaje-acceso";
import { EsqueletoRevision } from "@/components/panel/EsqueletoPanel";
import { VistaRevision } from "@/components/panel/VistaPanel";
import { resolverCaso } from "@/lib/acciones-panel";
import { cargarConfigPanel, cargarCola } from "@/lib/panel-datos";
import { leerAviso } from "@/lib/resolver";
import { exigirRol } from "@/lib/sesion";
import es from "@/i18n/es.json";

export const metadata: Metadata = {
  title: es.panel.tituloPagina,
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<EsqueletoRevision />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: SearchParams }) {
  // Guardia en el servidor de esta página (el layout no alcanza): solo reclutamiento. Un referente va a /portal; sin sesión, a /ingresar.
  const acceso = await exigirRol("reclutamiento");
  const mensaje = mensajeAcceso(acceso, "/panel");
  if (mensaje) return mensaje;
  if (acceso.estado !== "mostrar") return null;

  const config = await cargarConfigPanel(acceso.sesion.supabase);
  const cola = config.ok ? await cargarCola(acceso.sesion.supabase, config.config) : ({ ok: false } as const);
  return (
    <VistaRevision
      zona={config.ok ? config.config.zona : "UTC"}
      plazo={config.ok ? config.config.plazoRevisionDias : null}
      cola={cola}
      accion={resolverCaso}
      aviso={leerAviso(await searchParams)}
    />
  );
}
