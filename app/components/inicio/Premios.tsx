import { config } from "@/lib/config";
import { calcularPremio } from "@/lib/premios";
import es from "@/i18n/es.json";
import { t } from "@/lib/i18n";
import { CountUp } from "./CountUp";

const { tarjetas } = es.inicio.premios;
const HITOS_TARJETA = [1, 3, 10];
const usd = (n: number) => n.toLocaleString("es-AR");

export function Premios() {
  const filas = HITOS_TARJETA.map((n) => {
    return { n, ...calcularPremio(n), maximo: calcularPremio(n, n).total };
  });

  return (
    <div className="mt-12 grid gap-4 lg:grid-cols-3 lg:items-end">
      {filas.map((f, i) => {
        const destacada = i === filas.length - 1;
        return (
          <article
            key={f.n}
            className={`flex flex-col rounded-lg border-[1.5px] p-6 sm:p-7 ${
              destacada ? "border-verde bg-verde text-crema lg:min-h-[23rem]" : "border-fg/20 lg:min-h-[19rem]"
            } ${i === 1 ? "lg:min-h-[21rem]" : ""}`}
          >
            <p className="font-display text-xl font-medium">
              <span className="num mr-2 text-4xl">{f.n}</span>
              {f.n === 1 ? tarjetas.unidadUno : tarjetas.unidad}
            </p>
            <p className="mt-auto pt-10 font-display text-lg font-medium text-current opacity-70">{tarjetas.total}</p>
            <p className={`font-display text-[clamp(3.25rem,6vw,4.75rem)] font-medium leading-none tracking-tight ${destacada ? "text-lima" : ""}`}>
              <CountUp valor={f.total} />
            </p>
            <p className="num mt-4 text-sm opacity-75">
              {f.hitos > 0
                ? t("inicio.premios.tarjetas.desgloseBono", { n: f.n, base: config.montoBaseUsd, bonos: usd(f.hitos) })
                : t("inicio.premios.tarjetas.desglose", { n: f.n, base: config.montoBaseUsd })}
            </p>
            <p className="num mt-1 text-sm font-semibold">{t("inicio.premios.tarjetas.prioritario", { total: usd(f.maximo) })}</p>
          </article>
        );
      })}
    </div>
  );
}
