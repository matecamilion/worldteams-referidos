"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import es from "@/i18n/es.json";

const entrada = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
};

/** Al aparecer, el foco va al título para que lectores de pantalla anuncien el resultado. */
function useFocoAlMontar() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);
  return ref;
}

export function ConfirmacionRegistro({ nombre, email, referente }: { nombre: string; email: string; referente: string }) {
  const ref = useFocoAlMontar();
  return (
    <motion.div {...entrada}>
      <h2 ref={ref} tabIndex={-1} className="font-display text-3xl font-medium leading-tight tracking-tight outline-none">
        {t("confirmacion.titulo", { nombre })}
      </h2>
      <p className="mt-3 text-tinta-suave">{t("confirmacion.bajada", { referente })}</p>
      <ol className="mt-7 grid gap-5">
        {es.confirmacion.pasos.map((p, i) => (
          <li key={p.titulo} className="flex gap-4">
            <span aria-hidden className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-verde text-sm font-bold text-lima">
              {i + 1}
            </span>
            <div>
              <p className="font-bold">{p.titulo}</p>
              <p className="text-[0.95rem] text-tinta-suave">
                {p.texto.replace("{email}", email).replace("{dias}", String(config.plazoRespuestaCandidatoDiasHabiles))}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-7 border-t border-borde/40 pt-5 text-sm text-tinta-suave">{t("confirmacion.mail")}</p>
    </motion.div>
  );
}

/** Mensaje neutro: no menciona referidos ni premios (decisión 23). */
export function YaRegistrado() {
  const ref = useFocoAlMontar();
  return (
    <motion.div {...entrada}>
      <h2 ref={ref} tabIndex={-1} className="font-display text-3xl font-medium leading-tight tracking-tight outline-none">
        {t("yaRegistrado.titulo")}
      </h2>
      <p className="mt-3 text-tinta-suave">{t("yaRegistrado.texto")}</p>
      <a
        href="https://worldteams.com/"
        className="mt-7 inline-flex min-h-12 items-center rounded-lg bg-verde px-6 font-bold text-crema transition-transform duration-150 active:scale-[0.98]"
      >
        {t("yaRegistrado.cta")}
      </a>
    </motion.div>
  );
}
