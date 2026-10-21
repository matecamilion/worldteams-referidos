import { Encabezado } from "@/components/Encabezado";

/** Marcador temporal: la página "/" del referente se construye después de "/r/[codigo]". */
export default function Page() {
  return (
    <>
      <Encabezado />
      <main className="px-5 py-20 sm:px-8 lg:px-14">
        <h1 className="font-display text-5xl font-medium tracking-tight">Próximamente</h1>
      </main>
    </>
  );
}
