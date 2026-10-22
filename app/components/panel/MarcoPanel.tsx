import type { ReactNode } from "react";
import { BotonSalir } from "@/components/BotonSalir";
import { Encabezado } from "@/components/Encabezado";
import { NavegacionPanel } from "@/components/panel/NavegacionPanel";
import { exigirRol } from "@/lib/sesion";

const principal = "mx-auto w-full max-w-[1280px] px-5 pb-20 sm:px-8 lg:px-14";

/** Logo, Salir y pestañas alrededor de la página. Sin datos ni sesión: la usan el layout real y el de /dev/panel. */
export function MarcoVisual({ base = "/panel", children }: { base?: string; children: ReactNode }) {
  return (
    <>
      <Encabezado acciones={<BotonSalir />} />
      <main className={principal}>
        <NavegacionPanel base={base} />
        {children}
      </main>
    </>
  );
}

/**
 * Layout del panel. Solo muestra las pestañas y Salir si hay reclutamiento: sin sesión o con otro rol `exigirRol`
 * redirige antes de dibujar nada, y si la sesión no se pudo resolver deja que cada página muestre su mensaje.
 * Esto no reemplaza el control de cada página: un layout no se vuelve a ejecutar al navegar entre páginas hijas.
 */
export async function MarcoPanelProtegido({ children }: { children: ReactNode }) {
  const acceso = await exigirRol("reclutamiento");
  if (acceso.estado === "mostrar") return <MarcoVisual>{children}</MarcoVisual>;
  return (
    <>
      <Encabezado />
      <main className={principal}>{children}</main>
    </>
  );
}
