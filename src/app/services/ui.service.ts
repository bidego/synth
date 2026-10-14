import { Injectable } from '@angular/core';

/** Estado de la interfaz compartido entre componentes. */
@Injectable()
export class UiService {
    // Modo limpio: se oculta todo y queda solo el arte VJ de fondo
    public zen = false;

    toggleZen() {
        this.zen = !this.zen;
    }
}
