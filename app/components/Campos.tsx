"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import type { FieldValues, Path, UseFormRegister } from "react-hook-form";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export const claseEtiqueta = "mb-1.5 block text-sm font-semibold";

export const claseInput =
  "h-11 w-full rounded-lg border-[1.5px] border-borde bg-white px-3.5 text-base text-verde placeholder:text-tinta-suave/90 transition-colors hover:border-verde aria-[invalid=true]:border-error aria-[invalid=true]:bg-[#fff4f2]";

export function MensajeError({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-[0.8125rem] font-medium leading-snug text-error" aria-live="polite">
      {children}
    </p>
  );
}

/** Título de bloque numerado: el formulario es una secuencia de 3 pasos. */
export function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-borde/30 pt-5 first:border-t-0 first:pt-0">
      <h3 className="font-display text-lg font-medium tracking-tight">{titulo}</h3>
      {children}
    </section>
  );
}

type Opciones = { valor: string; etiqueta: string }[];

/**
 * Control segmentado: opciones unidas en una barra de una sola línea.
 * Son radios nativos dentro de un radiogroup: Tab entra al grupo y las flechas cambian la opción.
 */
export function Segmentado<T extends FieldValues>({
  nombre,
  leyenda,
  opciones,
  register,
  error,
}: {
  nombre: Path<T>;
  leyenda: string;
  opciones: Opciones;
  register: UseFormRegister<T>;
  error?: string;
}) {
  const idLeyenda = `${nombre}-leyenda`;
  const idError = `${nombre}-error`;
  return (
    <div>
      <span id={idLeyenda} className={claseEtiqueta}>
        {leyenda}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={idLeyenda}
        aria-describedby={error ? idError : undefined}
        className={`flex h-11 overflow-hidden rounded-lg border-[1.5px] bg-white ${error ? "border-error" : "border-borde"}`}
      >
        {opciones.map((o) => (
          <label
            key={o.valor}
            className="relative flex min-w-0 flex-1 cursor-pointer border-l border-borde/50 first:border-l-0"
          >
            <input type="radio" value={o.valor} className="peer sr-only" {...register(nombre)} />
            <span className="flex w-full items-center justify-center px-1 text-center text-[0.8125rem] font-semibold leading-none transition-colors duration-150 peer-checked:bg-verde peer-checked:text-crema peer-hover:bg-lima/25 peer-checked:peer-hover:bg-verde peer-focus-visible:outline-3 peer-focus-visible:-outline-offset-3 peer-focus-visible:outline-lima sm:text-sm">
              {o.etiqueta}
            </span>
          </label>
        ))}
      </div>
      <MensajeError id={idError}>{error}</MensajeError>
    </div>
  );
}

const IconoPdf = () => (
  <svg aria-hidden viewBox="0 0 20 20" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 13.5v1A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </svg>
);

/** Carga de CV en una línea: arrastrar o elegir. La validación (tipo y peso) vive en el esquema zod. */
export function CargaCv({
  valor,
  alCambiar,
  error,
}: {
  valor?: File;
  alCambiar: (f?: File) => void;
  error?: string;
}) {
  const idInput = useId();
  const idError = "cv-error";
  const ref = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          alCambiar(e.dataTransfer.files?.[0]);
        }}
        className={`flex h-11 items-center rounded-lg border-[1.5px] border-dashed bg-white transition-colors ${
          error ? "border-error bg-[#fff4f2]" : arrastrando ? "border-verde bg-lima/30" : "border-borde hover:border-verde"
        }`}
      >
        <input
          ref={ref}
          id={idInput}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          onChange={(e) => {
            alCambiar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {valor ? (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2 pl-3.5">
              <IconoPdf />
              <span className="truncate text-sm font-semibold">{valor.name}</span>
            </span>
            <button
              type="button"
              onClick={() => alCambiar(undefined)}
              className="h-full shrink-0 px-3.5 text-sm font-bold underline-offset-4 hover:underline"
            >
              {t("formulario.campos.cv.quitar")}
              <span className="sr-only"> {valor.name}</span>
            </button>
          </>
        ) : (
          <label htmlFor={idInput} className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 px-3.5 text-sm font-semibold">
            <IconoPdf />
            <span className="truncate">{t("formulario.campos.cv.vacio", { mb: config.cvMaxMb })}</span>
          </label>
        )}
      </div>
      <MensajeError id={idError}>{error}</MensajeError>
    </div>
  );
}
