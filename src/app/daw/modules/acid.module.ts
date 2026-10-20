import { ModuleEnv, NoteMsg } from '../core/types';
import { WorkletSynthModule } from './worklet-synth.module';
import { AC_PARAMS, AC_PRESETS } from './acid-data';

export { AC_PARAMS, AC_PRESETS } from './acid-data';

/**
 * Acid Line: bajo monofonico de linea acida (un oscilador, filtro de 18 dB con resonancia, barrido de decaimiento, acento y slide).
 * Una nota con velocidad por encima del umbral lleva acento; las notas ligadas se deslizan. Mismo motor que el plugin.
 */
export class AcidLineModule extends WorkletSynthModule {
    readonly type = 'acid';
    /** La ultima nota llevo acento (para el LED del panel). */
    public accentLit = false;

    constructor(env: ModuleEnv) {
        super(env, { workletUrl: 'assets/worklets/acid-worklet.js', processor: 'acid-processor', params: AC_PARAMS, presets: AC_PRESETS });
    }

    receive(msg: NoteMsg, port: string) {
        if (port == 'notes' && msg.type == 'on')
            this.accentLit = msg.velocity >= this.values.accentVel;
        super.receive(msg, port);
    }
}
