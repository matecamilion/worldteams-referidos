"use client";

import { useId, useState } from "react";
import { config } from "@/lib/config";
import { calcularPremio, extraPrioritarioUsd } from "@/lib/premios";
import { t } from "@/lib/i18n";

const MAXIMO = 20;
const usd = (n: number) => n.toLocaleString("es-AR");

function Deslizador({
  id,
  etiqueta,
  valor,
  maximo,
  alCambiar,
}: {
  id: string;
  etiqueta: string;
  valor: number;
  maximo: number;
  alCambiar: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-semibold">
          {etiqueta}
        </label>
        <output htmlFor={id} className="num font-display text-2xl font-medium">
          {valor}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={maximo}
        step={1}
        value={valor}
        onChange={(e) => alCambiar(Number(e.target.value))}
        className="h-10 w-full cursor-pointer accent-verde"
      />
    </div>
  );
}

export function Calculadora() {
  const idTotal = useId();
  const idPrioritarias = useId();
  const [total, setTotal] = useState(4);
  const [prioritarias, setPrioritarias] = useState(1);
  const r = calcularPremio(total, prioritarias);

  return (
    <div className="sobre-crema rounded-lg border border-verde/15 bg-white p-5 text-verde shadow-[0_24px_60px_-34px_rgba(20,45,43,0.5)] sm:p-7">
      <div className="grid gap-6">
        <Deslizador
          id={idTotal}
          etiqueta={t("inicio.calculadora.total")}
          valor={total}
          maximo={MAXIMO}
          alCambiar={(n) => {
            setTotal(n);
            setPrioritarias((p) => Math.min(p, n));
          }}
        />
        <Deslizador
          id={idPrioritarias}
          etiqueta={t("inicio.calculadora.prioritarias")}
          valor={prioritarias}
          maximo={total}
          alCambiar={setPrioritarias}
        />
      </div>

      <div className="mt-7 border-t border-borde/30 pt-6" aria-live="polite" aria-atomic="true">
        <p className="text-sm font-semibold text-tinta-suave">{t("inicio.calculadora.resultado")}</p>
        <p className="num mt-1 font-display text-6xl font-medium leading-none tracking-tight">
          {usd(r.total)}
          <span className="ml-2 text-base font-semibold tracking-normal text-tinta-suave">{t("inicio.calculadora.resultadoUnidad")}</span>
        </p>

        <dl className="mt-5 grid gap-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt>{t("inicio.calculadora.desglose.base", { n: total, monto: config.montoBaseUsd })}</dt>
            <dd className="num font-semibold">USD {usd(r.base)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{t("inicio.calculadora.desglose.prioritario", { n: prioritarias, monto: extraPrioritarioUsd })}</dt>
            <dd className="num font-semibold">USD {usd(r.extra)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{t("inicio.calculadora.desglose.hitos")}</dt>
            <dd className="num font-semibold">{r.hitos > 0 ? `USD ${usd(r.hitos)}` : t("inicio.calculadora.desglose.ninguno")}</dd>
          </div>
        </dl>

        <p className="mt-5 rounded-lg bg-lima/40 px-3.5 py-2.5 text-sm font-semibold">
          {r.proximo
            ? t("inicio.calculadora.proximo", {
                n: r.proximo.referidos - total,
                bono: r.proximo.bonoUsd,
                hito: r.proximo.referidos,
              })
            : t("inicio.calculadora.completo")}
        </p>
        <p className="mt-3 text-[0.8125rem] leading-snug text-tinta-suave">{t("inicio.calculadora.aclaracion")}</p>
      </div>
    </div>
  );
}
