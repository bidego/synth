import { Component, HostListener } from '@angular/core';
import { SoundService } from './services/sound.service';
import { MidiService } from './services/midi.service';
import { UiService } from './services/ui.service';
import { RackService } from './daw/core/rack.service';
import { TransportService } from './daw/core/transport.service';
import { ProjectService } from './daw/core/project.service';
import { isTyping, isControl } from './daw/core/dom';
import { version } from '../../package.json';

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
  version: string = version;
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
    { group: 'Transporte', items: [
      { keys: ['`'], text: 'Grabar / dejar de grabar (en los instrumentos armados)' },
      { keys: ['Enter'], text: 'Reproducir / detener' }
    ] },
    { group: 'Rack', items: [
      { keys: ['Tab'], text: 'Alternar entre Rack y Cableado (con nada enfocado)' },
      { keys: ['Supr'], text: 'En Cableado: quitar el cable seleccionado' },
      { keys: ['Shift', 'clic'], text: 'En Cableado: desconectar un puerto' }
    ] },
    { group: 'Editor de notas', items: [
      { keys: ['Supr'], text: 'Borrar las notas seleccionadas (tambien doble clic)' },
      { keys: ['Ctrl', 'A'], text: 'Seleccionar todo' },
      { keys: ['Ctrl', 'Z'], text: 'Deshacer' },
      { keys: ['Ctrl', 'Shift', 'Z'], text: 'Rehacer' },
      { keys: ['Shift', 'clic'], text: 'Sumar o quitar de la seleccion' },
      { keys: ['Ctrl', 'arrastrar'], text: 'Copiar las notas (tambien Cmd o Alt)' }
    ] },
    { group: 'Interfaz', items: [
      { keys: ['Esc'], text: 'Modo visual: oculta todo y deja solo el arte' },
      { keys: ['F1'], text: 'Esta ayuda' }
    ] }
  ];

  constructor(public sound: SoundService, public midi: MidiService, public ui: UiService,
              public rack: RackService, public transport: TransportService, public project: ProjectService) {
    this.narrow = ui.isNarrow();
  }

  /** Voces sonando entre todos los instrumentos del rack. */
  get voiceCount(): number {
    return this.rack.synths.reduce((n, s) => n + s.engine.voiceCount, 0);
  }

  get sustaining(): boolean {
    return this.rack.synths.some(s => s.engine.sustain);
  }

  @HostListener('window:resize')
  onResize() {
    this.narrow = this.ui.isNarrow();
  }

  get latencyMs(): number {
    return Math.round((this.sound.baseLatency || 0) * 1000);
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
    const target = event.target as HTMLElement;
    if (event.repeat || isTyping(target))
      return;
    // Enter = play/stop y ` = grabar (no se usan para notas)
    if ((event.code == 'Enter' || event.code == 'Backquote') && !isControl(target) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (event.code == 'Enter')
        this.transport.togglePlay();
      else
        this.transport.toggleRecord();
      return;
    }
    // Tab alterna Rack / Cableado solo si nada tiene el foco (si no, sigue siendo la navegacion normal)
    if (event.code == 'Tab' && (!target || target === document.body) && !event.shiftKey) {
      event.preventDefault();
      this.ui.setView(this.ui.view == 'rack' ? 'patch' : 'rack');
      return;
    }
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
    // El clic suele caer en un icono (svg) dentro del boton, no en el boton mismo
    const target = event.target as HTMLElement;
    const button = target && target.closest ? target.closest('button') : null;
    if (button)
      button.blur();
  }
}
