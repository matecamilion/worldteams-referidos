import { BotonSalir } from "@/components/BotonSalir";
import { MensajePagina } from "@/components/MensajePagina";
import { t } from "@/lib/i18n";
import type { AccesoRuta } from "@/lib/sesion";

/** Mensaje para los estados de acceso que no muestran el panel; null si hay que mostrarlo. */
export function mensajeAcceso(acceso: AccesoRuta, rutaReintento: string) {
  if (acceso.estado === "no_disponible") {
    return <MensajePagina titulo={t("portal.noDisponible.titulo")} texto={t("portal.noDisponible.texto")} cta={{ href: "/", texto: t("portal.noDisponible.cta") }} />;
  }
  if (acceso.estado === "error") {
    return <MensajePagina titulo={t("portal.error.titulo")} texto={t("portal.error.texto")} cta={{ href: rutaReintento, texto: t("portal.error.reintentar") }} acciones={<BotonSalir />} />;
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
  return null;
}
