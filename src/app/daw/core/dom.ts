// Los sliders y botones no capturan teclas de notas; los campos de texto y selects si
export function isTyping(target: HTMLElement): boolean {
    if (!target)
        return false;
    if (target.tagName == 'SELECT' || target.tagName == 'TEXTAREA')
        return true;
    return target.tagName == 'INPUT' && ['range', 'checkbox', 'button'].indexOf((target as HTMLInputElement).type) < 0;
}

// Espacio sobre un boton enfocado debe seguir "clickeandolo"
export function isControl(target: HTMLElement): boolean {
    return !!target && (target.tagName == 'BUTTON' || target.tagName == 'A');
}
