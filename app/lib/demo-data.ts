/** Datos de ejemplo para NEXT_PUBLIC_DEMO=true. En producción salen de Supabase. */
export type Referente = { codigo: string; nombre: string; apellido: string };

export const referentesDemo: Referente[] = [
  { codigo: "lucia-k7q2m9", nombre: "Lucía", apellido: "Gómez" },
  { codigo: "martin-x4d8w1", nombre: "Martín", apellido: "Ferreyra" },
  { codigo: "camila-p3n6z5", nombre: "Camila", apellido: "Duarte" },
];

/** Este email simula a alguien que ya estaba en el talent pool. */
export const emailYaRegistradoDemo = "ya.registrado@example.com";

/** Este email simula una caída del servidor, para probar el manejo de error. */
export const emailFallaDemo = "falla@example.com";
