import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { mensajeAcceso } from "@/components/panel/mensaje-acceso";
import { EsqueletoPool } from "@/components/panel/EsqueletoPanel";
import { VistaPool } from "@/components/panel/VistaPanel";
import { resolverCaso } from "@/lib/acciones-panel";
import { cargarConfigPanel, cargarPool } from "@/lib/panel-datos";
import { leerParamsPool, urlPool } from "@/lib/panel";
import { leerAviso } from "@/lib/resolver";
import { exigirRol } from "@/lib/sesion";
import es from "@/i18n/es.json";

export const metadata: Metadata = {
  title: es.panel.tituloPaginaPool,
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<EsqueletoPool />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: SearchParams }) {
  // Guardia en el servidor de esta página (el layout no alcanza): solo reclutamiento. Un referente va a /portal; sin sesión, a /ingresar.
  const acceso = await exigirRol("reclutamiento");
  const mensaje = mensajeAcceso(acceso, "/panel/pool");
  if (mensaje) return mensaje;
  if (acceso.estado !== "mostrar") return null;

  const { supabase } = acceso.sesion;
  const sp = await searchParams;
  const params = leerParamsPool(sp);
  const [config, pool] = await Promise.all([cargarConfigPanel(supabase), cargarPool(supabase, params)]);
  // Una página más allá de la última (por ejemplo, un link viejo) vuelve a la primera con los mismos filtros.
  if (pool.ok && "fueraDeRango" in pool) redirect(urlPool({ ...params, pagina: 1 }));

  return <VistaPool zona={config.ok ? config.config.zona : "UTC"} pool={pool} params={params} accion={resolverCaso} aviso={leerAviso(sp)} />;
}
