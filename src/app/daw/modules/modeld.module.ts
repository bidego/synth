import { ModuleEnv } from '../core/types';
import { WorkletSynthModule } from './worklet-synth.module';
import { MD_PARAMS, MD_PRESETS } from './modeld-data';

export { MD_PARAMS, MD_PRESETS, MdParam, MdPreset } from './modeld-data';

/**
 * Model D: sintetizador monofonico de tres osciladores y filtro de escalera, inspirado en el Minimoog. El audio lo genera el
 * mismo motor que el plugin (traducido a un AudioWorklet).
 */
export class ModelDModule extends WorkletSynthModule {
    readonly type = 'modeld';

    constructor(env: ModuleEnv) {
        super(env, { workletUrl: 'assets/worklets/modeld-worklet.js', processor: 'modeld-processor', params: MD_PARAMS, presets: MD_PRESETS });
    }
}
