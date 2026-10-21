"use client";

import { useEffect, useRef } from "react";
import es from "@/i18n/es.json";
import { cargarGsap } from "@/lib/gsap";
import { Celular, PantallaFormulario, PantallaLink, PantallaPortal } from "./Celular";

const { como } = es.inicio;
const pantallas = [PantallaLink, PantallaFormulario, PantallaPortal];

/** Camino del hilo entre los tres nodos (referente, candidato, premio), en un lienzo de 280 × 544. */
const CAMINO = "M36 40 C36 150 120 150 120 272 S36 394 36 504";
const NODOS = [
  { x: 36, y: 40 },
  { x: 120, y: 272 },
  { x: 36, y: 504 },
];

function Hilo() {
  return (
    <div className="relative h-[34rem] w-[17.5rem]">
      <svg aria-hidden viewBox="0 0 280 544" className="absolute inset-0 size-full overflow-visible" fill="none">
        <path d={CAMINO} pathLength={1} stroke="currentColor" strokeOpacity={0.18} strokeWidth={2} />
        <path data-hilo d={CAMINO} pathLength={1} className="stroke-lima" strokeWidth={3} strokeLinecap="round" strokeDasharray={1} />
        {NODOS.map((n, i) => (
          <circle key={i} data-nodo cx={n.x} cy={n.y} r={9} className="fill-lima" />
        ))}
      </svg>
      {NODOS.map((n, i) => (
        <p
          key={i}
          data-etiqueta
          className="absolute font-display text-lg font-medium"
          style={{ left: `${((n.x + 20) / 280) * 100}%`, top: `${(n.y / 544) * 100}%`, transform: "translateY(-50%)" }}
        >
          {como.hilo[i]}
        </p>
      ))}
    </div>
  );
}

function Texto({ i }: { i: number }) {
  const p = como.pasos[i];
  return (
    <>
      <p className="num font-display text-5xl font-medium leading-none text-acento">{i + 1}</p>
      <h3 className="mt-4 font-display text-3xl font-medium leading-tight tracking-tight">{p.titulo}</h3>
      <p className="mt-3 max-w-[24rem] text-lg leading-relaxed text-fg/75">{p.texto}</p>
    </>
  );
}

export function ComoFunciona() {
  const raiz = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    let cancelado = false;
    let limpiar = () => {};

    cargarGsap().then(({ gsap }) => {
      if (cancelado) return;
      const mm = gsap.matchMedia();

      // Escritorio con movimiento: sección fija, un celular y tres estados ligados al scroll.
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        const fijo = el.querySelector<HTMLElement>("[data-fijo]")!;
        const q = gsap.utils.selector(fijo);
        const textos = q("[data-texto]");
        const pant = q("[data-pantalla]");
        const nodos = q("[data-nodo]");
        const etiquetas = q("[data-etiqueta]");
        gsap.set([...textos.slice(1), ...pant.slice(1)], { autoAlpha: 0 });
        gsap.set(nodos.slice(1), { scale: 0.4, transformOrigin: "center", opacity: 0.35 });
        gsap.set(etiquetas.slice(1), { opacity: 0.4 });

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: fijo, start: "top top", end: "+=260%", pin: true, scrub: 0.6, anticipatePin: 1 },
        });

        tl.fromTo(q("[data-hilo]"), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 3 }, 0);
        [1, 2].forEach((i) => {
          tl.to(nodos[i], { scale: 1, opacity: 1, duration: 0.2 }, i - 0.15);
          tl.to(etiquetas[i], { opacity: 1, duration: 0.2 }, i - 0.15);
        });

        // Estado 1: el link se copia.
        tl.from(q("[data-copiado]"), { autoAlpha: 0, duration: 0.2 }, 0.35);
        tl.to(q("[data-copiar]"), { autoAlpha: 0, duration: 0.2 }, 0.35);

        // Cambio 1 → 2: el candidato completa el formulario.
        tl.to([textos[0], pant[0]], { autoAlpha: 0, duration: 0.3 }, 0.95);
        tl.to([textos[1], pant[1]], { autoAlpha: 1, duration: 0.3 }, 1.05);
        tl.from(q("[data-campo]"), { clipPath: "inset(0 100% 0 0)", stagger: 0.12, duration: 0.25 }, 1.3);
        tl.from(q("[data-enviar]"), { backgroundColor: "#7a8e89", duration: 0.2 }, 1.9);

        // Cambio 2 → 3: aparece el premio y la barra avanza.
        tl.to([textos[1], pant[1]], { autoAlpha: 0, duration: 0.3 }, 1.95);
        tl.to([textos[2], pant[2]], { autoAlpha: 1, duration: 0.3 }, 2.05);
        tl.from(q("[data-premio]"), { scale: 0.85, autoAlpha: 0, transformOrigin: "left center", duration: 0.3 }, 2.2);
        tl.from(q("[data-barra]"), { scaleX: 0.5, duration: 0.5 }, 2.4);
      });

      // Móvil: sin fijar, tres estados apilados con revelado simple.
      mm.add("(max-width: 1023px) and (prefers-reduced-motion: no-preference)", () => {
        const apilado = el.querySelector<HTMLElement>("[data-apilado]")!;
        const q = gsap.utils.selector(apilado);
        q("[data-bloque]").forEach((b) => {
          gsap.from(b, { autoAlpha: 0, y: 24, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: b, start: "top 85%", once: true } });
        });
        gsap.fromTo(
          q("[data-linea]"),
          { scaleY: 0 },
          { scaleY: 1, ease: "none", scrollTrigger: { trigger: apilado, start: "top 70%", end: "bottom 70%", scrub: true } },
        );
      });

      limpiar = () => mm.revert();
    });

    return () => {
      cancelado = true;
      limpiar();
    };
  }, []);

  return (
    <section ref={raiz} id="como" data-fondo="verde" className="scroll-mt-6 border-t border-fg/15">
      {/* Escritorio con movimiento: se fija mientras el scroll recorre los tres estados. */}
      <div
        data-fijo
        className="mx-auto hidden min-h-[40rem] w-full max-w-[1280px] flex-col justify-center px-14 py-8 lg:flex lg:h-screen motion-reduce:lg:hidden"
      >
        <h2 className="font-display text-[clamp(2rem,3.4vw,3rem)] font-medium leading-none tracking-[-0.03em]">{como.titulo}</h2>
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-16">
          <div className="relative min-h-72">
            {como.pasos.map((_, i) => (
              <div key={i} data-texto className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                <Texto i={i} />
              </div>
            ))}
          </div>
          <Celular>
            {pantallas.map((P, i) => (
              <P key={i} />
            ))}
          </Celular>
          <Hilo />
        </div>
      </div>

      {/* Móvil, o escritorio con movimiento reducido: los tres estados apilados. */}
      <div data-apilado className="mx-auto w-full max-w-[1280px] px-5 py-16 sm:px-8 lg:hidden lg:px-14 lg:py-24 motion-reduce:lg:block">
        <h2 className="font-display text-[clamp(2rem,6vw,3rem)] font-medium leading-none tracking-[-0.03em]">{como.titulo}</h2>
        <div className="relative mt-10 grid gap-16 pl-7 sm:pl-10">
          <span aria-hidden className="absolute bottom-0 left-0 top-2 w-0.5 bg-fg/15" />
          <span aria-hidden data-linea className="absolute bottom-0 left-0 top-2 w-0.5 origin-top bg-lima" />
          {pantallas.map((P, i) => (
            <div key={i} data-bloque className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div>
                <Texto i={i} />
              </div>
              <Celular>
                <P />
              </Celular>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
