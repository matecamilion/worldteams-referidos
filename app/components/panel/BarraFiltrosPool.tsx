"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { claseBoton, claseBotonSecundario, claseCampo } from "@/components/panel/estilos";
import { busquedaAplicable, cambiaFiltros, claveFiltros, crearDiferido, reconciliarUrl, urlDeFiltros } from "@/lib/busqueda-pool";
import { estadosReferido, type EstadoReferido, type ParamsPool } from "@/lib/panel";
import { t } from "@/lib/i18n";

const esEstado = (v: string): v is EstadoReferido => (estadosReferido as readonly string[]).includes(v);

/**
 * Buscador y filtro del talent pool. Es el único trozo del pool que corre en el navegador, y solo cambia la URL
 * (`router.replace`, sin sumar historial, dentro de una transición): la consulta sigue resolviéndose en el servidor
 * y la página sigue siendo de servidor. El campo es de esta barra, que no se vuelve a montar al recargar la tabla,
 * así que no pierde el foco ni el cursor.
 *
 * Sin JavaScript sigue siendo el formulario GET de siempre: el botón Buscar vive en un <noscript>, de modo que solo
 * existe cuando no hay JavaScript.
 */
export function BarraFiltrosPool({
  params,
  basePool,
  opciones,
  anuncio,
  icono,
}: {
  /** Lo que ya está aplicado (viene de la URL, leído en el servidor). */
  params: ParamsPool;
  basePool: string;
  opciones: { valor: string; etiqueta: string }[];
  /** Resumen de resultados para lectores de pantalla ("137 candidatos…"); cambia con cada consulta. */
  anuncio: string;
  icono: ReactNode;
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [q, setQ] = useState(params.q);
  const [estado, setEstado] = useState<string>(params.estado ?? "");

  // Si la URL cambia por fuera de esta barra (pestaña del menú, atrás/adelante), el campo copia lo que quedó aplicado.
  const [visto, setVisto] = useState(claveFiltros(params.q, params.estado));
  const [empujados, setEmpujados] = useState<string[]>([]);
  const actual = claveFiltros(params.q, params.estado);
  if (actual !== visto) {
    setVisto(actual);
    const r = reconciliarUrl(empujados, actual);
    setEmpujados(r.empujados);
    if (!r.propio) {
      setQ(params.q);
      setEstado(params.estado ?? "");
    }
  }

  // La función que aplica siempre lee los parámetros más recientes, sin recrear el retardo en cada render.
  const aplicar = useRef<(q: string, estado: string) => void>(() => {});
  useEffect(() => {
    aplicar.current = (nuevaQ, nuevoEstado) => {
      const e = esEstado(nuevoEstado) ? nuevoEstado : null;
      if (!cambiaFiltros(params, nuevaQ, e)) return;
      setEmpujados((previos) => [...previos, claveFiltros(nuevaQ, e)]);
      iniciarTransicion(() => router.replace(urlDeFiltros(nuevaQ, e, basePool), { scroll: false }));
    };
  });
  const diferidoRef = useRef<ReturnType<typeof crearDiferido<{ q: string; estado: string }>> | null>(null);
  useEffect(() => {
    const d = crearDiferido((v: { q: string; estado: string }) => aplicar.current(v.q, v.estado));
    diferidoRef.current = d;
    return () => d.cancelar();
  }, []);

  /** Búsqueda efectiva de lo escrito: una corta no filtra y deja la que ya estaba aplicada. */
  const busquedaDe = (texto: string) => busquedaAplicable(texto) ?? params.q;

  return (
    <form
      action={basePool}
      method="get"
      role="search"
      aria-busy={pendiente}
      className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-crema/15 bg-crema/[0.04] p-3 sm:p-4"
      onSubmit={(e) => {
        // Enter: se aplica ya, sin esperar el retardo.
        e.preventDefault();
        diferidoRef.current?.cancelar();
        const b = busquedaAplicable(q);
        if (b !== null) aplicar.current(b, estado);
      }}
    >
      {/* Persistente: el texto cambia con cada consulta y se anuncia sin mover el foco. */}
      <p className="sr-only" aria-live="polite" data-testid="pool-anuncio">
        {anuncio}
      </p>

      <div className="min-w-0 grow basis-64">
        <label htmlFor="pool-q" className="mb-1.5 block text-sm font-semibold">
          {t("panel.pool.buscar.etiqueta")}
        </label>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-crema/60">
            {icono}
          </span>
          <input
            id="pool-q"
            name="q"
            type="search"
            value={q}
            maxLength={80}
            autoComplete="off"
            placeholder={t("panel.pool.buscar.placeholder")}
            className={`${claseCampo} w-full pl-10 pr-10`}
            onChange={(e) => {
              setQ(e.target.value);
              // Menos de 2 caracteres no programa nada; vaciar el campo sí (vuelve al listado completo).
              if (busquedaAplicable(e.target.value) === null) diferidoRef.current?.cancelar();
              else diferidoRef.current?.programar({ q: busquedaAplicable(e.target.value) ?? "", estado });
            }}
          />
          {pendiente ? (
            <span
              aria-hidden
              data-testid="pool-cargando"
              className="absolute inset-y-0 right-3.5 my-auto size-4 animate-spin rounded-full border-2 border-crema/25 border-t-lima motion-reduce:animate-none"
            />
          ) : null}
        </div>
      </div>

      <div className="max-sm:w-full">
        <label htmlFor="pool-estado" className="mb-1.5 block text-sm font-semibold">
          {t("panel.pool.filtro.etiqueta")}
        </label>
        <select
          id="pool-estado"
          name="estado"
          value={estado}
          className={`${claseCampo} min-w-44 max-sm:w-full`}
          onChange={(e) => {
            // El filtro se aplica al instante (y arrastra lo que haya en el buscador, sin esperar el retardo).
            setEstado(e.target.value);
            diferidoRef.current?.cancelar();
            aplicar.current(busquedaDe(q), e.target.value);
          }}
        >
          <option value="">{t("panel.pool.filtro.todos")}</option>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {/* Respaldo sin JavaScript: con JavaScript React no monta el contenido de <noscript>, así que el botón no existe. */}
      <noscript>
        <button type="submit" className={claseBoton}>
          {t("panel.pool.buscar.boton")}
        </button>
      </noscript>

      {params.q || params.estado ? (
        <Link
          href={basePool}
          className={`${claseBotonSecundario} max-sm:grow`}
          onClick={(e) => {
            e.preventDefault();
            diferidoRef.current?.cancelar();
            setQ("");
            setEstado("");
            setEmpujados((previos) => [...previos, claveFiltros("", null)]);
            iniciarTransicion(() => router.replace(basePool, { scroll: false }));
          }}
        >
          {t("panel.pool.buscar.limpiar")}
        </Link>
      ) : null}
    </form>
  );
}
