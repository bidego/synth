import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { SoundService } from './services/sound.service';
import { LooperService } from './services/looper.service';
import { RollEditorComponent } from './synth/roll-editor.component';
import { SidebarComponent } from './synth/sidebar.component';
import { TransportComponent } from './synth/transport.component';
import { ProjectMenuComponent } from './synth/project-menu.component';
import { FxComponent } from './synth/fx.component';
import { IconComponent } from './ui/icon.component';
import { PanelComponent } from './ui/panel.component';
import { LooperComponent } from './synth/looper.component';
import { SampleLibrary } from './services/sample-library';
import { UiService } from './services/ui.service';
import { MidiService } from './services/midi.service';
import { SynthEngine } from './services/synth.engine';
import { SynthPanelComponent } from './synth/synth-panel.component';
import { PianoComponent } from './synth/piano.component';
import { VisualizerComponent } from './synth/visualizer.component';
import { ListenKeys } from './directives/listen.keys';

@NgModule({
  declarations: [
    AppComponent,
    SynthPanelComponent,
    PianoComponent,
    LooperComponent,
    SidebarComponent,
    TransportComponent,
    ProjectMenuComponent,
    FxComponent,
    IconComponent,
    PanelComponent,
    RollEditorComponent,
    VisualizerComponent,
    ListenKeys
  ],
  imports: [
    BrowserModule
  ],
  providers: [
    ListenKeys,
    SoundService,
    AudioContext,
    SynthEngine,
    SampleLibrary,
    MidiService,
    UiService,
    LooperService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
