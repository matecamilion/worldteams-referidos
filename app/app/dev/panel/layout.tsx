import { notFound } from "next/navigation";
import { MarcoVisual } from "@/components/panel/MarcoPanel";

/** Marco de /dev/panel: el mismo de /panel, sin sesión, con las pestañas apuntando a las vistas de prueba. Solo en desarrollo. */
export default function LayoutDevPanel({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <MarcoVisual base="/dev/panel">{children}</MarcoVisual>;
}
