import { ModuleEnv } from '../core/types';
import { WorkletSynthModule } from './worklet-synth.module';
import { PF_PARAMS, PF_PRESETS } from './polyfive-data';

export { PF_PARAMS, PF_PRESETS } from './polyfive-data';

/**
 * Poly Five: sintetizador polifonico de 5 voces (dos osciladores con sync, poly-mod, filtro de escalera de 24 dB, dos ADSR, LFO con rueda
 * de modulacion, unison y glide), inspirado en los clasicos de los 70. Mismo motor que el plugin, en un AudioWorklet.
 */
export class PolyFiveModule extends WorkletSynthModule {
    readonly type = 'polyfive';

    constructor(env: ModuleEnv) {
        super(env, { workletUrl: 'assets/worklets/polyfive-worklet.js', processor: 'polyfive-processor', params: PF_PARAMS, presets: PF_PRESETS });
    }
}
