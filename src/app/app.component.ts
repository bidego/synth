import { Component, HostListener } from '@angular/core';
import { SoundService } from './services/sound.service';
import { SynthEngine } from './services/synth.engine';
import { MidiService } from './services/midi.service';
import { LooperService } from './services/looper.service';
import { UiService } from './services/ui.service';

interface Shortcut {
  keys: Array<string>;
  text: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Syntotec';
  narrow = false;

  // Modo visual: el boton flotante casi desaparece y solo reaparece al mover el puntero o tocar
  public zenHint = false;
  private zenTimer: any;

  public shortcuts: Array<{ group: string; items: Array<Shortcut> }> = [
    { group: 'Tocar', items: [
      { keys: ['Z', 'X', 'C', '...', '/'], text: 'Fila de abajo: teclas blancas (S D G H J L ; son las negras)' },
      { keys: ['Q', 'W', 'E', '...', 'P'], text: 'Fila de arriba, una octava mas aguda (2 3 5 6 7 9 0 son las negras)' },
      { keys: ['↑', '↓'], text: 'Cambiar de octava' },
      { keys: ['Espacio'], text: 'Pedal de sustain' }
    ] },
    { group: 'Looper', items: [
      { keys: ['`'], text: 'Grabar / dejar de grabar' },
      { keys: ['Enter'], text: 'Reproducir / detener' }
    ] },
    { group: 'Editor de notas', items: [
      { keys: ['Supr'], text: 'Borrar las notas seleccionadas (tambien doble clic)' },
      { keys: ['Ctrl', 'A'], text: 'Seleccionar todo' },
      { keys: ['Ctrl', 'Z'], text: 'Deshacer' },
      { keys: ['Ctrl', 'Shift', 'Z'], text: 'Rehacer' },
      { keys: ['Shift', 'clic'], text: 'Sumar o quitar de la seleccion' }
    ] },
    { group: 'Interfaz', items: [
      { keys: ['Esc'], text: 'Modo visual: oculta todo y deja solo el arte' },
      { keys: ['F1'], text: 'Esta ayuda' }
    ] }
  ];

  constructor(public sound: SoundService, public engine: SynthEngine, public midi: MidiService,
              public looper: LooperService, public ui: UiService) {
    this.narrow = ui.isNarrow();
  }

  @HostListener('window:resize')
  onResize() {
    this.narrow = this.ui.isNarrow();
  }

  get latencyMs(): number {
    return Math.round((this.sound.baseLatency || 0) * 1000);
  }

  get kindLabel(): string {
    switch (this.engine.patch.kind) {
      case 'sampler': return 'Instrumento de muestras reales';
      case 'kit': return 'Kit de bateria de muestras';
      case 'drums': return 'Percusion sintetizada';
      default: return 'Sintetizador';
    }
  }

  // --- Chips de estado ---

  get midiClass(): string {
    return this.midi.status == 'ready' && this.midi.devices.length ? 'ok' : '';
  }

  get midiLabel(): string {
    if (this.midi.status == 'ready')
      return this.midi.devices.length ? this.midi.devices[0] + (this.midi.devices.length > 1 ? ' +' + (this.midi.devices.length - 1) : '') : 'Sin dispositivos';
    return this.midi.status == 'pending' ? 'Esperando permiso' : 'No disponible';
  }

  // --- Atajos globales ---

  // Esc: cierra lo que este abierto y, si no hay nada, alterna el modo visual (no interfiere con las notas)
  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.repeat || this.engine.isTyping(event.target as HTMLElement))
      return;
    if (event.code == 'F1') {
      event.preventDefault();
      this.ui.toggleHelp();
    } else if (event.code == 'Escape') {
      event.preventDefault();
      if (this.ui.helpOpen)
        this.ui.helpOpen = false;
      else if (this.ui.menuOpen)
        this.ui.menuOpen = false;
      else
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
    this.ui.menuOpen = false;
    this.showZenHint();
    // Al salir del modo visual no hace falta el aviso
    if (!this.ui.zen)
      this.zenHint = false;
  }

  // Tras un clic con el mouse el foco no debe quedarse en el boton: los atajos (Enter, `, espacio)
  // y las teclas de notas tienen que seguir llegando
  @HostListener('document:click', ['$event'])
  releaseButtonFocus(event: Event) {
    const target = event.target as HTMLElement;
    if (target && target.tagName == 'BUTTON')
      target.blur();
  }
}
