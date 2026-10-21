import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Encabezado } from "@/components/Encabezado";
import { MensajePagina } from "@/components/MensajePagina";
import { EsqueletoPortal } from "@/components/portal/EsqueletoPortal";
import { VistaPortalReferente } from "@/components/portal/VistaPortal";
import { armarPremios, armarProgreso, armarReferidos } from "@/lib/portal";
import type { VistaPortal } from "@/lib/portal-datos";
import { t } from "@/lib/i18n";

/**
 * Vista previa de los estados del portal con datos ficticios, SOLO en desarrollo (en producción responde 404).
 * Sirve para revisar el diseño y sacar capturas sin tener una sesión real. No lee la base ni usa la sesión.
 *   /dev/portal?estado=datos | vacio | cargando | error | casi | completo
 */
export default function Page({ searchParams }: PageProps<"/dev/portal">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <Encabezado />
      <main className="mx-auto w-full max-w-[1280px] px-5 pb-20 sm:px-8 lg:px-14">
        <Suspense>
          <Estado searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

const base: VistaPortal = {
  nombre: "Lucía",
  codigo: "lucia-k7q2m9xd",
  link: "worldteams-referidos.vercel.app/r/lucia-k7q2m9xd",
  urlCompleta: "https://worldteams-referidos.vercel.app/r/lucia-k7q2m9xd",
  referidos: [],
  premios: armarPremios([]),
  progreso: armarProgreso({ validados_anio: 0, proximo_hito: 3, proximo_bono_usd: 75, faltan: 3 }),
};

async function Estado({ searchParams }: { searchParams: PageProps<"/dev/portal">["searchParams"] }) {
  const { estado } = await searchParams;
  if (estado === "cargando") return <EsqueletoPortal />;
  if (estado === "error") {
    return <MensajePagina titulo={t("portal.error.titulo")} texto={t("portal.error.texto")} cta={{ href: "/portal", texto: t("portal.error.reintentar") }} />;
  }
  if (estado === "vacio") return <VistaPortalReferente vista={base} />;

  const referidos = armarReferidos([
    { referido_id: "1", nombre: "Camila", apellido: "Restrepo", estado_visible: "validado", creado_en: "2026-10-02T10:00:00Z" },
    { referido_id: "2", nombre: "Joaquín", apellido: "Ferreyra", estado_visible: "en_revision", creado_en: "2026-10-09T10:00:00Z" },
    { referido_id: "3", nombre: "Mariana", apellido: "Sousa", estado_visible: "validado", creado_en: "2026-09-21T10:00:00Z" },
    { referido_id: "4", nombre: "Diego", apellido: "Mamani", estado_visible: "rechazado", creado_en: "2026-09-12T10:00:00Z" },
    { referido_id: "5", nombre: "Paula", apellido: "Núñez", estado_visible: "registrado", creado_en: "2026-10-15T10:00:00Z" },
  ]);
  const premios = armarPremios([
    { id: "a", concepto: "base", hito_umbral: null, monto_usd: "50.00", estado: "pendiente", ciclo_pago: "2026-10", pagado_en: null, creado_en: "2026-10-02T10:00:00Z" },
    { id: "b", concepto: "extra_prioritario", hito_umbral: null, monto_usd: "50.00", estado: "pendiente", ciclo_pago: "2026-10", pagado_en: null, creado_en: "2026-10-02T10:00:01Z" },
    { id: "c", concepto: "base", hito_umbral: null, monto_usd: "50.00", estado: "pagado", ciclo_pago: "2026-09", pagado_en: "2026-09-25T10:00:00Z", creado_en: "2026-09-21T10:00:00Z" },
  ]);
  const progreso =
    estado === "completo"
      ? armarProgreso({ validados_anio: 11, proximo_hito: null, proximo_bono_usd: null, faltan: 0 })
      : estado === "casi"
        ? armarProgreso({ validados_anio: 2, proximo_hito: 3, proximo_bono_usd: 75, faltan: 1 })
        : armarProgreso({ validados_anio: 2, proximo_hito: 3, proximo_bono_usd: 75, faltan: 1 });
  return <VistaPortalReferente vista={{ ...base, referidos, premios, progreso }} />;
}
