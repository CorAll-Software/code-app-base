import type { KeyboardEvent } from 'react';

/**
 * Props que vuelven accesible un elemento no interactivo con `onClick`.
 *
 * Un `<div onClick={...}>` no recibe foco ni responde al teclado: quien navegue
 * sin ratón —o con lector de pantalla— no puede usarlo. Esto le da el rol, la
 * parada de tabulación y la activación con Enter o Espacio, que es lo que hace
 * un `<button>` de forma nativa.
 *
 * Úsalo cuando no se pueda usar un `<button>` de verdad (porque el estilo o el
 * layout lo compliquen). Si se puede, un `<button>` siempre es mejor.
 *
 *     <div {...clickable(() => abrir())} style={...}>
 */
export const clickable = (onClick: () => void, disabled = false) => ({
    role: 'button',
    tabIndex: disabled ? -1 : 0,
    'aria-disabled': disabled || undefined,
    onClick: disabled ? undefined : onClick,
    onKeyDown: (event: KeyboardEvent) => {
        if (disabled) return;
        // Espacio se envía como ' ' y además haría scroll: hay que frenarlo.
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
        }
    },
});
