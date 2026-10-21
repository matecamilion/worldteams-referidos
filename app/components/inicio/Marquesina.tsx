import { t } from "@/lib/i18n";

/** Franja lima con el texto desplazándose despacio. Con movimiento reducido queda quieta, con una sola copia. */
export function Marquesina() {
  const texto = t("inicio.marquesina");
  const copia = (segunda: boolean) => (
    <div className={`flex shrink-0 items-center ${segunda ? "motion-reduce:hidden" : "motion-reduce:w-full motion-reduce:justify-center"}`}>
      {Array.from({ length: 4 }, (_, i) => (
        <span
          key={i}
          className={`whitespace-nowrap px-8 font-display text-2xl font-medium tracking-tight sm:text-3xl ${i > 0 ? "motion-reduce:hidden" : ""}`}
        >
          {texto}
        </span>
      ))}
    </div>
  );

  return (
    <div className="overflow-hidden bg-lima py-5 text-verde">
      <p className="sr-only">{texto}</p>
      <div aria-hidden className="marquesina-pista flex w-max motion-reduce:w-full">
        {copia(false)}
        {copia(true)}
      </div>
    </div>
  );
}
