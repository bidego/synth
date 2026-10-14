import { Component, HostListener } from '@angular/core';
import { PRESETS, Preset } from './services/presets';
import { SoundService } from './services/sound.service';
import { SynthEngine } from './services/synth.engine';
import { MidiService } from './services/midi.service';
import { UiService } from './services/ui.service';

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

  constructor(public sound: SoundService, public engine: SynthEngine, public midi: MidiService, public ui: UiService) {}

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

  // Modo limpio: el boton flotante casi desaparece y solo reaparece al mover el puntero o tocar
  public zenHint = false;
  private zenTimer: any;

  // Esc oculta o muestra toda la interfaz (no interfiere con las teclas de notas)
  @HostListener('document:keydown', ['$event'])
  onEscape(event: KeyboardEvent) {
    if (event.code == 'Escape' && !event.repeat && !this.engine.isTyping(event.target as HTMLElement)) {
      event.preventDefault();
      this.toggleZen();
    }
  }

  @HostListener('document:pointermove')
  @HostListener('document:pointerdown')
  showZenHint() {
    if (!this.ui.zen)
      return;
    this.zenHint = true;
    clearTimeout(this.zenTimer);
    this.zenTimer = setTimeout(() => this.zenHint = false, 2500);
  }

  toggleZen() {
    this.ui.toggleZen();
    this.showZenHint();
    // Al salir del modo limpio no hace falta el aviso
    if (!this.ui.zen)
      this.zenHint = false;
  }

  setFx(name: string, value) {
    this.sound.setFx({ [name]: parseFloat(value) });
  }
}
