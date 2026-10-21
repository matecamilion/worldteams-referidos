/** reCAPTCHA v3 en el navegador. Solo se usa con NEXT_PUBLIC_DEMO=false. */
type Grecaptcha = {
  ready: (cb: () => void) => void;
  execute: (clave: string, opts: { action: string }) => Promise<string>;
};
declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

const clave = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
let cargando: Promise<void> | null = null;

/** Carga el script recién cuando la persona empieza a completar el formulario. */
export function cargarRecaptcha(): Promise<void> {
  if (!clave || typeof document === "undefined") return Promise.resolve();
  cargando ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${clave}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No cargó reCAPTCHA"));
    document.head.appendChild(s);
  });
  return cargando;
}

export async function obtenerTokenRecaptcha(accion: string): Promise<string> {
  await cargarRecaptcha();
  const g = window.grecaptcha;
  if (!g || !clave) throw new Error("reCAPTCHA no disponible");
  await new Promise<void>((r) => g.ready(r));
  return g.execute(clave, { action: accion });
}
