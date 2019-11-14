import {
    ComponentFactoryResolver,
    Injectable,
    Inject,
    ReflectiveInjector
} from '@angular/core'
import { OscComponent } from '../synte/osc.component'

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
    addDynamicComponent() {
        const factory = this.factoryResolver
                            .resolveComponentFactory(OscComponent)
        const component = factory
            .create(this.rootViewContainer.parentInjector)
        this.rootViewContainer.insert(component.hostView)
    }
}