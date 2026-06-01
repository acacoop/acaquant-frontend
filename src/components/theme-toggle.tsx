"use client";

import { useEffect, useState } from "react";

// Switch de tema (claro/oscuro). Alterna la clase "light" en <html> y guarda la
// preferencia en localStorage. El default es CLARO (con clase 'light') — el modo
// oscuro es opt-in. El anti-parpadeo al cargar lo resuelve un script en layout.
type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

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
      className="inline-flex items-center gap-1 px-1.5 leading-none text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors"
    >
      <span>{theme === "dark" ? "☀" : "☾"}</span>
      <span className="tracking-widest">{theme === "dark" ? "CLARO" : "OSCURO"}</span>
    </button>
  );
}
