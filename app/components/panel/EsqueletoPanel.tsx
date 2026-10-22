import { t } from "@/lib/i18n";

const bloque = "animate-pulse rounded-xl bg-crema/10 motion-reduce:animate-none";

function Cargando({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-8 sm:pt-10" aria-busy="true" data-testid="cargando">
      <p role="status" className="sr-only">
        {t("panel.cargando")}
      </p>
      <div aria-hidden>{children}</div>
    </div>
  );
}

/** Esqueleto del layout: logo, Salir y pestañas, mientras se comprueba la sesión. */
export function EsqueletoMarco() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-14" aria-busy="true" data-testid="cargando-marco">
      <p role="status" className="sr-only">
        {t("panel.cargando")}
      </p>
      <div aria-hidden>
        <div className="flex items-center justify-between py-6">
          <div className={`${bloque} h-7 w-36`} />
          <div className={`${bloque} h-11 w-20`} />
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-crema/15 pb-3 sm:flex">
          <div className={`${bloque} h-9 sm:w-32`} />
          <div className={`${bloque} h-9 sm:w-32`} />
        </div>
      </div>
    </div>
  );
}

/** Esqueleto de Revisión: título, dos métricas y una tarjeta de caso. */
export function EsqueletoRevision() {
  return (
    <Cargando>
      <div className={`${bloque} h-12 w-72 max-w-[70%]`} />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[0, 1].map((i) => (
          <div key={i} className={`${bloque} h-20 sm:h-28`} />
        ))}
      </div>
      <div className="mt-8 grid gap-4">
        <div className={`${bloque} h-72`} />
        <div className={`${bloque} h-72`} />
      </div>
    </Cargando>
  );
}

/** Esqueleto del Talent pool: título, métrica, barra de filtros y filas. */
export function EsqueletoPool() {
  return (
    <Cargando>
      <div className={`${bloque} h-12 w-60 max-w-[70%]`} />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className={`${bloque} h-20 sm:h-28`} />
      </div>
      <div className="mt-8 grid gap-3">
        <div className={`${bloque} h-24 sm:h-[5.5rem]`} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`${bloque} h-16`} />
        ))}
      </div>
    </Cargando>
  );
}
