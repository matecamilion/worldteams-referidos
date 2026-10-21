"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import type { z } from "zod";
import { esDemo } from "@/lib/demo";
import { esquemaCandidato, especialidades, nivelesIngles, seniorities, siNo, type DatosCandidato } from "@/lib/esquema";
import { t } from "@/lib/i18n";
import { cargarRecaptcha, obtenerTokenRecaptcha } from "@/lib/recaptcha-client";
import type { RespuestaReferir } from "@/app/api/referir/route";
import { Bloque, CargaCv, MensajeError, Segmentado, claseEtiqueta, claseInput } from "./Campos";
import { ConfirmacionRegistro, YaRegistrado } from "./Confirmacion";

type Entrada = z.input<typeof esquemaCandidato>;
type Estado =
  | { tipo: "formulario" }
  | { tipo: "registrado"; nombre: string; email: string }
  | { tipo: "ya_registrado" };

const opciones = <T extends string>(campo: string, valores: readonly T[]) =>
  valores.map((v) => ({ valor: v, etiqueta: t(`formulario.campos.${campo}.opciones.${v}`) }));

export function FormularioReferido({ codigo, referente }: { codigo: string; referente: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "formulario" });
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [reintentable, setReintentable] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Entrada, unknown, DatosCandidato>({
    resolver: zodResolver(esquemaCandidato),
    mode: "onTouched",
    defaultValues: { nombre: "", apellido: "", email: "", linkedin_url: "" },
  });

  const enviar = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    setReintentable(false);
    const cuerpo = new FormData();
    cuerpo.set("codigo_referente", codigo);
    for (const [k, v] of Object.entries(datos)) {
      cuerpo.set(k, v instanceof File ? v : String(v));
    }
    try {
      if (!esDemo) cuerpo.set("recaptcha_token", await obtenerTokenRecaptcha("referir"));
      const r = await fetch("/api/referir", { method: "POST", body: cuerpo });
      const j = (await r.json().catch(() => null)) as RespuestaReferir | null;
      if (j?.resultado === "registrado") return setEstado({ tipo: "registrado", nombre: datos.nombre, email: datos.email });
      if (j?.resultado === "ya_registrado") return setEstado({ tipo: "ya_registrado" });
      if (j?.resultado === "datos_invalidos") {
        for (const [campo, message] of Object.entries(j.errores)) setError(campo as keyof Entrada, { message });
        return;
      }
      if (r.status === 429) return setErrorGeneral(t("formulario.errores.demasiados"));
      setErrorGeneral(j?.resultado === "error" ? j.mensaje : t("formulario.errores.servidor"));
      setReintentable(j?.resultado === "error" && j.reintentable === true);
    } catch {
      setErrorGeneral(t("formulario.errores.servidor"));
      setReintentable(true);
    }
  });

  const msg = (campo: keyof Entrada) => errors[campo]?.message as string | undefined;
  const campo = (c: string, k: string) => t(`formulario.campos.${c}.${k}`);

  return (
    <div className="sobre-crema scheme-light rounded-lg bg-crema p-5 text-verde shadow-[0_24px_60px_-28px_rgba(0,0,0,0.65)] sm:p-7">
      <AnimatePresence mode="wait" initial={false}>
        {estado.tipo === "formulario" ? (
          <motion.form
            key="form"
            onSubmit={enviar}
            onFocusCapture={() => {
              if (!esDemo) void cargarRecaptcha().catch(() => {});
            }}
            noValidate
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="grid gap-5"
          >
            <div>
              <h2 className="font-display text-xl font-medium tracking-tight">{t("formulario.titulo")}</h2>
              <p className="mt-0.5 text-sm text-tinta-suave">{t("formulario.ayudaObligatorios")}</p>
            </div>

            <Bloque titulo={t("formulario.bloques.datos")}>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor="nombre" className={claseEtiqueta}>
                    {campo("nombre", "label")}
                  </label>
                  <input
                    id="nombre"
                    autoComplete="given-name"
                    aria-invalid={errors.nombre ? true : undefined}
                    aria-describedby={errors.nombre ? "nombre-error" : undefined}
                    className={claseInput}
                    {...register("nombre")}
                  />
                  <MensajeError id="nombre-error">{msg("nombre")}</MensajeError>
                </div>
                <div className="min-w-0">
                  <label htmlFor="apellido" className={claseEtiqueta}>
                    {campo("apellido", "label")}
                  </label>
                  <input
                    id="apellido"
                    autoComplete="family-name"
                    aria-invalid={errors.apellido ? true : undefined}
                    aria-describedby={errors.apellido ? "apellido-error" : undefined}
                    className={claseInput}
                    {...register("apellido")}
                  />
                  <MensajeError id="apellido-error">{msg("apellido")}</MensajeError>
                </div>
              </div>

              <div>
                <label htmlFor="email" className={claseEtiqueta}>
                  {campo("email", "label")}
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={claseInput}
                  {...register("email")}
                />
                <MensajeError id="email-error">{msg("email")}</MensajeError>
              </div>

              <div>
                <label htmlFor="linkedin_url" className={claseEtiqueta}>
                  {campo("linkedin_url", "label")}
                </label>
                <input
                  id="linkedin_url"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="none"
                  placeholder={campo("linkedin_url", "placeholder")}
                  aria-invalid={errors.linkedin_url ? true : undefined}
                  aria-describedby={errors.linkedin_url ? "linkedin_url-error" : undefined}
                  className={claseInput}
                  {...register("linkedin_url")}
                />
                <MensajeError id="linkedin_url-error">{msg("linkedin_url")}</MensajeError>
              </div>
            </Bloque>

            <Bloque titulo={t("formulario.bloques.perfil")}>
              <Segmentado<Entrada>
                nombre="especialidad"
                leyenda={campo("especialidad", "label")}
                opciones={opciones("especialidad", especialidades)}
                register={register}
                error={msg("especialidad")}
              />
              <Segmentado<Entrada>
                nombre="usa_revit"
                leyenda={campo("usa_revit", "label")}
                opciones={opciones("usa_revit", siNo)}
                register={register}
                error={msg("usa_revit")}
              />
              <Segmentado<Entrada>
                nombre="seniority"
                leyenda={campo("seniority", "label")}
                opciones={opciones("seniority", seniorities)}
                register={register}
                error={msg("seniority")}
              />
              <Segmentado<Entrada>
                nombre="nivel_ingles"
                leyenda={campo("nivel_ingles", "label")}
                opciones={opciones("nivel_ingles", nivelesIngles)}
                register={register}
                error={msg("nivel_ingles")}
              />
            </Bloque>

            <Bloque titulo={t("formulario.bloques.cv")}>
              <Controller
                control={control}
                name="cv"
                render={({ field, fieldState }) => (
                  <CargaCv
                    valor={field.value as File | undefined}
                    alCambiar={(f) => {
                      field.onChange(f);
                      field.onBlur();
                    }}
                    error={fieldState.error?.message}
                  />
                )}
              />

              <div>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    aria-invalid={errors.acepto_visibilidad ? true : undefined}
                    aria-describedby={errors.acepto_visibilidad ? "acepto_visibilidad-error" : undefined}
                    className="mt-0.5 size-5 shrink-0 accent-verde"
                    {...register("acepto_visibilidad")}
                  />
                  <span className="text-sm font-medium leading-snug">{campo("acepto_visibilidad", "label")}</span>
                </label>
                <MensajeError id="acepto_visibilidad-error">{msg("acepto_visibilidad")}</MensajeError>
              </div>
            </Bloque>

            {errorGeneral && (
              <p role="alert" className="rounded-lg border border-error bg-[#fff4f2] p-3 text-sm font-semibold text-error">
                {errorGeneral}
                {reintentable && (
                  <button
                    type="button"
                    onClick={() => void enviar()}
                    disabled={isSubmitting}
                    className="mt-2 block rounded-lg border-[1.5px] border-error px-4 py-2 font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    {t("formulario.reintentar")}
                  </button>
                )}
              </p>
            )}

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="group flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-lima px-6 text-base font-bold text-verde transition-[transform,background-color] duration-150 hover:bg-[#dcf48f] active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
              >
                {isSubmitting ? (
                  <>
                    <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-verde border-t-transparent" />
                    {t("formulario.enviando")}
                  </>
                ) : (
                  <>
                    {t("formulario.enviar")}
                    <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-1">
                      →
                    </span>
                  </>
                )}
              </button>
              <p className="mt-2.5 text-center text-xs text-tinta-suave">{t("formulario.privacidad")}</p>
            </div>
          </motion.form>
        ) : estado.tipo === "registrado" ? (
          <ConfirmacionRegistro key="ok" nombre={estado.nombre} email={estado.email} referente={referente} />
        ) : (
          <YaRegistrado key="ya" />
        )}
      </AnimatePresence>
    </div>
  );
}
