/**
 * Código de referido: nombre normalizado + sufijo aleatorio ("lucia-k7q2m9xd").
 * El nombre solo hace el link legible; la protección está en el sufijo, que no se puede adivinar:
 * 8 caracteres base36 (36^8, unos 2,8 billones de combinaciones) sacados de un generador criptográfico:
 * adivinar un código es inviable incluso sin límite de intentos; el límite por IP es la segunda capa.
 */
const ALFABETO = "0123456789abcdefghijklmnopqrstuvwxyz";
export const LARGO_SUFIJO = 8;

/** Formato válido: partes en minúsculas unidas por guiones y, al final, un sufijo de 8 caracteres. */
const FORMATO = /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{8}$/;
const LARGO_MAXIMO = 64;

/** "María José" -> "maria-jose". Sin tildes, solo a-z y 0-9. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Sufijo base36 con rechazo de bytes sobrantes, para que los 36 caracteres sean igual de probables. */
export function generarSufijo(largo = LARGO_SUFIJO): string {
  const limite = 256 - (256 % ALFABETO.length); // 252: los bytes de 252 a 255 se descartan
  let sufijo = "";
  while (sufijo.length < largo) {
    const bytes = crypto.getRandomValues(new Uint8Array(largo * 2));
    for (const b of bytes) {
      if (b < limite && sufijo.length < largo) sufijo += ALFABETO[b % ALFABETO.length];
    }
  }
  return sufijo;
}

export function generarCodigo(nombre: string): string {
  return `${normalizarNombre(nombre) || "ref"}-${generarSufijo()}`;
}

/** Descarta a primera vista lo que no puede ser un código, sin consultar la base. */
export function tieneFormatoDeCodigo(codigo: string): boolean {
  return codigo.length <= LARGO_MAXIMO && FORMATO.test(codigo);
}
