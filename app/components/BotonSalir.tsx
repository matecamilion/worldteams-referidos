import { salir } from "@/lib/acciones-sesion";
import { t } from "@/lib/i18n";

/** Cierra la sesión con una server action: funciona aun sin JavaScript en el navegador. */
export function BotonSalir({ className = "" }: { className?: string }) {
  return (
    <form action={salir}>
      <button
        type="submit"
        className={`inline-flex h-11 items-center rounded-lg border-[1.5px] border-crema/30 px-5 font-bold transition-colors duration-150 hover:border-crema/60 active:scale-[0.98] ${className}`}
      >
        {t("portal.salir")}
      </button>
    </form>
  );
}
