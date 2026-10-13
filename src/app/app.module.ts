import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { SoundService } from './services/sound.service';
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
    SynthEngine
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
