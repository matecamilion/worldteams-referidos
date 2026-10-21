"use client";

import { MensajePagina } from "@/components/MensajePagina";
import { t } from "@/lib/i18n";

/** Red de seguridad: cualquier excepción inesperada al armar el portal muestra el mismo estado de error, sin detalles. */
export default function ErrorDelPortal({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 pb-20 sm:px-8 lg:px-14">
      <MensajePagina
        titulo={t("portal.error.titulo")}
        texto={t("portal.error.texto")}
        acciones={
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex h-12 items-center rounded-lg bg-lima px-8 font-bold text-verde transition-transform duration-150 active:scale-[0.98]"
          >
            {t("portal.error.reintentar")}
          </button>
        }
      />
    </main>
  );
}
