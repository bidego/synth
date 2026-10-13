import { Component, ViewChild, ElementRef, Inject, ViewContainerRef } from '@angular/core';
import { ComponentFactory } from './services/component.factory';
import { PRESETS, Preset, DEFAULT_FX, FxConfig } from './services/presets';
import { SoundService } from './services/sound.service';
import { OscComponent } from './synth/osc.component';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'syntotec-app';
  // Presets agrupados por categoria, en el orden en que aparecen
  categories = PRESETS.reduce((acc, preset) => {
    let group = acc.find(c => c.name == preset.category);
    if (!group)
      acc.push(group = { name: preset.category, presets: [] });
    group.presets.push(preset);
    return acc;
  }, [] as Array<{ name: string, presets: Array<Preset> }>);
  fxKnobs = [
    { name: 'delayMix', label: 'Delay', max: 1, step: 0.01 },
    { name: 'delayTime', label: 'Time', max: 1, step: 0.01 },
    { name: 'delayFeedback', label: 'Feedback', max: 0.9, step: 0.01 },
    { name: 'reverbMix', label: 'Reverb', max: 1, step: 0.01 }
  ];
  @ViewChild("container", { static:false })
  private container:ElementRef;
  constructor(private _factory:ComponentFactory, public sound:SoundService,@Inject(ViewContainerRef) viewContainerRef) {
    _factory.setRootViewContainerRef(viewContainerRef);
  }
  addOscilator() {
    this._factory.addDynamicComponent();
  }

  loadPreset(preset: Preset) {
    this.sound.setFx({ ...DEFAULT_FX, ...preset.fx });
    this._factory.loadPreset(preset);
  }

  clearOscilators() {
    this._factory.clear();
  }

  setFx(name: string, value) {
    this.sound.setFx({ [name]: parseFloat(value) });
  }

  get oscsCount(): number {
    return OscComponent.getCount();
  } 
}
