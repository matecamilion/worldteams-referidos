import { Suspense } from "react";
import { connection } from "next/server";
import { VistaPool } from "@/components/panel/VistaPanel";
import { resolverCasoDemo } from "@/app/dev/panel/acciones";
import { datosDemo } from "@/lib/panel-demo";
import { leerAviso } from "@/lib/resolver";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Vista previa del Talent pool con datos ficticios (el buscador, el filtro y la paginación funcionan sobre ellos). Solo desarrollo. */
export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const { cfg, pool, params } = datosDemo(sp);
  return <VistaPool zona={cfg.zona} pool={pool} params={params} accion={resolverCasoDemo} aviso={leerAviso(sp)} basePool="/dev/panel/pool" />;
}
