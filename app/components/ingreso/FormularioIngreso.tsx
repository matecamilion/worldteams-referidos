"use client";

import { useActionState, useState } from "react";
import { pedirLink, type EstadoIngreso } from "@/app/ingresar/actions";
import { claseEtiqueta, claseInput, MensajeError } from "@/components/Campos";
import { t } from "@/lib/i18n";

const inicial: EstadoIngreso = { resultado: null, email: "" };

const claveError = {
  email_invalido: "ingreso.errores.emailInvalido",
  limitado: "ingreso.errores.limitado",
  no_disponible: "ingreso.errores.noDisponible",
} as const;

export function FormularioIngreso({ errorInicial }: { errorInicial?: "enlace" }) {
  const [estado, accion, enviando] = useActionState(pedirLink, inicial);
  // "Usar otro email" vuelve al formulario sin tocar el servidor.
  const [volverAlFormulario, setVolver] = useState<EstadoIngreso | null>(null);
  const mostrando = volverAlFormulario === estado ? null : estado;

  if (mostrando?.resultado === "enviado") {
    return (
      <div role="status" className="sobre-crema scheme-light rounded-lg bg-crema p-5 text-verde shadow-[0_24px_60px_-28px_rgba(0,0,0,0.65)] sm:p-7">
        <h2 className="font-display text-2xl font-medium tracking-tight">{t("ingreso.enviado.titulo")}</h2>
        <p className="mt-3 text-lg font-semibold leading-snug">{t("ingreso.enviado.texto")}</p>
        <p className="mt-2 text-tinta-suave">{t("ingreso.enviado.ayuda")}</p>
        <button
          type="button"
          onClick={() => setVolver(estado)}
          className="mt-6 inline-flex h-11 items-center rounded-lg border-[1.5px] border-verde/40 px-5 font-bold transition-colors hover:border-verde active:scale-[0.98]"
        >
          {t("ingreso.enviado.otro")}
        </button>
      </div>
    );
  }

  const error = mostrando?.resultado ? t(claveError[mostrando.resultado]) : null;
  const avisoEnlace = !mostrando?.resultado && errorInicial === "enlace" ? t("ingreso.errores.enlace") : null;
  const mensaje = error ?? avisoEnlace;

  return (
    <form
      action={accion}
      noValidate
      className="sobre-crema scheme-light rounded-lg bg-crema p-5 text-verde shadow-[0_24px_60px_-28px_rgba(0,0,0,0.65)] sm:p-7"
    >
      <label htmlFor="email" className={claseEtiqueta}>
        {t("ingreso.campo.label")}
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={mostrando?.email ?? ""}
        placeholder={t("ingreso.campo.placeholder")}
        aria-invalid={mensaje ? true : undefined}
        aria-describedby="email-error"
        className={claseInput}
      />
      <MensajeError id="email-error">{mensaje}</MensajeError>
      <button
        type="submit"
        disabled={enviando}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-lg bg-verde px-7 font-bold text-lima transition-transform duration-150 active:scale-[0.98] disabled:opacity-70"
      >
        {enviando ? t("ingreso.enviando") : t("ingreso.boton")}
      </button>
    </form>
  );
}
