import { Component } from '@angular/core';
import { PRESETS, Preset } from './services/presets';
import { SoundService } from './services/sound.service';
import { SynthEngine } from './services/synth.engine';

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

  constructor(public sound: SoundService, public engine: SynthEngine) {}

  loadPreset(preset: Preset, event: Event) {
    this.engine.loadPatch(preset);
    // Que el foco no quede en el boton: la barra espaciadora/enter no debe re-dispararlo
    (event.target as HTMLElement).blur();
  }

  setFx(name: string, value) {
    this.sound.setFx({ [name]: parseFloat(value) });
  }
}
