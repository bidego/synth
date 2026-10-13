import { Component, HostListener } from '@angular/core';
import { PRESETS, Preset } from './services/presets';
import { SoundService } from './services/sound.service';
import { SynthEngine } from './services/synth.engine';
import { MidiService } from './services/midi.service';

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

  constructor(public sound: SoundService, public engine: SynthEngine, public midi: MidiService) {}

  loadPreset(preset: Preset) {
    this.engine.loadPatch(preset);
  }

  // Tras un clic con el mouse el foco no debe quedarse en el boton: los atajos (Enter, `, espacio)
  // y las teclas de notas tienen que seguir llegando
  @HostListener('document:click', ['$event'])
  releaseButtonFocus(event: Event) {
    const target = event.target as HTMLElement;
    if (target && target.tagName == 'BUTTON')
      target.blur();
  }

  setFx(name: string, value) {
    this.sound.setFx({ [name]: parseFloat(value) });
  }
}
