/** Rol de una sesión: lo decide la base (RLS y funciones), nunca el navegador. */
export type Rol = "referente" | "reclutamiento" | "ninguno";
export type RolRequerido = Exclude<Rol, "ninguno">;

const inicioPorRol: Record<RolRequerido, string> = {
  referente: "/portal",
  reclutamiento: "/panel",
};

/** A dónde va cada rol después de entrar. Sin habilitación va a /portal, que muestra "tu email no está habilitado" sin datos. */
export function rutaPorRol(rol: Rol): string {
  return rol === "ninguno" ? inicioPorRol.referente : inicioPorRol[rol];
}

/**
 * Rol de la sesión a partir de lo que la base le deja ver al propio usuario.
 * Reclutamiento gana si coincide con las dos; un referente solo cuenta si sigue colocado y sin sanción.
 */
export function decidirRol(datos: {
  esReclutamiento: boolean;
  referente: { colocado: boolean; sancionado_en: string | null } | null;
}): Rol {
  if (datos.esReclutamiento) return "reclutamiento";
  if (datos.referente && datos.referente.colocado && datos.referente.sancionado_en === null) return "referente";
  return "ninguno";
}

export type Acceso = { accion: "mostrar" } | { accion: "no_habilitado" } | { accion: "redirigir"; a: string };

/** Qué hace una ruta protegida según el rol de quien entra (`null` = sin sesión). */
export function resolverAcceso(requerido: RolRequerido, rol: Rol | null): Acceso {
  if (rol === null) return { accion: "redirigir", a: "/ingresar" };
  if (rol === "ninguno") return { accion: "no_habilitado" };
  if (rol === requerido) return { accion: "mostrar" };
  return { accion: "redirigir", a: rutaPorRol(rol) };
}
