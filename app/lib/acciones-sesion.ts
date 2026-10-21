"use server";

import { redirect } from "next/navigation";
import { crearClienteSesion, supabaseConfigurado } from "./supabase-sesion";

/** Botón "Salir": cierra la sesión (borra las cookies) y vuelve al login. */
export async function salir() {
  if (supabaseConfigurado()) {
    try {
      await (await crearClienteSesion()).auth.signOut();
    } catch (err) {
      console.error("[sesion] No se pudo cerrar la sesión:", err instanceof Error ? err.message : err);
    }
  }
  redirect("/ingresar");
}
