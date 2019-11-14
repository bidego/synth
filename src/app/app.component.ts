import { Component, ViewChild, ElementRef, OnInit, Inject, ViewContainerRef } from '@angular/core';
import { ComponentFactory } from './services/component.factory';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'syntotec-app';
  @ViewChild("container", { static:false })
  private container:ElementRef;
  constructor(private _factory:ComponentFactory,@Inject(ViewContainerRef) viewContainerRef) {
    _factory.setRootViewContainerRef(viewContainerRef);
  }
  addOscilator() {
    this._factory.addDynamicComponent();
  }
}
