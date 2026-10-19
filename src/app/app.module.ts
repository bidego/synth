import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { SoundService } from './services/sound.service';
import { RollEditorComponent } from './synth/roll-editor.component';
import { SidebarComponent } from './synth/sidebar.component';
import { ProjectMenuComponent } from './synth/project-menu.component';
import { FxComponent } from './synth/fx.component';
import { IconComponent } from './ui/icon.component';
import { PanelComponent } from './ui/panel.component';
import { KnobComponent } from './ui/knob.component';
import { FaderComponent } from './ui/fader.component';
import { JunoSliderComponent } from './ui/juno-slider.component';
import { SequencerDeviceComponent } from './daw/ui/sequencer-device.component';
import { JunoDeviceComponent } from './daw/ui/juno-device.component';
import { LooperComponent } from './synth/looper.component';
import { TransportService } from './daw/core/transport.service';
import { RackService } from './daw/core/rack.service';
import { ProjectService } from './daw/core/project.service';
import { AutomationService } from './daw/core/automation.service';
import { SyncService } from './daw/core/sync.service';
import { TimelineComponent } from './daw/ui/timeline.component';
import { TransportBarComponent } from './daw/ui/transport-bar.component';
import { RackViewComponent } from './daw/ui/rack-view.component';
import { PatchViewComponent } from './daw/ui/patch-view.component';
import { DeviceComponent } from './daw/ui/device.component';
import { SynthDeviceComponent } from './daw/ui/synth-device.component';
import { MixerDeviceComponent } from './daw/ui/mixer-device.component';
import { EffectDeviceComponent } from './daw/ui/effect-device.component';
import { KeyboardDeviceComponent, OutputDeviceComponent, PatchbayDeviceComponent } from './daw/ui/misc-devices.component';
import { SampleLibrary } from './services/sample-library';
import { UiService } from './services/ui.service';
import { MidiService } from './services/midi.service';
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
    TransportBarComponent,
    TimelineComponent,
    RackViewComponent,
    PatchViewComponent,
    DeviceComponent,
    SynthDeviceComponent,
    MixerDeviceComponent,
    EffectDeviceComponent,
    KeyboardDeviceComponent,
    OutputDeviceComponent,
    PatchbayDeviceComponent,
    ProjectMenuComponent,
    FxComponent,
    IconComponent,
    PanelComponent,
    KnobComponent,
    FaderComponent,
    JunoSliderComponent,
    JunoDeviceComponent,
    SequencerDeviceComponent,
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
    SampleLibrary,
    MidiService,
    UiService,
    TransportService,
    RackService,
    AutomationService,
    SyncService,
    ProjectService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
