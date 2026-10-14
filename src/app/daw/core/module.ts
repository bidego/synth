import { Subject } from 'rxjs';
import { ModuleEnv, NoteMsg, PortDef } from './types';
import { setParam } from './audio';

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

    /** Cambia un parametro de audio (suave en vivo, inmediato en el render offline). */
    protected set(param: AudioParam, value: number, timeConstant = 0.02) {
        setParam(this.env, param, value, timeConstant);
    }

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

    /**
     * Rutas internas: pares [entrada, salida] por los que la senal de una entrada llega a una salida.
     * Sirve para detectar bucles por puerto. Por defecto toda entrada llega a toda salida del mismo
     * tipo; los modulos que no lo cumplen (mezclador, instrumento) lo redefinen.
     */
    routes(): Array<[string, string]> {
        const pairs: Array<[string, string]> = [];
        this.ports.filter(p => p.dir == 'in').forEach(i =>
            this.ports.filter(o => o.dir == 'out' && o.kind == i.kind).forEach(o => pairs.push([i.id, o.id])));
        return pairs;
    }

    portDef(id: string): PortDef | undefined {
        return this.ports.find(p => p.id == id);
    }
}
