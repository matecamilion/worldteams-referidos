"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import type { FieldValues, Path, UseFormRegister } from "react-hook-form";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export const claseInput =
  "w-full rounded-xl border-[1.5px] border-borde bg-white px-4 py-3.5 text-base text-verde placeholder:text-tinta-suave/70 transition-colors hover:border-verde aria-[invalid=true]:border-error aria-[invalid=true]:bg-[#fff4f2]";

export function MensajeError({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 min-h-0 text-sm font-medium text-error" aria-live="polite">
      {children}
    </p>
  );
}

type OpcionesSegmentadas = { valor: string; etiqueta: string }[];

/** Grupo de opciones tipo chips: más rápido de completar que un desplegable. */
export function Segmentado<T extends FieldValues>({
  nombre,
  leyenda,
  opciones,
  register,
  error,
  columnas = "grid-cols-2",
}: {
  nombre: Path<T>;
  leyenda: string;
  opciones: OpcionesSegmentadas;
  register: UseFormRegister<T>;
  error?: string;
  columnas?: string;
}) {
  const idError = `${nombre}-error`;
  return (
    <fieldset aria-describedby={error ? idError : undefined}>
      <legend className="mb-2 text-sm font-bold">{leyenda}</legend>
      <div className={`grid gap-2 ${columnas}`}>
        {opciones.map((o) => (
          <label key={o.valor} className="relative flex cursor-pointer">
            <input
              type="radio"
              value={o.valor}
              data-invalid={error ? true : undefined}
              className="peer sr-only"
              {...register(nombre)}
            />
            <span className="flex min-h-12 w-full items-center justify-center rounded-xl border-[1.5px] border-borde bg-white px-3 py-2 text-center text-[0.95rem] font-semibold transition-[background-color,color,border-color,transform] duration-150 peer-checked:border-verde peer-checked:bg-verde peer-checked:text-crema peer-hover:border-verde peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-verde peer-active:scale-[0.98] peer-data-[invalid=true]:border-error">
              {o.etiqueta}
            </span>
          </label>
        ))}
      </div>
      <MensajeError id={idError}>{error}</MensajeError>
    </fieldset>
  );
}

function formatoPeso(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Carga de CV: arrastrar o elegir. La validación (tipo y peso) vive en el esquema zod. */
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
  const c = (k: string) => t(`formulario.campos.cv.${k}`, { mb: config.cvMaxMb });

  const tomar = (f?: File | null) => alCambiar(f ?? undefined);

  return (
    <div>
      <label htmlFor={idInput} className="mb-2 block text-sm font-bold">
        {c("label")}
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          tomar(e.dataTransfer.files?.[0]);
        }}
        className={`rounded-xl border-[1.5px] border-dashed bg-white p-4 transition-colors ${
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
            tomar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {valor ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{valor.name}</p>
              <p className="num text-sm text-tinta-suave">{formatoPeso(valor.size)}</p>
            </div>
            <div className="flex shrink-0 gap-1 text-sm font-bold">
              <button type="button" onClick={() => ref.current?.click()} className="min-h-11 rounded-lg px-3 underline-offset-4 hover:underline">
                {c("cambiar")}
              </button>
              <button type="button" onClick={() => tomar(null)} className="min-h-11 rounded-lg px-3 underline-offset-4 hover:underline">
                {c("quitar")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="flex min-h-14 w-full flex-col items-start gap-0.5 rounded-lg text-left"
          >
            <span className="font-semibold">{c("vacio")}</span>
            <span className="text-sm text-tinta-suave">{c("ayuda")}</span>
          </button>
        )}
      </div>
      <MensajeError id={idError}>{error}</MensajeError>
    </div>
  );
}
