"use client";

import { useActionState, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { MOTIVO_MAX, type Decision, type EstadoResolver } from "@/lib/resolver";
import { t } from "@/lib/i18n";

/** La server action `resolverCaso` (o la de /dev/panel): se recibe por prop para que la vista de prueba no toque la base. */
export type AccionResolver = (previo: EstadoResolver, datos: FormData) => Promise<EstadoResolver>;

const base = "inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-5 font-bold transition-colors duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";
const estiloBoton: Record<Decision, string> = {
  aprobar: `${base} bg-lima text-verde`,
  rechazar: `${base} border-[1.5px] border-alerta/60 text-alerta hover:bg-alerta/10`,
  reabrir: `${base} border-[1.5px] border-crema/30 hover:border-crema/60 hover:bg-crema/5`,
};
const estiloConfirmar: Record<Decision, string> = {
  aprobar: `${base} bg-lima text-verde`,
  rechazar: `${base} bg-alerta text-verde`,
  reabrir: `${base} bg-lima text-verde`,
};

/**
 * Botón que abre un diálogo de confirmación (`<dialog>` nativo: foco atrapado, Esc cierra) y envía a la server action.
 * Quién puede resolver lo decide la base; este botón solo ordena la pantalla. `campos` viaja como inputs ocultos
 * (por ejemplo, la página del pool a la que se vuelve).
 */
export function BotonResolver({
  decision,
  referidoId,
  nombre,
  accion,
  campos = {},
  compacto = false,
}: {
  decision: Decision;
  referidoId: string;
  nombre: string;
  accion: AccionResolver;
  campos?: Record<string, string>;
  /** Más bajo (40 px), para filas de la tabla. */
  compacto?: boolean;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className={`${estiloBoton[decision]} ${compacto ? "!h-10 !px-4 text-sm" : ""}`}
        data-testid={`boton-${decision}`}
        onClick={() => {
          setAbierto(true);
          dialogo.current?.showModal();
        }}
      >
        {t(`panel.acciones.${decision}.boton`)}
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby={`${id}-titulo`}
        onClose={() => setAbierto(false)}
        // Un clic en el fondo oscuro (no en el contenido) cierra.
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-crema/20 bg-verde-hondo p-0 text-crema backdrop:bg-black/70"
      >
        {/* Se monta al abrir: cada vez arranca sin el error ni el texto de la vez anterior. */}
        {abierto ? (
          <Formulario idTitulo={`${id}-titulo`} decision={decision} referidoId={referidoId} nombre={nombre} accion={accion} campos={campos} cerrar={() => dialogo.current?.close()} />
        ) : null}
      </dialog>
    </>
  );
}

function Formulario({
  idTitulo,
  decision,
  referidoId,
  nombre,
  accion,
  campos,
  cerrar,
}: {
  idTitulo: string;
  decision: Decision;
  referidoId: string;
  nombre: string;
  accion: AccionResolver;
  campos: Record<string, string>;
  cerrar: () => void;
}) {
  const [estado, enviar] = useActionState(accion, { error: null });
  const idMotivo = useId();
  const pideMotivo = decision !== "aprobar";
  const obligatorio = decision === "reabrir";
  return (
    <form action={enviar} className="p-5 sm:p-6" data-testid={`dialogo-${decision}`}>
      <h2 id={idTitulo} className="font-display text-2xl font-medium leading-tight tracking-tight">
        {t(`panel.acciones.${decision}.titulo`, { nombre })}
      </h2>
      <p className="mt-3 text-crema/80">{t(`panel.acciones.${decision}.texto`)}</p>

      <input type="hidden" name="referido" value={referidoId} />
      <input type="hidden" name="decision" value={decision} />
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      {pideMotivo ? (
        <div className="mt-5">
          <label htmlFor={idMotivo} className="mb-1.5 block text-sm font-semibold">
            {t(`panel.acciones.${decision}.motivo`)}
          </label>
          <textarea
            id={idMotivo}
            name="motivo"
            rows={3}
            maxLength={MOTIVO_MAX}
            required={obligatorio}
            // Lo que escribió se conserva si la acción devolvió un error.
            defaultValue={estado.motivo ?? ""}
            aria-describedby={`${idMotivo}-ayuda`}
            autoFocus
            className="w-full rounded-lg border-[1.5px] border-borde bg-verde px-3.5 py-2.5 text-base text-crema placeholder:text-crema/50 transition-colors hover:border-crema/70"
          />
          <p id={`${idMotivo}-ayuda`} className="mt-1.5 text-sm text-crema/70">
            {t(`panel.acciones.${decision}.motivoAyuda`)}
          </p>
        </div>
      ) : null}

      {estado.error ? (
        <p role="alert" className="mt-4 rounded-lg border border-alerta/60 bg-alerta/10 px-4 py-3 text-crema" data-testid="error-resolver">
          {t(`panel.acciones.errores.${estado.error}`)}
        </p>
      ) : null}

      <Botones decision={decision} cerrar={cerrar} />
    </form>
  );
}

/** Aparte porque `useFormStatus` solo lee el formulario que lo contiene. Mientras guarda no se puede enviar dos veces. */
function Botones({ decision, cerrar }: { decision: Decision; cerrar: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button type="button" onClick={cerrar} disabled={pending} className={`${base} border-[1.5px] border-crema/30 hover:border-crema/60 hover:bg-crema/5`}>
        {t("panel.acciones.cancelar")}
      </button>
      <button type="submit" disabled={pending} aria-busy={pending} className={estiloConfirmar[decision]} data-testid={`confirmar-${decision}`}>
        {pending ? t("panel.acciones.guardando") : t(`panel.acciones.${decision}.confirmar`)}
      </button>
    </div>
  );
}
