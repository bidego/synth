import { ModuleEnv } from './types';

/**
 * Cambia un AudioParam. En vivo se suaviza (evita clicks); en el render offline se fija de golpe,
 * porque ahi los parametros empiezan en su valor por defecto y suavizar dejaria pasar el principio
 * de las primeras notas con un valor equivocado.
 */
export function setParam(env: ModuleEnv, param: AudioParam, value: number, timeConstant = 0.02) {
    if (env.live)
        param.setTargetAtTime(value, env.ctx.currentTime, timeConstant);
    else
        param.value = value;
}
