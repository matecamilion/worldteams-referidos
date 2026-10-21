/**
 * Dirección pública de la app. El link que comparte cada referente apunta siempre acá (en producción),
 * aunque se esté probando en localhost. Se puede cambiar con NEXT_PUBLIC_SITE_URL.
 */
const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://worldteams-referidos.vercel.app").replace(/\/+$/, "");

export const sitio = {
  /** "https://worldteams-referidos.vercel.app" */
  url: base,
  /** Sin protocolo, como se muestra: "worldteams-referidos.vercel.app" */
  host: base.replace(/^https?:\/\//, ""),
};
