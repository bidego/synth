import { Subject } from 'rxjs';
import { ModuleEnv, NoteMsg, PortDef } from './types';

/**
 * Un dispositivo del rack. Expone puertos (audio / notas) que se unen con cables.
 * No sabe nada de la pantalla: asi se puede construir tambien en un OfflineAudioContext.
 */
export abstract class RackModule {
    abstract readonly type: string;
    abstract readonly ports: ReadonlyArray<PortDef>;

    public id = '';
    public name = '';
    // Posicion del dispositivo en la vista de cableado
    public pos = { x: 0, y: 0 };
    // Salida de notas (solo los modulos que tienen un puerto de notas de salida la usan)
    public readonly noteOut = new Subject<NoteMsg>();

    constructor(protected env: ModuleEnv) {}

    /** El AudioNode al que se conecta (entrada) o del que sale (salida) un puerto de audio. */
    abstract audioPort(id: string): AudioNode | null;

    /** Llega un mensaje de notas por un puerto de entrada. */
    receive(msg: NoteMsg, port: string): void {}

    /** Estado serializable (parametros, patch, pistas...). */
    abstract getState(): any;
    abstract setState(state: any): void;

    /** El tempo cambio (para los efectos sincronizados al BPM). */
    onTempo(): void {}

    dispose(): void {}

    portDef(id: string): PortDef | undefined {
        return this.ports.find(p => p.id == id);
    }
}
