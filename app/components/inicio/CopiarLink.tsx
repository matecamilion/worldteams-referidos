"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { Magnetico } from "./Magnetico";

/** Copia el link de ejemplo. Si el navegador no da acceso al portapapeles, selecciona el texto para copiarlo a mano. */
export function CopiarLink() {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const textoRef = useRef<HTMLSpanElement>(null);
  const link = t("inicio.hero.linkEjemplo");

  useEffect(() => () => clearTimeout(temporizador.current), []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`https://${link}`);
      setCopiado(true);
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiado(false), 2200);
    } catch {
      const r = document.createRange();
      if (textoRef.current) r.selectNodeContents(textoRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  }

  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-fg/70">{t("inicio.hero.linkTitulo")}</p>
      <div className="mt-2 flex max-w-[34rem] items-center gap-2 rounded-lg border-[1.5px] border-fg/25 p-1.5 pl-4">
        <span ref={textoRef} className="min-w-0 flex-1 truncate font-display text-lg font-medium sm:text-xl">
          {link}
        </span>
        <Magnetico>
          <button
            type="button"
            onClick={copiar}
            aria-label={t("inicio.hero.copiarEtiqueta")}
            className="inline-flex h-11 min-w-28 items-center justify-center rounded-md bg-lima px-5 font-bold text-verde transition-transform duration-150 active:scale-[0.97]"
          >
            {copiado ? t("inicio.hero.copiado") : t("inicio.hero.copiar")}
          </button>
        </Magnetico>
      </div>
      <p className="mt-2 text-sm text-fg/60">{t("inicio.hero.linkNota")}</p>
      <p role="status" className="sr-only">
        {copiado ? t("inicio.hero.copiadoAviso") : ""}
      </p>
    </div>
  );
}
