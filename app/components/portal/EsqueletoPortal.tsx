import { t } from "@/lib/i18n";

const bloque = "animate-pulse rounded-lg bg-crema/10 motion-reduce:animate-none";

/** Estado "cargando" del portal: la misma grilla que la vista con datos, para que no salte al llegar. */
export function EsqueletoPortal() {
  return (
    <div className="pt-4 sm:pt-8" aria-busy="true" data-testid="cargando">
      <p role="status" className="sr-only">
        {t("portal.cargando")}
      </p>
      <div className="flex items-center justify-between gap-4" aria-hidden>
        <div className={`${bloque} h-12 w-72 max-w-[70%]`} />
        <div className={`${bloque} h-11 w-20`} />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14" aria-hidden>
        <div>
          <div className={`${bloque} h-28`} />
          <div className={`${bloque} mt-8 h-24`} />
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className={`${bloque} h-24`} />
            <div className={`${bloque} h-24`} />
          </div>
        </div>
        <div className="grid content-start gap-3">
          <div className={`${bloque} h-7 w-40`} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${bloque} h-12`} />
          ))}
        </div>
      </div>
    </div>
  );
}
