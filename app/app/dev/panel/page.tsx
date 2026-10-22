import { Suspense } from "react";
import { connection } from "next/server";
import { VistaRevision } from "@/components/panel/VistaPanel";
import { resolverCasoDemo } from "@/app/dev/panel/acciones";
import { datosDemo } from "@/lib/panel-demo";
import { leerAviso } from "@/lib/resolver";

/**
 * Vista previa de Revisión con datos ficticios, SOLO en desarrollo (en producción el layout responde 404).
 * /dev/panel?modo=datos | vacio | error   ·   el Talent pool está en /dev/panel/pool
 * Los botones usan una acción de mentira (app/dev/panel/acciones.ts): no tocan la base ni gastan casos.
 */
export default function Page({ searchParams }: PageProps<"/dev/panel">) {
  return (
    <Suspense>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: PageProps<"/dev/panel">["searchParams"] }) {
  await connection(); // usa la hora actual: se renderiza en cada pedido
  const sp = await searchParams;
  const { cfg, cola } = datosDemo(sp);
  return <VistaRevision zona={cfg.zona} plazo={cfg.plazoRevisionDias} cola={cola} accion={resolverCasoDemo} aviso={leerAviso(sp)} baseCola="/dev/panel" />;
}
