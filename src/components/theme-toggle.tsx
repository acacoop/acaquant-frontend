"use client";

import { useEffect, useState } from "react";

// Switch de tema (oscuro/claro). Alterna la clase "light" en <html> y guarda la
// preferencia en localStorage. El default es OSCURO (sin clase) — el modo claro
// es opt-in. El anti-parpadeo al cargar lo resuelve un script inline en layout.
type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // Sincroniza el estado inicial con lo que el script anti-parpadeo ya aplicó.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    const root = document.documentElement;
    if (next === "light") root.classList.add("light");
    else root.classList.remove("light");
    try {
      localStorage.setItem("aca-theme", next);
    } catch {
      /* localStorage bloqueado — el tema igual aplica en esta sesión */
    }
  };

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label="Cambiar tema"
      className="inline-flex items-center gap-1 px-1.5 leading-none text-[10px] text-[#555555] hover:text-[#ff9900] transition-colors"
    >
      <span>{theme === "dark" ? "☀" : "☾"}</span>
      <span className="tracking-widest">{theme === "dark" ? "CLARO" : "OSCURO"}</span>
    </button>
  );
}
