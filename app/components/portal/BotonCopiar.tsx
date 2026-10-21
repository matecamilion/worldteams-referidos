"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

/** Copia el link al portapapeles y lo confirma con texto (no solo con color). Si el navegador lo impide, lo dice. */
export function BotonCopiar({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<"reposo" | "copiado" | "error">("reposo");
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
    } catch {
      setEstado("error");
    }
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setEstado("reposo"), 2500);
  }

  return (
    <>
      <button
        type="button"
        onClick={copiar}
        className="inline-flex h-11 min-w-28 shrink-0 items-center justify-center rounded-lg bg-lima px-5 font-bold text-verde transition-transform duration-150 active:scale-[0.97]"
      >
        {estado === "copiado" ? t("portal.link.copiado") : t("portal.link.copiar")}
      </button>
      <span role="status" className="sr-only">
        {estado === "copiado" ? t("portal.link.copiado") : estado === "error" ? t("portal.link.error") : ""}
      </span>
      {estado === "error" ? (
        <p className="basis-full text-sm font-medium text-lima" aria-hidden>
          {t("portal.link.error")}
        </p>
      ) : null}
    </>
  );
}
