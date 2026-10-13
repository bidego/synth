import {
    ComponentFactoryResolver,
    Injectable,
    Inject,
    ReflectiveInjector
} from '@angular/core'
import { OscComponent } from '../synth/osc.component'
import { OscConfig, Preset } from './presets'

@Injectable()
export class ComponentFactory {
    private factoryResolver;
    private rootViewContainer;
    constructor(@Inject(ComponentFactoryResolver) factoryResolver) {
        this.factoryResolver = factoryResolver
    }
    setRootViewContainerRef(viewContainerRef) {
        this.rootViewContainer = viewContainerRef
    }
    addDynamicComponent(config?: OscConfig) {
        const factory = this.factoryResolver
                            .resolveComponentFactory(OscComponent)
        const component = factory
            .create(this.rootViewContainer.parentInjector)
        component.instance.config = config
        this.rootViewContainer.insert(component.hostView)
    }
    clear() {
        this.rootViewContainer.clear()
    }
    loadPreset(preset: Preset) {
        this.clear()
        preset.oscs.forEach(config => this.addDynamicComponent(config))
    }
}
