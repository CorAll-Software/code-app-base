import { useEffect, useState } from "react";
import { useNavigation } from "react-router-dom";
import { Spin } from "antd";
import { create } from "zustand";
import { BRAND } from "../core/color";

/**
 * Store de la barra de progreso superior (estilo NProgress).
 * NavProgress lo controla según el estado de navegación del data router,
 * de modo que la barra refleja la carga de los lazy chunks.
 */
type ProgressState = { active: boolean; start: () => void; done: () => void };

export const useProgressStore = create<ProgressState>((set) => ({
  active: false,
  start: () => set({ active: true }),
  done: () => set({ active: false }),
}));

/**
 * Barra fina fija en el tope del viewport. Avanza con "trickle" mientras
 * carga y se completa al 100% con un fade al terminar.
 * Montar una sola vez a nivel de App.
 */
export const TopProgress = () => {
  const active = useProgressStore((s) => s.active);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setProgress(8);
      const trickle = setInterval(() => {
        setProgress((p) => (p < 90 ? p + (90 - p) * 0.1 : p));
      }, 200);
      return () => clearInterval(trickle);
    }

    if (visible) {
      setProgress(100);
      const hide = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(hide);
    }
  }, [active]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: `${progress}%`,
        height: 3,
        zIndex: 2000,
        background: BRAND.secondary,
        boxShadow: `0 0 8px ${BRAND.secondary}`,
        transition: "width 200ms ease, opacity 300ms ease",
        opacity: progress >= 100 ? 0 : 1,
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * Conecta el estado de navegación del data router con el feedback visual:
 * mientras navigation.state === "loading" (descarga del lazy chunk / loaders),
 * activa la barra superior y muestra un overlay con Spin sobre el contenido
 * actual (que permanece visible gracias a las transiciones del router).
 * Montar una sola vez dentro del layout autenticado (bajo RouterProvider).
 */
export const NavProgress = () => {
  const navigation = useNavigation();
  const loading = navigation.state !== "idle";

  useEffect(() => {
    const store = useProgressStore.getState();
    if (loading) store.start();
    else store.done();
  }, [loading]);

  if (!loading) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255, 255, 255, 0.45)",
        backdropFilter: "blur(1px)",
        pointerEvents: "none",
      }}
    >
      <Spin size="large" />
    </div>
  );
};
